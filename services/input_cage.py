"""
FULLSCREEN INPUT CAGE • ACCIDENTAL KEY & MULTI-MONITOR MINIMIZE SHIELD
Swallows Windows Key, suppresses Sticky Keys 5x Shift prompt, and locks mouse cursor inside
primary game monitor bounds (user32.ClipCursor) to prevent accidental minimizes mid-fight.
"""

import ctypes
from ctypes import wintypes
import logging
import psutil
import threading
import time
from typing import Dict, Any, Optional

logger = logging.getLogger("ping_radar.input_cage")

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# RECT structure for ClipCursor
class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]

# STICKYKEYS structure for SystemParametersInfo
class STICKYKEYS(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("dwFlags", wintypes.DWORD),
    ]

SPI_GETSTICKYKEYS = 0x003A
SPI_SETSTICKYKEYS = 0x003B
SKF_HOTKEYACTIVE = 0x00000004

WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
VK_LWIN = 0x5B
VK_RWIN = 0x5C

# Common competitive games
KNOWN_GAMES = [
    "cs2.exe", "csgo.exe", "valorant-win64-shipping.exe", "valorant.exe",
    "r5apex.exe", "dota2.exe", "overwatch.exe", "fortniteclient-win64-shipping.exe",
    "cod.exe", "modernwarfare.exe", "rainbowsix.exe", "leagueclient.exe",
    "pubg.exe", "destiny2.exe", "rustclient.exe", "rocketleague.exe", "gta5.exe"
]

HOOKPROC = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)

class InputCage:
    def __init__(self):
        self.is_caged: bool = False
        self.auto_cage_on_game: bool = True
        self.detected_game: Optional[str] = None
        self.original_sticky_flags: Optional[int] = None
        self.cursor_locked: bool = False
        self.win_key_blocked: bool = False
        self.sticky_keys_disabled: bool = False
        self.lock_rect: Dict[str, int] = {"left": 0, "top": 0, "right": 1920, "bottom": 1080}
        
        self._hook_id = None
        self._hook_thread: Optional[threading.Thread] = None
        self._hook_thread_id: Optional[int] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._running: bool = True
        self._lock = threading.Lock()

        # Start auto game monitor thread
        self._start_monitor_thread()

    def _start_monitor_thread(self):
        self._monitor_thread = threading.Thread(target=self._game_monitor_loop, daemon=True)
        self._monitor_thread.start()

    def _game_monitor_loop(self):
        """Continuously checks if a competitive game is running to auto-activate cage."""
        while self._running:
            try:
                found_game = None
                for proc in psutil.process_iter(['name']):
                    try:
                        pname = (proc.info['name'] or '').lower()
                        if pname in KNOWN_GAMES:
                            found_game = pname
                            break
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                with self._lock:
                    self.detected_game = found_game
                    if self.auto_cage_on_game:
                        if found_game and not self.is_caged:
                            logger.info(f"[InputCage] Competitive game detected: {found_game}. Auto-activating Input Cage.")
                            self._activate_cage_internal()
                        elif not found_game and self.is_caged:
                            logger.info("[InputCage] Game exited. Auto-releasing Input Cage.")
                            self._release_cage_internal()
            except Exception as e:
                logger.error(f"[InputCage] Monitor loop error: {e}")
            time.sleep(2.0)

    def _lock_cursor_to_primary(self):
        """Restricts mouse cursor to primary monitor display bounds."""
        try:
            width = user32.GetSystemMetrics(0)   # SM_CXSCREEN
            height = user32.GetSystemMetrics(1)  # SM_CYSCREEN
            rect = RECT(0, 0, width, height)
            success = user32.ClipCursor(ctypes.byref(rect))
            if success:
                self.cursor_locked = True
                self.lock_rect = {"left": 0, "top": 0, "right": width, "bottom": height}
                logger.info(f"[InputCage] Cursor caged to primary monitor bounds: {width}x{height}")
            return bool(success)
        except Exception as e:
            logger.error(f"[InputCage] Failed to clip cursor: {e}")
            return False

    def _unlock_cursor(self):
        """Releases cursor clipping."""
        try:
            user32.ClipCursor(None)
            self.cursor_locked = False
            logger.info("[InputCage] Cursor clipping released.")
        except Exception as e:
            logger.error(f"[InputCage] Failed to unlock cursor: {e}")

    def _disable_sticky_keys(self):
        """Suppresses Windows 5x Shift Sticky Keys popup dialog."""
        try:
            sk = STICKYKEYS()
            sk.cbSize = ctypes.sizeof(STICKYKEYS)
            if user32.SystemParametersInfoW(SPI_GETSTICKYKEYS, sk.cbSize, ctypes.byref(sk), 0):
                if self.original_sticky_flags is None:
                    self.original_sticky_flags = sk.dwFlags
                sk.dwFlags &= ~SKF_HOTKEYACTIVE
                user32.SystemParametersInfoW(SPI_SETSTICKYKEYS, sk.cbSize, ctypes.byref(sk), 0)
                self.sticky_keys_disabled = True
                logger.info("[InputCage] Sticky Keys 5x Shift popup suppressed.")
        except Exception as e:
            logger.error(f"[InputCage] Error disabling sticky keys: {e}")

    def _restore_sticky_keys(self):
        """Restores user's original sticky keys preference."""
        if self.original_sticky_flags is not None:
            try:
                sk = STICKYKEYS()
                sk.cbSize = ctypes.sizeof(STICKYKEYS)
                sk.dwFlags = self.original_sticky_flags
                user32.SystemParametersInfoW(SPI_SETSTICKYKEYS, sk.cbSize, ctypes.byref(sk), 0)
                self.sticky_keys_disabled = False
                logger.info("[InputCage] Sticky Keys restored.")
            except Exception as e:
                logger.error(f"[InputCage] Error restoring sticky keys: {e}")

    def _low_level_keyboard_proc(self, nCode, wParam, lParam):
        if nCode >= 0:
            vk_code = ctypes.cast(lParam, ctypes.POINTER(wintypes.DWORD)).contents.value
            # Swallow Left Win Key and Right Win Key
            if vk_code in (VK_LWIN, VK_RWIN):
                return 1  # Swallow event
        return user32.CallNextHookEx(self._hook_id, nCode, wParam, lParam)

    def _hook_loop(self):
        """Runs Windows message loop for the low-level keyboard hook."""
        self._hook_thread_id = kernel32.GetCurrentThreadId()
        self._hook_callback = HOOKPROC(self._low_level_keyboard_proc)
        self._hook_id = user32.SetWindowsHookExW(
            WH_KEYBOARD_LL,
            self._hook_callback,
            kernel32.GetModuleHandleW(None),
            0
        )
        if not self._hook_id:
            logger.warning("[InputCage] Could not install low-level keyboard hook for Win key.")
            return

        self.win_key_blocked = True
        msg = wintypes.MSG()
        while self.is_caged and user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

        if self._hook_id:
            user32.UnhookWindowsHookEx(self._hook_id)
            self._hook_id = None
        self.win_key_blocked = False

    def _activate_cage_internal(self):
        self.is_caged = True
        self._lock_cursor_to_primary()
        self._disable_sticky_keys()

        # Start keyboard hook thread if not running
        if self._hook_thread is None or not self._hook_thread.is_alive():
            self._hook_thread = threading.Thread(target=self._hook_loop, daemon=True)
            self._hook_thread.start()

    def _release_cage_internal(self):
        self.is_caged = False
        self._unlock_cursor()
        self._restore_sticky_keys()

        if self._hook_thread_id:
            user32.PostThreadMessageW(self._hook_thread_id, 0x0012, 0, 0)  # WM_QUIT
        self.win_key_blocked = False

    def activate(self) -> Dict[str, Any]:
        """Manually locks cursor, blocks Win key, and disables Sticky Keys."""
        with self._lock:
            self._activate_cage_internal()
            return self.get_status()

    def release(self) -> Dict[str, Any]:
        """Manually unlocks cursor and restores normal OS key behavior."""
        with self._lock:
            self._release_cage_internal()
            return self.get_status()

    def toggle(self) -> Dict[str, Any]:
        with self._lock:
            if self.is_caged:
                self._release_cage_internal()
            else:
                self._activate_cage_internal()
            return self.get_status()

    def set_auto_cage(self, enabled: bool) -> Dict[str, Any]:
        with self._lock:
            self.auto_cage_on_game = bool(enabled)
            return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        return {
            "active": self.is_caged,
            "cursor_locked": self.cursor_locked,
            "win_key_blocked": self.win_key_blocked,
            "sticky_keys_disabled": self.sticky_keys_disabled,
            "auto_cage_on_game": self.auto_cage_on_game,
            "detected_game": self.detected_game,
            "monitor_bounds": self.lock_rect
        }

input_cage = InputCage()
