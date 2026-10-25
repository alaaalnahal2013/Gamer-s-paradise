"""
BLINDING WHITE FLASH AT NIGHT FIXER • LUMINANCE GUARD
Samples screen pixels every 200ms using low-overhead thumbnails.
If a pure white flash (PDF, legacy web page, light theme popup) is detected at night,
instantly drops the monitor hardware backlight via DDC/CI (screen_brightness_control)
to prevent retina shock. Restores original brightness once the glare subsides.
"""

from datetime import datetime
import logging
import threading
import time
from typing import Dict, Any, Optional
import numpy as np

logger = logging.getLogger("ping_radar.luminance_guard")

class LuminanceGuard:
    def __init__(self):
        self.enabled: bool = False
        self.always_active: bool = True  # If True, protects 24/7; if False, only 20:00 to 07:00
        self.flash_threshold: int = 195  # 0-255 scale (anything above ~195 is blinding white)
        self.dimmed_brightness: int = 20  # Brightness to drop to during blinding flash (%)
        self.original_brightness: int = 100
        self.is_currently_dimmed: bool = False
        self.current_luminance: float = 0.0
        self.recent_flashes_blocked: int = 0
        self.last_flash_time: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._sbc_available = False
        self._init_sbc()

    def _init_sbc(self):
        try:
            import screen_brightness_control as sbc
            cur = sbc.get_brightness()
            if cur:
                self.original_brightness = cur[0] if isinstance(cur, list) else cur
                self._sbc_available = True
        except Exception as e:
            logger.warning(f"screen_brightness_control initialization notice: {e}")
            self._sbc_available = False

    def is_night_time(self) -> bool:
        if self.always_active:
            return True
        hour = datetime.now().hour
        return hour >= 20 or hour < 7

    def sample_screen_luminance(self) -> float:
        """Captures a tiny 64x64 thumbnail of screen and computes average perceived luminance."""
        try:
            import mss
            with mss.mss() as sct:
                mon = sct.monitors[1]
                # Grab a tiny box in the center of the primary monitor (64x64)
                w, h = mon["width"], mon["height"]
                box = {
                    "top": mon["top"] + (h // 4),
                    "left": mon["left"] + (w // 4),
                    "width": min(128, w // 2),
                    "height": min(128, h // 2)
                }
                raw = np.array(sct.grab(box))
                # mss returns BGRA: raw[:, :, 0] is B, 1 is G, 2 is R
                lum = np.mean(0.299 * raw[:, :, 2] + 0.587 * raw[:, :, 1] + 0.114 * raw[:, :, 0])
                return float(lum)
        except Exception:
            # Fallback using PIL
            try:
                from PIL import ImageGrab
                img = ImageGrab.grab(bbox=(300, 300, 428, 428))
                arr = np.array(img)
                lum = np.mean(0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2])
                return float(lum)
            except Exception:
                return 0.0

    def start(self):
        if self.enabled and self._thread and self._thread.is_alive():
            return
        self.enabled = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._guard_loop, daemon=True, name="LuminanceGuard")
        self._thread.start()
        logger.info("Luminance Guard daemon started (200ms screen sampling)")

    def stop(self):
        self.enabled = False
        self._stop_event.set()
        if self.is_currently_dimmed:
            self._restore_brightness()
        logger.info("Luminance Guard daemon stopped")

    def _drop_brightness(self):
        try:
            import screen_brightness_control as sbc
            sbc.set_brightness(self.dimmed_brightness)
            self.is_currently_dimmed = True
            self.recent_flashes_blocked += 1
            self.last_flash_time = time.strftime("%H:%M:%S")
            logger.info(f"Luminance Guard: Blinding flash blocked! Backlight dropped to {self.dimmed_brightness}%")
        except Exception as e:
            logger.debug(f"Failed to set brightness: {e}")

    def _restore_brightness(self):
        try:
            import screen_brightness_control as sbc
            sbc.set_brightness(self.original_brightness)
            self.is_currently_dimmed = False
            logger.info(f"Luminance Guard: Glare subsided. Restored brightness to {self.original_brightness}%")
        except Exception as e:
            logger.debug(f"Failed to restore brightness: {e}")

    def _guard_loop(self):
        while not self._stop_event.is_set():
            try:
                if self.is_night_time():
                    lum = self.sample_screen_luminance()
                    self.current_luminance = round(lum, 1)

                    if lum >= self.flash_threshold:
                        if not self.is_currently_dimmed:
                            self._drop_brightness()
                    else:
                        if self.is_currently_dimmed and lum < (self.flash_threshold - 30):
                            self._restore_brightness()
            except Exception:
                pass

            time.sleep(0.2)  # 200ms cycle

    def test_trigger(self) -> Dict[str, Any]:
        """Manually trigger a 2-second flash defense test."""
        self._drop_brightness()
        threading.Timer(2.5, self._restore_brightness).start()
        return {
            "success": True,
            "message": f"Simulated glare flash: Dimmed to {self.dimmed_brightness}% for 2.5 seconds, then restoring to {self.original_brightness}%"
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "always_active": self.always_active,
            "flash_threshold": self.flash_threshold,
            "dimmed_brightness": self.dimmed_brightness,
            "original_brightness": self.original_brightness,
            "current_luminance": self.current_luminance,
            "is_currently_dimmed": self.is_currently_dimmed,
            "recent_flashes_blocked": self.recent_flashes_blocked,
            "last_flash_time": self.last_flash_time,
            "sbc_available": self._sbc_available
        }

luminance_guard = LuminanceGuard()
