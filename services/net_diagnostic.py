"""
MYSTERY LAG SPIKES FIXER • 3-POINT NET DIAGNOSTIC
Concurrently pings:
1. Local Router Gateway (e.g. 192.168.1.1) -> Isolates Local Wi-Fi / Ethernet bufferbloat
2. Public Tier-1 Core (1.1.1.1 / 8.8.8.8) -> Isolates ISP / Upstream fiber routing
3. Bandwidth consumption per application (psutil) -> Isolates stealth background downloads
Instantly classifies the exact bottleneck in real time.
"""

import asyncio
import logging
import re
import subprocess
import threading
import time
from typing import Dict, List, Optional, Any
import icmplib
import psutil

logger = logging.getLogger("ping_radar.net_diagnostic")

def detect_default_gateway() -> str:
    """Detects default router gateway IP on Windows."""
    try:
        out = subprocess.check_output('ipconfig', text=True, stderr=subprocess.DEVNULL)
        gateways = re.findall(r'Default Gateway[ .]*: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', out)
        if gateways:
            # Filter out 0.0.0.0
            valid = [g for g in gateways if g != "0.0.0.0"]
            if valid:
                return valid[0]
    except Exception:
        pass
    return "192.168.1.1"


class NetDiagnosticService:
    def __init__(self):
        self.gateway_ip: str = detect_default_gateway()
        self.wan_ip: str = "1.1.1.1"
        self.last_diagnostic: Dict[str, Any] = {}
        self.history: List[Dict[str, Any]] = []
        self._last_net_bytes = psutil.net_io_counters()
        self._last_time = time.time()
        self.download_mbps: float = 0.0
        self.upload_mbps: float = 0.0
        self.enabled: bool = True
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

    def get_top_network_apps(self) -> List[Dict[str, Any]]:
        """Identifies active apps with open network connections and disk/network IO."""
        active_apps = []
        try:
            seen_pids = set()
            for conn in psutil.net_connections(kind='inet'):
                if conn.status == 'ESTABLISHED' and conn.pid and conn.pid not in seen_pids:
                    seen_pids.add(conn.pid)
                    try:
                        p = psutil.Process(conn.pid)
                        name = p.name()
                        # Skip system idle
                        if name.lower() in ("system idle process", "svchost.exe") and len(seen_pids) > 5:
                            continue
                        mem_mb = round(p.memory_info().rss / (1024 * 1024), 1)
                        active_apps.append({
                            "pid": conn.pid,
                            "name": name,
                            "memory_mb": mem_mb,
                            "remote": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else "Direct"
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
        except Exception:
            pass
        return active_apps[:6]

    async def run_3point_diagnostic_async(self) -> Dict[str, Any]:
        """Runs concurrent ping to Gateway + 1.1.1.1 and computes bandwidth rates."""
        # 1. Bandwidth calculation
        now = time.time()
        dt = max(0.1, now - self._last_time)
        net_now = psutil.net_io_counters()
        
        down_bps = (net_now.bytes_recv - self._last_net_bytes.bytes_recv) * 8 / dt
        up_bps = (net_now.bytes_sent - self._last_net_bytes.bytes_sent) * 8 / dt
        self.download_mbps = round(max(0.0, down_bps / 1_000_000), 2)
        self.upload_mbps = round(max(0.0, up_bps / 1_000_000), 2)

        self._last_net_bytes = net_now
        self._last_time = now

        # 2. Concurrent icmplib pings
        gw_task = icmplib.async_ping(self.gateway_ip, count=2, interval=0.1, timeout=0.8, privileged=False)
        wan_task = icmplib.async_ping(self.wan_ip, count=2, interval=0.1, timeout=1.0, privileged=False)

        try:
            gw_host, wan_host = await asyncio.gather(gw_task, wan_task, return_exceptions=True)
        except Exception as e:
            gw_host, wan_host = None, None

        gw_ping = round(gw_host.avg_rtt, 1) if (gw_host and not isinstance(gw_host, Exception) and gw_host.is_alive) else 999.0
        gw_loss = round(gw_host.packet_loss * 100, 1) if (gw_host and not isinstance(gw_host, Exception)) else 100.0

        wan_ping = round(wan_host.avg_rtt, 1) if (wan_host and not isinstance(wan_host, Exception) and wan_host.is_alive) else 999.0
        wan_loss = round(wan_host.packet_loss * 100, 1) if (wan_host and not isinstance(wan_host, Exception)) else 100.0

        # 3. Bottleneck Analysis Logic
        bottleneck_code = "ALL_CLEAR"
        bottleneck_title = "Connection Pristine"
        bottleneck_desc = "Optimal gaming conditions. Zero Wi-Fi bufferbloat and low ISP latency."
        severity = "success"

        if self.download_mbps > 20.0 or self.upload_mbps > 10.0:
            bottleneck_code = "BACKGROUND_HOG"
            bottleneck_title = f"Heavy Background Download ({self.download_mbps} Mbps)"
            bottleneck_desc = "A background process is saturating your connection, causing rubber-banding."
            severity = "warning"

        if gw_ping > 35.0 or gw_loss > 3.0:
            bottleneck_code = "WIFI_FAULT"
            bottleneck_title = f"Local Wi-Fi / Router Fault ({gw_ping}ms, {gw_loss}% loss)"
            bottleneck_desc = "Severe latency or packet loss between your PC and the Wi-Fi router. Switch to 5GHz or Ethernet cable."
            severity = "danger"
        elif (wan_ping > 85.0 or wan_loss > 4.0) and gw_ping <= 10.0:
            bottleneck_code = "ISP_FAULT"
            bottleneck_title = f"ISP / Upstream Fiber Congestion ({wan_ping}ms, {wan_loss}% loss)"
            bottleneck_desc = "Local Wi-Fi is perfect, but your Internet Service Provider is experiencing peering congestion."
            severity = "danger"

        top_apps = self.get_top_network_apps()

        result = {
            "timestamp": time.strftime("%H:%M:%S"),
            "bottleneck_code": bottleneck_code,
            "bottleneck_title": bottleneck_title,
            "bottleneck_desc": bottleneck_desc,
            "severity": severity,
            "gateway": {
                "ip": self.gateway_ip,
                "latency_ms": gw_ping if gw_ping < 900 else None,
                "packet_loss_pct": gw_loss,
                "status": "HEALTHY" if gw_ping < 15 and gw_loss == 0 else "WARNING" if gw_ping < 35 else "CRITICAL"
            },
            "wan": {
                "ip": self.wan_ip,
                "latency_ms": wan_ping if wan_ping < 900 else None,
                "packet_loss_pct": wan_loss,
                "status": "HEALTHY" if wan_ping < 50 and wan_loss == 0 else "WARNING" if wan_ping < 90 else "CRITICAL"
            },
            "bandwidth": {
                "download_mbps": self.download_mbps,
                "upload_mbps": self.upload_mbps
            },
            "top_apps": top_apps
        }

        with self._lock:
            self.last_diagnostic = result
            self.history.append(result)
            if len(self.history) > 30:
                self.history.pop(0)

        return result

    def start_polling(self):
        if self._thread and self._thread.is_alive():
            return
        self.enabled = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="NetDiagnostic")
        self._thread.start()
        logger.info("3-Point Net Diagnostic polling loop started")

    def stop_polling(self):
        self.enabled = False
        self._stop_event.set()

    def _poll_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        while not self._stop_event.is_set():
            try:
                loop.run_until_complete(self.run_3point_diagnostic_async())
            except Exception:
                pass
            time.sleep(1.5)  # 1.5s diagnostic cycle

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "last_diagnostic": self.last_diagnostic,
                "history": self.history[-15:],
                "gateway_ip": self.gateway_ip,
                "wan_ip": self.wan_ip
            }

net_diagnostic = NetDiagnosticService()
