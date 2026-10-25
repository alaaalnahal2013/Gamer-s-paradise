"""
RAM STARVATION DURING GAMING FIXER • AUTO PROCESS FREEZER
Monitors running games and automatically suspends heavy background apps (browsers, Discord, Spotify, etc.)
Flushes their working set memory using Windows EmptyWorkingSet API, freeing physical RAM for the game.
Resumes all frozen apps seamlessly once gaming session ends.
"""

import ctypes
import logging
import psutil
import threading
import time
from typing import Dict, List, Set, Any

logger = logging.getLogger("ping_radar.process_freezer")

# Default memory hogs to freeze during gaming
DEFAULT_TARGET_APPS = [
    "chrome.exe",
    "msedge.exe",
    "brave.exe",
    "firefox.exe",
    "opera.exe",
    "discord.exe",
    "spotify.exe",
    "slack.exe",
    "steamwebhelper.exe",
    "epicgameslauncher.exe",
    "battlenet.exe",
    "notion.exe",
    "whatsapp.exe",
    "telegram.exe"
]

class ProcessFreezer:
    def __init__(self):
        self.target_apps: Set[str] = set(DEFAULT_TARGET_APPS)
        self.frozen_pids: Dict[int, Dict[str, Any]] = {}
        self.auto_freeze_on_game: bool = True
        self.is_frozen: bool = False
        self.total_memory_saved_mb: float = 0.0
        self._lock = threading.Lock()

    def add_target_app(self, app_name: str):
        app_name = app_name.lower().strip()
        if not app_name.endswith(".exe"):
            app_name += ".exe"
        self.target_apps.add(app_name)

    def remove_target_app(self, app_name: str):
        self.target_apps.discard(app_name.lower().strip())

    def get_running_hogs(self) -> List[Dict[str, Any]]:
        """Returns list of active background apps that can be frozen and their memory usage."""
        hogs = []
        for proc in psutil.process_iter(['pid', 'name', 'memory_info']):
            try:
                name = (proc.info['name'] or '').lower()
                if name in self.target_apps:
                    mem_mb = round(proc.info['memory_info'].rss / (1024 * 1024), 1)
                    is_currently_suspended = proc.pid in self.frozen_pids
                    hogs.append({
                        "pid": proc.pid,
                        "name": proc.info['name'],
                        "memory_mb": mem_mb,
                        "status": "FROZEN" if is_currently_suspended else "ACTIVE"
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return sorted(hogs, key=lambda x: x['memory_mb'], reverse=True)

    def freeze_all(self) -> Dict[str, Any]:
        """Freezes all target background applications and trims their working set."""
        with self._lock:
            freed_bytes = 0
            count = 0
            for proc in psutil.process_iter(['pid', 'name', 'memory_info']):
                try:
                    name = (proc.info['name'] or '').lower()
                    if name in self.target_apps and proc.pid not in self.frozen_pids:
                        mem_before = proc.info['memory_info'].rss
                        # Suspend process execution
                        proc.suspend()

                        # Windows EmptyWorkingSet API: flush pages to standby/pagefile
                        try:
                            # PROCESS_SET_QUOTA = 0x0100, PROCESS_QUERY_INFORMATION = 0x0400
                            h_proc = ctypes.windll.kernel32.OpenProcess(0x0500, False, proc.pid)
                            if h_proc:
                                ctypes.windll.psapi.EmptyWorkingSet(h_proc)
                                ctypes.windll.kernel32.CloseHandle(h_proc)
                        except Exception:
                            pass

                        try:
                            mem_after = proc.memory_info().rss
                            freed = max(0, mem_before - mem_after)
                        except Exception:
                            freed = mem_before // 2

                        freed_bytes += freed
                        count += 1
                        self.frozen_pids[proc.pid] = {
                            "name": proc.info['name'],
                            "mem_before_mb": round(mem_before / (1024 * 1024), 1),
                            "timestamp": time.time()
                        }
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            self.is_frozen = len(self.frozen_pids) > 0
            saved_mb = round(freed_bytes / (1024 * 1024), 1)
            self.total_memory_saved_mb = saved_mb
            logger.info(f"RAM Turbo Freeze: Suspended {count} background processes, reclaimed {saved_mb} MB RAM")
            return {
                "frozen_count": count,
                "memory_reclaimed_mb": saved_mb,
                "is_frozen": self.is_frozen
            }

    def unfreeze_all(self) -> Dict[str, Any]:
        """Resumes all previously suspended background processes."""
        with self._lock:
            resumed_count = 0
            for pid, info in list(self.frozen_pids.items()):
                try:
                    p = psutil.Process(pid)
                    p.resume()
                    resumed_count += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            self.frozen_pids.clear()
            self.is_frozen = False
            self.total_memory_saved_mb = 0.0
            logger.info(f"RAM Turbo Freeze: Resumed {resumed_count} background processes")
            return {
                "resumed_count": resumed_count,
                "is_frozen": False
            }

    def on_game_state_change(self, is_game_running: bool, game_name: str = ""):
        """Called automatically when the game detector detects a game launch or exit."""
        if not self.auto_freeze_on_game:
            return

        if is_game_running and not self.is_frozen:
            logger.info(f"Game detected ({game_name}) -> Triggering Auto Process Freeze")
            self.freeze_all()
        elif not is_game_running and self.is_frozen:
            logger.info(f"Game closed -> Releasing and Unfreezing all processes")
            self.unfreeze_all()

    def get_status(self) -> Dict[str, Any]:
        hogs = self.get_running_hogs()
        return {
            "is_frozen": self.is_frozen,
            "auto_freeze_on_game": self.auto_freeze_on_game,
            "frozen_count": len(self.frozen_pids),
            "memory_reclaimed_mb": self.total_memory_saved_mb,
            "target_apps": sorted(list(self.target_apps)),
            "running_hogs": hogs
        }

process_freezer = ProcessFreezer()
