/**
 * SNIPER MODULE • Lock & Port Sniper Controller
 * Inspects port collisions (EADDRINUSE) and Windows RestartManager file locks.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

// DOM Elements
let inputSniperPort, btnInspectPort, sniperCommonPortsGrid;
let inputLockedFile, btnInspectFile, sniperResultCard;

export async function inspectPort(portNumber) {
  if (!portNumber) {
    showToast('Please enter a valid port number (e.g. 3000, 8080)', 'alert');
    return;
  }
  try {
    showToast(`Scanning PID bound to port ${portNumber}...`, 'info');
    const res = await fetch(`/api/sniper/port/${portNumber}`);
    const data = await res.json();
    renderSniperResult(data, 'port', portNumber);
    playRadarBlip(1050);
  } catch (e) {
    showToast('Failed to inspect port', 'alert');
  }
}

export async function inspectFileLock(filePath) {
  if (!filePath) {
    showToast('Please enter or paste a file or folder path', 'alert');
    return;
  }
  try {
    showToast(`Querying Windows RestartManager for "${filePath}"...`, 'info');
    const res = await fetch('/api/sniper/file_lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath })
    });
    const data = await res.json();
    renderSniperResult(data, 'file', filePath);
    playRadarBlip(1050);
  } catch (e) {
    showToast('Failed to inspect file lock', 'alert');
  }
}

export async function killProcess(pid, procName) {
  if (!confirm(`Are you sure you want to terminate process "${procName}" (PID: ${pid})?`)) return;
  try {
    const res = await fetch(`/api/sniper/kill/${pid}`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast(`Culprit process ${procName} (PID ${pid}) terminated! Port/File is now FREE.`, 'success');
      playRadarBlip(1250);
      if (sniperResultCard) {
        sniperResultCard.style.display = 'none';
      }
      loadCommonPorts();
    } else {
      showToast(`Could not terminate PID ${pid}: ${data.message}`, 'alert');
    }
  } catch (e) {
    showToast('Failed to kill process', 'alert');
  }
}

export function renderSniperResult(data, type, target) {
  if (!sniperResultCard) return;
  sniperResultCard.style.display = 'block';

  if (!data.in_use && !data.locked) {
    sniperResultCard.className = 'util-panel sniper-result-box clean';
    sniperResultCard.innerHTML = `
      <div class="srb-header">
        <span class="srb-icon">🟢</span>
        <div>
          <h4>${type === 'port' ? `Port ${target} is Completely FREE` : `File "${escapeHtml(target)}" is UNLOCKED`}</h4>
          <p class="text-muted">No process is currently holding this resource. Safe to bind or delete!</p>
        </div>
      </div>
    `;
    return;
  }

  // Culprit found
  const culprits = data.processes || (data.process ? [data.process] : []);
  sniperResultCard.className = 'util-panel sniper-result-box active';
  sniperResultCard.innerHTML = `
    <div class="srb-header">
      <span class="srb-icon">🚨</span>
      <div>
        <h4 style="color:#f43f5e;">CULPRIT IDENTIFIED &bull; Resource Locked!</h4>
        <p class="text-muted">${type === 'port' ? `Port ${target} is currently occupied:` : `File is held open by ${culprits.length} process(es):`}</p>
      </div>
    </div>
    <div class="srb-culprits-list">
      ${culprits.map(p => `
        <div class="culprit-row">
          <div class="cr-left">
            <span class="cr-badge">PID ${p.pid}</span>
            <div class="cr-details">
              <strong>${escapeHtml(p.name)}</strong>
              <span class="cr-cmd text-muted">${escapeHtml(p.cmdline || p.path || '')}</span>
            </div>
          </div>
          <button class="btn-danger-action btn-kill-proc" data-pid="${p.pid}" data-name="${escapeHtml(p.name)}">
            🎯 1-CLICK KILL (SNIPE)
          </button>
        </div>
      `).join('')}
    </div>
  `;

  sniperResultCard.querySelectorAll('.btn-kill-proc').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-pid');
      const name = btn.getAttribute('data-name');
      killProcess(pid, name);
    });
  });
}

export async function loadCommonPorts() {
  if (!sniperCommonPortsGrid) return;
  try {
    const res = await fetch('/api/sniper/common_ports');
    const data = await res.json();
    const ports = data.ports || [];
    sniperCommonPortsGrid.innerHTML = ports.map(p => `
      <div class="common-port-chip ${p.in_use ? 'occupied' : 'free'}" data-port="${p.port}">
        <span class="cpc-port">:${p.port}</span>
        <span class="cpc-name">${p.name}</span>
        <span class="cpc-status">${p.in_use ? `Occupied (${escapeHtml(p.process?.name || '')})` : 'Free'}</span>
      </div>
    `).join('');

    sniperCommonPortsGrid.querySelectorAll('.common-port-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const port = chip.getAttribute('data-port');
        if (inputSniperPort) inputSniperPort.value = port;
        inspectPort(port);
      });
    });
  } catch (e) {}
}

export function initSniperModule() {
  inputSniperPort = document.getElementById('input-sniper-port');
  btnInspectPort = document.getElementById('btn-inspect-port');
  sniperCommonPortsGrid = document.getElementById('sniper-common-ports-grid');
  inputLockedFile = document.getElementById('input-locked-file');
  btnInspectFile = document.getElementById('btn-inspect-file');
  sniperResultCard = document.getElementById('sniper-result-card');

  if (btnInspectPort && inputSniperPort) {
    btnInspectPort.addEventListener('click', () => {
      inspectPort(inputSniperPort.value.trim());
    });
    inputSniperPort.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') inspectPort(inputSniperPort.value.trim());
    });
  }

  if (btnInspectFile && inputLockedFile) {
    btnInspectFile.addEventListener('click', () => {
      inspectFileLock(inputLockedFile.value.trim());
    });
    inputLockedFile.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') inspectFileLock(inputLockedFile.value.trim());
    });
  }

  loadCommonPorts();
}
