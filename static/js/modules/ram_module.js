/**
 * RAM MODULE • Auto Process Freezer & 8GB Gaming RAM Rescue Engine
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let ramHogsData = [];
let ramStatus = null;

// DOM Elements
let ramSavedMb, ramFrozenCount, ramAutoModeBadge;
let btnTurboFreeze, btnUnfreezeAll, chkAutoFreeze;
let btnRefreshRam, ramHogsTbody;

export async function loadRamHogs() {
  try {
    const res = await fetch('/api/ram/hogs');
    const data = await res.json();
    ramHogsData = data.hogs || [];
    ramStatus = data.status || {};
    renderRamUI();
  } catch (e) {
    console.error('Failed to load RAM hogs', e);
  }
}

export function renderRamUI() {
  if (ramSavedMb && ramStatus) {
    ramSavedMb.textContent = `${ramStatus.total_ram_reclaimed_mb || 0} MB`;
  }
  if (ramFrozenCount && ramStatus) {
    ramFrozenCount.textContent = ramStatus.frozen_count || 0;
  }
  if (ramAutoModeBadge && ramStatus) {
    const autoOn = !!ramStatus.auto_freeze_on_game;
    ramAutoModeBadge.textContent = autoOn ? 'AUTO (ACTIVE)' : 'MANUAL';
    ramAutoModeBadge.className = autoOn ? 'uhc-stat-val text-green' : 'uhc-stat-val';
  }
  if (chkAutoFreeze && ramStatus) {
    chkAutoFreeze.checked = !!ramStatus.auto_freeze_on_game;
  }

  // Populate Hogs Table
  if (ramHogsTbody) {
    if (ramHogsData.length === 0) {
      ramHogsTbody.innerHTML = '<tr><td colspan="5" class="empty-state-notice">No heavy background apps detected. High physical RAM headroom available!</td></tr>';
      return;
    }

    ramHogsTbody.innerHTML = ramHogsData.map(h => {
      const isFrozen = (h.status === 'FROZEN');
      return `
        <tr class="${isFrozen ? 'row-frozen' : ''}">
          <td>
            <strong>${escapeHtml(h.name)}</strong>
            <span class="sub-label d-block">${h.count} instance(s)</span>
          </td>
          <td><code>${h.pids.join(', ')}</code></td>
          <td>
            <span class="badge-tag ${h.memory_mb > 300 ? 'badge-danger' : 'badge-neutral'}">
              ${h.memory_mb} MB
            </span>
          </td>
          <td>
            <span class="status-pill ${isFrozen ? 'frozen' : 'running'}">
              ${isFrozen ? '❄️ SUSPENDED' : '⚡ RUNNING'}
            </span>
          </td>
          <td>
            <button class="btn-clean-mini btn-toggle-process" data-name="${escapeHtml(h.name)}" data-frozen="${isFrozen}">
              ${isFrozen ? '▶ Resume' : '❄️ Freeze'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    ramHogsTbody.querySelectorAll('.btn-toggle-process').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-name');
        const isFrozen = btn.getAttribute('data-frozen') === 'true';
        if (isFrozen) {
          await freezeTargetApp(name, 'resume');
        } else {
          await freezeTargetApp(name, 'suspend');
        }
      });
    });
  }
}

export async function turboFreezeAll() {
  try {
    showToast('Suspending background hogs & flushing memory working set...', 'info');
    const res = await fetch('/api/ram/freeze', { method: 'POST' });
    const data = await res.json();
    showToast(`Turbo Freeze complete! Reclaimed ${data.ram_reclaimed_mb} MB RAM across ${data.frozen_count} processes`, 'success');
    playRadarBlip(1200);
    await loadRamHogs();
  } catch (e) {
    showToast('Failed to turbo freeze processes', 'alert');
  }
}

export async function unfreezeAll() {
  try {
    showToast('Resuming all background apps...', 'info');
    const res = await fetch('/api/ram/unfreeze', { method: 'POST' });
    const data = await res.json();
    showToast(`Restored ${data.unfrozen_count} processes to active state`, 'info');
    playRadarBlip(800);
    await loadRamHogs();
  } catch (e) {
    showToast('Failed to unfreeze processes', 'alert');
  }
}

export async function freezeTargetApp(appName, action) {
  try {
    // If user clicks individual freeze, invoke freeze endpoint
    if (action === 'suspend') {
      await turboFreezeAll();
    } else {
      await unfreezeAll();
    }
  } catch (e) {}
}

export function initRamModule() {
  ramSavedMb = document.getElementById('ram-saved-mb');
  ramFrozenCount = document.getElementById('ram-frozen-count');
  ramAutoModeBadge = document.getElementById('ram-auto-mode-badge');
  btnTurboFreeze = document.getElementById('btn-turbo-freeze');
  btnUnfreezeAll = document.getElementById('btn-unfreeze-all');
  chkAutoFreeze = document.getElementById('chk-auto-freeze');
  btnRefreshRam = document.getElementById('btn-refresh-ram');
  ramHogsTbody = document.getElementById('ram-hogs-tbody');

  if (btnTurboFreeze) {
    btnTurboFreeze.addEventListener('click', turboFreezeAll);
  }

  if (btnUnfreezeAll) {
    btnUnfreezeAll.addEventListener('click', unfreezeAll);
  }

  if (chkAutoFreeze) {
    chkAutoFreeze.addEventListener('change', async (e) => {
      try {
        await fetch('/api/ram/toggle_auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: e.target.checked })
        });
        showToast(`Auto-Freeze On Fullscreen Game: ${e.target.checked ? 'ENABLED' : 'DISABLED'}`, 'info');
      } catch (err) {}
    });
  }

  if (btnRefreshRam) {
    btnRefreshRam.addEventListener('click', () => {
      loadRamHogs();
      showToast('Scanned physical memory consumers', 'info');
      playRadarBlip(950);
    });
  }

  loadRamHogs();
}
