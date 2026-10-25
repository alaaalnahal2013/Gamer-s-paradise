"""
NET DIAGNOSTIC ROUTER • Independent API endpoints for 3-Point Net Diagnostic
No code mixed with other modules.
"""

from fastapi import APIRouter
from services.net_diagnostic import net_diagnostic

router = APIRouter(prefix="/api/net_diagnostic", tags=["3-Point Net Diagnostic"])

@router.on_event("startup")
async def startup_net_diagnostic():
    net_diagnostic.start_polling()

@router.get("/latest")
async def get_latest_diagnostic():
    """Returns the most recent 3-point diagnostic bottleneck evaluation."""
    return net_diagnostic.last_diagnostic or await net_diagnostic.run_3point_diagnostic_async()

@router.post("/run")
async def run_diagnostic_now():
    """Immediately triggers a concurrent 3-point diagnostic run."""
    return await net_diagnostic.run_3point_diagnostic_async()

@router.get("/status")
async def get_diagnostic_status():
    """Returns diagnostic history and gateway/WAN endpoints."""
    return net_diagnostic.get_status()
