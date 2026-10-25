"""
AUDIO ROUTER • Independent API endpoints for Audio Lock Daemon
No code mixed with other modules.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from services.audio_daemon import audio_daemon

router = APIRouter(prefix="/api/audio", tags=["Audio Lock Daemon"])

@router.get("/devices")
async def get_audio_devices():
    """Lists all available playback and capture audio hardware endpoints."""
    return audio_daemon.get_all_devices()

@router.post("/lock_speaker")
async def lock_speaker(payload: Dict[str, Any]):
    """Locks user's preferred primary speaker/headset."""
    dev_id = payload.get("device_id", "")
    dev_name = payload.get("name", "")
    if not dev_id:
        raise HTTPException(status_code=400, detail="device_id is required")
    audio_daemon.lock_speaker(dev_id, dev_name)
    return {"status": "ok", "locked_speaker": dev_name or dev_id}

@router.post("/lock_mic")
async def lock_mic(payload: Dict[str, Any]):
    """Locks user's preferred primary microphone."""
    dev_id = payload.get("device_id", "")
    dev_name = payload.get("name", "")
    if not dev_id:
        raise HTTPException(status_code=400, detail="device_id is required")
    audio_daemon.lock_microphone(dev_id, dev_name)
    return {"status": "ok", "locked_mic": dev_name or dev_id}

@router.post("/unlock")
async def unlock_audio(payload: Dict[str, Any]):
    """Unlocks audio device lock."""
    dev_type = payload.get("type", "all")
    if dev_type in ("speaker", "all"):
        audio_daemon.unlock_speaker()
    if dev_type in ("mic", "all"):
        audio_daemon.unlock_microphone()
    return {"status": "ok", "unlocked": dev_type}

@router.get("/status")
async def get_audio_status():
    """Returns current lock status and switch prevention history."""
    return audio_daemon.get_status()
