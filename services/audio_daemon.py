"""
AUDIO OUTPUT ROULETTE FIXER • AUDIO LOCK DAEMON
Locks the user's preferred speaker and microphone hardware.
If Windows or a plugged-in peripheral (monitor, controller, headset) switches
the active device, the daemon force-reverts back to the primary device within 100ms.
"""

import asyncio
import ctypes
import logging
import threading
import time
from typing import Dict, List, Optional, Any
from comtypes import GUID, IUnknown, COMMETHOD, HRESULT
import comtypes.client

logger = logging.getLogger("ping_radar.audio_daemon")

CLSID_PolicyConfigClient = GUID('{870af99c-171d-4f9e-af0d-e63df40c2bc9}')
IID_IPolicyConfig = GUID('{f8679f50-850a-41cf-9c72-430f290290c8}')

class IPolicyConfig(IUnknown):
    _iid_ = IID_IPolicyConfig
    _methods_ = [
        COMMETHOD([], HRESULT, 'GetMixFormat'),
        COMMETHOD([], HRESULT, 'GetDeviceFormat'),
        COMMETHOD([], HRESULT, 'ResetDeviceFormat'),
        COMMETHOD([], HRESULT, 'SetDeviceFormat'),
        COMMETHOD([], HRESULT, 'GetProcessingPeriod'),
        COMMETHOD([], HRESULT, 'SetProcessingPeriod'),
        COMMETHOD([], HRESULT, 'GetShareMode'),
        COMMETHOD([], HRESULT, 'SetShareMode'),
        COMMETHOD([], HRESULT, 'GetPropertyValue'),
        COMMETHOD([], HRESULT, 'SetPropertyValue'),
        COMMETHOD([], HRESULT, 'SetDefaultEndpoint',
                  (['in'], ctypes.c_wchar_p, 'wszDeviceId'),
                  (['in'], ctypes.c_int, 'eRole')),
        COMMETHOD([], HRESULT, 'SetEndpointVisibility')
    ]

# ERole values
ROLE_CONSOLE = 0         # Games, system audio
ROLE_MULTIMEDIA = 1      # Media playback
ROLE_COMMUNICATIONS = 2  # Discord, Zoom, Calls


class AudioLockDaemon:
    def __init__(self):
        self.locked_speaker_id: Optional[str] = None
        self.locked_speaker_name: Optional[str] = None
        self.locked_mic_id: Optional[str] = None
        self.locked_mic_name: Optional[str] = None
        self.enabled: bool = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.revert_events: List[Dict[str, Any]] = []
        self._policy_config = None
        self._init_policy_config()

    def _init_policy_config(self):
        try:
            self._policy_config = comtypes.client.CreateObject(CLSID_PolicyConfigClient, interface=IPolicyConfig)
        except Exception as e:
            logger.warning(f"Could not initialize IPolicyConfig: {e}")
            self._policy_config = None

    def get_all_devices(self) -> Dict[str, List[Dict[str, Any]]]:
        """Returns all playback and capture devices."""
        try:
            import pythoncom
            pythoncom.CoInitialize()
        except Exception:
            pass

        from pycaw.pycaw import AudioUtilities
        playback = []
        recording = []

        try:
            current_spk = AudioUtilities.GetSpeakers()
            current_spk_id = current_spk.id if current_spk else None
        except Exception:
            current_spk_id = None

        try:
            current_mic_dev = AudioUtilities.GetMicrophone()
            current_mic = AudioUtilities.CreateDevice(current_mic_dev) if current_mic_dev else None
            current_mic_id = current_mic.id if current_mic else None
        except Exception:
            current_mic_id = None

        try:
            all_devices = AudioUtilities.GetAllDevices()
            for dev in all_devices:
                dev_id = getattr(dev, 'id', '')
                state = str(getattr(dev, 'state', ''))
                is_active = 'Active' in state
                friendly_name = getattr(dev, 'FriendlyName', 'Unknown Device')
                
                info = {
                    "id": dev_id,
                    "name": friendly_name,
                    "active": is_active,
                    "is_default": False
                }

                # {0.0.0...} is render (playback), {0.0.1...} is capture (recording)
                if dev_id.startswith('{0.0.0.'):
                    if dev_id == current_spk_id:
                        info["is_default"] = True
                    playback.append(info)
                elif dev_id.startswith('{0.0.1.'):
                    if dev_id == current_mic_id:
                        info["is_default"] = True
                    recording.append(info)
        except Exception as e:
            logger.error(f"Error enumerating audio devices: {e}")

        return {
            "playback": playback,
            "recording": recording,
            "active_speaker_id": current_spk_id,
            "active_mic_id": current_mic_id,
            "locked_speaker_id": self.locked_speaker_id,
            "locked_speaker_name": self.locked_speaker_name,
            "locked_mic_id": self.locked_mic_id,
            "locked_mic_name": self.locked_mic_name,
            "daemon_active": self.enabled
        }

    def set_default_device(self, device_id: str) -> bool:
        """Immediately sets default audio device across all roles."""
        try:
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except Exception:
                pass
            # Recreate policy config if in another thread context
            policy = comtypes.client.CreateObject(CLSID_PolicyConfigClient, interface=IPolicyConfig)
            for role in (ROLE_CONSOLE, ROLE_MULTIMEDIA, ROLE_COMMUNICATIONS):
                policy.SetDefaultEndpoint(device_id, role)
            return True
        except Exception as e:
            logger.error(f"Failed to set default device {device_id}: {e}")
            return False

    def lock_speaker(self, device_id: str, device_name: str = ""):
        self.locked_speaker_id = device_id
        self.locked_speaker_name = device_name
        self.set_default_device(device_id)
        self.start()

    def lock_microphone(self, device_id: str, device_name: str = ""):
        self.locked_mic_id = device_id
        self.locked_mic_name = device_name
        self.set_default_device(device_id)
        self.start()

    def unlock_speaker(self):
        self.locked_speaker_id = None
        self.locked_speaker_name = None
        if not self.locked_mic_id:
            self.stop()

    def unlock_microphone(self):
        self.locked_mic_id = None
        self.locked_mic_name = None
        if not self.locked_speaker_id:
            self.stop()

    def start(self):
        if self.enabled and self._thread and self._thread.is_alive():
            return
        self.enabled = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True, name="AudioLockDaemon")
        self._thread.start()
        logger.info("Audio Lock Daemon started (polling every 100ms)")

    def stop(self):
        self.enabled = False
        self._stop_event.set()
        logger.info("Audio Lock Daemon stopped")

    def _monitor_loop(self):
        # Initialize COM in this background thread
        import pythoncom
        pythoncom.CoInitialize()

        from pycaw.pycaw import AudioUtilities

        while not self._stop_event.is_set():
            try:
                # 1. Check speaker
                if self.locked_speaker_id:
                    try:
                        cur_spk = AudioUtilities.GetSpeakers()
                        if cur_spk and cur_spk.id != self.locked_speaker_id:
                            # Revert!
                            logger.warning(f"Audio Output Roulette detected! OS switched speaker to {cur_spk.FriendlyName}. Force-reverting to {self.locked_speaker_name} within 100ms.")
                            self.set_default_device(self.locked_speaker_id)
                            self.revert_events.append({
                                "type": "speaker",
                                "switched_to": cur_spk.FriendlyName,
                                "reverted_to": self.locked_speaker_name or self.locked_speaker_id,
                                "timestamp": time.strftime("%H:%M:%S")
                            })
                            if len(self.revert_events) > 50:
                                self.revert_events.pop(0)
                    except Exception as e:
                        pass

                # 2. Check mic
                if self.locked_mic_id:
                    try:
                        cur_mic_dev = AudioUtilities.GetMicrophone()
                        if cur_mic_dev:
                            cur_mic = AudioUtilities.CreateDevice(cur_mic_dev)
                            if cur_mic and cur_mic.id != self.locked_mic_id:
                                logger.warning(f"Audio Mic Roulette detected! OS switched mic to {cur_mic.FriendlyName}. Force-reverting to {self.locked_mic_name} within 100ms.")
                                self.set_default_device(self.locked_mic_id)
                                self.revert_events.append({
                                    "type": "microphone",
                                    "switched_to": cur_mic.FriendlyName,
                                    "reverted_to": self.locked_mic_name or self.locked_mic_id,
                                    "timestamp": time.strftime("%H:%M:%S")
                                })
                                if len(self.revert_events) > 50:
                                    self.revert_events.pop(0)
                    except Exception as e:
                        pass

            except Exception as e:
                pass

            time.sleep(0.1)  # 100ms cycle

        pythoncom.CoUninitialize()

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "locked_speaker_id": self.locked_speaker_id,
            "locked_speaker_name": self.locked_speaker_name,
            "locked_mic_id": self.locked_mic_id,
            "locked_mic_name": self.locked_mic_name,
            "revert_events": self.revert_events[-10:]
        }

audio_daemon = AudioLockDaemon()
