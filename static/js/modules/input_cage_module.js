/**
 * FULLSCREEN INPUT CAGE MODULE
 * Swallows Windows Key, suppresses Sticky Keys 5x Shift prompt, and locks mouse cursor inside
 * primary monitor bounds (ClipCursor) to prevent accidental minimizes mid-fight.
 */

import { showToast, playRadarBlip } from './utils.js';

let btnCageToggle, cageStatusBadge, cageStatusTitle, cageDescText;
let chkAutoCage, cageDetectedGame, cageMonitorBounds;
let cageStatWin, cageStatSticky, cageStatCursor;

export async function loadInputCageStatus() {
  try {
    const res = await fetch('/api/input_cage/status');
    const data = await res.json();
    updateInputCageUI(data);
  } catch (e) {
    console.error('Failed to load Input Cage status:', e);
  }
}

export function updateInputCageUI(data) {
  if (!btnCageToggle) return;

  const active = !!data.active;
  btnCageToggle.classList.toggle('active', active);
  btnCageToggle.textContent = active ? '🔓 RELEASE INPUT CAGE' : '🔒 ENGAGE INPUT CAGE';

  if (cageStatusBadge) {
    cageStatusBadge.textContent = active ? 'INPUT CAGED' : 'UNLOCKED / PASS-THROUGH';
    cageStatusBadge.className = `vhc-badge ${active ? 'good' : 'muted'}`;
  }

  if (cageStatusTitle) {
    cageStatusTitle.textContent = active ? 'FULLSCREEN INPUT CAGE ACTIVE' : 'INPUT CAGE DISENGAGED';
  }

  if (cageDescText) {
    cageDescText.textContent = active
      ? `Cursor is clamped to primary display (${data.monitor_bounds.right}x${data.monitor_bounds.bottom}). Windows key & Sticky Keys are suppressed.`
      : 'Normal Windows cursor behavior. Flicking mouse may cross into secondary monitor or trigger Windows key interruptions.';
  }

  if (cageDetectedGame) {
    cageDetectedGame.textContent = data.detected_game ? data.detected_game.toUpperCase() : 'None Detected';
  }

  if (cageStatCursor) {
    cageStatCursor.textContent = data.cursor_locked ? 'Clamped (ClipCursor)' : 'Free Roam';
    cageStatCursor.className = `vs-val ${data.cursor_locked ? 'highlight' : ''}`;
  }

  if (cageStatWin) {
    cageStatWin.textContent = data.win_key_blocked ? 'Swallowed (WH_KEYBOARD_LL)' : 'Enabled';
    cageStatWin.className = `vs-val ${data.win_key_blocked ? 'highlight' : ''}`;
  }

  if (cageStatSticky) {
    cageStatSticky.textContent = data.sticky_keys_disabled ? 'Suppressed (SKF_HOTKEYACTIVE Off)' : 'Normal';
    cageStatSticky.className = `vs-val ${data.sticky_keys_disabled ? 'highlight' : ''}`;
  }

  if (chkAutoCage && chkAutoCage.checked !== data.auto_cage_on_game) {
    chkAutoCage.checked = data.auto_cage_on_game;
  }
}

export function initInputCageModule() {
  btnCageToggle = document.getElementById('btn-cage-toggle');
  cageStatusBadge = document.getElementById('cage-status-badge');
  cageStatusTitle = document.getElementById('cage-status-title');
  cageDescText = document.getElementById('cage-desc-text');
  chkAutoCage = document.getElementById('chk-auto-cage');
  cageDetectedGame = document.getElementById('cage-detected-game');
  cageStatCursor = document.getElementById('cage-stat-cursor');
  cageStatWin = document.getElementById('cage-stat-win');
  cageStatSticky = document.getElementById('cage-stat-sticky');

  if (btnCageToggle) {
    btnCageToggle.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/input_cage/toggle', { method: 'POST' });
        const data = await res.json();
        updateInputCageUI(data);
        showToast(data.active ? 'Input Cage Engaged! Cursor locked to game monitor.' : 'Input Cage Released. Cursor free.', data.active ? 'success' : 'info');
        playRadarBlip(data.active ? 1150 : 850);
      } catch (e) {
        showToast('Failed to toggle Input Cage', 'alert');
      }
    });
  }

  if (chkAutoCage) {
    chkAutoCage.addEventListener('change', async () => {
      try {
        const res = await fetch('/api/input_cage/auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: chkAutoCage.checked })
        });
        const data = await res.json();
        updateInputCageUI(data);
        showToast(chkAutoCage.checked ? 'Auto-Cage on game launch enabled' : 'Auto-Cage disabled', 'info');
      } catch (e) {}
    });
  }

  loadInputCageStatus();
  setInterval(loadInputCageStatus, 2500);
}
