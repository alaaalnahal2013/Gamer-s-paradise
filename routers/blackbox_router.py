"""
BLACKBOX ROUTER • REST API endpoints for Stutter Blackbox Flight Recorder
"""

from fastapi import APIRouter
from services.blackbox_logger import blackbox_logger

router = APIRouter(prefix="/api/blackbox", tags=["Blackbox Logger"])

@router.get("/status")
def get_blackbox_status():
    return blackbox_logger.get_status()

@router.get("/buffer")
def get_blackbox_buffer():
    return {"buffer": blackbox_logger.get_buffer()}

@router.post("/freeze")
def freeze_blackbox_incident():
    return blackbox_logger.freeze_incident()

@router.post("/reset")
def reset_blackbox_buffer():
    return blackbox_logger.reset_buffer()
