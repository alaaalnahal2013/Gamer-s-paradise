"""
CONFIG & SENS SYNC • UNIFIED CM/360 AIM MUSCLE MEMORY ENGINE
Converts sensitivities across game engines using exact physical cm/360 yaw mathematics.
Maintains muscle memory when switching between CS2, Valorant, Apex, Overwatch 2, CoD, and Fortnite.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger("ping_radar.sens_sync")

# Standard mouse yaw constants (degrees per count at sens 1.0)
ENGINES = [
    {
        "id": "cs2",
        "name": "Counter-Strike 2 / Source",
        "yaw": 0.022,
        "console_command": "sensitivity {val}",
        "config_file": "cs2_user_keys.vcfg",
        "decimals": 3
    },
    {
        "id": "valorant",
        "name": "Valorant (Riot Games)",
        "yaw": 0.070,
        "console_command": "In-Game Setting: {val}",
        "config_file": "RiotClientPrivateSettings.yaml",
        "decimals": 3
    },
    {
        "id": "apex",
        "name": "Apex Legends / Titanfall",
        "yaw": 0.022,
        "console_command": 'mouse_sensitivity "{val}"',
        "config_file": "settings.cfg",
        "decimals": 3
    },
    {
        "id": "overwatch",
        "name": "Overwatch 2 (Blizzard)",
        "yaw": 0.0066,
        "console_command": "In-Game Setting: {val}%",
        "config_file": "Settings_v0.ini",
        "decimals": 2
    },
    {
        "id": "cod",
        "name": "Call of Duty: Warzone / MW3",
        "yaw": 0.0066,
        "console_command": "Mouse Sensitivity: {val}",
        "config_file": "options.3.cod23.cst",
        "decimals": 2
    },
    {
        "id": "fortnite",
        "name": "Fortnite (Unreal Engine)",
        "yaw": 0.005555,
        "console_command": "X/Y Axis Sensitivity: {val}%",
        "config_file": "GameUserSettings.ini",
        "decimals": 2
    },
    {
        "id": "r6siege",
        "name": "Rainbow Six Siege",
        "yaw": 0.005728,
        "console_command": "RawSensitivity: {val}",
        "config_file": "GameSettings.ini",
        "decimals": 2
    }
]

class SensSync:
    def __init__(self):
        self.default_dpi: int = 800
        self.default_source: str = "cs2"
        self.default_sens: float = 1.25

    def calculate_sync(self, dpi: int, source_game_id: str, sens: float) -> Dict[str, Any]:
        """Calculates identical physical 360 turn distance and derives equivalent sensitivities for all games."""
        dpi = max(dpi, 100)
        sens = max(sens, 0.0001)

        source_engine = next((e for e in ENGINES if e["id"] == source_game_id), ENGINES[0])
        source_yaw = source_engine["yaw"]

        # Calculate true physical distance
        # cm/360 = (360 * 2.54) / (dpi * yaw * sens) = 914.4 / (dpi * yaw * sens)
        cm_360 = 914.4 / (dpi * source_yaw * sens)
        in_360 = cm_360 / 2.54
        edpi = round(dpi * sens, 1)

        # Aim Style Categorization
        if cm_360 < 22.0:
            category = "High Sensitivity / Wrist Flick"
            desc = "Fast reactive turning, ideal for arena shooters and close-quarters tracking."
        elif cm_360 <= 35.0:
            category = "Medium-Fast / Hybrid"
            desc = "Great balance between flick speed and smooth tracking (Apex & Overwatch standard)."
        elif cm_360 <= 50.0:
            category = "Tactical / Arm Aiming"
            desc = "Maximum micro-adjustment precision, standard for CS2 and Valorant competitive pros."
        else:
            category = "Ultra-Low / Desk Sweep"
            desc = "Extreme precision requiring broad arm sweeps across large desk mousepads."

        # Compute equivalent sensitivities for every other game
        conversions = []
        for target in ENGINES:
            target_yaw = target["yaw"]
            # target_sens = 914.4 / (dpi * target_yaw * cm_360)
            target_sens = round(914.4 / (dpi * target_yaw * cm_360), target["decimals"])
            cmd = target["console_command"].replace("{val}", str(target_sens))
            
            conversions.append({
                "id": target["id"],
                "name": target["name"],
                "sensitivity": target_sens,
                "edpi": round(dpi * target_sens, 1),
                "command": cmd,
                "is_source": target["id"] == source_game_id
            })

        return {
            "input": {
                "dpi": dpi,
                "source_game": source_engine["name"],
                "source_sens": sens
            },
            "physical_metrics": {
                "cm_per_360": round(cm_360, 2),
                "inches_per_360": round(in_360, 2),
                "edpi": edpi,
                "category": category,
                "description": desc
            },
            "converted_games": conversions
        }

    def scan_local_configs(self) -> List[Dict[str, Any]]:
        """Scans Steam and Game config folders for detected sensitivity settings."""
        found = []
        
        # Check Steam Userdata for CS2 / Apex configs
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        steam_userdata = Path(program_files_x86) / "Steam" / "userdata"
        if steam_userdata.exists():
            for user_id_dir in steam_userdata.iterdir():
                if user_id_dir.is_dir():
                    cs2_cfg = user_id_dir / "730" / "local" / "cfg" / "cs2_user_keys.vcfg"
                    if cs2_cfg.exists():
                        found.append({
                            "game": "Counter-Strike 2",
                            "file": str(cs2_cfg),
                            "status": "Detected"
                        })

        # Check Apex Saved Games
        userprofile = os.environ.get("USERPROFILE", "")
        apex_cfg = Path(userprofile) / "Saved Games" / "Respawn" / "Apex" / "local" / "settings.cfg"
        if apex_cfg.exists():
            found.append({
                "game": "Apex Legends",
                "file": str(apex_cfg),
                "status": "Detected"
            })

        return found

    def get_status(self) -> Dict[str, Any]:
        sample = self.calculate_sync(self.default_dpi, self.default_source, self.default_sens)
        return {
            "supported_engines": ENGINES,
            "sample_calculation": sample,
            "detected_configs": self.scan_local_configs()
        }

sens_sync = SensSync()
