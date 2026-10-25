# 🎮 Gamer's Paradise • Esports Network & Hardware Suite

> High-performance gaming network radar, OS interruption shield, and hardware telemetry suite built with **`icmplib` concurrency**, **FastAPI**, **`pycaw` CoreAudio**, and responsive **Canvas 2D HUD visuals**.

Pings datacenters, eliminates OS minimize interruptions, logs stutter culprits, and keeps aim sensitivity consistent across every title.

---

## ⚡ Tactical Gaming & Hardware Perks

### 1. Performance & OS Interruptions
| Perk | Module | Core Functionality |
| :--- | :--- | :--- |
| **Fullscreen Input Cage** | `services/input_cage.py` | Swallows Win key (`WH_KEYBOARD_LL`), suppresses Sticky Keys 5x Shift dialog, and locks cursor to primary monitor (`user32.ClipCursor`) to prevent accidental minimizes mid-fight. |
| **Stutter Blackbox Logger** | `services/blackbox_logger.py` | 60-second rolling circular buffer tracking CPU, RAM, Disk I/O, and Network. Freeze instantly after a lag spike to isolate the exact process that spiked resources. |
| **Shader Cache Sweeper** | `services/shader_sweeper.py` | 1-click cleaner for stale corrupt DirectX (`D3DSCache`), GPU driver (`DXCache`, `GLCache` on NVIDIA, AMD, Intel), and game shader blobs; flushes standby memory. |
| **RAM Process Freezer** | `services/process_freezer.py` | Auto-suspends memory hogs (Chrome, Edge, Discord, Spotify) when a game launches via `EmptyWorkingSet`, restoring physical RAM. |
| **Lock & Port Sniper** | `services/sniper_service.py` | Resolves `EADDRINUSE` port conflicts (3000, 5000, 8000, 8080) and releases locked file handles using Windows `RestartManager`. |
| **Luminance Guard** | `services/luminance_guard.py` | Auto-dims monitor hardware backlight via DDC/CI in 200ms when bright white pages flash at night, preventing retina shock. |

### 2. Saves, Mods & Configs
| Perk | Module | Core Functionality |
| :--- | :--- | :--- |
| **Save-State Time Machine** | `services/save_timemachine.py` | Watches game save folders, automatically packs timestamped `.zip` backups upon file modification (5s debounce), keeps rolling 20 saves, and restores with 1 click. |
| **Instant Loadout Switcher** | `services/loadout_switcher.py` | Stores modpacks and shader configurations in separate directories. Swaps active profile in 1 second using Windows Directory Junctions without copying gigabytes of files. |
| **Config & Sens Sync** | `services/sens_sync.py` | Converts mouse sensitivity using physical cm/360 yaw mathematics across CS2, Valorant, Apex, Overwatch 2, CoD, and Fortnite to preserve muscle memory. |

### 3. Audio & Voice
| Perk | Module | Core Functionality |
| :--- | :--- | :--- |
| **Voice-Ducking Audio Mixer** | `services/voice_ducking.py` | Polls audio sessions (`pycaw`). When Discord / voice chat outputs speech, automatically drops game volume to 30%, restoring to 100% when speech ends. |
| **Audio Lock Daemon** | `services/audio_daemon.py` | Locks your preferred headset & mic via Windows CoreAudio COM; auto-reverts rogue peripheral switches in `<100ms`. |

### 4. Tactical Network & In-Game Overlay
| Perk | Module | Core Functionality |
| :--- | :--- | :--- |
| **Desktop Server Radar** | `services/preflight_radar.py` | Pings server IP and queries status port (UDP A2S & TCP handshake) before launching games. Shows live latency, jitter, and player counts; alerts when slots open. |
| **360° Tactical Radar** | `static/js/modules/radar_core.js` | Polar sweep displaying server distance zones (80ms / 150ms / 250ms), rolling 60s latency waveform, and jitter oscilloscopes. |
| **3-Point Fault Isolation** | `services/net_diagnostic.py` | Tests Local Gateway (`192.168.1.1`), ISP (`1.1.1.1`), and Game Servers to pinpoint: `LOCAL_WIFI_FAULT`, `ISP_FAULT`, or `SERVER_FAULT`. |
| **Matchmaking Optimizer** | `routers/` | Real-time ranked Region Ladder with 1-click in-game console commands (e.g. `mm_dedicated_search_maxping 45`) & synthetic voice callouts. |
| **In-Game HUD Overlay** | `overlay_hud.py` | Transparent Always-On-Top in-game window (`/overlay`) with Ghost Opacity modes (100% / 85% / 50%) and compact Mini-Bar ticker. |
| **Gaming VPN & IP Shield** | `vpn_service.py` | 12 regional relays, Steam/Game client IP cloaking (`+net_public_adr <ip>`), and Anti-DDoS emergency killswitch. |

---

## 🚀 Quick Launch

```powershell
# Run desktop app directly:
python app_desktop.py

# Or run the telemetry server:
python run.py
```

- **Dashboard**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **In-Game Transparent HUD**: [http://127.0.0.1:8000/overlay](http://127.0.0.1:8000/overlay)

```powershell
# Update dependencies, rebuild Gamer's paradise.exe, and test all 33 endpoints:
.\update_app.bat
```

---
*Built for competitive gamers, streamers, and developers who demand peak network stability and zero system interruptions.*
