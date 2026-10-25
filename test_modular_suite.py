import urllib.request
import json
import sys

endpoints = [
    ("/", "Web App Index HTML"),
    ("/overlay", "In-Game HUD HTML"),
    ("/api/games", "Game Catalog API"),
    ("/api/recommendation", "Telemetry Recommendation Engine"),
    ("/api/vpn/status", "Gaming VPN Status API"),
    ("/api/vpn/countries", "VPN Regional Relays API"),
    ("/api/audio/devices", "Audio Lock Hardware Devices API"),
    ("/api/audio/status", "Audio Lock Status API"),
    ("/api/ram/hogs", "RAM Process Freezer Hogs API"),
    ("/api/ram/status", "RAM Process Freezer Status API"),
    ("/api/sniper/common_ports", "Lock & Port Sniper Common Ports API"),
    ("/api/sniper/port/8000", "Lock & Port Sniper Port 8000 API"),
    ("/api/luminance/status", "Luminance Guard Status API"),
    ("/api/ocr/history", "Screen-Snip OCR Grabber History API"),
    ("/api/screenshots/status", "Smart Screenshot Indexer Status API"),
    ("/api/screenshots/search", "Smart Screenshot Indexer Search API"),
    ("/api/clipboard/status", "Clean Paste Interceptor Status API"),
    ("/api/net_diagnostic/latest", "3-Point Net Diagnostic Latest API"),
    ("/api/net_diagnostic/status", "3-Point Net Diagnostic Status API"),
    # 8 New Performance, Saves/Mods, Audio, & Preflight Endpoints
    ("/api/input_cage/status", "Fullscreen Input Cage Status API"),
    ("/api/blackbox/status", "Stutter Blackbox Flight Recorder Status API"),
    ("/api/blackbox/buffer", "Stutter Blackbox Rolling Telemetry Buffer API"),
    ("/api/shader_sweeper/status", "Shader Cache Sweeper Status API"),
    ("/api/shader_sweeper/scan", "Shader Cache Sweeper Multi-Vendor Scan API"),
    ("/api/saves/status", "Save-State Time Machine Status API"),
    ("/api/saves/snapshots", "Save-State Time Machine Snapshots API"),
    ("/api/loadout/status", "Instant Loadout Switcher Status API"),
    ("/api/sens/status", "Config & Sens Sync Status API"),
    ("/api/sens/scan", "Config & Sens Local Game Config Scan API"),
    ("/api/voice_ducking/status", "Voice-Ducking Audio Mixer Status API"),
    ("/api/preflight/status", "Desktop Server Radar Status API"),
    ("/api/preflight/servers", "Desktop Server Radar Watchlist API"),
    ("/api/my-ip-info", "Public IP & Geo-Recommendation API")
]

failed = []
passed = []

for path, desc in endpoints:
    url = f"http://127.0.0.1:8000{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ModularSuiteTester/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            status = res.status
            if status == 200:
                passed.append((path, desc, status))
                print(f"[PASS] {status} OK  | {desc} ({path})")
            else:
                failed.append((path, desc, status, "Non-200"))
                print(f"[FAIL] {status}     | {desc} ({path})")
    except Exception as e:
        failed.append((path, desc, 0, str(e)))
        print(f"[FAIL] ERROR   | {desc} ({path}) -> {e}")

print("\n" + "="*60)
print(f"MODULAR TEST SUMMARY: {len(passed)}/{len(endpoints)} PASSED")
print("="*60)

if failed:
    sys.exit(1)
else:
    print("ALL DECOUPLED MODULES OPERATING FLAWLESSLY WITH 0 ERRORS!")
