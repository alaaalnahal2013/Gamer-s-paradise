"""
GAMER'S PARADISE • Automated Executable Builder & Updater
Compiles and packages Gamer's paradise.exe with all perks, assets, and decoupled modules.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent

def build_executable():
    print("=" * 60)
    print("  🔨 BUILDING GAMER'S PARADISE.EXE")
    print("=" * 60)

    pyinstaller_exe = BASE_DIR / ".venv" / "Scripts" / "pyinstaller.exe"
    if not pyinstaller_exe.exists():
        pyinstaller_exe = shutil.which("pyinstaller")
        if not pyinstaller_exe:
            print("[ERROR] PyInstaller not found. Please run pip install pyinstaller.")
            return False

    # PyInstaller arguments
    cmd = [
        str(pyinstaller_exe),
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name=Gamer's paradise",
        "--add-data=static;static",
        "--add-data=routers;routers",
        "--add-data=services;services",
        "--add-data=vpn_service.py;.",
        "--add-data=overlay_hud.py;.",
        "--add-data=server.py;.",
        "--clean",
        str(BASE_DIR / "app_desktop.py")
    ]

    print(f"[Build] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(BASE_DIR))
    if result.returncode != 0:
        print("[ERROR] PyInstaller build failed.")
        return False

    dist_exe = BASE_DIR / "dist" / "Gamer's paradise" / "Gamer's paradise.exe"
    # Also compile the smart launcher executable at root
    try:
        csc_paths = [
            r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
            r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
        ]
        csc = next((p for p in csc_paths if os.path.exists(p)), shutil.which("csc"))
        if csc and (BASE_DIR / "launcher.cs").exists():
            subprocess.run([csc, "/target:winexe", f"/out:{BASE_DIR / 'Gamer\'s paradise.exe'}", str(BASE_DIR / "launcher.cs")], cwd=str(BASE_DIR))
            print("[Build Success] Native C# Launcher compiled to root 'Gamer\'s paradise.exe'")
    except Exception as e:
        print(f"[Warning] Launcher compilation notice: {e}")

    try:
        launcher_bat = BASE_DIR / "Gamer's paradise.bat"
        with open(launcher_bat, "w", encoding="utf-8") as f:
            f.write(
                '@echo off\n'
                'set "DIR=%~dp0"\n'
                'if exist "%DIR%.venv\\Scripts\\pythonw.exe" (\n'
                '    start "" "%DIR%.venv\\Scripts\\pythonw.exe" "%DIR%app_desktop.py" %*\n'
                ') else if exist "%DIR%dist\\Gamer\'s paradise\\Gamer\'s paradise.exe" (\n'
                '    start "" "%DIR%dist\\Gamer\'s paradise\\Gamer\'s paradise.exe" %*\n'
                ') else (\n'
                '    start http://127.0.0.1:8000\n'
                ')\n'
            )
        print(f"[Build Success] Fast launcher generated: {launcher_bat}")
    except Exception as e:
        print(f"[Warning] Launcher link notice: {e}")

    print("\n" + "=" * 60)
    print("  🎉 Gamer's paradise.exe ready to run!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    build_executable()
