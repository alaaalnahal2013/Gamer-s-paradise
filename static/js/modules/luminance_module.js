/**
 * LUMINANCE MODULE • Luminance Guard & Anti-Flashbang Night Shield Controller
 * Detects blinding white flashes and dynamically drops DDC/CI monitor backlight.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip } from './utils.js';

let luminanceStatus = null;

// DOM Elements
let luminanceActiveBadge, luminanceCurVal, luminanceFlashesBlocked;
let chkLuminanceGuard, btnTestGlareFlash, rangeLuminanceThreshold, rangeLuminanceDimmed;
let thresholdValLabel, dimmedValLabel, chkAlwaysActive;

export async function loadLuminanceStatus() {
  try {
    const res = await fetch('/api/luminance/status');
    const data = await res.json();
    luminanceStatus = data;
    renderLuminanceUI(data);
  } catch (e) {
    console.error('Failed to load luminance status', e);
  }
}

export function renderLuminanceUI(data) {
  if (!data) return;

  if (luminanceActiveBadge) {
    const isActive = !!data.running;
    luminanceActiveBadge.textContent = isActive ? 'ACTIVE (MONITORING)' : 'OFFLINE';
    luminanceActiveBadge.className = isActive ? 'uhc-stat-val text-green' : 'uhc-stat-val';
  }

  if (luminanceCurVal) {
    luminanceCurVal.textContent = `${Math.round(data.current_luminance || 0)} / 255`;
  }

  if (luminanceFlashesBlocked) {
    luminanceFlashesBlocked.textContent = data.flashes_blocked || 0;
  }

  if (chkLuminanceGuard) {
    chkLuminanceGuard.checked = !!data.running;
  }

  if (rangeLuminanceThreshold && data.flash_threshold) {
    rangeLuminanceThreshold.value = data.flash_threshold;
    if (thresholdValLabel) thresholdValLabel.textContent = `${data.flash_threshold} / 255`;
  }

  if (rangeLuminanceDimmed && data.dimmed_brightness !== undefined) {
    rangeLuminanceDimmed.value = data.dimmed_brightness;
    if (dimmedValLabel) dimmedValLabel.textContent = `${data.dimmed_brightness}%`;
  }

  if (chkAlwaysActive && data.always_active !== undefined) {
    chkAlwaysActive.checked = !!data.always_active;
  }
}

export async function toggleGuard(enable) {
  try {
    const res = await fetch('/api/luminance/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable })
    });
    const data = await res.json();
    renderLuminanceUI(data);
    showToast(`Luminance Guard: ${enable ? 'ACTIVE' : 'STANDBY'}`, enable ? 'success' : 'info');
    playRadarBlip(1000);
  } catch (e) {
    showToast('Failed to toggle Luminance Guard', 'alert');
  }
}

export async function testGlareFlash() {
  try {
    showToast('Simulating sudden white glare... Dimming DDC/CI backlight!', 'info');
    const res = await fetch('/api/luminance/test', { method: 'POST' });
    const data = await res.json();
    showToast('Flash mitigated! Monitor hardware dimmed to safe level.', 'success');
    playRadarBlip(1150);
    await loadLuminanceStatus();
  } catch (e) {
    showToast('Flash test failed', 'alert');
  }
}

export async function updateSettings(settings) {
  try {
    const res = await fetch('/api/luminance/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    renderLuminanceUI(data);
  } catch (e) {}
}

export function initLuminanceModule() {
  luminanceActiveBadge = document.getElementById('luminance-active-badge');
  luminanceCurVal = document.getElementById('luminance-cur-val');
  luminanceFlashesBlocked = document.getElementById('luminance-flashes-blocked');
  chkLuminanceGuard = document.getElementById('chk-luminance-guard');
  btnTestGlareFlash = document.getElementById('btn-test-glare-flash');
  rangeLuminanceThreshold = document.getElementById('range-luminance-threshold');
  rangeLuminanceDimmed = document.getElementById('range-luminance-dimmed');
  thresholdValLabel = document.getElementById('threshold-val-label');
  dimmedValLabel = document.getElementById('dimmed-val-label');
  chkAlwaysActive = document.getElementById('chk-always-active');

  if (chkLuminanceGuard) {
    chkLuminanceGuard.addEventListener('change', (e) => {
      toggleGuard(e.target.checked);
    });
  }

  if (btnTestGlareFlash) {
    btnTestGlareFlash.addEventListener('click', testGlareFlash);
  }

  if (rangeLuminanceThreshold) {
    rangeLuminanceThreshold.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (thresholdValLabel) thresholdValLabel.textContent = `${val} / 255`;
    });
    rangeLuminanceThreshold.addEventListener('change', (e) => {
      updateSettings({ threshold: parseInt(e.target.value) });
    });
  }

  if (rangeLuminanceDimmed) {
    rangeLuminanceDimmed.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (dimmedValLabel) dimmedValLabel.textContent = `${val}%`;
    });
    rangeLuminanceDimmed.addEventListener('change', (e) => {
      updateSettings({ dimmed: parseInt(e.target.value) });
    });
  }

  if (chkAlwaysActive) {
    chkAlwaysActive.addEventListener('change', (e) => {
      updateSettings({ always_active: e.target.checked });
    });
  }

  loadLuminanceStatus();
}
