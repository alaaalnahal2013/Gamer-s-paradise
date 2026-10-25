"""
LOCK & PORT SNIPER ROUTER • Independent API endpoints for File & Port Sniper
No code mixed with other modules.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from services.sniper_service import sniper_service

router = APIRouter(prefix="/api/sniper", tags=["Lock & Port Sniper"])

@router.get("/port/{port}")
async def inspect_port(port: int):
    """Finds which program is occupying a given network port."""
    return sniper_service.inspect_port(port)

@router.get("/common_ports")
async def scan_common_ports():
    """Scans popular developer and gaming ports (3000, 5000, 8080, etc.)."""
    return {"ports": sniper_service.scan_common_ports()}

@router.post("/file_lock")
async def inspect_file_lock(payload: Dict[str, Any]):
    """Uses Windows RestartManager to reveal which process locks a file/folder."""
    f_path = payload.get("file_path", "")
    if not f_path:
        raise HTTPException(status_code=400, detail="file_path required")
    return sniper_service.inspect_file_lock(f_path)

@router.post("/kill/{pid}")
async def kill_culprit(pid: int):
    """Force-terminates a culprit process holding a lock or port."""
    return sniper_service.kill_process(pid)
