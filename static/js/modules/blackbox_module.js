/**
 * STUTTER BLACKBOX MODULE
 * 60-Second Rolling Flight Recorder and Lag Spike Culprit Isolator.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let btnFreezeBlackbox, btnResetBlackbox;
let bbStatusBadge, bbVerdictText, bbCulpritProcess, bbBottleneckType, bbDiagnosisText, bbRecommendationText;
let bbLiveCpu, bbLiveRam, bbLiveDisk, bbLiveNet;
let bbLogContainer;

export async function loadBlackboxStatus() {
  try {
    const res = await fetch('/api/blackbox/status');
    const data = await res.json();
    updateBlackboxUI(data);
  } catch (e) {
    console.error('Failed to load Blackbox status:', e);
  }
}

export function updateBlackboxUI(data) {
  if (!btnFreezeBlackbox) return;

  const isFrozen = !!data.is_frozen;
  btnFreezeBlackbox.style.display = isFrozen ? 'none' : 'inline-flex';
  if (btnResetBlackbox) btnResetBlackbox.style.display = isFrozen ? 'inline-flex' : 'none';

  if (bbStatusBadge) {
    bbStatusBadge.textContent = isFrozen ? 'INCIDENT FROZEN' : 'RECORDING (60s ROLLING)';
    bbStatusBadge.className = `vhc-badge ${isFrozen ? 'alert' : 'good'}`;
  }

  const latest = data.latest;
  if (latest) {
    if (bbLiveCpu) bbLiveCpu.textContent = `${latest.cpu_percent.toFixed(1)}%`;
    if (bbLiveRam) bbLiveRam.textContent = `${latest.ram_percent.toFixed(1)}% (${latest.ram_used_gb} GB)`;
    if (bbLiveDisk) bbLiveDisk.textContent = `${latest.disk_write_mbs.toFixed(1)} MB/s`;
    if (bbLiveNet) bbLiveNet.textContent = `${latest.net_recv_kbs.toFixed(0)} KB/s`;
  }

  if (isFrozen && data.frozen_incident && data.frozen_incident.analysis) {
    const an = data.frozen_incident.analysis;
    if (bbVerdictText) bbVerdictText.textContent = an.verdict;
    if (bbCulpritProcess) bbCulpritProcess.textContent = an.culprit_process;
    if (bbBottleneckType) bbBottleneckType.textContent = an.bottleneck_type;
    if (bbDiagnosisText) bbDiagnosisText.textContent = an.diagnosis;
    if (bbRecommendationText) bbRecommendationText.textContent = an.recommendation;

    // Render frozen log table
    renderHistoryRows(data.frozen_incident.history || []);
  } else {
    if (bbVerdictText) bbVerdictText.textContent = 'Active Monitoring (Waiting for incident freeze)...';
    if (bbCulpritProcess) bbCulpritProcess.textContent = latest && latest.top_processes.length ? latest.top_processes[0].name : 'Monitoring';
    if (bbBottleneckType) bbBottleneckType.textContent = latest && latest.is_spike ? 'Spike Detected!' : 'Smooth (Optimal)';
    if (bbDiagnosisText) bbDiagnosisText.textContent = 'Flight recorder is tracking second-by-second process activity. Click "Freeze Incident" right after a stutter to isolate the guilty process.';
    if (bbRecommendationText) bbRecommendationText.textContent = 'Press the freeze button or hotkey as soon as an FPS drop occurs in-game.';
  }
}

function renderHistoryRows(records) {
  if (!bbLogContainer) return;
  if (!records.length) {
    bbLogContainer.innerHTML = '<div class="empty-state">No telemetry recorded yet</div>';
    return;
  }

  bbLogContainer.innerHTML = records.slice(-15).reverse().map(r => {
    const topP = (r.top_processes && r.top_processes.length) ? r.top_processes[0].name : '--';
    const topCpu = (r.top_processes && r.top_processes.length) ? `${r.top_processes[0].cpu}%` : '--';
    return `
      <div class="bb-log-row ${r.is_spike ? 'spike-row' : ''}">
        <span class="bb-time">${new Date(r.timestamp * 1000).toLocaleTimeString()}</span>
        <span class="bb-cpu ${r.cpu_percent > 75 ? 'danger' : ''}">CPU: ${r.cpu_percent.toFixed(1)}%</span>
        <span class="bb-ram">RAM: ${r.ram_percent.toFixed(1)}%</span>
        <span class="bb-disk ${r.disk_write_mbs > 20 ? 'danger' : ''}">Disk: ${r.disk_write_mbs.toFixed(1)} MB/s</span>
        <span class="bb-proc">Top: <strong>${escapeHtml(topP)}</strong> (${topCpu})</span>
      </div>
    `;
  }).join('');
}

export function initBlackboxModule() {
  btnFreezeBlackbox = document.getElementById('btn-freeze-blackbox');
  btnResetBlackbox = document.getElementById('btn-reset-blackbox');
  bbStatusBadge = document.getElementById('bb-status-badge');
  bbVerdictText = document.getElementById('bb-verdict-text');
  bbCulpritProcess = document.getElementById('bb-culprit-process');
  bbBottleneckType = document.getElementById('bb-bottleneck-type');
  bbDiagnosisText = document.getElementById('bb-diagnosis-text');
  bbRecommendationText = document.getElementById('bb-recommendation-text');
  bbLiveCpu = document.getElementById('bb-live-cpu');
  bbLiveRam = document.getElementById('bb-live-ram');
  bbLiveDisk = document.getElementById('bb-live-disk');
  bbLiveNet = document.getElementById('bb-live-net');
  bbLogContainer = document.getElementById('bb-log-container');

  if (btnFreezeBlackbox) {
    btnFreezeBlackbox.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/blackbox/freeze', { method: 'POST' });
        const data = await res.json();
        showToast(`Incident Frozen! Culprit: ${data.analysis.culprit_process}`, 'alert');
        playRadarBlip(1250);
        loadBlackboxStatus();
      } catch (e) {
        showToast('Failed to freeze Blackbox incident', 'alert');
      }
    });
  }

  if (btnResetBlackbox) {
    btnResetBlackbox.addEventListener('click', async () => {
      try {
        await fetch('/api/blackbox/reset', { method: 'POST' });
        showToast('Blackbox resumed live rolling capture', 'info');
        playRadarBlip(900);
        loadBlackboxStatus();
      } catch (e) {}
    });
  }

  loadBlackboxStatus();
  setInterval(loadBlackboxStatus, 2000);
}
