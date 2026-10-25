"""
OCR GRABBER ROUTER • Independent API endpoints for Screen-Snip AI OCR
No code mixed with other modules.
"""

from fastapi import APIRouter
from typing import Dict, Any
from services.ocr_grabber import ocr_grabber

router = APIRouter(prefix="/api/ocr", tags=["Screen-Snip OCR Grabber"])

@router.post("/snip_region")
async def snip_screen_region(payload: Dict[str, Any]):
    """Captures a specific screen region and extracts text to clipboard."""
    left = int(payload.get("left", 0))
    top = int(payload.get("top", 0))
    right = int(payload.get("right", 0))
    bottom = int(payload.get("bottom", 0))
    copy = bool(payload.get("copy", True))
    return ocr_grabber.grab_region(left, top, right, bottom, copy_to_clipboard=copy)

@router.post("/full_screen")
async def grab_full_screen(payload: Dict[str, Any] = None):
    """Captures entire display and extracts all visible text straight to clipboard."""
    copy = True
    if payload:
        copy = bool(payload.get("copy", True))
    return ocr_grabber.grab_full_screen(copy_to_clipboard=copy)

@router.post("/file")
async def ocr_image_file(payload: Dict[str, Any]):
    """Extracts text from an image file path (PNG, JPG, BMP)."""
    f_path = payload.get("file_path", "")
    copy = bool(payload.get("copy", True))
    return ocr_grabber.ocr_image_file(f_path, copy_to_clipboard=copy)

@router.get("/history")
async def get_ocr_history():
    """Returns recent OCR snippet history."""
    return {"history": ocr_grabber.get_history()}
