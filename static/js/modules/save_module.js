/**
 * SAVE-STATE TIME MACHINE MODULE
 * Continuous rolling save backups with 1-click instant rollback.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let selSaveGame, txtSavePath, chkAutoWatchSave;
let btnSaveBackup, txtBackupLabel, saveSnapshotList, saveSnapshotCount;

export async function loadSaveStatus() {
  try {
    const res = await fetch('/api/saves/status');
    const data = await res.json();
    updateSaveUI(data);
  } catch (e) {
    console.error('Failed to load Save Time Machine status:', e);
  }
}

export function updateSaveUI(data) {
  if (selSaveGame && data.presets) {
    if (selSaveGame.options.length <= 1) {
      selSaveGame.innerHTML = data.presets.map(p =>
        `<option value="${p.id}" ${p.id === data.active_game_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
      ).join('');
    }
  }

  if (txtSavePath && !txtSavePath.value) {
    txtSavePath.value = data.active_save_path || '';
  }

  if (chkAutoWatchSave) {
    chkAutoWatchSave.checked = !!data.auto_watch_enabled;
  }

  if (saveSnapshotCount) {
    saveSnapshotCount.textContent = data.total_snapshots || 0;
  }

  loadSnapshots(data.active_game_id);
}

export async function loadSnapshots(gameId) {
  try {
    const gid = gameId || (selSaveGame ? selSaveGame.value : 'elden_ring');
    const res = await fetch(`/api/saves/snapshots?game_id=${encodeURIComponent(gid)}`);
    const data = await res.json();
    renderSnapshotsList(data.snapshots || []);
  } catch (e) {
    console.error('Failed to load snapshots:', e);
  }
}

function renderSnapshotsList(snapshots) {
  if (!saveSnapshotList) return;
  if (!snapshots.length) {
    saveSnapshotList.innerHTML = '<div class="empty-state">No saved state checkpoints found. Click "Create Checkpoint" to back up your current progress.</div>';
    return;
  }

  saveSnapshotList.innerHTML = snapshots.map(s => `
    <div class="snapshot-row">
      <div class="sr-info">
        <span class="sr-icon">💾</span>
        <div>
          <div class="sr-title">${escapeHtml(s.filename)}</div>
          <div class="sr-date">${s.date_str} &bull; ${s.size_mb} MB</div>
        </div>
      </div>
      <button class="btn-restore-save" data-filename="${escapeHtml(s.filename)}">
        ↺ 1-Click Restore
      </button>
    </div>
  `).join('');

  saveSnapshotList.querySelectorAll('.btn-restore-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const filename = btn.getAttribute('data-filename');
      const gameId = selSaveGame.value;
      const targetPath = txtSavePath.value;

      if (!targetPath) {
        showToast('Specify target save directory first', 'alert');
        return;
      }

      if (confirm(`Are you sure you want to restore '${filename}'? An automated safety backup will be created first.`)) {
        try {
          const res = await fetch('/api/saves/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              game_id: gameId,
              snapshot_filename: filename,
              target_save_path: targetPath
            })
          });
          const data = await res.json();
          showToast(data.message, data.status === 'success' ? 'success' : 'alert');
          playRadarBlip(1100);
          loadSnapshots(gameId);
        } catch (e) {
          showToast('Failed to restore snapshot', 'alert');
        }
      }
    });
  });
}

export function initSaveModule() {
  selSaveGame = document.getElementById('sel-save-game');
  txtSavePath = document.getElementById('txt-save-path');
  chkAutoWatchSave = document.getElementById('chk-auto-watch-save');
  btnSaveBackup = document.getElementById('btn-save-backup');
  txtBackupLabel = document.getElementById('txt-backup-label');
  saveSnapshotList = document.getElementById('save-snapshot-list');
  saveSnapshotCount = document.getElementById('save-snapshot-count');

  if (selSaveGame) {
    selSaveGame.addEventListener('change', () => {
      loadSnapshots(selSaveGame.value);
    });
  }

  if (btnSaveBackup) {
    btnSaveBackup.addEventListener('click', async () => {
      const gameId = selSaveGame ? selSaveGame.value : 'custom';
      const savePath = txtSavePath ? txtSavePath.value : '';
      const label = txtBackupLabel && txtBackupLabel.value ? txtBackupLabel.value : 'Manual Checkpoint';

      if (!savePath) {
        showToast('Please enter a valid save directory path', 'alert');
        return;
      }

      try {
        btnSaveBackup.disabled = true;
        btnSaveBackup.textContent = 'Archiving...';
        const res = await fetch('/api/saves/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_id: gameId, save_path: savePath, label })
        });
        const data = await res.json();
        showToast(data.message, data.status === 'success' ? 'success' : 'alert');
        playRadarBlip(1150);
        if (txtBackupLabel) txtBackupLabel.value = '';
        loadSnapshots(gameId);
      } catch (e) {
        showToast('Failed to create save snapshot', 'alert');
      } finally {
        btnSaveBackup.disabled = false;
        btnSaveBackup.textContent = '💾 Create Checkpoint';
      }
    });
  }

  if (chkAutoWatchSave) {
    chkAutoWatchSave.addEventListener('change', async () => {
      const gameId = selSaveGame.value;
      const savePath = txtSavePath.value;
      try {
        await fetch('/api/saves/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: gameId,
            save_path: savePath,
            auto_watch: chkAutoWatchSave.checked
          })
        });
        showToast(chkAutoWatchSave.checked ? 'Auto-save watchdog engaged' : 'Auto-save disabled', 'info');
      } catch (e) {}
    });
  }

  loadSaveStatus();
}
