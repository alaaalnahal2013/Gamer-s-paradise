"""
SAVE ROUTER • REST API endpoints for Save-State Time Machine
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.save_timemachine import save_timemachine

router = APIRouter(prefix="/api/saves", tags=["Save Time Machine"])

class BackupRequest(BaseModel):
    game_id: str
    save_path: str
    label: Optional[str] = "Manual Checkpoint"

class RestoreRequest(BaseModel):
    game_id: str
    snapshot_filename: str
    target_save_path: str

class ConfigRequest(BaseModel):
    game_id: str
    save_path: str
    auto_watch: bool

@router.get("/status")
def get_save_status():
    return save_timemachine.get_status()

@router.get("/snapshots")
def get_snapshots(game_id: Optional[str] = None):
    gid = game_id or save_timemachine.active_game_id
    return {"game_id": gid, "snapshots": save_timemachine.get_snapshots(gid)}

@router.post("/backup")
def create_backup(req: BackupRequest):
    return save_timemachine.create_snapshot(req.game_id, req.save_path, req.label or "Manual Checkpoint")

@router.post("/restore")
def restore_backup(req: RestoreRequest):
    return save_timemachine.restore_snapshot(req.game_id, req.snapshot_filename, req.target_save_path)

@router.post("/config")
def set_save_config(req: ConfigRequest):
    return save_timemachine.set_config(req.game_id, req.save_path, req.auto_watch)
