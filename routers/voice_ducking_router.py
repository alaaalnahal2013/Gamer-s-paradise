"""
VOICE DUCKING ROUTER • REST API endpoints for Voice-Ducking Audio Mixer
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.voice_ducking import voice_ducking

router = APIRouter(prefix="/api/voice_ducking", tags=["Voice Ducking"])

class DuckingConfigRequest(BaseModel):
    enabled: bool
    duck_volume_pct: int = 30
    voice_app: Optional[str] = "discord.exe"
    game_app: Optional[str] = "cs2.exe"

class VolumeRequest(BaseModel):
    volume_percent: int

@router.get("/status")
def get_voice_ducking_status():
    return voice_ducking.get_status()

@router.post("/config")
def set_ducking_config(req: DuckingConfigRequest):
    return voice_ducking.configure(req.enabled, req.duck_volume_pct, req.voice_app or "discord.exe", req.game_app or "cs2.exe")

@router.post("/volume")
def set_game_volume(req: VolumeRequest):
    return voice_ducking.set_game_volume(req.volume_percent)
