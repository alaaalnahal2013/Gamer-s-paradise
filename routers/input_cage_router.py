"""
INPUT CAGE ROUTER • REST API endpoints for Fullscreen Input Cage
"""

from fastapi import APIRouter
from pydantic import BaseModel
from services.input_cage import input_cage

router = APIRouter(prefix="/api/input_cage", tags=["Input Cage"])

class AutoCageRequest(BaseModel):
    enabled: bool

@router.get("/status")
def get_input_cage_status():
    return input_cage.get_status()

@router.post("/lock")
def lock_input_cage():
    return input_cage.activate()

@router.post("/unlock")
def unlock_input_cage():
    return input_cage.release()

@router.post("/toggle")
def toggle_input_cage():
    return input_cage.toggle()

@router.post("/auto")
def set_auto_cage(req: AutoCageRequest):
    return input_cage.set_auto_cage(req.enabled)
