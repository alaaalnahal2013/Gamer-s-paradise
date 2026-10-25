"""
SENS ROUTER • REST API endpoints for Config & Sens Sync
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.sens_sync import sens_sync

router = APIRouter(prefix="/api/sens", tags=["Sens Sync"])

class CalcRequest(BaseModel):
    dpi: int
    source_game_id: str
    sensitivity: float

@router.get("/status")
def get_sens_status():
    return sens_sync.get_status()

@router.post("/calculate")
def calculate_sens(req: CalcRequest):
    return sens_sync.calculate_sync(req.dpi, req.source_game_id, req.sensitivity)

@router.get("/scan")
def scan_configs():
    return {"configs": sens_sync.scan_local_configs()}
