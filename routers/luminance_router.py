"""
LUMINANCE GUARD ROUTER • Independent API endpoints for White Flash Defense
No code mixed with other modules.
"""

from fastapi import APIRouter
from typing import Dict, Any
from services.luminance_guard import luminance_guard

router = APIRouter(prefix="/api/luminance", tags=["Luminance Guard"])

@router.get("/status")
async def get_luminance_status():
    """Returns live screen luminance and hardware DDC/CI backlight settings."""
    return luminance_guard.get_status()

@router.post("/toggle")
async def toggle_luminance_guard(payload: Dict[str, Any]):
    """Enables or disables screen luminance monitoring."""
    enable = payload.get("enabled", True)
    if enable:
        luminance_guard.start()
    else:
        luminance_guard.stop()
    return luminance_guard.get_status()

@router.post("/test")
async def test_glare_flash():
    """Simulates a 2.5-second white flash dimming defense."""
    return luminance_guard.test_trigger()

@router.post("/settings")
async def update_luminance_settings(payload: Dict[str, Any]):
    """Configures white flash threshold, target dimming level, and night schedule."""
    if "threshold" in payload:
        luminance_guard.flash_threshold = int(payload["threshold"])
    if "dimmed" in payload:
        luminance_guard.dimmed_brightness = int(payload["dimmed"])
    if "always_active" in payload:
        luminance_guard.always_active = bool(payload["always_active"])
    return luminance_guard.get_status()
