"""
PREFLIGHT ROUTER • REST API endpoints for Desktop Server Radar
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.preflight_radar import preflight_radar

router = APIRouter(prefix="/api/preflight", tags=["Preflight Radar"])

class AddServerRequest(BaseModel):
    name: str
    game: Optional[str] = "Custom"
    ip: str
    port: int = 27015

class RemoveServerRequest(BaseModel):
    id: str

class ProbeRequest(BaseModel):
    ip: str
    port: int = 27015

@router.get("/status")
def get_preflight_status():
    return preflight_radar.get_status()

@router.get("/servers")
def get_servers():
    return {"servers": preflight_radar.get_watchlist()}

@router.post("/probe")
def probe_server(req: ProbeRequest):
    return preflight_radar.probe_direct(req.ip, req.port)

@router.post("/add")
def add_server(req: AddServerRequest):
    return preflight_radar.add_server(req.name, req.game or "Custom", req.ip, req.port)

@router.post("/remove")
def remove_server(req: RemoveServerRequest):
    return preflight_radar.remove_server(req.id)
