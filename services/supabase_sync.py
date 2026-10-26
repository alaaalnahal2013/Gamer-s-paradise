"""
GAMER'S PARADISE • Supabase Cloud Synchronization Service
Enables cloud backups of gamer profiles, game sensitivities, ping records, and settings.
"""

import os
import json
import urllib.request
import urllib.error
from pathlib import Path

# Load environment variables from .env file if present
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.is_file():
    try:
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    _k, _v = _k.strip(), _v.strip().strip("'\"")
                    if _k and _k not in os.environ:
                        os.environ[_k] = _v
    except Exception:
        pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

def is_supabase_configured() -> bool:
    """Returns True if Supabase credentials are present."""
    return bool(SUPABASE_URL and SUPABASE_KEY)

def sync_profile_to_cloud(gamer_tag: str, ip_info: dict = None) -> dict:
    """
    Upserts the local gamer profile and IP telemetry into the 'gamer_profiles' Supabase table.
    """
    if not is_supabase_configured():
        return {"status": "skipped", "message": "Supabase credentials not configured in environment"}

    url = f"{SUPABASE_URL}/rest/v1/gamer_profiles"
    payload = {
        "gamer_tag": gamer_tag,
        "public_ip": ip_info.get("public_ip") if ip_info else "Unknown",
        "city": ip_info.get("city") if ip_info else "Unknown",
        "country": ip_info.get("country_name") if ip_info else "Unknown",
        "best_node": ip_info.get("best_node") if ip_info else "Unknown"
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "resolution=merge-duplicates"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return {"status": "success", "code": resp.status}
    except Exception as e:
        return {"status": "error", "error": str(e)}

def fetch_cloud_leaderboard() -> list:
    """
    Fetches community ping radar stats from Supabase 'gamer_profiles' table.
    """
    if not is_supabase_configured():
        return []

    url = f"{SUPABASE_URL}/rest/v1/gamer_profiles?select=gamer_tag,country,best_node,updated_at&order=updated_at.desc&limit=25"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
