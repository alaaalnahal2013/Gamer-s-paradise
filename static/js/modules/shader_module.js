/**
 * SHADER CACHE SWEEPER MODULE
 * Wipes corrupt and stale DirectX, NVIDIA, AMD, and Intel shader caches to clear micro-stutters.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let btnSweepShaders, btnScanShaders;
let shaderTotalFiles, shaderTotalMb, shaderLifetimeMb, shaderTargetList;

export async function scanShaders() {
  try {
    const res = await fetch('/api/shader_sweeper/scan');
    const data = await res.json();
    renderShaderScan(data);
  } catch (e) {
    console.error('Failed to scan shaders:', e);
  }
}

export function renderShaderScan(data) {
  if (shaderTotalFiles) shaderTotalFiles.textContent = data.total_files || 0;
  if (shaderTotalMb) shaderTotalMb.textContent = `${data.total_size_mb || 0} MB`;
  if (shaderLifetimeMb) shaderLifetimeMb.textContent = `${data.lifetime_freed_mb || 0} MB`;

  if (shaderTargetList && data.targets) {
    shaderTargetList.innerHTML = data.targets.map(t => `
      <div class="shader-card ${t.exists ? 'active-cache' : 'empty-cache'}">
        <div class="sc-header">
          <span class="sc-vendor">${escapeHtml(t.vendor)}</span>
          <span class="sc-badge ${t.size_mb > 0 ? 'highlight' : ''}">${t.size_mb} MB</span>
        </div>
        <div class="sc-title">${escapeHtml(t.name)}</div>
        <div class="sc-meta">${t.file_count} stale cache files detected</div>
        <div class="sc-path">${escapeHtml(t.path || 'Not present')}</div>
      </div>
    `).join('');
  }
}

export function initShaderModule() {
  btnSweepShaders = document.getElementById('btn-sweep-shaders');
  btnScanShaders = document.getElementById('btn-scan-shaders');
  shaderTotalFiles = document.getElementById('shader-total-files');
  shaderTotalMb = document.getElementById('shader-total-mb');
  shaderLifetimeMb = document.getElementById('shader-lifetime-mb');
  shaderTargetList = document.getElementById('shader-target-list');

  if (btnSweepShaders) {
    btnSweepShaders.addEventListener('click', async () => {
      try {
        btnSweepShaders.disabled = true;
        btnSweepShaders.textContent = '🧹 Purging Shaders...';
        const res = await fetch('/api/shader_sweeper/clean', { method: 'POST' });
        const data = await res.json();
        showToast(data.message, 'success');
        playRadarBlip(1200);
        scanShaders();
      } catch (e) {
        showToast('Failed to clean shader caches', 'alert');
      } finally {
        btnSweepShaders.disabled = false;
        btnSweepShaders.textContent = '🧹 SWEEP & PURGE SHADER CACHES';
      }
    });
  }

  if (btnScanShaders) {
    btnScanShaders.addEventListener('click', () => {
      scanShaders();
      showToast('Shader directories scanned', 'info');
      playRadarBlip(950);
    });
  }

  scanShaders();
}
