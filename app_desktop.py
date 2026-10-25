"""
GAMER'S PARADISE • Native Desktop Window Application
Embedded hardware-accelerated desktop window with real-time auto-reload,
FastAPI telemetry server daemon, and all 10 gaming perks loaded instantly.
"""

import os
import sys
import time
import socket
import threading
import subprocess
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Base Directory Resolution (Supports both source and PyInstaller frozen modes)
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).resolve().parent
    if hasattr(sys, '_MEIPASS'):
        BUNDLE_DIR = Path(sys._MEIPASS).resolve()
    else:
        BUNDLE_DIR = BASE_DIR
else:
    BASE_DIR = Path(__file__).resolve().parent
    BUNDLE_DIR = BASE_DIR

# Ensure working directory is BASE_DIR so relative assets and databases are found
os.chdir(str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR))
if str(BUNDLE_DIR) != str(BASE_DIR):
    sys.path.insert(0, str(BUNDLE_DIR))

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8000
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((SERVER_HOST, port)) == 0

def start_backend_server():
    """Starts the FastAPI backend inside a background daemon thread if not already running."""
    if is_port_in_use(SERVER_PORT):
        print(f"[Gamer's Paradise] Backend server already active on {SERVER_URL}")
        return

    print(f"[Gamer's Paradise] Starting background telemetry server on {SERVER_URL}...")
    import uvicorn
    from server import app

    server_thread = threading.Thread(
        target=lambda: uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_level="warning"),
        daemon=True
    )
    server_thread.start()

def wait_for_server(timeout: float = 12.0) -> bool:
    """Polls until the server responds with 200 OK."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{SERVER_URL}/api/games", timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False

def launch_native_window():
    """Launches the modern desktop window via pywebview or fallback to Windows Native App Mode."""
    # Attempt 1: pywebview (Embedded Edge Chromium WebView2)
    try:
        import webview
        print("[Gamer's Paradise] Launching via Microsoft Edge WebView2...")
        window = webview.create_window(
            title="Gamer's Paradise - Esports Network & Hardware Suite",
            url=SERVER_URL,
            width=1340,
            height=860,
            min_size=(1024, 680),
            background_color="#0b0f19",
            text_select=True,
            zoomable=True
        )
        webview.start(debug=False)
        return
    except Exception as e:
        print(f"[Gamer's Paradise] pywebview notice: {e}. Falling back to Windows Native App Mode...")

    # Attempt 2: Microsoft Edge Native App Mode (100% available on Windows 10/11)
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe")
    ]
    for ep in edge_paths:
        if os.path.exists(ep):
            print(f"[Gamer's Paradise] Launching standalone application window via: {ep}")
            app_args = [
                ep,
                f"--app={SERVER_URL}",
                "--window-size=1340,860",
                "--window-position=80,60",
                f"--user-data-dir={os.path.expandvars(r'%LocalAppData%\GamersParadise\AppProfile')}",
                "--no-first-run",
                "--no-default-browser-check"
            ]
            proc = subprocess.Popen(app_args)
            proc.wait()
            return

    # Attempt 3: Google Chrome Native App Mode
    chrome_paths = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe")
    ]
    for cp in chrome_paths:
        if os.path.exists(cp):
            print(f"[Gamer's Paradise] Launching standalone application window via: {cp}")
            proc = subprocess.Popen([
                cp,
                f"--app={SERVER_URL}",
                "--window-size=1340,860",
                f"--user-data-dir={os.path.expandvars(r'%LocalAppData%\GamersParadise\ChromeProfile')}"
            ])
            proc.wait()
            return

    # Attempt 4: Default System Browser
    import webbrowser
    webbrowser.open(SERVER_URL)

def main():
    print("=" * 60)
    print("   🎮 GAMER'S PARADISE &bull; ULTIMATE ESPORTS SUITE")
    print("   10 Perks Active &bull; Real-time Hardware & Network Telemetry")
    print("=" * 60)
    
    start_backend_server()
    if not wait_for_server():
        print("[ERROR] Could not start telemetry engine within timeout.")
        sys.exit(1)

    print("[Gamer's Paradise] Telemetry engine ready. Opening application...")
    launch_native_window()

if __name__ == "__main__":
    main()
