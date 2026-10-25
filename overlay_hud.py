"""
PING RADAR &bull; NATIVE ALWAYS-ON-TOP IN-GAME HUD EXTENSION
Transparent, draggable floating esports telemetry HUD for full-screen / borderless PC games.
Connects directly to the local WebSocket telemetry engine (ws://127.0.0.1:8000/ws).
"""

import sys
import json
import threading
import time
import tkinter as tk
from tkinter import ttk

# WebSocket client
try:
    import websockets
    import asyncio
except ImportError:
    websockets = None
    asyncio = None

class InGameHudApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Ping Radar In-Game HUD")

        # Window styling: Frameless, Always on Top, Translucent dark glass
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        try:
            self.root.attributes("-alpha", 0.90)
        except Exception:
            pass

        # Dimensions & positioning (Top-right corner by default)
        self.width = 340
        self.height = 200
        self.min_height = 36
        self.is_collapsed = False

        screen_w = self.root.winfo_screenwidth()
        start_x = max(20, screen_w - self.width - 24)
        start_y = 36
        self.root.geometry(f"{self.width}x{self.height}+{start_x}+{start_y}")
        self.root.configure(bg="#060b13")

        # Dragging mechanics
        self.drag_start_x = 0
        self.drag_start_y = 0

        # State
        self.game_name = "Counter-Strike 2"
        self.best_server = "Scanning..."
        self.best_ping = "-- ms"
        self.best_region = "Worldwide Fleet"
        self.wifi_status = "Wi-Fi: Pro Clean (1.2 ms)"
        self.cmd_text = "mm_dedicated_search_maxping 45"
        self.status_color = "#00e599"

        self.build_ui()
        self.start_ws_thread()

    def build_ui(self):
        # Outer Border Box
        self.outer_frame = tk.Frame(self.root, bg="#131e33", bd=1)
        self.outer_frame.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)

        self.main_container = tk.Frame(self.outer_frame, bg="#080e1a")
        self.main_container.pack(fill=tk.BOTH, expand=True)

        # Title Bar / Drag Header
        self.header_bar = tk.Frame(self.main_container, bg="#0c1527", height=32)
        self.header_bar.pack(fill=tk.X, side=tk.TOP)
        self.header_bar.bind("<Button-1>", self.start_drag)
        self.header_bar.bind("<B1-Motion>", self.do_drag)

        self.lbl_game_tag = tk.Label(
            self.header_bar,
            text="🎮 CS2 EXTENSION",
            font=("Segoe UI", 9, "bold"),
            fg="#00e599",
            bg="#0c1527"
        )
        self.lbl_game_tag.pack(side=tk.LEFT, padx=10, pady=6)
        self.lbl_game_tag.bind("<Button-1>", self.start_drag)
        self.lbl_game_tag.bind("<B1-Motion>", self.do_drag)

        self.lbl_vpn_tag = tk.Label(
            self.header_bar,
            text="🛡️ REAL IP",
            font=("Segoe UI", 7, "bold"),
            fg="#f59e0b",
            bg="#0c1527"
        )
        self.lbl_vpn_tag.pack(side=tk.LEFT, padx=2)

        # Minimize / Collapse Button
        self.btn_toggle = tk.Button(
            self.header_bar,
            text="▲",
            font=("Segoe UI", 8),
            fg="#8493a8",
            bg="#0c1527",
            bd=0,
            activebackground="#14213d",
            activeforeground="#ffffff",
            cursor="hand2",
            command=self.toggle_collapse
        )
        self.btn_toggle.pack(side=tk.RIGHT, padx=4)

        # Close Button
        self.btn_close = tk.Button(
            self.header_bar,
            text="✕",
            font=("Segoe UI", 9),
            fg="#8493a8",
            bg="#0c1527",
            bd=0,
            activebackground="#f43f5e",
            activeforeground="#ffffff",
            cursor="hand2",
            command=self.root.destroy
        )
        self.btn_close.pack(side=tk.RIGHT, padx=4)

        # Content Body
        self.body_frame = tk.Frame(self.main_container, bg="#080e1a", padx=14, pady=10)
        self.body_frame.pack(fill=tk.BOTH, expand=True)

        # Hero Best Server Section
        self.hero_row = tk.Frame(self.body_frame, bg="#080e1a")
        self.hero_row.pack(fill=tk.X)

        self.lbl_best_label = tk.Label(
            self.hero_row,
            text="OPTIMAL MATCHMAKING SERVER",
            font=("Segoe UI", 7, "bold"),
            fg="#8493a8",
            bg="#080e1a"
        )
        self.lbl_best_label.pack(anchor="w")

        self.lbl_best_server = tk.Label(
            self.hero_row,
            text="EU Frankfurt (38 ms)",
            font=("Segoe UI", 13, "bold"),
            fg="#ffffff",
            bg="#080e1a"
        )
        self.lbl_best_server.pack(anchor="w", pady=(2, 0))

        # Wi-Fi vs Server Diagnostics Pill
        self.lbl_diag_status = tk.Label(
            self.body_frame,
            text="● Wi-Fi: 1.1 ms (Clean) | Route: Optimal",
            font=("Segoe UI", 8, "bold"),
            fg="#00e599",
            bg="#091424",
            padx=8,
            pady=3
        )
        self.lbl_diag_status.pack(fill=tk.X, pady=(8, 6))

        # In-Game Command / 1-Click Copy Bar
        self.cmd_row = tk.Frame(self.body_frame, bg="#09101d", bd=1, relief=tk.SOLID)
        self.cmd_row.pack(fill=tk.X, pady=(2, 0))

        self.lbl_cmd = tk.Label(
            self.cmd_row,
            text="mm_dedicated_search_maxping 45",
            font=("Consolas", 8, "bold"),
            fg="#00e599",
            bg="#09101d",
            padx=6,
            pady=4
        )
        self.lbl_cmd.pack(side=tk.LEFT)

        self.btn_copy = tk.Button(
            self.cmd_row,
            text="COPY",
            font=("Segoe UI", 7, "bold"),
            fg="#060b13",
            bg="#00e599",
            bd=0,
            activebackground="#05f2a4",
            cursor="hand2",
            padx=8,
            pady=2,
            command=self.copy_command
        )
        self.btn_copy.pack(side=tk.RIGHT, padx=4, pady=3)

    def start_drag(self, event):
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def do_drag(self, event):
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()
        new_x = cur_x + (event.x - self.drag_start_x)
        new_y = cur_y + (event.y - self.drag_start_y)
        self.root.geometry(f"+{new_x}+{new_y}")

    def toggle_collapse(self):
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()
        if not self.is_collapsed:
            self.body_frame.pack_forget()
            self.root.geometry(f"{self.width}x{self.min_height}+{cur_x}+{cur_y}")
            self.btn_toggle.config(text="▼")
            self.lbl_game_tag.config(text=f"🎮 {self.best_server}")
            self.is_collapsed = True
        else:
            self.body_frame.pack(fill=tk.BOTH, expand=True)
            self.root.geometry(f"{self.width}x{self.height}+{cur_x}+{cur_y}")
            self.btn_toggle.config(text="▲")
            self.lbl_game_tag.config(text=f"🎮 {self.game_name.upper()} EXTENSION")
            self.is_collapsed = False

    def copy_command(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.cmd_text)
        self.btn_copy.config(text="COPIED!", bg="#38bdf8")
        self.root.after(1400, lambda: self.btn_copy.config(text="COPY", bg="#00e599"))

    def update_telemetry(self, data):
        rec = data.get("recommendation", {})
        diag = data.get("diagnosis", {})
        det = data.get("detected_game")
        game_id = data.get("selected_game_id", "cs2")

        if det and det.get("name"):
            self.game_name = det.get("name")
        else:
            self.game_name = rec.get("game_name", game_id.upper())

        best = rec.get("best_server")
        if best and best.get("metrics"):
            m = best["metrics"]
            rtt = m.get("current_rtt", "--")
            self.best_server = f"{best.get('name')} ({rtt} ms)"
            self.lbl_best_server.config(text=self.best_server)
        else:
            self.lbl_best_server.config(text="Scanning global fleet...")

        if not self.is_collapsed:
            self.lbl_game_tag.config(text=f"🎮 {self.game_name.upper()} EXTENSION")
        else:
            self.lbl_game_tag.config(text=f"🎮 {self.best_server}")

        # VPN IP Shield Status
        vpn = data.get("vpn")
        if vpn and hasattr(self, 'lbl_vpn_tag'):
            if vpn.get("enabled"):
                self.lbl_vpn_tag.config(
                    text=f"🛡️ {vpn.get('flag')} {vpn.get('masked_ip')}",
                    fg="#00e599"
                )
            else:
                self.lbl_vpn_tag.config(
                    text="🛡️ REAL IP",
                    fg="#f59e0b"
                )

        # Diagnostics & 3-Point Diagnostic
        net_diag = data.get("net_diag")
        if net_diag and net_diag.get("bottleneck_title"):
            b_title = net_diag.get("bottleneck_title")
            sev = net_diag.get("severity")
            if sev == "danger":
                self.lbl_diag_status.config(
                    text=f"🚨 {b_title}",
                    fg="#f43f5e",
                    bg="#1a0c16"
                )
            elif sev == "warning":
                self.lbl_diag_status.config(
                    text=f"⚠️ {b_title}",
                    fg="#f59e0b",
                    bg="#1f1807"
                )
            else:
                self.lbl_diag_status.config(
                    text=f"● Net Pipeline: Clean ({b_title})",
                    fg="#00e599",
                    bg="#091424"
                )
        else:
            gw = next((t for t in data.get("targets", []) if t.get("is_gateway")), None)
            if gw and gw.get("metrics"):
                gw_rtt = gw["metrics"].get("current_rtt")
                gw_loss = gw["metrics"].get("packet_loss", 0)
                if gw_loss > 0 or (gw_rtt and gw_rtt > 15):
                    self.lbl_diag_status.config(
                        text=f"⚠️ Wi-Fi Bottleneck (+{gw_rtt}ms) - Check Router",
                        fg="#f43f5e",
                        bg="#1a0c16"
                    )
                else:
                    self.lbl_diag_status.config(
                        text=f"● Wi-Fi: {gw_rtt or 1.2} ms (Clean) | Route: Optimal",
                        fg="#00e599",
                        bg="#091424"
                    )

        # In-game console command
        if rec.get("matchmaking_cmd") and rec.get("recommended_max_ping"):
            self.cmd_text = f"{rec['matchmaking_cmd']} {rec['recommended_max_ping']}"
            self.lbl_cmd.config(text=self.cmd_text)

    def start_ws_thread(self):
        t = threading.Thread(target=self._ws_worker, daemon=True)
        t.start()

    def _ws_worker(self):
        asyncio.run(self._ws_loop())

    async def _ws_loop(self):
        uri = "ws://127.0.0.1:8000/ws"
        while True:
            try:
                async with websockets.connect(uri) as ws:
                    async for message in ws:
                        try:
                            payload = json.loads(message)
                            self.root.after(0, self.update_telemetry, payload)
                        except Exception:
                            pass
            except Exception:
                time.sleep(2)

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = InGameHudApp()
    app.run()
