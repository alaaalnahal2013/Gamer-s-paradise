"""
INSTANT LOADOUT SWITCHER • ZERO-COPY MOD & SHADER PROFILE SWAPPER
Stores modpacks and shader configurations in isolated profile repositories.
Swaps active in-game directories in under 1 second using Windows Directory Junctions & Symlinks.
"""

import json
import logging
import os
from pathlib import Path
import shutil
import subprocess
import time
from typing import Dict, List, Any, Optional

logger = logging.getLogger("ping_radar.loadout_switcher")

BASE_PROFILES_DIR = Path(__file__).resolve().parent.parent / "profiles"
BASE_PROFILES_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_LOADOUT_GAMES = [
    {
        "id": "minecraft_mods",
        "name": "Minecraft (Mods)",
        "default_target": "%APPDATA%\\.minecraft\\mods",
        "category": "Mods"
    },
    {
        "id": "minecraft_shaders",
        "name": "Minecraft (Shaderpacks)",
        "default_target": "%APPDATA%\\.minecraft\\shaderpacks",
        "category": "Shaders"
    },
    {
        "id": "skyrim",
        "name": "Skyrim / Starfield Mods",
        "default_target": "%LOCALAPPDATA%\\ModOrganizer\\SkyrimSE\\mods",
        "category": "Mods"
    },
    {
        "id": "lethal_company",
        "name": "Lethal Company (BepInEx)",
        "default_target": "%APPDATA%\\Thunderstore Mod Manager\\DataFolder\\LethalCompany\\profiles",
        "category": "Mods"
    },
    {
        "id": "custom",
        "name": "Custom Game Mod/Shader Folder",
        "default_target": "",
        "category": "Custom"
    }
]

class LoadoutSwitcher:
    def __init__(self):
        self.active_game_id: str = "minecraft_mods"
        self._seed_default_sample_profiles()

    def _seed_default_sample_profiles(self):
        """Creates sample profile folders if none exist so user can immediately test switching."""
        mc_mods = BASE_PROFILES_DIR / "minecraft_mods"
        mc_mods.mkdir(parents=True, exist_ok=True)

        vanilla_p = mc_mods / "Vanilla Pure (Zero Mods)"
        if not vanilla_p.exists():
            vanilla_p.mkdir(exist_ok=True)
            (vanilla_p / "readme.txt").write_text("Clean vanilla environment for competitive multiplayer servers.\n", encoding="utf-8")

        perf_p = mc_mods / "Sodium & Lithium (FPS Boost)"
        if not perf_p.exists():
            perf_p.mkdir(exist_ok=True)
            (perf_p / "sodium-fabric-0.5.jar").write_text("# Sodium performance mod placeholder\n", encoding="utf-8")
            (perf_p / "lithium-fabric-0.11.jar").write_text("# Lithium optimization mod placeholder\n", encoding="utf-8")

    def _get_profiles_folder(self, game_id: str) -> Path:
        p = BASE_PROFILES_DIR / game_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def list_profiles(self, game_id: str, active_link_target: Optional[str] = None) -> List[Dict[str, Any]]:
        folder = self._get_profiles_folder(game_id)
        profiles = []
        
        # Check what the active link is currently pointing to
        resolved_link = None
        if active_link_target:
            link_p = Path(os.path.expandvars(active_link_target))
            if link_p.is_symlink() or link_p.exists():
                try:
                    resolved_link = str(link_p.resolve())
                except Exception:
                    pass

        for d in sorted(folder.iterdir()):
            if d.is_dir():
                file_count = sum(1 for _ in d.rglob("*") if _.is_file())
                size_mb = round(sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) / (1024 * 1024), 2)
                is_active = (resolved_link is not None and str(d.resolve()) == resolved_link)
                
                profiles.append({
                    "name": d.name,
                    "path": str(d),
                    "file_count": file_count,
                    "size_mb": size_mb,
                    "is_active": is_active,
                    "modified_time": d.stat().st_mtime
                })
        return profiles

    def create_profile(self, game_id: str, profile_name: str, source_folder: Optional[str] = None) -> Dict[str, Any]:
        """Creates a new loadout profile folder, optionally importing from an existing folder."""
        folder = self._get_profiles_folder(game_id)
        clean_name = "".join(c for c in profile_name if c.isalnum() or c in (" ", "-", "_")).strip()
        if not clean_name:
            return {"status": "error", "message": "Invalid profile name"}

        target_dir = folder / clean_name
        if target_dir.exists():
            return {"status": "error", "message": f"Profile '{clean_name}' already exists"}

        target_dir.mkdir(parents=True, exist_ok=True)

        if source_folder:
            src = Path(os.path.expandvars(source_folder))
            if src.exists() and src.is_dir():
                try:
                    shutil.copytree(str(src), str(target_dir), dirs_exist_ok=True)
                except Exception as e:
                    logger.warning(f"[Loadout] Partial copy notice: {e}")

        logger.info(f"[Loadout] Created profile: {clean_name} for game {game_id}")
        return {
            "status": "success",
            "profile_name": clean_name,
            "path": str(target_dir),
            "message": f"Profile '{clean_name}' created successfully!"
        }

    def activate_profile(self, game_id: str, profile_name: str, link_destination_path: str) -> Dict[str, Any]:
        """
        Instant 1-second loadout swap using Windows Directory Junctions / Symlinks.
        No multi-gigabyte file copying required!
        """
        folder = self._get_profiles_folder(game_id)
        profile_dir = folder / profile_name
        if not profile_dir.exists() or not profile_dir.is_dir():
            return {"status": "error", "message": f"Profile '{profile_name}' does not exist"}

        link_dest = Path(os.path.expandvars(link_destination_path))
        link_dest.parent.mkdir(parents=True, exist_ok=True)

        start_time = time.time()

        # If destination already exists:
        if link_dest.exists():
            if link_dest.is_symlink():
                link_dest.unlink()
            elif link_dest.is_dir():
                # Check if it is a directory junction
                try:
                    # On Windows, os.rmdir() removes junctions without deleting target contents
                    os.rmdir(str(link_dest))
                except OSError:
                    # If it's a real directory with existing user files, back it up to a profile first
                    safety_backup = folder / f"Previous_Active_{int(time.time())}"
                    shutil.move(str(link_dest), str(safety_backup))
                    logger.info(f"[Loadout] Preserved existing non-symlinked files to {safety_backup.name}")
            else:
                link_dest.unlink()

        # Create Junction using Windows mklink /J (requires no admin privileges)
        cmd = f'cmd.exe /c mklink /J "{link_dest}" "{profile_dir}"'
        res = subprocess.run(cmd, capture_output=True, text=True, shell=True)

        if res.returncode != 0:
            # Fallback to python os.symlink
            try:
                os.symlink(str(profile_dir), str(link_dest), target_is_directory=True)
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to create junction link: {res.stderr or str(e)}"
                }

        elapsed_ms = round((time.time() - start_time) * 1000, 1)
        logger.info(f"[Loadout] Swapped to profile '{profile_name}' in {elapsed_ms} ms via Directory Junction.")
        return {
            "status": "success",
            "profile_name": profile_name,
            "target_link": str(link_dest),
            "swap_time_ms": elapsed_ms,
            "message": f"⚡ Swapped to profile '{profile_name}' in {elapsed_ms} ms (Zero file duplication)!"
        }

    def delete_profile(self, game_id: str, profile_name: str) -> Dict[str, Any]:
        folder = self._get_profiles_folder(game_id)
        target = folder / profile_name
        if target.exists() and target.is_dir():
            shutil.rmtree(str(target), ignore_errors=True)
            return {"status": "success", "message": f"Profile '{profile_name}' deleted"}
        return {"status": "error", "message": "Profile not found"}

    def get_status(self) -> Dict[str, Any]:
        return {
            "active_game_id": self.active_game_id,
            "games": DEFAULT_LOADOUT_GAMES,
            "profiles": self.list_profiles(self.active_game_id)
        }

loadout_switcher = LoadoutSwitcher()
