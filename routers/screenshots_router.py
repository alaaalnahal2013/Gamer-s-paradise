"""
SCREENSHOTS ROUTER • Independent API endpoints for Smart Screenshot Indexer
No code mixed with other modules.
"""

from fastapi import APIRouter
from services.screenshot_indexer import screenshot_indexer

router = APIRouter(prefix="/api/screenshots", tags=["Smart Screenshot Indexer"])

@router.on_event("startup")
async def startup_screenshot_watcher():
    screenshot_indexer.start_watcher()

@router.get("/search")
async def search_screenshots(q: str = "", category: str = ""):
    """Instant search for receipts, Wi-Fi credentials, errors, code snippets in screenshots."""
    results = screenshot_indexer.search(q, category)
    return {"count": len(results), "results": results}

@router.post("/scan_all")
async def scan_all_screenshots():
    """Scans and indexes all existing screenshots in watch directory."""
    indexed_count = screenshot_indexer.scan_all_existing()
    return {"indexed_count": indexed_count, "status": screenshot_indexer.get_status()}

@router.post("/rename/{item_id}")
async def rename_screenshot(item_id: int):
    """Renames a screenshot file using its smart AI-detected title."""
    return screenshot_indexer.rename_file(item_id)

@router.get("/status")
async def get_screenshots_status():
    """Returns watch directory status and category counts."""
    return screenshot_indexer.get_status()
