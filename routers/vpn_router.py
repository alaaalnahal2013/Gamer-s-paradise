"""
VPN ROUTER • Independent API endpoints for Gaming VPN & IP Cloaking Shield
No code mixed with other modules.
"""

from fastapi import APIRouter
from typing import Dict, Any
from vpn_service import vpn_manager, COUNTRY_NODES

router = APIRouter(prefix="/api/vpn", tags=["Gaming VPN & IP Shield"])

@router.get("/status")
async def get_vpn_status():
    """Returns current VPN connection status, masked exit IP, and country node."""
    return vpn_manager.get_status()

@router.get("/countries")
async def get_vpn_countries():
    """Returns list of 10 regional relay datacenter nodes with ping estimates."""
    return {
        "countries": COUNTRY_NODES,
        "active": vpn_manager.current_country_code,
        "enabled": vpn_manager.enabled
    }

@router.post("/connect")
async def connect_vpn(payload: Dict[str, Any]):
    """Connects to a specific country relay node (de, gb, us-east, jp, etc.)."""
    c_code = payload.get("country_code", "de")
    return vpn_manager.connect(c_code)

@router.post("/disconnect")
async def disconnect_vpn():
    """Disconnects the VPN relay and restores standard routing."""
    return vpn_manager.disconnect()

@router.post("/toggle_killswitch")
async def toggle_killswitch(payload: Dict[str, Any]):
    """Enables or disables the emergency kill switch."""
    enable = payload.get("enabled", True)
    val = vpn_manager.toggle_kill_switch(enable)
    return {"kill_switch": val}

@router.post("/toggle_system_proxy")
async def toggle_system_proxy(payload: Dict[str, Any]):
    """Enables or disables system-wide proxy routing."""
    enable = payload.get("enabled", True)
    val = vpn_manager.toggle_system_proxy(enable)
    return {"system_proxy": val}
