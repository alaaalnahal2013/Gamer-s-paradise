import asyncio
import json
import logging
import math
import os
import re
import subprocess
import sys
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import icmplib
import psutil
from vpn_service import vpn_manager
from services.process_freezer import process_freezer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ping_radar")

app = FastAPI(title="Game Server Ping Radar Pro")

# Setup directories
BASE_DIR = Path(__file__).resolve().parent
# If running inside dist/.../_internal, prioritize the live workspace static directory if present
workspace_static = BASE_DIR.parent.parent / "static"
if workspace_static.exists() and (workspace_static / "index.html").exists():
    STATIC_DIR = workspace_static
else:
    STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

PRESETS_FILE = STATIC_DIR / "game_presets.json"
CATALOG_FILE = STATIC_DIR / "game_catalogs.json"

# State Store
targets_lock = asyncio.Lock()
targets: List[Dict[str, Any]] = []
history: Dict[str, deque] = {}  # target_id -> deque of recent (timestamp, rtt_ms, success)
HISTORY_LEN = 120

# Active Game state
selected_game_id: str = "cs2"  # Default game
detected_game_info: Optional[Dict[str, Any]] = None

# Ping settings
ping_settings = {
    "interval": 1.0,         # seconds between ping waves
    "timeout": 1.5,          # ping timeout in seconds
    "count": 1,              # packets per target per wave
    "paused": False
}

connected_websockets = set()

# Load Game Catalog
game_catalog: Dict[str, Any] = {}
if CATALOG_FILE.exists():
    with open(CATALOG_FILE, "r", encoding="utf-8") as f:
        game_catalog = json.load(f).get("games", {})

# Auto-detect running game process via psutil
def detect_running_game() -> Optional[Dict[str, Any]]:
    try:
        running_names = set()
        for p in psutil.process_iter(['name']):
            try:
                name = p.info['name']
                if name:
                    running_names.add(name.lower())
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        for gid, gdata in game_catalog.items():
            for exe in gdata.get("executables", []):
                if exe.lower() in running_names:
                    return {
                        "game_id": gid,
                        "name": gdata["name"],
                        "publisher": gdata.get("publisher"),
                        "icon": gdata.get("icon", "🎮"),
                        "matched_executable": exe
                    }
    except Exception as e:
        logger.warning(f"Process scan error: {e}")
    return None

# Helper: Detect default gateway IP on Windows
def detect_default_gateway() -> Optional[str]:
    try:
        output = subprocess.check_output(["route", "print", "0.0.0.0"], text=True, stderr=subprocess.DEVNULL)
        for line in output.splitlines():
            line = line.strip()
            parts = line.split()
            if len(parts) >= 4 and parts[0] == "0.0.0.0" and parts[1] == "0.0.0.0":
                gw = parts[2]
                if gw != "On-link" and re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", gw):
                    return gw
    except Exception as e:
        logger.warning(f"Could not auto-detect gateway: {e}")
    return "192.168.1.1"

# User Custom IP store
user_configured_ip: Optional[str] = None

# Helper: Detect default gateway IP on Windows
def detect_default_gateway() -> Optional[str]:
    if user_configured_ip:
        return user_configured_ip
    try:
        output = subprocess.check_output(["route", "print", "0.0.0.0"], text=True, stderr=subprocess.DEVNULL)
        for line in output.splitlines():
            line = line.strip()
            parts = line.split()
            if len(parts) >= 4 and parts[0] == "0.0.0.0" and parts[1] == "0.0.0.0":
                gw = parts[2]
                if gw != "On-link" and re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", gw):
                    return gw
    except Exception as e:
        logger.warning(f"Could not auto-detect gateway: {e}")
    return "192.168.1.1"

# Helper: Detect Wi-Fi Interface Details on Windows (sanitizing personal SSID)
def detect_wifi_telemetry() -> Dict[str, Any]:
    telemetry = {
        "is_wifi": False,
        "ssid": "Connected Wi-Fi",
        "signal_percent": 100,
        "band": "Unknown",
        "channel": "Unknown",
        "tx_rate_mbps": 0.0,
        "rx_rate_mbps": 0.0,
        "adapter": "Ethernet / Generic LAN",
        "description": ""
    }
    try:
        output = subprocess.check_output(["netsh", "wlan", "show", "interfaces"], text=True, stderr=subprocess.DEVNULL)
        for line in output.splitlines():
            line = line.strip()
            if ":" not in line:
                continue
            key, val = [p.strip() for p in line.split(":", 1)]
            if key == "State" and val == "connected":
                telemetry["is_wifi"] = True
                telemetry["ssid"] = "Connected Wi-Fi (LAN)"
            elif key == "Signal":
                try:
                    telemetry["signal_percent"] = int(val.replace("%", "").strip())
                except ValueError:
                    pass
            elif key == "Band":
                telemetry["band"] = val
            elif key == "Channel":
                telemetry["channel"] = val
            elif key == "Transmit rate (Mbps)":
                try:
                    telemetry["tx_rate_mbps"] = float(val)
                except ValueError:
                    pass
            elif key == "Receive rate (Mbps)":
                try:
                    telemetry["rx_rate_mbps"] = float(val)
                except ValueError:
                    pass
            elif key == "Description":
                telemetry["adapter"] = val
    except Exception:
        pass
    return telemetry

# Load / Switch Targets for Selected Game
def switch_active_game(game_id: str):
    global targets, selected_game_id
    selected_game_id = game_id
    gw_ip = detect_default_gateway()

    new_targets = [
        {
            "id": "gateway",
            "name": "Local Wi-Fi Gateway",
            "ip": gw_ip or "192.168.1.1",
            "category": "local",
            "region": "Home Router",
            "description": f"Local Router / Default Gateway ({gw_ip})",
            "is_gateway": True,
            "enabled": True
        },
        {
            "id": "dns_cf",
            "name": "Cloudflare DNS (Tier-1 Edge)",
            "ip": "1.1.1.1",
            "category": "reference",
            "region": "Global Edge",
            "description": "Baseline Internet ISP routing reference",
            "is_reference": True,
            "enabled": True
        }
    ]

    gdata = game_catalog.get(game_id)
    if gdata and "servers" in gdata:
        for s in gdata["servers"]:
            new_targets.append({
                "id": s["id"],
                "name": f"{gdata['name']} ({s['name']})",
                "ip": s["ip"],
                "category": game_id,
                "region": s["region"],
                "description": f"{gdata['name']} server in {s['region']}",
                "code": s.get("code", ""),
                "enabled": True
            })

    # Preserve custom targets added by user
    for old_t in targets:
        if old_t.get("category") == "custom":
            new_targets.append(old_t)

    targets = new_targets

    # Ensure history exists for all targets
    for t in targets:
        tid = t["id"]
        if tid not in history:
            history[tid] = deque(maxlen=HISTORY_LEN)

# Initialize with detected game or default
detected = detect_running_game()
if detected:
    selected_game_id = detected["game_id"]
    detected_game_info = detected
switch_active_game(selected_game_id)

# Metrics calculator for a target
def calculate_metrics(tid: str) -> Dict[str, Any]:
    buf = list(history.get(tid, []))
    if not buf:
        return {
            "current_rtt": None,
            "min_rtt": None,
            "avg_rtt": None,
            "max_rtt": None,
            "jitter": 0.0,
            "packet_loss": 0.0,
            "status": "waiting",
            "grade": "N/A",
            "samples": 0
        }

    total_samples = len(buf)
    success_rtts = [rtt for ts, rtt, ok in buf if ok and rtt is not None]
    lost_count = sum(1 for ts, rtt, ok in buf if not ok or rtt is None)

    packet_loss = round((lost_count / total_samples) * 100.0, 1)

    if not success_rtts:
        return {
            "current_rtt": None,
            "min_rtt": None,
            "avg_rtt": None,
            "max_rtt": None,
            "jitter": 0.0,
            "packet_loss": 100.0,
            "status": "offline",
            "grade": "F",
            "samples": total_samples
        }

    current_rtt = round(success_rtts[-1], 1)
    min_rtt = round(min(success_rtts), 1)
    max_rtt = round(max(success_rtts), 1)
    avg_rtt = round(sum(success_rtts) / len(success_rtts), 1)

    # Compute Jitter using consecutive packet delays (RFC 3550 style)
    if len(success_rtts) >= 2:
        diffs = [abs(success_rtts[i] - success_rtts[i - 1]) for i in range(1, len(success_rtts))]
        jitter = round(sum(diffs) / len(diffs), 1)
    else:
        jitter = 0.0

    # Status classification
    if packet_loss > 15:
        status = "packet_loss"
    elif jitter > 25:
        status = "high_jitter"
    elif current_rtt > 150:
        status = "high_latency"
    elif current_rtt > 80:
        status = "moderate"
    else:
        status = "excellent"

    # Connection Quality Grade
    score = 100.0
    score -= min(packet_loss * 4.0, 50.0)
    score -= min(jitter * 1.5, 30.0)
    if avg_rtt > 45:
        score -= min((avg_rtt - 45) * 0.45, 25.0)

    if packet_loss > 40:
        grade = "F"
    elif score >= 90:
        grade = "A+"
    elif score >= 80:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 55:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    return {
        "current_rtt": current_rtt,
        "min_rtt": min_rtt,
        "avg_rtt": avg_rtt,
        "max_rtt": max_rtt,
        "jitter": jitter,
        "packet_loss": packet_loss,
        "status": status,
        "grade": grade,
        "samples": total_samples
    }

# Best Game Server & Region Recommendation Engine
def calculate_best_server_recommendation(target_metrics: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    gdata = game_catalog.get(selected_game_id, {})
    game_name = gdata.get("name", "Active Game")

    # Filter to only the selected game's servers (excluding gateway and reference)
    candidates = []
    for t in targets:
        if t.get("is_gateway") or t.get("is_reference") or not t.get("enabled", True):
            continue
        if t.get("category") == selected_game_id:
            m = target_metrics.get(t["id"])
            if m and m["current_rtt"] is not None:
                # Calculate penalty score: lower is better
                # Primary = current_rtt, penalty for jitter and loss
                score = m["current_rtt"] + (m["jitter"] * 1.2) + (m["packet_loss"] * 8.0)
                candidates.append({
                    "id": t["id"],
                    "name": t["name"],
                    "region": t.get("region", "Unknown"),
                    "ip": t["ip"],
                    "code": t.get("code", ""),
                    "metrics": m,
                    "score": round(score, 1)
                })

    if not candidates:
        return {
            "game_id": selected_game_id,
            "game_name": game_name,
            "best_server": None,
            "runner_up": None,
            "third_place": None,
            "leaderboard": [],
            "recommendation_text": f"Scanning {game_name} servers worldwide...",
            "recommended_max_ping": 60,
            "matchmaking_cmd": gdata.get("matchmaking_cmd")
        }

    # Sort candidates by score ascending (lowest latency & jitter first)
    candidates.sort(key=lambda c: c["score"])

    best = candidates[0]
    runner_up = candidates[1] if len(candidates) > 1 else None
    third = candidates[2] if len(candidates) > 2 else None

    # Calculate recommended in-game max search ping (e.g. best ping + 15ms)
    best_ping = best["metrics"]["current_rtt"]
    rec_max_ping = int(math.ceil((best_ping + 15) / 5.0) * 5)
    rec_max_ping = max(25, min(150, rec_max_ping))

    rec_text = (
        f"Connect to {best['name']} in {best['region']}. "
        f"Delivers tournament-grade {best_ping} ms with ±{best['metrics']['jitter']} ms jitter. "
    )
    if runner_up:
        rec_text += f"Secondary backup: {runner_up['name']} ({runner_up['metrics']['current_rtt']} ms)."

    return {
        "game_id": selected_game_id,
        "game_name": game_name,
        "best_server": best,
        "runner_up": runner_up,
        "third_place": third,
        "leaderboard": candidates,
        "recommendation_text": rec_text,
        "recommended_max_ping": rec_max_ping,
        "matchmaking_cmd": gdata.get("matchmaking_cmd")
    }

# Diagnostic Engine: Correlates Gateway, ISP DNS, and Game Server hops
def analyze_fault_root_cause(target_metrics: Dict[str, Dict[str, Any]], wifi_info: Dict[str, Any]) -> Dict[str, Any]:
    gw_metrics = None
    ref_metrics = None
    game_server_metrics = []

    for t in targets:
        tid = t["id"]
        m = target_metrics.get(tid)
        if not m or not t.get("enabled", True):
            continue
        if t.get("is_gateway"):
            gw_metrics = (t, m)
        elif t.get("is_reference"):
            if not ref_metrics or t["id"] == "dns_cf":
                ref_metrics = (t, m)
        else:
            game_server_metrics.append((t, m))

    gw_rtt = gw_metrics[1]["current_rtt"] if gw_metrics and gw_metrics[1]["current_rtt"] is not None else None
    gw_jitter = gw_metrics[1]["jitter"] if gw_metrics else 0.0
    gw_loss = gw_metrics[1]["packet_loss"] if gw_metrics else 0.0

    ref_rtt = ref_metrics[1]["current_rtt"] if ref_metrics and ref_metrics[1]["current_rtt"] is not None else None
    ref_loss = ref_metrics[1]["packet_loss"] if ref_metrics else 0.0
    ref_jitter = ref_metrics[1]["jitter"] if ref_metrics else 0.0

    # Check 1: Local Wi-Fi / Router Fault
    if gw_loss > 0 or (gw_rtt is not None and gw_rtt > 15.0) or gw_jitter > 10.0:
        advice = []
        if wifi_info.get("is_wifi"):
            if wifi_info.get("band") == "2.4 GHz":
                advice.append("You are connected to 2.4 GHz Wi-Fi which suffers heavy interference. Switch to 5 GHz or 6 GHz.")
            if wifi_info.get("signal_percent", 100) < 65:
                advice.append(f"Wi-Fi signal is weak ({wifi_info.get('signal_percent')}%), move closer to the router.")
            advice.append("Check if another device on your local network is downloading or streaming.")
            advice.append("Plug in an Ethernet cable for instant 0.5ms jitter-free gaming.")
        else:
            advice.append("Local router or LAN switch is dropping packets or overwhelmed with local traffic.")

        return {
            "verdict": "LOCAL_WIFI_FAULT",
            "title": "Local Wi-Fi / Router Fault Detected",
            "severity": "critical" if (gw_loss > 5 or (gw_rtt and gw_rtt > 40)) else "warning",
            "message": f"Your local router hop is spiking ({gw_rtt} ms, ±{gw_jitter} ms jitter, {gw_loss}% loss). This local bottleneck ruins latency to ALL game servers.",
            "culprit": "Local Wi-Fi / Home Network",
            "gateway_status": "degraded",
            "isp_status": "unknown_masked_by_lan",
            "game_server_status": "impacted_by_lan",
            "advice": advice
        }

    # Check 2: ISP / Upstream Backbone Congestion
    game_spikes = [m for t, m in game_server_metrics if m["packet_loss"] > 0 or m["jitter"] > 20.0 or (m["current_rtt"] and m["current_rtt"] > 120)]
    if (ref_loss > 0 or ref_jitter > 20.0) and len(game_spikes) >= max(1, len(game_server_metrics) // 2):
        return {
            "verdict": "ISP_FAULT",
            "title": "ISP Upstream / Peering Congestion",
            "severity": "warning",
            "message": f"Your local Wi-Fi is pristine ({gw_rtt} ms to router), but your Internet Service Provider edge is experiencing packet drops or route congestion.",
            "culprit": "Internet Service Provider (ISP)",
            "gateway_status": "optimal",
            "isp_status": "degraded",
            "game_server_status": "impacted_by_isp",
            "advice": [
                "Your Wi-Fi is NOT at fault; restarting your router may request a cleaner IP route from your ISP.",
                "ISP neighborhood node might be congested during peak gaming hours.",
                "Try enabling a Gaming VPN (ExitLag/Cloudflare WARP) to bypass congested ISP routing."
            ]
        }

    # Check 3: Game Server / Route Fault
    lagging_servers = [t["name"] for t, m in game_server_metrics if (m["packet_loss"] > 0 or m["jitter"] > 15.0 or (m["current_rtt"] and m["avg_rtt"] and m["current_rtt"] > m["avg_rtt"] + 35))]
    if lagging_servers:
        names = ", ".join(lagging_servers[:3])
        return {
            "verdict": "SERVER_FAULT",
            "title": "Game Server Fault / Routing Congestion",
            "severity": "warning",
            "message": f"Your local Wi-Fi and ISP are completely clean! The lag spike is isolated to {names}.",
            "culprit": f"Game Server Datacenter ({names})",
            "gateway_status": "optimal",
            "isp_status": "optimal",
            "game_server_status": "degraded",
            "advice": [
                f"Your home Wi-Fi ({gw_rtt} ms) is NOT causing this lag.",
                f"The issue is in the game server's datacenter or carrier transit route.",
                "Switch to your recommended best server region shown in the Radar recommendations."
            ]
        }

    # All Optimal
    return {
        "verdict": "OPTIMAL",
        "title": "Network Pipeline Pristine",
        "severity": "optimal",
        "message": f"Optimal gaming conditions. Local Wi-Fi hop is {gw_rtt} ms, jitter is negligible, zero packet loss detected across the board.",
        "culprit": "None (All Systems Green)",
        "gateway_status": "optimal",
        "isp_status": "optimal",
        "game_server_status": "optimal",
        "advice": ["Connection is tournament-ready. Keep gaming!"]
    }

# Background worker: Concurrently pings all enabled targets using icmplib.async_multiping
async def ping_loop():
    logger.info("Starting ICMP Radar ping worker loop...")
    process_check_counter = 0

    while True:
        try:
            if ping_settings["paused"]:
                await asyncio.sleep(0.5)
                continue

            start_time = time.time()
            now_ts = time.time()

            # Check running game processes every 3 waves (approx 3s)
            process_check_counter += 1
            if process_check_counter >= 3:
                process_check_counter = 0
                detected = detect_running_game()
                global detected_game_info
                detected_game_info = detected
                process_freezer.on_game_state_change(bool(detected), detected["name"] if detected else "")
                # Auto-switch telemetry fleet if game is detected and differs from active
                if detected and detected.get("id") and detected["id"] != selected_game_id:
                    logger.info(f"[Auto-Hook] Detected running game: {detected['name']} ({detected['id']}). Auto-switching fleet.")
                    async with targets_lock:
                        switch_active_game(detected["id"])

            # Gather enabled targets
            async with targets_lock:
                enabled_targets = [t for t in targets if t.get("enabled", True)]

            if not enabled_targets:
                await asyncio.sleep(1.0)
                continue

            addresses = [t["ip"] for t in enabled_targets]

            # Execute concurrent ping via icmplib.async_multiping
            try:
                hosts = await icmplib.async_multiping(
                    addresses,
                    count=ping_settings["count"],
                    interval=0.08,
                    timeout=ping_settings["timeout"],
                    privileged=True
                )
            except Exception as e:
                try:
                    hosts = await icmplib.async_multiping(
                        addresses,
                        count=ping_settings["count"],
                        interval=0.08,
                        timeout=ping_settings["timeout"],
                        privileged=False
                    )
                except Exception as e2:
                    logger.error(f"ICMP ping failed: {e2}")
                    hosts = []

            # Map results to targets
            host_map = {h.address: h for h in hosts}

            target_metrics = {}
            for t in enabled_targets:
                tid = t["id"]
                ip = t["ip"]
                h = host_map.get(ip)

                if h and h.is_alive and h.avg_rtt > 0:
                    rtt = float(h.avg_rtt)
                    history[tid].append((now_ts, rtt, True))
                else:
                    history[tid].append((now_ts, None, False))

                target_metrics[tid] = calculate_metrics(tid)

            # Wi-Fi Telemetry
            wifi_info = detect_wifi_telemetry()

            # Fault Analysis
            diagnosis = analyze_fault_root_cause(target_metrics, wifi_info)

            # Best Server & Region Recommendation for Active Game
            recommendation = calculate_best_server_recommendation(target_metrics)

            # Prepare telemetry payload for WebSocket broadcast
            payload = {
                "timestamp": now_ts,
                "selected_game_id": selected_game_id,
                "detected_game": detected_game_info,
                "recommendation": recommendation,
                "targets": [
                    {
                        **t,
                        "metrics": target_metrics.get(t["id"], {}),
                        "history": [
                            {"ts": round(ts, 2), "rtt": round(rtt, 1) if rtt is not None else None, "ok": ok}
                            for ts, rtt, ok in list(history.get(t["id"], []))[-30:]
                        ]
                    }
                    for t in targets
                ],
                "diagnosis": diagnosis,
                "wifi": wifi_info,
                "vpn": vpn_manager.get_status(),
                "recommendation": calculate_best_server_recommendation(target_metrics),
                "detected_game": detected_game_info,
                "selected_game_id": selected_game_id,
                "settings": ping_settings
            }

            # Broadcast to all connected WebSockets
            if connected_websockets:
                msg = json.dumps(payload)
                dead_sockets = set()
                for ws in list(connected_websockets):
                    try:
                        await ws.send_text(msg)
                    except Exception:
                        dead_sockets.add(ws)
                connected_websockets.difference_update(dead_sockets)

            elapsed = time.time() - start_time
            sleep_time = max(0.05, ping_settings["interval"] - elapsed)
            await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in ping_loop: {e}", exc_info=True)
            await asyncio.sleep(1.0)

@app.on_event("startup")
async def on_startup():
    asyncio.create_task(ping_loop())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        # Send initial frame
        wifi_info = detect_wifi_telemetry()
        target_metrics = {t["id"]: calculate_metrics(t["id"]) for t in targets}
        diagnosis = analyze_fault_root_cause(target_metrics, wifi_info)
        recommendation = calculate_best_server_recommendation(target_metrics)

        initial_payload = {
            "timestamp": time.time(),
            "selected_game_id": selected_game_id,
            "detected_game": detected_game_info,
            "recommendation": recommendation,
            "targets": [
                {
                    **t,
                    "metrics": target_metrics.get(t["id"], {}),
                    "history": [
                        {"ts": round(ts, 2), "rtt": round(rtt, 1) if rtt is not None else None, "ok": ok}
                        for ts, rtt, ok in list(history.get(t["id"], []))[-30:]
                    ]
                }
                for t in targets
            ],
            "diagnosis": diagnosis,
            "wifi": wifi_info,
            "vpn": vpn_manager.get_status(),
            "recommendation": recommendation,
            "detected_game": detected_game_info,
            "selected_game_id": selected_game_id,
            "settings": ping_settings
        }
        await websocket.send_text(json.dumps(initial_payload))

        while True:
            data = await websocket.receive_text()
            cmd = json.loads(data)
            action = cmd.get("action")
            if action == "toggle_target":
                tid = cmd.get("id")
                async with targets_lock:
                    for t in targets:
                        if t["id"] == tid:
                            t["enabled"] = not t.get("enabled", True)
                            break
            elif action == "select_game":
                gid = cmd.get("game_id")
                if gid in game_catalog:
                    async with targets_lock:
                        switch_active_game(gid)
            elif action == "vpn_connect":
                c_code = cmd.get("country_code", "de")
                vpn_manager.connect(c_code)
            elif action == "vpn_disconnect":
                vpn_manager.disconnect()
            elif action == "update_settings":
                if "interval" in cmd:
                    ping_settings["interval"] = float(cmd["interval"])
                if "paused" in cmd:
                    ping_settings["paused"] = bool(cmd["paused"])
    except WebSocketDisconnect:
        connected_websockets.discard(websocket)
    except Exception:
        connected_websockets.discard(websocket)

# REST API routes
@app.get("/api/games")
async def get_games():
    detected = detect_running_game()
    return {
        "games": game_catalog,
        "selected_game_id": selected_game_id,
        "detected_game": detected
    }

@app.post("/api/select_game")
async def api_select_game(req: Dict[str, Any]):
    gid = req.get("game_id")
    if gid not in game_catalog:
        raise HTTPException(status_code=400, detail="Unknown game ID")
    async with targets_lock:
        switch_active_game(gid)
    return {"status": "ok", "selected_game_id": gid}

@app.get("/api/recommendation")
async def get_recommendation():
    target_metrics = {t["id"]: calculate_metrics(t["id"]) for t in targets}
    rec = calculate_best_server_recommendation(target_metrics)
    return rec

@app.get("/api/client_ip")
async def get_client_ip(request: Request):
    client_ip = None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host

    gw = user_configured_ip or detect_default_gateway()
    vpn_status = vpn_manager.get_status()
    return {
        "client_ip": vpn_status["masked_ip"] if vpn_status["enabled"] else (client_ip or "127.0.0.1"),
        "gateway_ip": gw or "192.168.1.1",
        "user_configured_ip": user_configured_ip,
        "is_shielded": vpn_status["enabled"],
        "masked_ip": vpn_status["masked_ip"],
        "country": vpn_status["country_name"]
    }

@app.get("/api/my-ip-info")
async def get_my_ip_info():
    """Fetch real public IP, country, and recommend best VPN regions based on geo-proximity."""
    import urllib.request, json as _json
    
    # Region proximity map: continent_code -> recommended VPN nodes (ordered by closeness)
    CONTINENT_VPN_MAP = {
        "EU": ["de", "nl", "se", "fr", "pl"],
        "NA": ["us-east", "us-west", "ca"],
        "SA": ["br", "us-east"],
        "AS": ["sg", "jp", "hk", "in"],
        "OC": ["au", "sg"],
        "AF": ["za", "de", "nl"],
        "AN": ["de", "us-east"],
    }
    
    # Country -> continent (common gaming countries)
    COUNTRY_CONTINENT = {
        "EG": "AF", "NG": "AF", "ZA": "AF", "KE": "AF",
        "DE": "EU", "FR": "EU", "GB": "EU", "NL": "EU", "SE": "EU",
        "PL": "EU", "IT": "EU", "ES": "EU", "RU": "EU", "TR": "EU",
        "US": "NA", "CA": "NA", "MX": "NA",
        "BR": "SA", "AR": "SA", "CO": "SA",
        "JP": "AS", "KR": "AS", "CN": "AS", "IN": "AS", "SG": "AS",
        "TW": "AS", "TH": "AS", "SA": "AS", "AE": "AS", "PK": "AS",
        "AU": "OC", "NZ": "OC",
    }
    
    public_ip = "Unknown"
    country_code = "Unknown"
    country_name = "Unknown"
    continent = "EU"
    city = "Unknown"
    isp = "Unknown"
    lat, lon = 0.0, 0.0
    
    try:
        req = urllib.request.Request(
            "https://ipapi.co/json/",
            headers={"User-Agent": "GamerParadise/3.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            geo = _json.loads(resp.read().decode())
        public_ip = geo.get("ip", "Unknown")
        country_code = geo.get("country_code", "US")
        country_name = geo.get("country_name", "Unknown")
        city = geo.get("city", "Unknown")
        isp = geo.get("org", geo.get("isp", "Unknown"))
        lat = float(geo.get("latitude", 0))
        lon = float(geo.get("longitude", 0))
        continent = geo.get("continent_code") or COUNTRY_CONTINENT.get(country_code, "EU")
    except Exception as e:
        logger.warning(f"IP geo-lookup failed (offline?): {e}")
        continent = "EU"
    
    recommended_nodes = CONTINENT_VPN_MAP.get(continent, CONTINENT_VPN_MAP["EU"])
    
    return {
        "public_ip": public_ip,
        "country_code": country_code,
        "country_name": country_name,
        "city": city,
        "isp": isp,
        "continent": continent,
        "lat": lat,
        "lon": lon,
        "recommended_vpn_nodes": recommended_nodes,
        "best_node": recommended_nodes[0] if recommended_nodes else "de",
        "best_node_reason": f"Geographically closest relay to {city or country_name} ({continent})"
    }

@app.post("/api/set_user_ip")
async def set_user_ip(payload: Dict[str, Any]):
    global user_configured_ip
    ip = payload.get("ip", "").strip()
    if not ip:
        raise HTTPException(status_code=400, detail="Valid IP or Hostname required")

    user_configured_ip = ip
    async with targets_lock:
        for t in targets:
            if t.get("is_gateway"):
                t["ip"] = ip
                t["name"] = f"User Gateway ({ip})"
                t["description"] = f"User Local Network Hop ({ip})"
                break
    return {"status": "ok", "user_ip": ip}

@app.get("/api/targets")
async def get_targets():
    return {"targets": targets, "settings": ping_settings}

@app.post("/api/targets")
async def add_target(target: Dict[str, Any]):
    ip = target.get("ip", "").strip()
    name = target.get("name", "").strip() or ip
    category = target.get("category", "custom")
    region = target.get("region", "Custom Server")

    if not ip:
        raise HTTPException(status_code=400, detail="IP or Hostname is required")

    tid = f"custom_{int(time.time()*1000)}"
    new_target = {
        "id": tid,
        "name": name,
        "ip": ip,
        "category": category,
        "region": region,
        "description": f"Custom Game Server ({ip})",
        "enabled": True
    }

    async with targets_lock:
        targets.append(new_target)
        history[tid] = deque(maxlen=HISTORY_LEN)

    return {"status": "ok", "target": new_target}

@app.delete("/api/targets/{tid}")
async def delete_target(tid: str):
    async with targets_lock:
        global targets
        targets = [t for t in targets if t["id"] != tid]
        if tid in history:
            del history[tid]
    return {"status": "ok"}

@app.post("/api/settings")
async def update_settings(settings: Dict[str, Any]):
    if "interval" in settings:
        ping_settings["interval"] = max(0.2, min(5.0, float(settings["interval"])))
    if "paused" in settings:
        ping_settings["paused"] = bool(settings["paused"])
    return {"status": "ok", "settings": ping_settings}

@app.get("/api/wifi")
async def get_wifi():
    return detect_wifi_telemetry()

@app.get("/api/export")
async def export_logs(format: str = "json"):
    data = []
    for t in targets:
        tid = t["id"]
        m = calculate_metrics(tid)
        h = list(history.get(tid, []))
        data.append({
            "id": tid,
            "name": t["name"],
            "ip": t["ip"],
            "category": t.get("category"),
            "region": t.get("region"),
            "metrics": m,
            "history": [{"timestamp": ts, "rtt_ms": rtt, "delivered": ok} for ts, rtt, ok in h]
        })
    return {"export_timestamp": time.time(), "targets": data}

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(
                content=f.read(),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    return HTMLResponse("<h1>Game Server Ping Radar - Loading...</h1>")

@app.get("/overlay", response_class=HTMLResponse)
async def serve_overlay():
    overlay_file = STATIC_DIR / "overlay.html"
    if overlay_file.exists():
        with open(overlay_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>In-Game Tactical HUD - Loading...</h1>")

native_hud_proc = None

@app.post("/api/launch_native_hud")
async def launch_native_hud():
    """Launch or focus the native Always-on-Top transparent In-Game HUD widget."""
    global native_hud_proc
    try:
        if native_hud_proc is not None and native_hud_proc.poll() is None:
            return {"status": "ok", "message": "Native Always-On-Top In-Game HUD is already running"}

        script_path = BASE_DIR / "overlay_hud.py"
        native_hud_proc = subprocess.Popen(
            [sys.executable, str(script_path)],
            creationflags=subprocess.DETACHED_PROCESS if hasattr(subprocess, "DETACHED_PROCESS") else 0
        )
        return {"status": "ok", "message": "Native Always-On-Top In-Game HUD launched"}
    except Exception as e:
        logger.error(f"Failed to launch native overlay HUD: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/announce_voice")
async def announce_voice():
    """Speak the optimal game region and ping using Windows synthetic speech."""
    try:
        target_metrics = {t["id"]: calculate_metrics(t["id"]) for t in targets}
        rec = calculate_best_server_recommendation(target_metrics)
        best = rec.get("best_server")
        game_name = rec.get("game_name", "Game")
        if best and best.get("metrics"):
            rtt = best["metrics"].get("current_rtt", "optimal")
            loc = best.get("name")
            phrase = f"Tactical Radar locked. For {game_name}, best datacenter is {loc} at {rtt} milliseconds."
        else:
            phrase = f"Tactical Radar active. Scanning regional datacenters for {game_name}."

        ps_cmd = f"Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = 1; $synth.Speak('{phrase}')"
        subprocess.Popen(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd])
        return {"status": "ok", "phrase": phrase}
    except Exception as e:
        logger.error(f"Voice announcement error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/game/generate_config")
async def generate_game_config():
    """Generate an autoexec/config file with optimal matchmaking routing rules."""
    try:
        target_metrics = {t["id"]: calculate_metrics(t["id"]) for t in targets}
        rec = calculate_best_server_recommendation(target_metrics)
        best = rec.get("best_server", {})
        max_ping = rec.get("recommended_max_ping", 45)

        cfg_lines = [
            "// ========================================================",
            "// PING RADAR PRO - TACTICAL IN-GAME AUTO-CONFIG",
            f"// Optimized Datacenter: {best.get('name', 'Optimal')} ({best.get('region', 'Global')})",
            "// ========================================================",
            f"mm_dedicated_search_maxping {max_ping}",
            "rate 786432",
            "cl_net_buffer_ticks 0",
            f"echo \"[PingRadar] Telemetry applied: maxping set to {max_ping}\"",
            ""
        ]
        cfg_content = "\n".join(cfg_lines)
        cfg_path = BASE_DIR / "ping_radar_autoexec.cfg"
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write(cfg_content)

        return {
            "status": "ok",
            "cfg_path": str(cfg_path),
            "command": f"mm_dedicated_search_maxping {max_ping}",
            "content": cfg_content
        }
    except Exception as e:
        logger.error(f"Config generation error: {e}")
        return {"status": "error", "message": str(e)}

# ==============================================================================
# MODULAR MULTI-FUNCTIONAL ROUTERS
# Fully decoupled: each feature lives in its own router file in routers/
# No code is mixed with each other.
# ==============================================================================
from routers import (
    vpn_router,
    audio_router,
    ram_router,
    sniper_router,
    luminance_router,
    ocr_router,
    screenshots_router,
    clipboard_router,
    netdiag_router,
    input_cage_router,
    blackbox_router,
    shader_router,
    save_router,
    loadout_router,
    sens_router,
    voice_ducking_router,
    preflight_router
)

app.include_router(vpn_router)
app.include_router(audio_router)
app.include_router(ram_router)
app.include_router(sniper_router)
app.include_router(luminance_router)
app.include_router(ocr_router)
app.include_router(screenshots_router)
app.include_router(clipboard_router)
app.include_router(netdiag_router)
app.include_router(input_cage_router)
app.include_router(blackbox_router)
app.include_router(shader_router)
app.include_router(save_router)
app.include_router(loadout_router)
app.include_router(sens_router)
app.include_router(voice_ducking_router)
app.include_router(preflight_router)

# Listener for VPN state changes to update the gateway ping target in Radar
def handle_vpn_state_update(status: Dict[str, Any]):
    try:
        gw = user_configured_ip or detect_default_gateway()
        for t in targets:
            if t.get("is_gateway"):
                if status.get("enabled"):
                    t["name"] = f"VPN Relay [{status.get('flag', '')} {status.get('city', '')}]"
                    t["description"] = f"Cloaked IP Tunnel ({status.get('masked_ip', '')})"
                else:
                    t["name"] = f"User Gateway ({gw})"
                    t["description"] = f"User Local Network Hop ({gw})"
    except Exception as e:
        logger.warning(f"Error updating gateway on VPN toggle: {e}")

vpn_manager.add_state_listener(handle_vpn_state_update)


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
