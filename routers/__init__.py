"""
Routers package for modular Ping Radar & System Power Suite
Includes all Performance, Saves/Mods, Audio/Voice, and Tactical Pre-flight routers.
"""

from .audio_router import router as audio_router
from .ram_router import router as ram_router
from .sniper_router import router as sniper_router
from .luminance_router import router as luminance_router
from .ocr_router import router as ocr_router
from .screenshots_router import router as screenshots_router
from .clipboard_router import router as clipboard_router
from .netdiag_router import router as netdiag_router
from .vpn_router import router as vpn_router

# 8 New Performance & System Interruption Routers
from .input_cage_router import router as input_cage_router
from .blackbox_router import router as blackbox_router
from .shader_router import router as shader_router
from .save_router import router as save_router
from .loadout_router import router as loadout_router
from .sens_router import router as sens_router
from .voice_ducking_router import router as voice_ducking_router
from .preflight_router import router as preflight_router

__all__ = [
    "audio_router",
    "ram_router",
    "sniper_router",
    "luminance_router",
    "ocr_router",
    "screenshots_router",
    "clipboard_router",
    "netdiag_router",
    "vpn_router",
    # 8 New Routers
    "input_cage_router",
    "blackbox_router",
    "shader_router",
    "save_router",
    "loadout_router",
    "sens_router",
    "voice_ducking_router",
    "preflight_router"
]
