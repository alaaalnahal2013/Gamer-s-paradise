/**
 * INSTANT LOADOUT SWITCHER MODULE
 * Swaps active modpacks & shader profiles in 1 second using Windows Directory Junctions (Zero file copies).
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let selLoadoutGame, txtLoadoutDestPath, loadoutProfileGrid;
let btnCreateProfile, txtNewProfileName;

export async function loadLoadoutStatus() {
  try {
    const res = await fetch('/api/loadout/status');
    const data = await res.json();
    updateLoadoutUI(data);
  } catch (e) {
    console.error('Failed to load Loadout status:', e);
  }
}

export function updateLoadoutUI(data) {
  if (selLoadoutGame && data.games) {
    if (selLoadoutGame.options.length <= 1) {
      selLoadoutGame.innerHTML = data.games.map(g =>
        `<option value="${g.id}" data-target="${escapeHtml(g.default_target || '')}">${escapeHtml(g.name)} (${g.category})</option>`
      ).join('');
    }
  }

  syncDestPath();
  loadProfiles();
}

function syncDestPath() {
  if (!selLoadoutGame || !txtLoadoutDestPath) return;
  const opt = selLoadoutGame.options[selLoadoutGame.selectedIndex];
  if (opt) {
    txtLoadoutDestPath.value = opt.getAttribute('data-target') || '';
  }
}

export async function loadProfiles() {
  if (!selLoadoutGame) return;
  const gameId = selLoadoutGame.value;
  const targetPath = txtLoadoutDestPath ? txtLoadoutDestPath.value : '';

  try {
    const res = await fetch(`/api/loadout/profiles?game_id=${encodeURIComponent(gameId)}&active_link_target=${encodeURIComponent(targetPath)}`);
    const data = await res.json();
    renderProfiles(data.profiles || []);
  } catch (e) {
    console.error('Failed to load loadout profiles:', e);
  }
}

function renderProfiles(profiles) {
  if (!loadoutProfileGrid) return;
  if (!profiles.length) {
    loadoutProfileGrid.innerHTML = '<div class="empty-state">No profiles created yet. Enter a name and click "Create Profile" to start your library.</div>';
    return;
  }

  loadoutProfileGrid.innerHTML = profiles.map(p => `
    <div class="loadout-card ${p.is_active ? 'active-loadout' : ''}">
      <div class="lc-top">
        <span class="lc-badge ${p.is_active ? 'good' : 'muted'}">${p.is_active ? '⚡ ACTIVE IN-GAME' : 'STORED PROFILE'}</span>
        <span class="lc-size">${p.size_mb} MB (${p.file_count} files)</span>
      </div>
      <div class="lc-name">${escapeHtml(p.name)}</div>
      <div class="lc-path">${escapeHtml(p.path)}</div>
      <div class="lc-actions">
        <button class="btn-swap-loadout ${p.is_active ? 'btn-active-now' : ''}" data-name="${escapeHtml(p.name)}">
          ${p.is_active ? '✓ Currently Loaded' : '⚡ 1-Sec Instant Swap'}
        </button>
        <button class="btn-delete-loadout" data-name="${escapeHtml(p.name)}" title="Delete Profile">✕</button>
      </div>
    </div>
  `).join('');

  loadoutProfileGrid.querySelectorAll('.btn-swap-loadout:not(.btn-active-now)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pName = btn.getAttribute('data-name');
      const gameId = selLoadoutGame.value;
      const targetDest = txtLoadoutDestPath.value;

      if (!targetDest) {
        showToast('Specify target game destination folder path first', 'alert');
        return;
      }

      try {
        btn.textContent = 'Swapping...';
        const res = await fetch('/api/loadout/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: gameId,
            profile_name: pName,
            link_destination_path: targetDest
          })
        });
        const data = await res.json();
        showToast(data.message, data.status === 'success' ? 'success' : 'alert');
        playRadarBlip(1100);
        loadProfiles();
      } catch (e) {
        showToast('Failed to swap profile loadout', 'alert');
      }
    });
  });

  loadoutProfileGrid.querySelectorAll('.btn-delete-loadout').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pName = btn.getAttribute('data-name');
      if (confirm(`Delete loadout profile '${pName}'?`)) {
        try {
          await fetch('/api/loadout/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: selLoadoutGame.value, profile_name: pName })
          });
          showToast(`Profile '${pName}' deleted`, 'info');
          loadProfiles();
        } catch (e) {}
      }
    });
  });
}

export function initLoadoutModule() {
  selLoadoutGame = document.getElementById('sel-loadout-game');
  txtLoadoutDestPath = document.getElementById('txt-loadout-dest-path');
  loadoutProfileGrid = document.getElementById('loadout-profile-grid');
  btnCreateProfile = document.getElementById('btn-create-profile');
  txtNewProfileName = document.getElementById('txt-new-profile-name');

  if (selLoadoutGame) {
    selLoadoutGame.addEventListener('change', () => {
      syncDestPath();
      loadProfiles();
    });
  }

  if (btnCreateProfile) {
    btnCreateProfile.addEventListener('click', async () => {
      const name = txtNewProfileName ? txtNewProfileName.value.trim() : '';
      if (!name) {
        showToast('Enter a profile name', 'alert');
        return;
      }

      try {
        const res = await fetch('/api/loadout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_id: selLoadoutGame.value, profile_name: name })
        });
        const data = await res.json();
        showToast(data.message, data.status === 'success' ? 'success' : 'alert');
        playRadarBlip(1000);
        if (txtNewProfileName) txtNewProfileName.value = '';
        loadProfiles();
      } catch (e) {
        showToast('Failed to create loadout profile', 'alert');
      }
    });
  }

  loadLoadoutStatus();
}
