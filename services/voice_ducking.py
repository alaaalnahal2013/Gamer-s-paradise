"""
VOICE-DUCKING AUDIO MIXER • AUTOMATIC GAME VOLUME ATTENUATION & VOICE CLARITY
Polls Windows Core Audio sessions (pycaw). When teammates speak in Discord/voice chat,
automatically drops game volume to 30%, smoothly restoring to 100% when speech ends.
Supports instant on-the-fly game master volume tweaking.
"""

import logging
import pythoncom
import threading
import time
from typing import Dict, List, Any, Optional

logger = logging.getLogger("ping_radar.voice_ducking")

VOICE_APPS = ["discord.exe", "ts3client_win64.exe", "ts3client_win32.exe", "steamwebhelper.exe", "slack.exe", "mumble.exe", "skype.exe"]
GAME_APPS = ["cs2.exe", "csgo.exe", "valorant-win64-shipping.exe", "r5apex.exe", "dota2.exe", "overwatch.exe", "fortniteclient-win64-shipping.exe", "cod.exe", "modernwarfare.exe"]

class VoiceDuckingMixer:
    def __init__(self):
        self.enabled: bool = True
        self.duck_volume_pct: int = 30           # Drop game to 30% when voice active
        self.baseline_volume_pct: int = 100      # Normal game volume
        self.voice_threshold: float = 0.03       # Audio peak threshold for speech
        self.hold_seconds: float = 0.7           # Hold attenuation for 700ms after voice stops
        
        self.selected_voice_app: str = "discord.exe"
        self.selected_game_app: str = "cs2.exe"
        
        self.is_ducking: bool = False
        self.last_voice_time: float = 0.0
        self.current_game_volume_pct: int = 100
        self.voice_peak_meter: float = 0.0
        
        self.detected_sessions: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = True
        self._thread: Optional[threading.Thread] = None

        self._start_worker()

    def _start_worker(self):
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def _worker_loop(self):
        """Monitors voice session peak volume and dynamically adjusts game session volume."""
        pythoncom.CoInitialize()
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume, IAudioMeterInformation

        while self._running:
            try:
                if not self.enabled:
                    time.sleep(1.0)
                    continue

                sessions = AudioUtilities.GetAllSessions()
                found_voice_session = None
                found_game_session = None
                active_list = []

                for s in sessions:
                    proc = s.Process
                    if not proc:
                        continue
                    pname = (proc.name() or '').lower()
                    active_list.append(pname)

                    if pname == self.selected_voice_app.lower() or (not found_voice_session and pname in VOICE_APPS):
                        found_voice_session = s

                    if pname == self.selected_game_app.lower() or (not found_game_session and pname in GAME_APPS):
                        found_game_session = s

                with self._lock:
                    self.detected_sessions = list(set(active_list))

                voice_active = False
                peak_val = 0.0

                if found_voice_session:
                    try:
                        meter = found_voice_session._ctl.QueryInterface(IAudioMeterInformation)
                        peak_val = meter.GetPeakValue()
                        self.voice_peak_meter = round(peak_val, 3)
                        if peak_val > self.voice_threshold:
                            voice_active = True
                            self.last_voice_time = time.time()
                    except Exception:
                        pass

                now = time.time()
                should_duck = voice_active or (now - self.last_voice_time < self.hold_seconds)

                if found_game_session:
                    try:
                        volume = found_game_session._ctl.QueryInterface(ISimpleAudioVolume)
                        if should_duck and not self.is_ducking:
                            # Attenuate game volume
                            target_vol = max(self.duck_volume_pct / 100.0, 0.05)
                            volume.SetMasterVolume(target_vol, None)
                            self.is_ducking = True
                            self.current_game_volume_pct = self.duck_volume_pct
                            logger.info(f"[VoiceDucking] Speech detected in {self.selected_voice_app}! Ducking game volume to {self.duck_volume_pct}%.")

                        elif not should_duck and self.is_ducking:
                            # Restore game volume
                            target_vol = min(self.baseline_volume_pct / 100.0, 1.0)
                            volume.SetMasterVolume(target_vol, None)
                            self.is_ducking = False
                            self.current_game_volume_pct = self.baseline_volume_pct
                            logger.info(f"[VoiceDucking] Speech ended. Restoring game volume to {self.baseline_volume_pct}%.")
                    except Exception as e:
                        logger.warning(f"[VoiceDucking] Volume adjustment notice: {e}")

            except Exception as e:
                logger.error(f"[VoiceDucking] Worker loop error: {e}")

            time.sleep(0.1)

    def set_game_volume(self, volume_pct: int) -> Dict[str, Any]:
        """Tweaks game volume on the fly (e.g. from UI slider or Alt+ScrollWheel)."""
        pythoncom.CoInitialize()
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume

        volume_pct = max(0, min(100, volume_pct))
        with self._lock:
            self.baseline_volume_pct = volume_pct
            self.current_game_volume_pct = volume_pct

        try:
            for s in AudioUtilities.GetAllSessions():
                if s.Process and (s.Process.name() or '').lower() in (self.selected_game_app.lower(), "cs2.exe"):
                    volume = s._ctl.QueryInterface(ISimpleAudioVolume)
                    volume.SetMasterVolume(volume_pct / 100.0, None)
                    break
        except Exception as e:
            logger.warning(f"[VoiceDucking] Direct volume set error: {e}")

        return self.get_status()

    def configure(self, enabled: bool, duck_volume_pct: int, voice_app: str, game_app: str) -> Dict[str, Any]:
        with self._lock:
            self.enabled = bool(enabled)
            self.duck_volume_pct = max(5, min(90, int(duck_volume_pct)))
            if voice_app:
                self.selected_voice_app = voice_app.lower()
            if game_app:
                self.selected_game_app = game_app.lower()
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "enabled": self.enabled,
                "is_ducking": self.is_ducking,
                "current_game_volume": self.current_game_volume_pct,
                "baseline_volume": self.baseline_volume_pct,
                "duck_volume": self.duck_volume_pct,
                "voice_peak_meter": self.voice_peak_meter,
                "selected_voice_app": self.selected_voice_app,
                "selected_game_app": self.selected_game_app,
                "voice_app_candidates": VOICE_APPS,
                "detected_system_sessions": self.detected_sessions
            }

voice_ducking = VoiceDuckingMixer()
