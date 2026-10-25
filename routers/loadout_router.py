"""
LOADOUT ROUTER • REST API endpoints for Instant Loadout Switcher
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.loadout_switcher import loadout_switcher

router = APIRouter(prefix="/api/loadout", tags=["Loadout Switcher"])

class CreateProfileRequest(BaseModel):
    game_id: str
    profile_name: str
    source_folder: Optional[str] = None

class ActivateProfileRequest(BaseModel):
    game_id: str
    profile_name: str
    link_destination_path: str

class DeleteProfileRequest(BaseModel):
    game_id: str
    profile_name: str

@router.get("/status")
def get_loadout_status():
    return loadout_switcher.get_status()

@router.get("/profiles")
def list_profiles(game_id: str, active_link_target: Optional[str] = None):
    return {
        "game_id": game_id,
        "profiles": loadout_switcher.list_profiles(game_id, active_link_target)
    }

@router.post("/create")
def create_profile(req: CreateProfileRequest):
    return loadout_switcher.create_profile(req.game_id, req.profile_name, req.source_folder)

@router.post("/activate")
def activate_profile(req: ActivateProfileRequest):
    return loadout_switcher.activate_profile(req.game_id, req.profile_name, req.link_destination_path)

@router.post("/delete")
def delete_profile(req: DeleteProfileRequest):
    return loadout_switcher.delete_profile(req.game_id, req.profile_name)
