"""
UNSELECTABLE TEXT ON SCREEN FIXER • SCREEN-SNIP OCR GRABBER
Grabs screen regions (YouTube videos, game error popups, non-copyable IDE/browser text),
runs local high-accuracy Windows Media OCR (winocr), and pushes the clean text directly
to the Windows clipboard (pyperclip).
"""

import asyncio
import io
import logging
import os
import threading
import time
from typing import Dict, List, Optional, Any
from PIL import Image, ImageGrab
import pyperclip
import winocr

logger = logging.getLogger("ping_radar.ocr_grabber")

class OcrGrabber:
    def __init__(self):
        self.history: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    async def ocr_pil_image(self, img: Image.Image) -> str:
        """Runs Windows Native AI OCR on a PIL Image."""
        try:
            # Ensure RGB
            if img.mode != 'RGB':
                img = img.convert('RGB')
            result = await winocr.recognize_pil(img, 'en')
            return result.text.strip()
        except Exception as e:
            logger.error(f"winocr recognition error: {e}")
            return ""

    def grab_region(self, left: int, top: int, right: int, bottom: int, copy_to_clipboard: bool = True) -> Dict[str, Any]:
        """Captures a specific screen bounding box, extracts text, and copies to clipboard."""
        try:
            # Reorder if dragged backwards
            x1 = min(left, right)
            x2 = max(left, right)
            y1 = min(top, bottom)
            y2 = max(top, bottom)

            if x2 - x1 < 5 or y2 - y1 < 5:
                return {"success": False, "error": "Selected area too small"}

            img = ImageGrab.grab(bbox=(x1, y1, x2, y2))
            text = asyncio.run(self.ocr_pil_image(img))

            if copy_to_clipboard and text:
                pyperclip.copy(text)

            entry = {
                "id": int(time.time() * 1000),
                "text": text,
                "bbox": [x1, y1, x2, y2],
                "char_count": len(text),
                "copied": copy_to_clipboard and bool(text),
                "timestamp": time.strftime("%H:%M:%S")
            }

            with self._lock:
                self.history.insert(0, entry)
                if len(self.history) > 30:
                    self.history.pop()

            logger.info(f"Screen-Snip OCR Grabber: Extracted {len(text)} characters from ({x1},{y1},{x2},{y2})")
            return {
                "success": True,
                "text": text,
                "copied_to_clipboard": copy_to_clipboard and bool(text),
                "char_count": len(text),
                "timestamp": entry["timestamp"]
            }
        except Exception as e:
            logger.error(f"Failed to grab region: {e}")
            return {"success": False, "error": str(e)}

    def grab_full_screen(self, copy_to_clipboard: bool = True) -> Dict[str, Any]:
        """Captures the entire screen and extracts all visible text."""
        try:
            img = ImageGrab.grab(all_screens=True)
            text = asyncio.run(self.ocr_pil_image(img))

            if copy_to_clipboard and text:
                pyperclip.copy(text)

            entry = {
                "id": int(time.time() * 1000),
                "text": text,
                "bbox": "full_screen",
                "char_count": len(text),
                "copied": copy_to_clipboard and bool(text),
                "timestamp": time.strftime("%H:%M:%S")
            }

            with self._lock:
                self.history.insert(0, entry)
                if len(self.history) > 30:
                    self.history.pop()

            return {
                "success": True,
                "text": text,
                "copied_to_clipboard": copy_to_clipboard and bool(text),
                "char_count": len(text)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ocr_image_file(self, file_path: str, copy_to_clipboard: bool = True) -> Dict[str, Any]:
        """Extracts text from an image file (PNG, JPG, BMP)."""
        clean_path = file_path.strip().strip('"').strip("'")
        if not os.path.exists(clean_path):
            return {"success": False, "error": "File does not exist"}

        try:
            img = Image.open(clean_path)
            text = asyncio.run(self.ocr_pil_image(img))

            if copy_to_clipboard and text:
                pyperclip.copy(text)

            entry = {
                "id": int(time.time() * 1000),
                "text": text,
                "file_path": clean_path,
                "char_count": len(text),
                "copied": copy_to_clipboard and bool(text),
                "timestamp": time.strftime("%H:%M:%S")
            }

            with self._lock:
                self.history.insert(0, entry)
                if len(self.history) > 30:
                    self.history.pop()

            return {
                "success": True,
                "text": text,
                "copied_to_clipboard": copy_to_clipboard and bool(text),
                "char_count": len(text)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.history)

ocr_grabber = OcrGrabber()
