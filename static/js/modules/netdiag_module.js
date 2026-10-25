/**
 * NET DIAGNOSTIC MODULE • 3-Point Net Diagnostic Controller
 * Concurrently evaluates Gateway Hop vs WAN Upstream vs Bandwidth Saturation
 * to pinpoint exact root cause of lag spikes within 500ms.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let latestDiag = null;

// DOM Elements
let diagMasterBanner, dmbTitle, dmbDesc, dmbIcon;
let dpcGwIp, dpcGwPing, dpcGwLoss, dpcGwBadge;
let dpcWanPing, dpcWanLoss, dpcWanBadge;
let dpcDownRate, dpcUpRate, dpcBwBadge;
let diagAppsTbody, btnRunNetdiag;

export async function loadNetDiag() {
  try {
    const res = await fetch('/api/net_diagnostic/latest');
    const data = await res.json();
    latestDiag = data;
    renderNetDiagUI(data);
  } catch (e) {
    console.error('Failed to load network diagnostic', e);
  }
}

export async function runDiagnosticNow() {
  try {
    showToast('Running concurrent 3-point ping and bandwidth diagnosis...', 'info');
    const res = await fetch('/api/net_diagnostic/run', { method: 'POST' });
    const data = await res.json();
    latestDiag = data;
    renderNetDiagUI(data);
    showToast(`Diagnostic Complete: ${data.bottleneck_title}`, data.severity === 'danger' ? 'alert' : 'success');
    playRadarBlip(1200);
  } catch (e) {
    showToast('Network diagnostic run failed', 'alert');
  }
}

export function renderNetDiagUI(diag) {
  if (!diag || !diag.bottleneck_code) return;

  // Master Banner
  if (diagMasterBanner && dmbTitle && dmbDesc && dmbIcon) {
    dmbTitle.textContent = diag.bottleneck_title;
    dmbDesc.textContent = diag.bottleneck_desc;

    if (diag.severity === 'danger') {
      diagMasterBanner.className = 'diag-master-banner danger';
      dmbIcon.textContent = '🚨';
    } else if (diag.severity === 'warning') {
      diagMasterBanner.className = 'diag-master-banner warning';
      dmbIcon.textContent = '⚠️';
    } else {
      diagMasterBanner.className = 'diag-master-banner';
      dmbIcon.textContent = '🟢';
    }
  }

  // Point 1: Gateway
  if (diag.gateway) {
    if (dpcGwIp) dpcGwIp.textContent = diag.gateway.ip;
    if (dpcGwPing) dpcGwPing.textContent = diag.gateway.latency_ms !== null ? `${diag.gateway.latency_ms} ms` : 'Timeout';
    if (dpcGwLoss) dpcGwLoss.textContent = `${diag.gateway.packet_loss_pct}%`;
    if (dpcGwBadge) {
      dpcGwBadge.textContent = diag.gateway.status;
      dpcGwBadge.style.color = diag.gateway.status === 'HEALTHY' ? '#00e599' : '#ef4444';
    }
  }

  // Point 2: WAN
  if (diag.wan) {
    if (dpcWanPing) dpcWanPing.textContent = diag.wan.latency_ms !== null ? `${diag.wan.latency_ms} ms` : 'Timeout';
    if (dpcWanLoss) dpcWanLoss.textContent = `${diag.wan.packet_loss_pct}%`;
    if (dpcWanBadge) {
      dpcWanBadge.textContent = diag.wan.status;
      dpcWanBadge.style.color = diag.wan.status === 'HEALTHY' ? '#00e599' : '#ef4444';
    }
  }

  // Point 3: Bandwidth
  if (diag.bandwidth) {
    if (dpcDownRate) dpcDownRate.textContent = `${diag.bandwidth.download_mbps} Mbps`;
    if (dpcUpRate) dpcUpRate.textContent = `${diag.bandwidth.upload_mbps} Mbps`;
    if (dpcBwBadge) {
      const isHigh = diag.bandwidth.download_mbps > 15;
      dpcBwBadge.textContent = isHigh ? 'HIGH TRAFFIC' : 'NORMAL';
      dpcBwBadge.style.color = isHigh ? '#f59e0b' : '#00e599';
    }
  }

  // Top Apps
  if (diagAppsTbody && diag.top_apps) {
    if (diag.top_apps.length === 0) {
      diagAppsTbody.innerHTML = '<tr><td colspan="4" class="empty-state-notice">No high-traffic network apps currently active.</td></tr>';
    } else {
      diagAppsTbody.innerHTML = diag.top_apps.map(a => `
        <tr>
          <td><strong>${escapeHtml(a.name)}</strong></td>
          <td><code>${a.pid}</code></td>
          <td><span class="badge-tag">${a.memory_mb} MB</span></td>
          <td style="font-family: monospace; font-size: 11px; color:#94a3b8;">${escapeHtml(a.remote)}</td>
        </tr>
      `).join('');
    }
  }
}

export function initNetDiagModule() {
  diagMasterBanner = document.getElementById('diag-master-banner');
  dmbTitle = document.getElementById('dmb-title');
  dmbDesc = document.getElementById('dmb-desc');
  dmbIcon = document.getElementById('dmb-icon');
  dpcGwIp = document.getElementById('dpc-gw-ip');
  dpcGwPing = document.getElementById('dpc-gw-ping');
  dpcGwLoss = document.getElementById('dpc-gw-loss');
  dpcGwBadge = document.getElementById('dpc-gw-badge');
  dpcWanPing = document.getElementById('dpc-wan-ping');
  dpcWanLoss = document.getElementById('dpc-wan-loss');
  dpcWanBadge = document.getElementById('dpc-wan-badge');
  dpcDownRate = document.getElementById('dpc-down-rate');
  dpcUpRate = document.getElementById('dpc-up-rate');
  dpcBwBadge = document.getElementById('dpc-bw-badge');
  diagAppsTbody = document.getElementById('diag-apps-tbody');
  btnRunNetdiag = document.getElementById('btn-run-netdiag');

  if (btnRunNetdiag) {
    btnRunNetdiag.addEventListener('click', runDiagnosticNow);
  }

  loadNetDiag();
}
