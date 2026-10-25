"""
RAM FREEZER ROUTER • Independent API endpoints for Auto Process Freezer
No code mixed with other modules.
"""

from fastapi import APIRouter
from typing import Dict, Any
from services.process_freezer import process_freezer

router = APIRouter(prefix="/api/ram", tags=["RAM Process Freezer"])

@router.get("/hogs")
async def get_ram_hogs():
    """Returns list of heavy background apps and total memory consumption."""
    return {
        "hogs": process_freezer.get_running_hogs(),
        "status": process_freezer.get_status()
    }

@router.post("/freeze")
async def freeze_ram_hogs():
    """Suspends heavy background processes and flushes working set to reclaim RAM."""
    return process_freezer.freeze_all()

@router.post("/unfreeze")
async def unfreeze_ram_hogs():
    """Resumes all previously suspended background processes."""
    return process_freezer.unfreeze_all()

@router.post("/toggle_auto")
async def toggle_auto_freeze(payload: Dict[str, Any]):
    """Enables or disables auto-freeze when a fullscreen game starts."""
    val = payload.get("enabled", True)
    process_freezer.auto_freeze_on_game = bool(val)
    return {"auto_freeze_on_game": process_freezer.auto_freeze_on_game}

@router.post("/target_app")
async def manage_target_app(payload: Dict[str, Any]):
    """Adds or removes an application from the memory hog freeze list."""
    app_name = payload.get("app_name", "")
    action = payload.get("action", "add")
    if action == "add":
        process_freezer.add_target_app(app_name)
    else:
        process_freezer.remove_target_app(app_name)
    return {"target_apps": sorted(list(process_freezer.target_apps))}

@router.get("/status")
async def get_ram_status():
    """Returns current RAM freezer state and total reclaimed memory."""
    return process_freezer.get_status()
