"""
FILE LOCK & PORT MYSTERY FIXER • LOCK & PORT SNIPER
Identifies which mystery process is locking a file/folder or holding a network port (e.g. EADDRINUSE on port 3000).
Provides one-click process termination (proc.kill()) to unblock developers and gamers.
"""

import ctypes
from ctypes import wintypes
import logging
import os
import psutil
from typing import Dict, List, Optional, Any

logger = logging.getLogger("ping_radar.sniper")

# Windows Restart Manager Structures & Constants
CCH_RM_MAX_APP_NAME = 255
CCH_RM_MAX_SVC_NAME = 63

class RM_UNIQUE_PROCESS(ctypes.Structure):
    _fields_ = [
        ("dwProcessId", wintypes.DWORD),
        ("ProcessStartTime", wintypes.FILETIME)
    ]

class RM_PROCESS_INFO(ctypes.Structure):
    _fields_ = [
        ("Process", RM_UNIQUE_PROCESS),
        ("strAppName", wintypes.WCHAR * (CCH_RM_MAX_APP_NAME + 1)),
        ("strServiceShortName", wintypes.WCHAR * (CCH_RM_MAX_SVC_NAME + 1)),
        ("ApplicationType", wintypes.DWORD),
        ("AppStatus", wintypes.ULONG),
        ("TSSessionId", wintypes.DWORD),
        ("bRestartable", wintypes.BOOL)
    ]

COMMON_DEV_PORTS = [3000, 3001, 4200, 5000, 5173, 8000, 8080, 8081, 8888, 9229, 27017, 5432, 3306, 6379]

class SniperService:
    def __init__(self):
        self._rstrtmgr = None
        try:
            self._rstrtmgr = ctypes.windll.rstrtmgr
        except Exception as e:
            logger.warning(f"Could not load rstrtmgr.dll: {e}")

    def inspect_port(self, target_port: int) -> Dict[str, Any]:
        """Finds any process currently listening on or using target_port."""
        culprits = []
        try:
            target_port = int(target_port)
            for conn in psutil.net_connections(kind='inet'):
                if conn.laddr and conn.laddr.port == target_port:
                    pid = conn.pid
                    if pid:
                        culprit = self._get_process_details(pid)
                        culprit["local_address"] = f"{conn.laddr.ip}:{conn.laddr.port}"
                        culprit["status"] = conn.status
                        culprits.append(culprit)
        except Exception as e:
            logger.error(f"Error inspecting port {target_port}: {e}")

        # Deduplicate by PID
        unique_culprits = []
        seen = set()
        for c in culprits:
            if c["pid"] not in seen:
                seen.add(c["pid"])
                unique_culprits.append(c)

        return {
            "target_port": target_port,
            "is_occupied": len(unique_culprits) > 0,
            "culprits": unique_culprits
        }

    def scan_common_ports(self) -> List[Dict[str, Any]]:
        """Scans popular developer and gaming ports to see what is currently occupied."""
        results = []
        for port in COMMON_DEV_PORTS:
            info = self.inspect_port(port)
            if info["is_occupied"]:
                results.append(info)
        return results

    def inspect_file_lock(self, file_path: str) -> Dict[str, Any]:
        """Identifies what process is holding a lock on file_path."""
        clean_path = os.path.abspath(file_path.strip().strip('"').strip("'"))
        if not os.path.exists(clean_path):
            return {
                "file_path": clean_path,
                "exists": False,
                "is_locked": False,
                "error": "File or folder does not exist",
                "culprits": []
            }

        culprits = []

        # 1. Use Windows Restart Manager API (gold standard for file locks)
        if self._rstrtmgr:
            try:
                session_handle = wintypes.DWORD()
                session_key = (wintypes.WCHAR * 33)()
                res = self._rstrtmgr.RmStartSession(ctypes.byref(session_handle), 0, session_key)
                if res == 0:
                    try:
                        c_path = (wintypes.LPCWSTR * 1)(clean_path)
                        self._rstrtmgr.RmRegisterResources(session_handle, 1, c_path, 0, None, 0, None)
                        
                        n_proc_info_needed = wintypes.UINT()
                        n_proc_info = wintypes.UINT(16)
                        reboot_reasons = wintypes.DWORD()
                        proc_info_array = (RM_PROCESS_INFO * 16)()

                        res_get = self._rstrtmgr.RmGetList(
                            session_handle,
                            ctypes.byref(n_proc_info_needed),
                            ctypes.byref(n_proc_info),
                            proc_info_array,
                            ctypes.byref(reboot_reasons)
                        )

                        if res_get == 0:
                            for i in range(n_proc_info.value):
                                pid = proc_info_array[i].Process.dwProcessId
                                app_name = proc_info_array[i].strAppName
                                if pid > 0:
                                    detail = self._get_process_details(pid, fallback_name=app_name)
                                    culprits.append(detail)
                    finally:
                        self._rstrtmgr.RmEndSession(session_handle)
            except Exception as e:
                logger.warning(f"RestartManager failed for {clean_path}: {e}")

        # 2. Fallback: inspect open files via psutil
        if not culprits:
            try:
                clean_path_lower = clean_path.lower()
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        for f in proc.open_files():
                            if f.path.lower() == clean_path_lower or f.path.lower().startswith(clean_path_lower):
                                detail = self._get_process_details(proc.pid)
                                culprits.append(detail)
                                break
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            except Exception:
                pass

        return {
            "file_path": clean_path,
            "exists": True,
            "is_locked": len(culprits) > 0,
            "culprits": culprits
        }

    def kill_process(self, pid: int) -> Dict[str, Any]:
        """Force kills a culprit process holding a lock or port."""
        try:
            pid = int(pid)
            if pid <= 4:
                return {"success": False, "error": "Cannot kill protected system process"}
            
            proc = psutil.Process(pid)
            name = proc.name()
            proc.kill()
            logger.info(f"Sniper killed process {name} (PID: {pid})")
            return {
                "success": True,
                "pid": pid,
                "name": name,
                "message": f"Successfully killed {name} (PID {pid})"
            }
        except psutil.NoSuchProcess:
            return {"success": True, "pid": pid, "message": "Process already terminated"}
        except psutil.AccessDenied:
            return {"success": False, "pid": pid, "error": "Access Denied. Run as Administrator to kill this system process."}
        except Exception as e:
            return {"success": False, "pid": pid, "error": str(e)}

    def _get_process_details(self, pid: int, fallback_name: str = "") -> Dict[str, Any]:
        try:
            proc = psutil.Process(pid)
            name = proc.name()
            cmdline = " ".join(proc.cmdline()[:3]) if proc.cmdline() else ""
            mem_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
            exe_path = proc.exe() if hasattr(proc, 'exe') else ""
            return {
                "pid": pid,
                "name": name or fallback_name or f"PID {pid}",
                "exe": exe_path,
                "cmdline": cmdline,
                "memory_mb": mem_mb
            }
        except Exception:
            return {
                "pid": pid,
                "name": fallback_name or f"Process (PID {pid})",
                "exe": "",
                "cmdline": "",
                "memory_mb": 0.0
            }

sniper_service = SniperService()
