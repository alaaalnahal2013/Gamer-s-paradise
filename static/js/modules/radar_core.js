/**
 * RADAR CORE MODULE • 360° Tactical Radar, Telemetry Oscilloscopes, Fleet Table & WebSocket Controller
 * Completely isolated from utility modules.
 */

import { showToast, playRadarBlip, playAlertAlarm, escapeHtml } from './utils.js';
import { switchView } from './navigation.js';

// --- State Store ---
let socket = null;
let targets = [];
let diagnosis = {};
let wifiInfo = {};
let recommendation = {};
let selectedGameId = 'cs2';
let detectedGame = null;
let pingSettings = { interval: 1.0, paused: false };
let currentRegionFilter = 'all';
let searchQuery = '';
let radarMaxRange = 250;
let totalPacketsReceived = 0;

// Canvas Animation State
let sweepAngle = 0;
let blipRipples = {};
const targetAngleMap = {};

const TARGET_COLORS = [
  '#00e599', '#22d3ee', '#fbbf24', '#f43f5e', '#a855f7',
  '#38bdf8', '#34d399', '#fb7185', '#4ade80', '#facc15'
];

// External update callbacks
const telemetryListeners = [];
export function onTelemetryUpdate(callback) {
  telemetryListeners.push(callback);
}

// DOM Elements
let gameSelectDropdown, topbarRateText, topbarHealthStreak, btnAudioToggle, btnTopbarHud;
let btnOpenOverlayWindow, btnLaunchNativeOverlay, btnVoiceRecommendation;
let igebGameStatus, igebDesc;
let dashStatBestRegion, dashStatWifiQuality, dashStatOverallStatus;
let btnDashScanRegions, dashScanDesc, btnDashViewDiagnostics;
let dashFaultTitle, dashFaultDesc, dashStatusPill;
let donutCircleProgress, donutAccuracyVal;
let dashGwPing, dashIspPing, dashGameBestPing, dashPacketLossVal;
let overviewLatencyCanvas, overviewLatencyCtx;
let radarCanvas, radarCtx, radarTargetCount;
let radarBestServerName, radarBestServerRegion, radarBestPing, radarBestJitter, radarBestLoss;
let radarCmdCode, btnCopyRadarCmd;
let latencyCanvas, latencyCtx, jitterCanvas, jitterCtx;
let ladderList, btnSweepOptimizer;
let diagNodeWifi, diagWifiHopSub, diagLedWifi;
let diagNodeIsp, diagIspHopSub, diagLedIsp;
let diagNodeServer, diagServerHopSub, diagLedServer;
let diagFullTitle, diagFullMessage;
let serversGrid, serverSearchInput, btnAddFleetServer, categoryTabs;
let inputUserIpSettings, btnSaveUserIpSettings, btnDetectUserIpSettings;
let settingsIntervalSelect, btnExportSettings, sidebarUserIp, btnRefreshConnection;
let modalAdd, btnCloseModal, btnCancelModal, formAdd;

export function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[Ping Radar Core] Telemetry stream connected.');
    if (dashStatusPill) dashStatusPill.textContent = 'Telemetry Active';
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleTelemetryUpdate(payload);
    } catch (err) {
      console.error('Failed to parse WebSocket packet', err);
    }
  };

  socket.onclose = () => {
    if (dashStatusPill) dashStatusPill.textContent = 'Reconnecting...';
    setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = () => {
    socket.close();
  };
}

function handleTelemetryUpdate(data) {
  if (data.targets) {
    targets = data.targets;
    totalPacketsReceived += targets.filter(t => t.enabled).length;
  }
  if (data.diagnosis) diagnosis = data.diagnosis;
  if (data.wifi) wifiInfo = data.wifi;
  if (data.recommendation) recommendation = data.recommendation;
  if (data.detected_game !== undefined) detectedGame = data.detected_game;
  if (data.selected_game_id && data.selected_game_id !== selectedGameId) {
    selectedGameId = data.selected_game_id;
    if (gameSelectDropdown) gameSelectDropdown.value = selectedGameId;
  }
  if (data.settings) {
    pingSettings = data.settings;
    if (settingsIntervalSelect) settingsIntervalSelect.value = pingSettings.interval.toString();
    if (topbarRateText) topbarRateText.textContent = `${pingSettings.interval.toFixed(1)}s`;
  }

  updateTargetAngles();
  updateDashboardUI();
  updateTacticalRadarUI();
  updateRegionLadderUI();
  updateDiagnosticsUI();
  renderServersGrid();

  // Ripples for live blips
  targets.forEach(t => {
    if (t.enabled && t.metrics && t.metrics.current_rtt !== null) {
      if (!blipRipples[t.id]) blipRipples[t.id] = [];
      blipRipples[t.id].push({ radius: 4, maxRadius: 26, alpha: 1.0 });
    }
  });

  if (diagnosis.verdict === 'LOCAL_WIFI_FAULT' || diagnosis.severity === 'critical') {
    playAlertAlarm();
  } else {
    playRadarBlip(750 + Math.random() * 200);
  }

  // Notify any subscribers
  telemetryListeners.forEach(fn => {
    try { fn(data); } catch (e) {}
  });
}

function updateTargetAngles() {
  const enabled = targets.filter(t => t.enabled);
  enabled.forEach((t, idx) => {
    if (!(t.id in targetAngleMap)) {
      if (t.is_gateway) {
        targetAngleMap[t.id] = -Math.PI / 2; // North (Top)
      } else if (t.is_reference) {
        targetAngleMap[t.id] = -Math.PI / 4; // North-East
      } else {
        const step = (Math.PI * 2) / Math.max(1, enabled.length);
        targetAngleMap[t.id] = (idx * step) % (Math.PI * 2);
      }
    }
  });
}

function updateDashboardUI() {
  const best = recommendation.best_server;
  const gw = targets.find(t => t.is_gateway);
  const ref = targets.find(t => t.is_reference);

  if (dashStatBestRegion) {
    dashStatBestRegion.textContent = best ? (best.region || best.name || 'Optimal') : 'Scanning...';
  }

  if (dashStatWifiQuality) {
    if (gw && gw.metrics) {
      const gwRtt = gw.metrics.current_rtt || 2;
      const gwLoss = gw.metrics.packet_loss || 0;
      dashStatWifiQuality.textContent = (gwLoss === 0 && gwRtt < 5) ? 'Clean (100%)' : `Degraded (${gwRtt}ms)`;
    } else {
      dashStatWifiQuality.textContent = 'Clean (100%)';
    }
  }

  if (dashStatOverallStatus) {
    const verdict = (diagnosis.verdict || 'OPTIMAL').replace(/_/g, ' ');
    dashStatOverallStatus.textContent = verdict.charAt(0).toUpperCase() + verdict.slice(1).toLowerCase();
  }

  if (dashFaultTitle && dashFaultDesc) {
    dashFaultTitle.textContent = diagnosis.title || 'Fault Isolation Verdict';
    dashFaultDesc.textContent = diagnosis.message || 'Wi-Fi hop is 100% clean. Lag spikes originate from remote routing, not your local network.';
  }

  let stabilityScore = 98;
  if (gw && gw.metrics) {
    const lossDeduct = (gw.metrics.packet_loss || 0) * 3;
    const jitterDeduct = Math.min(25, (gw.metrics.jitter || 0) * 1.5);
    stabilityScore = Math.max(10, Math.min(100, Math.round(100 - lossDeduct - jitterDeduct)));
  }

  if (donutAccuracyVal) donutAccuracyVal.textContent = `${stabilityScore}%`;
  if (donutCircleProgress) {
    const circum = 301.6;
    donutCircleProgress.style.strokeDashoffset = circum * (1 - (stabilityScore / 100));
  }

  if (dashGwPing) {
    dashGwPing.textContent = gw && gw.metrics && gw.metrics.current_rtt !== null ? `${gw.metrics.current_rtt} ms` : '1.8 ms';
  }
  if (dashIspPing) {
    dashIspPing.textContent = ref && ref.metrics && ref.metrics.current_rtt !== null ? `${ref.metrics.current_rtt} ms` : '24.5 ms';
  }
  if (dashGameBestPing) {
    dashGameBestPing.textContent = best && best.metrics && best.metrics.current_rtt !== null ? `${best.metrics.current_rtt} ms` : '42.1 ms';
  }
  if (dashPacketLossVal) {
    dashPacketLossVal.textContent = gw && gw.metrics ? `${gw.metrics.packet_loss}%` : '0.0%';
  }

  if (sidebarUserIp && gw) {
    sidebarUserIp.textContent = gw.ip;
  }
  if (inputUserIpSettings && document.activeElement !== inputUserIpSettings && gw && !inputUserIpSettings.value) {
    inputUserIpSettings.value = gw.ip;
  }

  if (igebGameStatus && igebDesc) {
    if (detectedGame && detectedGame.name) {
      igebGameStatus.textContent = `HOOKED: ${detectedGame.name.toUpperCase()}`;
      igebGameStatus.style.background = 'rgba(0, 229, 153, 0.22)';
      igebGameStatus.style.borderColor = '#00e599';
      igebDesc.textContent = `Telemetry locked onto active game: ${detectedGame.name}. Lowest ping: ${best ? best.name : 'scanning'} (${best && best.metrics ? best.metrics.current_rtt + 'ms' : '--'}).`;
    } else {
      const selName = gameSelectDropdown ? gameSelectDropdown.options[gameSelectDropdown.selectedIndex]?.text : 'Game';
      igebGameStatus.textContent = 'AUTO-HOOK READY';
      igebGameStatus.style.background = 'rgba(0, 229, 153, 0.12)';
      igebGameStatus.style.borderColor = 'rgba(0, 229, 153, 0.3)';
      igebDesc.textContent = `Overlay active telemetry directly on top of your PC game screen. Currently monitoring ${selName} regional fleet.`;
    }
  }
}

function updateTacticalRadarUI() {
  const best = recommendation.best_server;
  if (radarBestServerName && best) radarBestServerName.textContent = best.name;
  if (radarBestServerRegion && best) radarBestServerRegion.textContent = best.region;
  if (radarBestPing && best && best.metrics) radarBestPing.textContent = `${best.metrics.current_rtt} ms`;
  if (radarBestJitter && best && best.metrics) radarBestJitter.textContent = `±${best.metrics.jitter} ms`;
  if (radarBestLoss && best && best.metrics) radarBestLoss.textContent = `${best.metrics.packet_loss}%`;

  if (radarCmdCode && recommendation.matchmaking_cmd && recommendation.recommended_max_ping) {
    radarCmdCode.textContent = `${recommendation.matchmaking_cmd} ${recommendation.recommended_max_ping}`;
  }
  if (radarTargetCount) {
    const count = targets.filter(t => t.enabled).length;
    radarTargetCount.textContent = `SERVERS: ${count}`;
  }
}

function updateRegionLadderUI() {
  if (!ladderList || !recommendation.leaderboard) return;
  ladderList.innerHTML = recommendation.leaderboard.map((item, idx) => {
    const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'standard';
    const rtt = item.metrics.current_rtt !== null ? `${item.metrics.current_rtt} ms` : 'LOST';
    const jitter = `±${item.metrics.jitter} ms`;
    const grade = item.metrics.grade || 'A';
    const gradeClass = grade.startsWith('A') ? 'a' : grade.startsWith('B') ? 'b' : grade.startsWith('C') ? 'c' : 'd';

    return `
      <div class="ladder-row">
        <div><span class="rank-pill ${rankClass}">#${idx + 1}</span></div>
        <div class="server-cell">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.ip)}</span>
        </div>
        <div class="region-cell">${escapeHtml(item.region)}</div>
        <div class="latency-cell">
          <strong>${rtt}</strong>
          <span>(${jitter})</span>
        </div>
        <div><span class="grade-badge ${gradeClass}">${grade}</span></div>
      </div>
    `;
  }).join('');
}

function updateDiagnosticsUI() {
  const gw = targets.find(t => t.is_gateway);
  const ref = targets.find(t => t.is_reference);
  const best = recommendation.best_server;

  if (gw && gw.metrics) {
    const rtt = gw.metrics.current_rtt !== null ? `${gw.metrics.current_rtt} ms` : 'Offline';
    if (diagWifiHopSub) diagWifiHopSub.textContent = `RTT: ${rtt}`;
    const isBad = gw.metrics.packet_loss > 0 || (gw.metrics.current_rtt && gw.metrics.current_rtt > 15);
    if (diagLedWifi) {
      diagLedWifi.className = `dhn-badge ${isBad ? 'alert' : 'clean'}`;
      diagLedWifi.textContent = isBad ? 'DEGRADED' : 'CLEAN';
    }
    if (diagNodeWifi) diagNodeWifi.classList.toggle('alert', isBad);
  }

  if (ref && ref.metrics) {
    const rtt = ref.metrics.current_rtt !== null ? `${ref.metrics.current_rtt} ms` : 'Offline';
    if (diagIspHopSub) diagIspHopSub.textContent = `Edge: ${rtt}`;
    const isBad = diagnosis.verdict === 'ISP_FAULT';
    if (diagLedIsp) {
      diagLedIsp.className = `dhn-badge ${isBad ? 'alert' : 'clean'}`;
      diagLedIsp.textContent = isBad ? 'DEGRADED' : 'OPTIMAL';
    }
    if (diagNodeIsp) diagNodeIsp.classList.toggle('alert', isBad);
  }

  if (best && best.metrics) {
    const rtt = best.metrics.current_rtt !== null ? `${best.metrics.current_rtt} ms` : 'Offline';
    if (diagServerHopSub) diagServerHopSub.textContent = `Best: ${rtt}`;
    const isBad = diagnosis.verdict === 'SERVER_FAULT';
    if (diagLedServer) {
      diagLedServer.className = `dhn-badge ${isBad ? 'alert' : 'clean'}`;
      diagLedServer.textContent = isBad ? 'SPIKING' : 'READY';
    }
    if (diagNodeServer) diagNodeServer.classList.toggle('alert', isBad);
  }

  if (diagFullTitle && diagnosis.title) diagFullTitle.textContent = diagnosis.title;
  if (diagFullMessage && diagnosis.message) diagFullMessage.textContent = diagnosis.message;
}

function renderServersGrid() {
  if (!serversGrid) return;
  let filtered = targets;

  if (currentRegionFilter !== 'all') {
    filtered = targets.filter(t => {
      if (t.is_gateway || t.is_reference) return true;
      const reg = (t.region || '').toLowerCase();
      if (currentRegionFilter === 'europe') return reg.includes('eu') || reg.includes('europe');
      if (currentRegionFilter === 'na') return reg.includes('us') || reg.includes('north america');
      if (currentRegionFilter === 'asia') return reg.includes('asia') || reg.includes('middle east') || reg.includes('japan');
      if (currentRegionFilter === 'other') return reg.includes('south america') || reg.includes('oceania') || reg.includes('brazil');
      if (currentRegionFilter === 'custom') return t.category === 'custom';
      return true;
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.region && t.region.toLowerCase().includes(q)) ||
      (t.ip && t.ip.toLowerCase().includes(q))
    );
  }

  serversGrid.innerHTML = filtered.map(t => {
    const m = t.metrics || {};
    const rtt = m.current_rtt !== null && m.current_rtt !== undefined ? `${m.current_rtt} ms` : 'LOST';
    const jitter = `±${m.jitter || 0} ms`;

    return `
      <div class="server-grid-item">
        <div class="sgi-head">
          <span class="sgi-name">${escapeHtml(t.name)}</span>
          <span class="sgi-ping-badge">${rtt}</span>
        </div>
        <div class="sgi-sub">${escapeHtml(t.region || 'Datacenter')} &bull; ${jitter}</div>
        <div class="sgi-footer">
          <span class="sgi-ip">${escapeHtml(t.ip)}</span>
          <button class="btn-clean-cancel" style="padding: 2px 6px; font-size: 11px;" data-del="${t.id}">
            ${t.category === 'custom' ? 'Delete' : 'Probe'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Canvas 1: Dashboard Overview Latency Graph ---
export function renderOverviewChart() {
  if (!overviewLatencyCtx) return;
  const w = overviewLatencyCanvas.width;
  const h = overviewLatencyCanvas.height;
  overviewLatencyCtx.clearRect(0, 0, w, h);

  const padLeft = 35;
  const padBottom = 25;
  const padTop = 15;
  const padRight = 15;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const yMax = 120;

  overviewLatencyCtx.font = '10px "JetBrains Mono", monospace';
  overviewLatencyCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  overviewLatencyCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  overviewLatencyCtx.setLineDash([4, 4]);
  overviewLatencyCtx.lineWidth = 1;

  [0, 40, 80, 120].forEach(val => {
    const y = padTop + plotH - (val / yMax) * plotH;
    overviewLatencyCtx.beginPath();
    overviewLatencyCtx.moveTo(padLeft, y);
    overviewLatencyCtx.lineTo(w - padRight, y);
    overviewLatencyCtx.stroke();
    overviewLatencyCtx.fillText(`${val}ms`, 6, y + 3);
  });
  overviewLatencyCtx.setLineDash([]);

  const best = targets.find(t => !t.is_gateway && !t.is_reference && t.enabled) || targets[0];
  if (best && best.history && best.history.length > 1) {
    const hist = best.history;
    const step = plotW / 30;

    const grad = overviewLatencyCtx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, 'rgba(0, 229, 153, 0.25)');
    grad.addColorStop(1, 'rgba(0, 229, 153, 0.0)');

    overviewLatencyCtx.beginPath();
    let started = false;
    hist.forEach((pt, i) => {
      const x = padLeft + (30 - hist.length + i) * step;
      if (pt.rtt !== null) {
        const y = padTop + plotH - Math.min(1.0, pt.rtt / yMax) * plotH;
        if (!started) { overviewLatencyCtx.moveTo(x, y); started = true; }
        else { overviewLatencyCtx.lineTo(x, y); }
      }
    });
    overviewLatencyCtx.lineTo(padLeft + 30 * step, padTop + plotH);
    overviewLatencyCtx.lineTo(padLeft + (30 - hist.length) * step, padTop + plotH);
    overviewLatencyCtx.closePath();
    overviewLatencyCtx.fillStyle = grad;
    overviewLatencyCtx.fill();

    overviewLatencyCtx.beginPath();
    started = false;
    hist.forEach((pt, i) => {
      const x = padLeft + (30 - hist.length + i) * step;
      if (pt.rtt !== null) {
        const y = padTop + plotH - Math.min(1.0, pt.rtt / yMax) * plotH;
        if (!started) { overviewLatencyCtx.moveTo(x, y); started = true; }
        else { overviewLatencyCtx.lineTo(x, y); }
      }
    });
    overviewLatencyCtx.strokeStyle = '#00e599';
    overviewLatencyCtx.lineWidth = 2.5;
    overviewLatencyCtx.stroke();
  }

  requestAnimationFrame(renderOverviewChart);
}

// --- Canvas 2: 360° Tactical Radar ---
export function renderRadar() {
  if (!radarCtx) return;
  const w = radarCanvas.width;
  const h = radarCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = cx - 20;

  radarCtx.clearRect(0, 0, w, h);

  // Radar Backdrop
  radarCtx.fillStyle = '#050912';
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, maxR, 0, Math.PI * 2);
  radarCtx.fill();

  // Concentric Rings
  [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
    const r = maxR * ratio;
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, r, 0, Math.PI * 2);
    radarCtx.strokeStyle = 'rgba(0, 229, 153, 0.12)';
    radarCtx.lineWidth = 1;
    radarCtx.stroke();

    const msVal = Math.round(radarMaxRange * ratio);
    radarCtx.font = '9px "JetBrains Mono", monospace';
    radarCtx.fillStyle = 'rgba(0, 229, 153, 0.45)';
    radarCtx.fillText(`${msVal}ms`, cx + 6, cy - r + 11);
  });

  // Crosshairs
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy - maxR);
  radarCtx.lineTo(cx, cy + maxR);
  radarCtx.moveTo(cx - maxR, cy);
  radarCtx.lineTo(cx + maxR, cy);
  radarCtx.strokeStyle = 'rgba(0, 229, 153, 0.15)';
  radarCtx.lineWidth = 1;
  radarCtx.stroke();

  // Sweep Beam
  sweepAngle = (sweepAngle + 0.02) % (Math.PI * 2);
  const sweepGrad = radarCtx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  sweepGrad.addColorStop(0, 'rgba(0, 229, 153, 0.0)');
  sweepGrad.addColorStop(1, 'rgba(0, 229, 153, 0.18)');

  radarCtx.save();
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy);
  radarCtx.arc(cx, cy, maxR, sweepAngle - 0.4, sweepAngle);
  radarCtx.closePath();
  radarCtx.fillStyle = sweepGrad;
  radarCtx.fill();

  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy);
  radarCtx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
  radarCtx.strokeStyle = 'rgba(0, 229, 153, 0.8)';
  radarCtx.lineWidth = 2;
  radarCtx.stroke();
  radarCtx.restore();

  // Render Target Blips
  const enabled = targets.filter(t => t.enabled);
  enabled.forEach(t => {
    const m = t.metrics || {};
    const rtt = m.current_rtt !== null && m.current_rtt !== undefined ? m.current_rtt : radarMaxRange;
    const angle = targetAngleMap[t.id] || 0;
    const dist = Math.min(maxR - 10, Math.max(12, (rtt / radarMaxRange) * maxR));

    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;

    let color = '#34d399';
    if (t.is_gateway) color = '#c084fc';
    else if (m.packet_loss > 5 || rtt > 150) color = '#f43f5e';
    else if (rtt > 90) color = '#fbbf24';
    else if (rtt > 45) color = '#22d3ee';

    radarCtx.beginPath();
    radarCtx.arc(bx, by, t.is_gateway ? 6 : 4.5, 0, Math.PI * 2);
    radarCtx.fillStyle = color;
    radarCtx.shadowColor = color;
    radarCtx.shadowBlur = 10;
    radarCtx.fill();
    radarCtx.shadowBlur = 0;

    radarCtx.font = '10px "Plus Jakarta Sans", sans-serif';
    radarCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    radarCtx.fillText(t.name.split(' ')[0], bx + 8, by + 3);
  });

  requestAnimationFrame(renderRadar);
}

// --- Canvas 3: History Latency Stream ---
export function renderLatencyChart() {
  if (!latencyCtx) return;
  const w = latencyCanvas.width;
  const h = latencyCanvas.height;
  latencyCtx.clearRect(0, 0, w, h);

  const padLeft = 40;
  const padBottom = 25;
  const padTop = 15;
  const padRight = 15;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const yMax = 150;

  latencyCtx.font = '10px "JetBrains Mono", monospace';
  latencyCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  latencyCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  latencyCtx.lineWidth = 1;

  [0, 50, 100, 150].forEach(val => {
    const y = padTop + plotH - (val / yMax) * plotH;
    latencyCtx.beginPath();
    latencyCtx.moveTo(padLeft, y);
    latencyCtx.lineTo(w - padRight, y);
    latencyCtx.stroke();
    latencyCtx.fillText(`${val}ms`, 6, y + 3);
  });

  const activeTargets = targets.filter(t => t.enabled).slice(0, 6);
  activeTargets.forEach((t, idx) => {
    const hist = t.history || [];
    if (hist.length < 2) return;

    const color = TARGET_COLORS[idx % TARGET_COLORS.length];
    const step = plotW / 30;

    latencyCtx.strokeStyle = color;
    latencyCtx.lineWidth = t.is_gateway ? 2.5 : 1.8;
    latencyCtx.beginPath();
    let started = false;

    hist.forEach((pt, i) => {
      const x = padLeft + (30 - hist.length + i) * step;
      if (pt.rtt !== null) {
        const y = padTop + plotH - Math.min(1.0, pt.rtt / yMax) * plotH;
        if (!started) { latencyCtx.moveTo(x, y); started = true; }
        else { latencyCtx.lineTo(x, y); }
      }
    });
    latencyCtx.stroke();
  });

  requestAnimationFrame(renderLatencyChart);
}

// --- Canvas 4: History Jitter & Loss Spikes ---
export function renderJitterChart() {
  if (!jitterCtx) return;
  const w = jitterCanvas.width;
  const h = jitterCanvas.height;
  jitterCtx.clearRect(0, 0, w, h);

  const padLeft = 40;
  const padBottom = 25;
  const padTop = 15;
  const padRight = 15;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const yMax = 50;

  jitterCtx.font = '10px "JetBrains Mono", monospace';
  jitterCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  jitterCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  jitterCtx.lineWidth = 1;

  [0, 25, 50].forEach(val => {
    const y = padTop + plotH - (val / yMax) * plotH;
    jitterCtx.beginPath();
    jitterCtx.moveTo(padLeft, y);
    jitterCtx.lineTo(w - padRight, y);
    jitterCtx.stroke();
    jitterCtx.fillText(`±${val}ms`, 6, y + 3);
  });

  const gw = targets.find(t => t.is_gateway);
  if (gw && gw.history) {
    const step = plotW / 30;
    gw.history.forEach((pt, i) => {
      const x = padLeft + (30 - gw.history.length + i) * step;
      if (i > 0 && pt.rtt !== null && gw.history[i-1].rtt !== null) {
        const delta = Math.abs(pt.rtt - gw.history[i-1].rtt);
        const barH = Math.min(plotH, (delta / yMax) * plotH);
        jitterCtx.fillStyle = delta > 10 ? 'rgba(244, 63, 94, 0.7)' : 'rgba(245, 158, 11, 0.5)';
        jitterCtx.fillRect(x - 2, padTop + plotH - barH, 4, barH);
      }
    });
  }

  requestAnimationFrame(renderJitterChart);
}

export function selectActiveGame(gameId) {
  selectedGameId = gameId;
  if (gameSelectDropdown) gameSelectDropdown.value = gameId;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action: 'select_game', game_id: gameId }));
  } else {
    fetch('/api/select_game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });
  }

  const gName = gameSelectDropdown ? gameSelectDropdown.options[gameSelectDropdown.selectedIndex]?.text : gameId.toUpperCase();
  if (dashScanDesc) {
    dashScanDesc.textContent = `Benchmark all global servers for ${gName} to pinpoint the lowest ping datacenter.`;
  }
}

export function openInGameOverlayWindow() {
  const popW = 340;
  const popH = 380;
  const left = Math.max(20, (window.screen.availWidth || 1920) - popW - 20);
  const top = 36;
  window.open(
    '/overlay',
    'PingRadarOverlay',
    `width=${popW},height=${popH},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`
  );
  showToast('In-Game Floating HUD Overlay launched!', 'success');
  playRadarBlip(1100);
}

export function initRadarCore() {
  gameSelectDropdown = document.getElementById('game-select-dropdown');
  topbarRateText = document.getElementById('topbar-rate-text');
  topbarHealthStreak = document.getElementById('topbar-health-streak');
  btnAudioToggle = document.getElementById('btn-audio-toggle');
  btnTopbarHud = document.getElementById('btn-topbar-hud');
  btnOpenOverlayWindow = document.getElementById('btn-open-overlay-window');
  btnLaunchNativeOverlay = document.getElementById('btn-launch-native-overlay');
  btnVoiceRecommendation = document.getElementById('btn-voice-recommendation');
  igebGameStatus = document.getElementById('igeb-game-status');
  igebDesc = document.getElementById('igeb-desc');

  dashStatBestRegion = document.getElementById('dash-stat-best-region');
  dashStatWifiQuality = document.getElementById('dash-stat-wifi-quality');
  dashStatOverallStatus = document.getElementById('dash-stat-overall-status');
  btnDashScanRegions = document.getElementById('btn-dash-scan-regions');
  dashScanDesc = document.getElementById('dash-scan-desc');
  btnDashViewDiagnostics = document.getElementById('btn-dash-view-diagnostics');
  dashFaultTitle = document.getElementById('dash-fault-title');
  dashFaultDesc = document.getElementById('dash-fault-desc');
  dashStatusPill = document.getElementById('dash-status-pill');
  donutCircleProgress = document.getElementById('donut-circle-progress');
  donutAccuracyVal = document.getElementById('donut-accuracy-val');
  dashGwPing = document.getElementById('dash-gw-ping');
  dashIspPing = document.getElementById('dash-isp-ping');
  dashGameBestPing = document.getElementById('dash-game-best-ping');
  dashPacketLossVal = document.getElementById('dash-packet-loss-val');

  overviewLatencyCanvas = document.getElementById('overview-latency-canvas');
  overviewLatencyCtx = overviewLatencyCanvas ? overviewLatencyCanvas.getContext('2d') : null;
  radarCanvas = document.getElementById('radar-canvas');
  radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  radarTargetCount = document.getElementById('radar-target-count');
  radarBestServerName = document.getElementById('radar-best-server-name');
  radarBestServerRegion = document.getElementById('radar-best-server-region');
  radarBestPing = document.getElementById('radar-best-ping');
  radarBestJitter = document.getElementById('radar-best-jitter');
  radarBestLoss = document.getElementById('radar-best-loss');
  radarCmdCode = document.getElementById('radar-cmd-code');
  btnCopyRadarCmd = document.getElementById('btn-copy-radar-cmd');

  latencyCanvas = document.getElementById('latency-canvas');
  latencyCtx = latencyCanvas ? latencyCanvas.getContext('2d') : null;
  jitterCanvas = document.getElementById('jitter-canvas');
  jitterCtx = jitterCanvas ? jitterCanvas.getContext('2d') : null;

  ladderList = document.getElementById('ladder-list');
  btnSweepOptimizer = document.getElementById('btn-sweep-optimizer');

  diagNodeWifi = document.getElementById('diag-node-wifi');
  diagWifiHopSub = document.getElementById('diag-wifi-hop-sub');
  diagLedWifi = document.getElementById('diag-led-wifi');
  diagNodeIsp = document.getElementById('diag-node-isp');
  diagIspHopSub = document.getElementById('diag-isp-hop-sub');
  diagLedIsp = document.getElementById('diag-led-isp');
  diagNodeServer = document.getElementById('diag-node-server');
  diagServerHopSub = document.getElementById('diag-server-hop-sub');
  diagLedServer = document.getElementById('diag-led-server');
  diagFullTitle = document.getElementById('diag-full-title');
  diagFullMessage = document.getElementById('diag-full-message');

  serversGrid = document.getElementById('servers-grid');
  serverSearchInput = document.getElementById('server-search-input');
  btnAddFleetServer = document.getElementById('btn-add-fleet-server');
  categoryTabs = document.getElementById('category-tabs');

  inputUserIpSettings = document.getElementById('input-user-ip-settings');
  btnSaveUserIpSettings = document.getElementById('btn-save-user-ip-settings');
  btnDetectUserIpSettings = document.getElementById('btn-detect-user-ip-settings');
  settingsIntervalSelect = document.getElementById('settings-interval-select');
  btnExportSettings = document.getElementById('btn-export-settings');
  sidebarUserIp = document.getElementById('sidebar-user-ip');
  btnRefreshConnection = document.getElementById('btn-refresh-connection');

  modalAdd = document.getElementById('modal-add-target');
  btnCloseModal = document.getElementById('btn-close-modal');
  btnCancelModal = document.getElementById('btn-cancel-modal');
  formAdd = document.getElementById('form-add-target');

  // Event Listeners
  if (btnTopbarHud) btnTopbarHud.addEventListener('click', openInGameOverlayWindow);
  if (btnOpenOverlayWindow) btnOpenOverlayWindow.addEventListener('click', openInGameOverlayWindow);

  if (btnLaunchNativeOverlay) {
    btnLaunchNativeOverlay.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/launch_native_hud', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'HUD Spawned', 'success');
        playRadarBlip(1200);
      } catch (e) {
        showToast('Failed to spawn HUD', 'alert');
      }
    });
  }

  if (btnVoiceRecommendation) {
    btnVoiceRecommendation.addEventListener('click', async () => {
      try {
        showToast('Synthesizing voice announcement...', 'info');
        await fetch('/api/announce_voice', { method: 'POST' });
      } catch (e) {}
    });
  }

  if (gameSelectDropdown) {
    gameSelectDropdown.addEventListener('change', (e) => {
      selectActiveGame(e.target.value);
      showToast(`Switched game to ${e.target.options[e.target.selectedIndex].text}`, 'info');
      playRadarBlip(980);
    });
  }

  if (btnCopyRadarCmd && radarCmdCode) {
    btnCopyRadarCmd.addEventListener('click', () => {
      navigator.clipboard.writeText(radarCmdCode.textContent).then(() => {
        showToast(`Copied command: "${radarCmdCode.textContent}"`, 'success');
        playRadarBlip(1100);
      });
    });
  }

  document.querySelectorAll('.range-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      radarMaxRange = parseInt(btn.dataset.range, 10);
      showToast(`Radar sweep range adjusted to ${radarMaxRange}ms`, 'info');
    });
  });

  if (btnDashScanRegions) {
    btnDashScanRegions.addEventListener('click', () => {
      switchView('view-optimizer', 'Game Optimizer');
      selectActiveGame(selectedGameId);
    });
  }

  if (btnDashViewDiagnostics) {
    btnDashViewDiagnostics.addEventListener('click', () => {
      switchView('view-diagnostics', 'Wi-Fi Diagnostics');
    });
  }

  if (btnSweepOptimizer) {
    btnSweepOptimizer.addEventListener('click', () => {
      selectActiveGame(selectedGameId);
    });
  }

  if (btnRefreshConnection) {
    btnRefreshConnection.addEventListener('click', () => {
      if (socket) socket.close();
      connectWebSocket();
      showToast('Reconnecting telemetry socket...', 'info');
    });
  }

  if (categoryTabs) {
    categoryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.rf-tab');
      if (!tab) return;
      categoryTabs.querySelectorAll('.rf-tab').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      currentRegionFilter = tab.dataset.cat;
      renderServersGrid();
    });
  }

  if (serverSearchInput) {
    serverSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderServersGrid();
    });
  }

  if (btnSaveUserIpSettings && inputUserIpSettings) {
    btnSaveUserIpSettings.addEventListener('click', async () => {
      const ip = inputUserIpSettings.value.trim();
      if (!ip) return;
      try {
        await fetch('/api/set_user_ip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip })
        });
        showToast(`Client benchmark hop updated to: ${ip}`, 'success');
        playRadarBlip(1050);
      } catch (err) {}
    });
  }

  if (btnDetectUserIpSettings && inputUserIpSettings) {
    btnDetectUserIpSettings.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/client_ip');
        const data = await res.json();
        const detected = data.client_ip || data.gateway_ip;
        if (detected) {
          inputUserIpSettings.value = detected;
          showToast(`Detected Client IP: ${detected}`, 'success');
        }
      } catch (err) {}
    });
  }

  if (btnAddFleetServer && modalAdd) {
    btnAddFleetServer.addEventListener('click', () => {
      modalAdd.classList.add('open');
      document.getElementById('input-ip')?.focus();
    });
  }

  if (btnCloseModal && modalAdd) btnCloseModal.addEventListener('click', () => modalAdd.classList.remove('open'));
  if (btnCancelModal && modalAdd) btnCancelModal.addEventListener('click', () => modalAdd.classList.remove('open'));

  if (formAdd && modalAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ip = document.getElementById('input-ip').value.trim();
      const name = document.getElementById('input-name').value.trim() || ip;
      const category = document.getElementById('input-category').value;
      const region = document.getElementById('input-region').value.trim() || 'Custom';

      try {
        const res = await fetch('/api/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, name, category, region })
        });
        if (res.ok) {
          const data = await res.json();
          modalAdd.classList.remove('open');
          formAdd.reset();
          targets.push(data.target);
          updateTargetAngles();
          renderServersGrid();
          showToast(`Server "${name}" added to monitoring fleet`, 'success');
          playRadarBlip(1050);
        }
      } catch (err) {}
    });
  }

  // Auto-fetch client IP on initial load
  fetch('/api/client_ip')
    .then(r => r.json())
    .then(data => {
      if (data && inputUserIpSettings) {
        const ip = data.user_configured_ip || data.gateway_ip || data.client_ip || '192.168.1.1';
        inputUserIpSettings.value = ip;
        if (sidebarUserIp) sidebarUserIp.textContent = ip;
      }
    })
    .catch(() => {});

  // Responsive canvas size synchronization
  window.addEventListener('resize', syncCanvasSizes);
  setTimeout(syncCanvasSizes, 60);
  setTimeout(syncCanvasSizes, 300);

  // Start animations & socket
  connectWebSocket();
  requestAnimationFrame(renderOverviewChart);
  requestAnimationFrame(renderRadar);
  requestAnimationFrame(renderLatencyChart);
  requestAnimationFrame(renderJitterChart);
}

export function syncCanvasSizes() {
  if (radarCanvas && radarCanvas.parentElement) {
    const rect = radarCanvas.parentElement.getBoundingClientRect();
    const size = Math.floor(Math.min(rect.width, rect.height || rect.width));
    if (size > 50 && Math.abs(radarCanvas.width - size) > 2) {
      radarCanvas.width = size;
      radarCanvas.height = size;
    }
  }

  if (overviewLatencyCanvas && overviewLatencyCanvas.parentElement) {
    const rect = overviewLatencyCanvas.parentElement.getBoundingClientRect();
    if (rect.width > 50 && Math.abs(overviewLatencyCanvas.width - Math.floor(rect.width)) > 2) {
      overviewLatencyCanvas.width = Math.floor(rect.width);
      overviewLatencyCanvas.height = Math.max(140, Math.floor(rect.height || 170));
    }
  }

  if (latencyCanvas && latencyCanvas.parentElement) {
    const rect = latencyCanvas.parentElement.getBoundingClientRect();
    if (rect.width > 50 && Math.abs(latencyCanvas.width - Math.floor(rect.width)) > 2) {
      latencyCanvas.width = Math.floor(rect.width);
      latencyCanvas.height = Math.max(180, Math.floor(rect.height || 260));
    }
  }

  if (jitterCanvas && jitterCanvas.parentElement) {
    const rect = jitterCanvas.parentElement.getBoundingClientRect();
    if (rect.width > 50 && Math.abs(jitterCanvas.width - Math.floor(rect.width)) > 2) {
      jitterCanvas.width = Math.floor(rect.width);
      jitterCanvas.height = Math.max(180, Math.floor(rect.height || 260));
    }
  }
}

