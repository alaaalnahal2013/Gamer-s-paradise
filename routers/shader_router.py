"""
SHADER ROUTER • REST API endpoints for Shader Cache Sweeper
"""

from fastapi import APIRouter
from services.shader_sweeper import shader_sweeper

router = APIRouter(prefix="/api/shader_sweeper", tags=["Shader Sweeper"])

@router.get("/status")
def get_shader_sweeper_status():
    return shader_sweeper.get_status()

@router.get("/scan")
def scan_shader_caches():
    return shader_sweeper.scan()

@router.post("/clean")
def clean_shader_caches():
    return shader_sweeper.clean()
