/**
 * VOICE-DUCKING AUDIO MIXER MODULE
 * Auto-attenuates game volume when teammates speak in Discord.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let btnVoiceDuckingToggle, duckingStatusBadge;
let rngDuckLevel, duckLevelVal, meterVoiceActivity;
let selVoiceApp, selGameApp, rngGameDirectVol, gameDirectVolVal;
let duckingActiveIndicator;

export async function loadVoiceDuckingStatus() {
  try {
    const res = await fetch('/api/voice_ducking/status');
    const data = await res.json();
    updateVoiceDuckingUI(data);
  } catch (e) {
    console.error('Failed to load Voice Ducking status:', e);
  }
}

export function updateVoiceDuckingUI(data) {
  if (btnVoiceDuckingToggle) {
    btnVoiceDuckingToggle.classList.toggle('active', !!data.enabled);
    btnVoiceDuckingToggle.textContent = data.enabled ? '⚡ AUTO-DUCKING ACTIVE' : 'DISABLED';
  }

  if (duckingStatusBadge) {
    duckingStatusBadge.textContent = data.is_ducking ? 'DUCKING: SPEECH DETECTED' : (data.enabled ? 'STANDBY / LISTENING' : 'OFF');
    duckingStatusBadge.className = `vhc-badge ${data.is_ducking ? 'alert' : (data.enabled ? 'good' : 'muted')}`;
  }

  if (duckingActiveIndicator) {
    duckingActiveIndicator.style.opacity = data.is_ducking ? '1' : '0.2';
  }

  if (meterVoiceActivity) {
    const pct = Math.min(Math.round(data.voice_peak_meter * 300), 100);
    meterVoiceActivity.style.width = `${pct}%`;
  }

  if (rngDuckLevel && !rngDuckLevel.dataset.userDragging) {
    rngDuckLevel.value = data.duck_volume;
    if (duckLevelVal) duckLevelVal.textContent = `${data.duck_volume}%`;
  }

  if (rngGameDirectVol && !rngGameDirectVol.dataset.userDragging) {
    rngGameDirectVol.value = data.current_game_volume;
    if (gameDirectVolVal) gameDirectVolVal.textContent = `${data.current_game_volume}%`;
  }
}

export function initVoiceDuckingModule() {
  btnVoiceDuckingToggle = document.getElementById('btn-voice-ducking-toggle');
  duckingStatusBadge = document.getElementById('ducking-status-badge');
  rngDuckLevel = document.getElementById('rng-duck-level');
  duckLevelVal = document.getElementById('duck-level-val');
  meterVoiceActivity = document.getElementById('meter-voice-activity');
  selVoiceApp = document.getElementById('sel-voice-app');
  selGameApp = document.getElementById('sel-game-app');
  rngGameDirectVol = document.getElementById('rng-game-direct-vol');
  gameDirectVolVal = document.getElementById('game-direct-vol-val');
  duckingActiveIndicator = document.getElementById('ducking-active-indicator');

  if (btnVoiceDuckingToggle) {
    btnVoiceDuckingToggle.addEventListener('click', async () => {
      const isCurrentlyActive = btnVoiceDuckingToggle.classList.contains('active');
      try {
        const res = await fetch('/api/voice_ducking/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: !isCurrentlyActive,
            duck_volume_pct: parseInt(rngDuckLevel.value, 10) || 30,
            voice_app: selVoiceApp ? selVoiceApp.value : 'discord.exe',
            game_app: selGameApp ? selGameApp.value : 'cs2.exe'
          })
        });
        const data = await res.json();
        updateVoiceDuckingUI(data);
        showToast(data.enabled ? 'Voice-Ducking Audio Mixer active' : 'Voice-Ducking disabled', data.enabled ? 'success' : 'info');
        playRadarBlip(data.enabled ? 1150 : 850);
      } catch (e) {
        showToast('Failed to toggle voice ducking', 'alert');
      }
    });
  }

  if (rngDuckLevel) {
    rngDuckLevel.addEventListener('input', () => {
      rngDuckLevel.dataset.userDragging = 'true';
      if (duckLevelVal) duckLevelVal.textContent = `${rngDuckLevel.value}%`;
    });
    rngDuckLevel.addEventListener('change', async () => {
      delete rngDuckLevel.dataset.userDragging;
      try {
        await fetch('/api/voice_ducking/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            duck_volume_pct: parseInt(rngDuckLevel.value, 10),
            voice_app: selVoiceApp ? selVoiceApp.value : 'discord.exe',
            game_app: selGameApp ? selGameApp.value : 'cs2.exe'
          })
        });
      } catch (e) {}
    });
  }

  if (rngGameDirectVol) {
    rngGameDirectVol.addEventListener('input', () => {
      rngGameDirectVol.dataset.userDragging = 'true';
      if (gameDirectVolVal) gameDirectVolVal.textContent = `${rngGameDirectVol.value}%`;
    });
    rngGameDirectVol.addEventListener('change', async () => {
      delete rngGameDirectVol.dataset.userDragging;
      try {
        await fetch('/api/voice_ducking/volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume_percent: parseInt(rngGameDirectVol.value, 10) })
        });
        playRadarBlip(1000);
      } catch (e) {}
    });
  }

  loadVoiceDuckingStatus();
  setInterval(loadVoiceDuckingStatus, 1500);
}
