"""
SAVE-STATE TIME MACHINE • CONTINUOUS SAVE BACKUPS & 1-CLICK ROLLBACK
Monitors game save directories, generates timestamped .zip backups upon file modification,
maintains a rolling history of the last 20 saves, and restores any checkpoint with 1 click.
"""

import json
import logging
import os
from pathlib import Path
import shutil
import threading
import time
from typing import Dict, List, Any, Optional
import zipfile

logger = logging.getLogger("ping_radar.save_timemachine")

BASE_BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups" / "saves"
BASE_BACKUP_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_PRESETS = [
    {
        "id": "elden_ring",
        "name": "Elden Ring",
        "path_template": "%APPDATA%\\EldenRing"
    },
    {
        "id": "cyberpunk",
        "name": "Cyberpunk 2077",
        "path_template": "%USERPROFILE%\\Saved Games\\CD Projekt Red\\Cyberpunk 2077"
    },
    {
        "id": "bg3",
        "name": "Baldur's Gate 3",
        "path_template": "%LOCALAPPDATA%\\Larian Studios\\Baldur's Gate 3\\PlayerProfiles\\Public\\Savegames"
    },
    {
        "id": "minecraft",
        "name": "Minecraft Worlds",
        "path_template": "%APPDATA%\\.minecraft\\saves"
    },
    {
        "id": "palworld",
        "name": "Palworld",
        "path_template": "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames"
    },
    {
        "id": "custom",
        "name": "Custom Game Folder",
        "path_template": ""
    }
]

class SaveTimeMachine:
    def __init__(self, max_snapshots: int = 20):
        self.max_snapshots = max_snapshots
        self.active_game_id: str = "elden_ring"
        self.active_save_path: str = ""
        self.auto_watch_enabled: bool = False
        
        self._last_modified_time: float = 0.0
        self._last_backup_time: float = 0.0
        self._watch_thread: Optional[threading.Thread] = None
        self._running: bool = True
        self._lock = threading.Lock()

        # Resolve initial active path from presets
        self._apply_preset("elden_ring")
        self._start_watcher()

    def _apply_preset(self, game_id: str):
        for p in DEFAULT_PRESETS:
            if p["id"] == game_id and p["path_template"]:
                self.active_game_id = game_id
                self.active_save_path = os.path.expandvars(p["path_template"])
                break

    def _start_watcher(self):
        self._watch_thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._watch_thread.start()

    def _watch_loop(self):
        """Monitors active save folder and auto-triggers snapshot when files change (5s debounce)."""
        while self._running:
            try:
                if self.auto_watch_enabled and self.active_save_path:
                    save_dir = Path(self.active_save_path)
                    if save_dir.exists() and save_dir.is_dir():
                        latest_mtime = 0.0
                        for root, _, files in os.walk(str(save_dir)):
                            for f in files:
                                try:
                                    m = (Path(root) / f).stat().st_mtime
                                    if m > latest_mtime:
                                        latest_mtime = m
                                except Exception:
                                    pass

                        # If modified since last check and at least 5s has elapsed since save write
                        now = time.time()
                        if latest_mtime > self._last_modified_time:
                            self._last_modified_time = latest_mtime
                            # Give 4 seconds for game process to finish writing save blocks
                            time.sleep(4.0)
                            if now - self._last_backup_time > 15.0:  # Minimum 15s between auto-backups
                                logger.info(f"[SaveTimeMachine] Detected save file changes in {self.active_save_path}. Creating auto-snapshot.")
                                self.create_snapshot(self.active_game_id, self.active_save_path, "Auto-Save Checkpoint")
            except Exception as e:
                logger.error(f"[SaveTimeMachine] Watch loop error: {e}")

            time.sleep(3.0)

    def _get_game_backup_dir(self, game_id: str) -> Path:
        d = BASE_BACKUP_DIR / game_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def create_snapshot(self, game_id: str, save_path: str, label: str = "Manual Snapshot") -> Dict[str, Any]:
        """Creates a timestamped .zip archive of the specified save directory and rotates old snapshots."""
        with self._lock:
            p = Path(os.path.expandvars(save_path))
            if not p.exists():
                return {"status": "error", "message": f"Save folder does not exist: {save_path}"}

            backup_dir = self._get_game_backup_dir(game_id)
            timestamp_str = time.strftime("%Y%m%d_%H%M%S")
            clean_label = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in label)
            zip_filename = f"save_{timestamp_str}_{clean_label}.zip"
            zip_path = backup_dir / zip_filename

            # Create zip archive
            file_count = 0
            with zipfile.ZipFile(str(zip_path), "w", zipfile.ZIP_DEFLATED) as zipf:
                if p.is_file():
                    zipf.write(str(p), arcname=p.name)
                    file_count = 1
                else:
                    for root, _, files in os.walk(str(p)):
                        for f in files:
                            fp = Path(root) / f
                            arcname = fp.relative_to(p)
                            try:
                                zipf.write(str(fp), arcname=str(arcname))
                                file_count += 1
                            except Exception:
                                pass

            size_mb = round(zip_path.stat().st_size / (1024 * 1024), 2)
            self._last_backup_time = time.time()

            # Rotate: Keep only the last `max_snapshots` files
            all_zips = sorted(backup_dir.glob("save_*.zip"), key=lambda f: f.stat().st_mtime)
            while len(all_zips) > self.max_snapshots:
                oldest = all_zips.pop(0)
                try:
                    oldest.unlink()
                    logger.info(f"[SaveTimeMachine] Rotated out oldest save snapshot: {oldest.name}")
                except Exception:
                    pass

            logger.info(f"[SaveTimeMachine] Created snapshot: {zip_filename} ({file_count} files, {size_mb} MB)")
            return {
                "status": "success",
                "filename": zip_filename,
                "label": label,
                "size_mb": size_mb,
                "file_count": file_count,
                "created_at": time.time(),
                "message": f"Snapshot '{label}' successfully archived ({size_mb} MB)."
            }

    def restore_snapshot(self, game_id: str, snapshot_filename: str, target_save_path: str) -> Dict[str, Any]:
        """Restores a .zip snapshot over the target save path with automated safety pre-backup."""
        with self._lock:
            backup_dir = self._get_game_backup_dir(game_id)
            zip_path = backup_dir / snapshot_filename
            if not zip_path.exists():
                return {"status": "error", "message": f"Snapshot archive not found: {snapshot_filename}"}

            target = Path(os.path.expandvars(target_save_path))
            target.parent.mkdir(parents=True, exist_ok=True)

            # Safety step: Create safety backup of current target before overwriting
            if target.exists():
                safety_path = backup_dir / f"safety_pre_restore_{int(time.time())}.zip"
                try:
                    with zipfile.ZipFile(str(safety_path), "w", zipfile.ZIP_DEFLATED) as s_zip:
                        if target.is_file():
                            s_zip.write(str(target), arcname=target.name)
                        else:
                            for root, _, files in os.walk(str(target)):
                                for f in files:
                                    fp = Path(root) / f
                                    s_zip.write(str(fp), arcname=str(fp.relative_to(target)))
                except Exception as e:
                    logger.warning(f"[SaveTimeMachine] Pre-restore safety backup notice: {e}")

            # Extract snapshot
            try:
                with zipfile.ZipFile(str(zip_path), "r") as zipf:
                    zipf.extractall(str(target))
                logger.info(f"[SaveTimeMachine] Restored snapshot {snapshot_filename} to {target_save_path}")
                return {
                    "status": "success",
                    "restored_snapshot": snapshot_filename,
                    "target_path": str(target),
                    "message": f"Successfully restored '{snapshot_filename}'. Save state rolled back safely!"
                }
            except Exception as e:
                logger.error(f"[SaveTimeMachine] Restore failed: {e}")
                return {"status": "error", "message": f"Failed to restore save: {str(e)}"}

    def get_snapshots(self, game_id: str) -> List[Dict[str, Any]]:
        backup_dir = self._get_game_backup_dir(game_id)
        results = []
        for f in sorted(backup_dir.glob("save_*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                st = f.stat()
                results.append({
                    "filename": f.name,
                    "size_mb": round(st.st_size / (1024 * 1024), 2),
                    "modified_time": st.st_mtime,
                    "date_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
                })
            except Exception:
                pass
        return results

    def get_status(self) -> Dict[str, Any]:
        snapshots = self.get_snapshots(self.active_game_id)
        return {
            "active_game_id": self.active_game_id,
            "active_save_path": self.active_save_path,
            "auto_watch_enabled": self.auto_watch_enabled,
            "total_snapshots": len(snapshots),
            "max_snapshots": self.max_snapshots,
            "presets": DEFAULT_PRESETS,
            "recent_snapshots": snapshots[:5]
        }

    def set_config(self, game_id: str, save_path: str, auto_watch: bool) -> Dict[str, Any]:
        with self._lock:
            self.active_game_id = game_id
            self.active_save_path = save_path
            self.auto_watch_enabled = bool(auto_watch)
            return self.get_status()

save_timemachine = SaveTimeMachine()
