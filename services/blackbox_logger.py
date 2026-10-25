"""
STUTTER BLACKBOX LOGGER • 60-SECOND ROLLING TELEMETRY & SPIKE CULPRIT ISOLATOR
Maintains 60-second rolling flight recorder of CPU, RAM, Disk I/O, Network, and active processes.
Freezes incidents instantly to pinpoint the exact Windows process causing mid-match FPS stutter.
"""

from collections import deque
import logging
import psutil
import threading
import time
from typing import Dict, List, Any, Optional

logger = logging.getLogger("ping_radar.blackbox_logger")

class BlackboxLogger:
    def __init__(self, buffer_seconds: int = 60):
        self.buffer_seconds = buffer_seconds
        self.buffer: deque = deque(maxlen=buffer_seconds)
        self.frozen_incident: Optional[Dict[str, Any]] = None
        self.is_frozen: bool = False
        self.total_incidents_recorded: int = 0
        
        self._prev_disk_io = None
        self._prev_net_io = None
        self._prev_time = time.time()
        
        self._lock = threading.Lock()
        self._running = True
        self._collector_thread: Optional[threading.Thread] = None

        self._start_collector()

    def _start_collector(self):
        # Prime psutil metrics
        psutil.cpu_percent(interval=None)
        self._prev_disk_io = psutil.disk_io_counters()
        self._prev_net_io = psutil.net_io_counters()
        self._prev_time = time.time()

        self._collector_thread = threading.Thread(target=self._collector_loop, daemon=True)
        self._collector_thread.start()

    def _collector_loop(self):
        while self._running:
            try:
                now = time.time()
                dt = max(now - self._prev_time, 0.1)
                self._prev_time = now

                # 1. System Overall
                cpu_pct = psutil.cpu_percent(interval=None)
                mem = psutil.virtual_memory()
                ram_pct = mem.percent
                ram_used_gb = round(mem.used / (1024**3), 2)
                ram_total_gb = round(mem.total / (1024**3), 2)

                # 2. Disk I/O Rate
                curr_disk = psutil.disk_io_counters()
                disk_read_mbs = 0.0
                disk_write_mbs = 0.0
                if curr_disk and self._prev_disk_io:
                    disk_read_mbs = round((curr_disk.read_bytes - self._prev_disk_io.read_bytes) / (1024 * 1024 * dt), 2)
                    disk_write_mbs = round((curr_disk.write_bytes - self._prev_disk_io.write_bytes) / (1024 * 1024 * dt), 2)
                self._prev_disk_io = curr_disk

                # 3. Network I/O Rate
                curr_net = psutil.net_io_counters()
                net_sent_kbs = 0.0
                net_recv_kbs = 0.0
                if curr_net and self._prev_net_io:
                    net_sent_kbs = round((curr_net.bytes_sent - self._prev_net_io.bytes_sent) / (1024 * dt), 1)
                    net_recv_kbs = round((curr_net.bytes_recv - self._prev_net_io.bytes_recv) / (1024 * dt), 1)
                self._prev_net_io = curr_net

                # 4. Top Active Processes
                top_procs = []
                for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
                    try:
                        info = p.info
                        mem_info = info.get('memory_info')
                        p_mem = round(mem_info.rss / (1024 * 1024), 1) if mem_info else 0.0
                        top_procs.append({
                            "pid": info.get('pid', 0),
                            "name": info.get('name') or 'unknown',
                            "cpu": info.get('cpu_percent') or 0.0,
                            "ram_mb": p_mem
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied, KeyError):
                        continue

                # Sort by CPU usage descending, take top 4
                top_procs.sort(key=lambda x: x["cpu"], reverse=True)
                top_consumers = top_procs[:4]

                record = {
                    "timestamp": round(now, 1),
                    "cpu_percent": cpu_pct,
                    "ram_percent": ram_pct,
                    "ram_used_gb": ram_used_gb,
                    "ram_total_gb": ram_total_gb,
                    "disk_read_mbs": max(disk_read_mbs, 0.0),
                    "disk_write_mbs": max(disk_write_mbs, 0.0),
                    "net_recv_kbs": max(net_recv_kbs, 0.0),
                    "net_sent_kbs": max(net_sent_kbs, 0.0),
                    "top_processes": top_consumers,
                    "is_spike": (cpu_pct > 80.0 or disk_write_mbs > 35.0 or ram_pct > 92.0)
                }

                with self._lock:
                    if not self.is_frozen:
                        self.buffer.append(record)

            except Exception as e:
                logger.error(f"[Blackbox] Collection loop error: {e}")

            time.sleep(1.0)

    def freeze_incident(self) -> Dict[str, Any]:
        """Freezes the rolling buffer, isolates peak lag culprit, and generates post-mortem."""
        with self._lock:
            self.is_frozen = True
            records = list(self.buffer)
            self.total_incidents_recorded += 1

            if not records:
                analysis = {
                    "verdict": "No telemetry recorded yet",
                    "culprit": "None",
                    "peak_cpu": 0,
                    "peak_disk": 0,
                    "timestamp": time.time()
                }
            else:
                peak_cpu_rec = max(records, key=lambda r: r["cpu_percent"])
                peak_disk_rec = max(records, key=lambda r: r["disk_write_mbs"] + r["disk_read_mbs"])

                culprit_proc = "System Normal"
                bottleneck_type = "Clean (No Severe Bottleneck)"
                severity = "Low"

                if peak_disk_rec["disk_write_mbs"] > 30.0:
                    bottleneck_type = "Disk I/O Thrashing"
                    severity = "Critical"
                    # Find top process during peak disk
                    if peak_disk_rec["top_processes"]:
                        culprit_proc = peak_disk_rec["top_processes"][0]["name"]
                elif peak_cpu_rec["cpu_percent"] > 85.0:
                    bottleneck_type = "CPU Core Saturation"
                    severity = "High"
                    if peak_cpu_rec["top_processes"]:
                        culprit_proc = peak_cpu_rec["top_processes"][0]["name"]
                elif records[-1]["ram_percent"] > 90.0:
                    bottleneck_type = "RAM Depletion / Paging"
                    severity = "High"
                    if records[-1]["top_processes"]:
                        culprit_proc = records[-1]["top_processes"][0]["name"]

                analysis = {
                    "verdict": f"Stutter triggered by {bottleneck_type} ({severity})",
                    "culprit_process": culprit_proc,
                    "bottleneck_type": bottleneck_type,
                    "severity": severity,
                    "peak_cpu_percent": peak_cpu_rec["cpu_percent"],
                    "peak_disk_write_mbs": peak_disk_rec["disk_write_mbs"],
                    "peak_timestamp": peak_cpu_rec["timestamp"],
                    "diagnosis": f"Primary culprit is {culprit_proc}. Peak resource demand caused thread preemption and micro-stutter in the active game engine.",
                    "recommendation": f"Add {culprit_proc} to RAM Process Freezer whitelist or suspend during competitive matches."
                }

            self.frozen_incident = {
                "frozen_at": time.time(),
                "analysis": analysis,
                "history": records
            }
            logger.info(f"[Blackbox] Incident frozen: {analysis['verdict']} (Culprit: {analysis.get('culprit_process')})")
            return self.frozen_incident

    def reset_buffer(self) -> Dict[str, Any]:
        """Resumes rolling live capture."""
        with self._lock:
            self.is_frozen = False
            self.frozen_incident = None
            return {"status": "ok", "message": "Blackbox rolling logger resumed"}

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            history = list(self.buffer)
            latest = history[-1] if history else None
            return {
                "is_frozen": self.is_frozen,
                "buffer_size": len(history),
                "max_seconds": self.buffer_seconds,
                "total_incidents": self.total_incidents_recorded,
                "latest": latest,
                "frozen_incident": self.frozen_incident
            }

    def get_buffer(self) -> List[Dict[str, Any]]:
        with self._lock:
            if self.is_frozen and self.frozen_incident:
                return self.frozen_incident["history"]
            return list(self.buffer)

blackbox_logger = BlackboxLogger()
