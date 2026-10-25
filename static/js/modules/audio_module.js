/**
 * AUDIO MODULE • Audio Output Roulette & Audio Lock Daemon Controller
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let audioData = null;

// DOM Elements
let audioPlaybackList, audioRecordingList;
let audioLockStatusText, audioRevertsCount, topbarAudioText, audioLogFeed;
let btnRefreshAudio, btnUnlockAllAudio;

export async function loadAudioDevices() {
  try {
    const res = await fetch('/api/audio/devices');
    const data = await res.json();
    audioData = data;
    renderAudioDevices(data);
  } catch (e) {
    console.error('Failed to load audio devices', e);
  }
}

export function renderAudioDevices(data) {
  if (!data) return;
  const isLocked = !!(data.locked_speaker_id || data.locked_mic_id);

  if (audioLockStatusText) {
    audioLockStatusText.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
    audioLockStatusText.className = isLocked ? 'uhc-stat-val text-green' : 'uhc-stat-val';
  }
  if (topbarAudioText) {
    topbarAudioText.textContent = isLocked ? 'AUDIO: LOCKED' : 'AUDIO: READY';
  }

  // Playback Devices
  if (audioPlaybackList && data.playback) {
    if (data.playback.length === 0) {
      audioPlaybackList.innerHTML = '<div class="empty-state-notice">No playback devices found.</div>';
    } else {
      audioPlaybackList.innerHTML = data.playback.map(d => {
        const isLockedSpeaker = (d.id === data.locked_speaker_id);
        return `
          <div class="audio-dev-card ${isLockedSpeaker ? 'is-locked' : ''}">
            <div class="adc-info">
              <span class="adc-icon">${d.is_default ? '🔊' : '🎧'}</span>
              <div class="adc-meta">
                <div class="adc-name">${escapeHtml(d.name)}</div>
                <div class="adc-sub">${d.is_default ? 'Windows Default Output' : 'Available Output Hardware'}</div>
              </div>
            </div>
            <div class="adc-actions">
              ${isLockedSpeaker ? '<span class="badge-locked">🔒 LOCKED PRIMARY</span>' : ''}
              <button class="btn-clean-mini btn-lock-speaker" data-id="${d.id}" data-name="${escapeHtml(d.name)}">
                ${isLockedSpeaker ? 'Re-Lock' : 'Lock as Primary'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      audioPlaybackList.querySelectorAll('.btn-lock-speaker').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          await lockSpeaker(id, name);
        });
      });
    }
  }

  // Recording Devices (Mics)
  if (audioRecordingList && data.recording) {
    if (data.recording.length === 0) {
      audioRecordingList.innerHTML = '<div class="empty-state-notice">No recording microphones found.</div>';
    } else {
      audioRecordingList.innerHTML = data.recording.map(d => {
        const isLockedMic = (d.id === data.locked_mic_id);
        return `
          <div class="audio-dev-card ${isLockedMic ? 'is-locked' : ''}">
            <div class="adc-info">
              <span class="adc-icon">🎙️</span>
              <div class="adc-meta">
                <div class="adc-name">${escapeHtml(d.name)}</div>
                <div class="adc-sub">${d.is_default ? 'Windows Default Microphone' : 'Available Input Hardware'}</div>
              </div>
            </div>
            <div class="adc-actions">
              ${isLockedMic ? '<span class="badge-locked">🔒 LOCKED MIC</span>' : ''}
              <button class="btn-clean-mini btn-lock-mic" data-id="${d.id}" data-name="${escapeHtml(d.name)}">
                ${isLockedMic ? 'Re-Lock' : 'Lock as Primary'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      audioRecordingList.querySelectorAll('.btn-lock-mic').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          await lockMic(id, name);
        });
      });
    }
  }
}

export async function lockSpeaker(deviceId, name) {
  try {
    const res = await fetch('/api/audio/lock_speaker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, name: name })
    });
    const data = await res.json();
    showToast(`Locked Primary Speaker: ${name || deviceId}`, 'success');
    playRadarBlip(1000);
    await loadAudioDevices();
  } catch (e) {
    showToast('Failed to lock speaker', 'alert');
  }
}

export async function lockMic(deviceId, name) {
  try {
    const res = await fetch('/api/audio/lock_mic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, name: name })
    });
    const data = await res.json();
    showToast(`Locked Primary Microphone: ${name || deviceId}`, 'success');
    playRadarBlip(1000);
    await loadAudioDevices();
  } catch (e) {
    showToast('Failed to lock microphone', 'alert');
  }
}

export async function unlockAll() {
  try {
    await fetch('/api/audio/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'all' })
    });
    showToast('Audio hardware lock released', 'info');
    playRadarBlip(750);
    await loadAudioDevices();
  } catch (e) {
    showToast('Failed to unlock audio', 'alert');
  }
}

export function initAudioModule() {
  audioPlaybackList = document.getElementById('audio-playback-list');
  audioRecordingList = document.getElementById('audio-recording-list');
  audioLockStatusText = document.getElementById('audio-lock-status-text');
  audioRevertsCount = document.getElementById('audio-reverts-count');
  topbarAudioText = document.getElementById('topbar-audio-text');
  audioLogFeed = document.getElementById('audio-log-feed');
  btnRefreshAudio = document.getElementById('btn-refresh-audio');
  btnUnlockAllAudio = document.getElementById('btn-unlock-all-audio');

  if (btnRefreshAudio) {
    btnRefreshAudio.addEventListener('click', () => {
      loadAudioDevices();
      showToast('Scanned audio hardware endpoints', 'info');
      playRadarBlip(900);
    });
  }

  if (btnUnlockAllAudio) {
    btnUnlockAllAudio.addEventListener('click', unlockAll);
  }

  loadAudioDevices();
}
