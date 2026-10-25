"""
CLIPBOARD ROUTER • Independent API endpoints for Clean Paste Interceptor
No code mixed with other modules.
"""

from fastapi import APIRouter
from typing import Dict, Any
import pyperclip
from services.clean_clipboard import clean_clipboard

router = APIRouter(prefix="/api/clipboard", tags=["Clean Paste Interceptor"])

@router.on_event("startup")
async def startup_clean_clipboard():
    clean_clipboard.start()

@router.get("/status")
async def get_clipboard_status():
    """Returns clean paste metrics (tracking params purged, PDF wraps healed)."""
    return clean_clipboard.get_status()

@router.post("/toggle")
async def toggle_clean_clipboard(payload: Dict[str, Any]):
    """Enables or disables automatic clipboard sanitization."""
    enable = payload.get("enabled", True)
    if enable:
        clean_clipboard.start()
    else:
        clean_clipboard.stop()
    return clean_clipboard.get_status()

@router.post("/clean_now")
async def clean_clipboard_now():
    """Immediately cleans the current content on the Windows clipboard."""
    try:
        cur = pyperclip.paste()
        cleaned, details = clean_clipboard.clean_text_content(cur)
        if details.get("was_modified"):
            pyperclip.copy(cleaned)
        return {"original": cur, "cleaned": cleaned, "details": details}
    except Exception as e:
        return {"error": str(e)}
