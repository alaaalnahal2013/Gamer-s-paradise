/**
 * PING RADAR &bull; DESKTOP TELEMETRY PLATFORM CONTROLLER
 * Full UI Controller, 360° Tactical Radar Canvas, Multi-Stream Oscilloscopes,
 * Real-Time Hop Isolation & Best-Region Matchmaking Recommendation Engine
 */

(() => {
  'use strict';

  // --- Application State ---
  let socket = null;
  let targets = [];
  let diagnosis = {};
  let wifiInfo = {};
  let recommendation = {};
  let selectedGameId = 'cs2';
  let detectedGame = null;
  let pingSettings = { interval: 1.0, paused: false };
  let audioEnabled = true;
  let currentRegionFilter = 'all';
  let searchQuery = '';
  let radarMaxRange = 250; // ms
  let totalPacketsReceived = 0;

  // Radar Animation State
  let sweepAngle = 0;
  let hoveredBlip = null;
  let blipRipples = {};
  const targetAngleMap = {};

  // Audio Context for synthetic telemetry sounds
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playRadarBlip(pitch = 880, duration = 0.04) {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playAlertAlarm() {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.setValueAtTime(330, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  }

  // --- Toast Notification System ---
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'alert' ? 'toast-alert' : ''}`;

    let iconSvg = '<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    if (type === 'success') {
      iconSvg = '<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="#00e599" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'alert') {
      iconSvg = '<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>';
    }

    toast.innerHTML = `${iconSvg} <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // --- DOM Element References ---
  // App Shell & Navigation
  const appSidebar = document.getElementById('app-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const breadcrumbTitle = document.getElementById('breadcrumb-title');
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const appViews = document.querySelectorAll('.app-view');
  const sidebarUserIp = document.getElementById('sidebar-user-ip');
  const btnRefreshConnection = document.getElementById('btn-refresh-connection');

  // Topbar
  const gameSelectDropdown = document.getElementById('game-select-dropdown');
  const topbarRateText = document.getElementById('topbar-rate-text');
  const btnTopbarAlerts = document.getElementById('btn-topbar-alerts');
  const topbarHealthStreak = document.getElementById('topbar-health-streak');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const btnTopbarHud = document.getElementById('btn-topbar-hud');

  // In-Game Extension Banner Elements
  const btnOpenOverlayWindow = document.getElementById('btn-open-overlay-window');
  const btnLaunchNativeOverlay = document.getElementById('btn-launch-native-overlay');
  const btnVoiceRecommendation = document.getElementById('btn-voice-recommendation');
  const igebGameStatus = document.getElementById('igeb-game-status');
  const igebDesc = document.getElementById('igeb-desc');

  // Gaming VPN & IP Shield Elements
  let vpnState = { enabled: false, country_code: 'de', masked_ip: '185.12.64.120' };
  let vpnCountriesList = [];

  const btnTopbarVpn = document.getElementById('btn-topbar-vpn');
  const topbarVpnText = document.getElementById('topbar-vpn-text');
  const btnVpnMainToggle = document.getElementById('btn-vpn-main-toggle');
  const vpnToggleBtnText = document.getElementById('vpn-toggle-btn-text');
  const vhcShieldEmblem = document.getElementById('vhc-shield-emblem');
  const vhcStatusTitle = document.getElementById('vhc-status-title');
  const vhcStatusBadge = document.getElementById('vhc-status-badge');
  const vhcDescText = document.getElementById('vhc-desc-text');
  const vpnStatOrigIp = document.getElementById('vpn-stat-orig-ip');
  const vpnStatMaskedIp = document.getElementById('vpn-stat-masked-ip');
  const vpnStatRelay = document.getElementById('vpn-stat-relay');
  const btnCopyVpnCmd = document.getElementById('btn-copy-vpn-cmd');
  const vpnCmdCode = document.getElementById('vpn-cmd-code');
  const vpnCountryGrid = document.getElementById('vpn-country-grid');
  const chkVpnKillswitch = document.getElementById('chk-vpn-killswitch');

  // Dashboard View (Screenshot replica)
  const dashStatBestRegion = document.getElementById('dash-stat-best-region');
  const dashStatWifiQuality = document.getElementById('dash-stat-wifi-quality');
  const dashStatOverallStatus = document.getElementById('dash-stat-overall-status');
  const btnDashScanRegions = document.getElementById('btn-dash-scan-regions');
  const dashScanDesc = document.getElementById('dash-scan-desc');
  const btnDashViewDiagnostics = document.getElementById('btn-dash-view-diagnostics');
  const dashFaultTitle = document.getElementById('dash-fault-title');
  const dashFaultDesc = document.getElementById('dash-fault-desc');
  const dashStatusPill = document.getElementById('dash-status-pill');
  const donutCircleProgress = document.getElementById('donut-circle-progress');
  const donutAccuracyVal = document.getElementById('donut-accuracy-val');
  const dashGwPing = document.getElementById('dash-gw-ping');
  const dashIspPing = document.getElementById('dash-isp-ping');
  const dashGameBestPing = document.getElementById('dash-game-best-ping');
  const dashPacketLossVal = document.getElementById('dash-packet-loss-val');

  // Canvases
  const overviewLatencyCanvas = document.getElementById('overview-latency-canvas');
  const overviewLatencyCtx = overviewLatencyCanvas ? overviewLatencyCanvas.getContext('2d') : null;

  const radarCanvas = document.getElementById('radar-canvas');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  const radarTooltip = document.getElementById('radar-tooltip');
  const radarTargetCount = document.getElementById('radar-target-count');
  const radarBestServerName = document.getElementById('radar-best-server-name');
  const radarBestServerRegion = document.getElementById('radar-best-server-region');
  const radarBestPing = document.getElementById('radar-best-ping');
  const radarBestJitter = document.getElementById('radar-best-jitter');
  const radarBestLoss = document.getElementById('radar-best-loss');
  const radarCmdCode = document.getElementById('radar-cmd-code');
  const btnCopyRadarCmd = document.getElementById('btn-copy-radar-cmd');

  const latencyCanvas = document.getElementById('latency-canvas');
  const latencyCtx = latencyCanvas ? latencyCanvas.getContext('2d') : null;
  const jitterCanvas = document.getElementById('jitter-canvas');
  const jitterCtx = jitterCanvas ? jitterCanvas.getContext('2d') : null;

  // Region Ladder Table
  const ladderList = document.getElementById('ladder-list');
  const btnSweepOptimizer = document.getElementById('btn-sweep-optimizer');

  // Diagnostics View
  const diagNodeWifi = document.getElementById('diag-node-wifi');
  const diagWifiHopSub = document.getElementById('diag-wifi-hop-sub');
  const diagLedWifi = document.getElementById('diag-led-wifi');
  const diagNodeIsp = document.getElementById('diag-node-isp');
  const diagIspHopSub = document.getElementById('diag-isp-hop-sub');
  const diagLedIsp = document.getElementById('diag-led-isp');
  const diagNodeServer = document.getElementById('diag-node-server');
  const diagServerHopSub = document.getElementById('diag-server-hop-sub');
  const diagLedServer = document.getElementById('diag-led-server');
  const diagFullTitle = document.getElementById('diag-full-title');
  const diagFullMessage = document.getElementById('diag-full-message');

  // Server Fleet View
  const serversGrid = document.getElementById('servers-grid');
  const serverSearchInput = document.getElementById('server-search-input');
  const btnAddFleetServer = document.getElementById('btn-add-fleet-server');
  const categoryTabs = document.getElementById('category-tabs');

  // Settings View
  const inputUserIpSettings = document.getElementById('input-user-ip-settings');
  const btnSaveUserIpSettings = document.getElementById('btn-save-user-ip-settings');
  const btnDetectUserIpSettings = document.getElementById('btn-detect-user-ip-settings');
  const settingsIntervalSelect = document.getElementById('settings-interval-select');
  const btnExportSettings = document.getElementById('btn-export-settings');

  // Add Target Modal
  const modalAdd = document.getElementById('modal-add-target');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const formAdd = document.getElementById('form-add-target');

  const TARGET_COLORS = [
    '#00e599', '#22d3ee', '#fbbf24', '#f43f5e', '#a855f7',
    '#38bdf8', '#34d399', '#fb7185', '#4ade80', '#facc15'
  ];

  // --- View Switcher Logic ---
  function switchView(targetViewId, titleText) {
    appViews.forEach(v => {
      v.classList.remove('active');
    });
    const targetEl = document.getElementById(targetViewId);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    navItems.forEach(item => {
      if (item.dataset.view === targetViewId) {
        item.classList.add('active');
        if (breadcrumbTitle && !titleText) {
          breadcrumbTitle.textContent = item.querySelector('.nav-text')?.textContent || 'Home';
        }
      } else {
        item.classList.remove('active');
      }
    });

    if (breadcrumbTitle && titleText) {
      breadcrumbTitle.textContent = titleText;
    }

    // Trigger initial data load for utility views
    if (targetViewId === 'view-audio') loadAudioDevices();
    if (targetViewId === 'view-ram') loadRamHogs();
    if (targetViewId === 'view-sniper') loadCommonPorts();
    if (targetViewId === 'view-luminance') loadLuminanceStatus();
    if (targetViewId === 'view-ocr') loadOcrHistory();
    if (targetViewId === 'view-screenshots') loadScreenshots();
    if (targetViewId === 'view-clipboard') loadClipboardStatus();
    if (targetViewId === 'view-netdiag') loadNetDiag();
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = item.dataset.view;
      const navText = item.querySelector('.nav-text')?.textContent || 'Home';
      switchView(viewId, navText);
      playRadarBlip(920);
    });
  });

  // Action Cards Navigation
  if (btnDashScanRegions) {
    btnDashScanRegions.addEventListener('click', () => {
      switchView('view-optimizer', 'Game Optimizer');
      selectActiveGame(selectedGameId);
      showToast('Initiating sweep across all regions...', 'info');
      playRadarBlip(1100);
    });
  }

  if (btnDashViewDiagnostics) {
    btnDashViewDiagnostics.addEventListener('click', () => {
      switchView('view-diagnostics', 'Wi-Fi Diagnostics');
      playRadarBlip(1000);
    });
  }

  if (btnSweepOptimizer) {
    btnSweepOptimizer.addEventListener('click', () => {
      selectActiveGame(selectedGameId);
      showToast('Sweeping all global regional clusters...', 'info');
      playRadarBlip(1200);
    });
  }

  // Sidebar Collapse
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('collapsed');
      const isCol = appSidebar.classList.contains('collapsed');
      btnToggleSidebar.title = isCol ? 'Expand Sidebar' : 'Collapse Sidebar';
    });
  }

  // Reconnect Button
  if (btnRefreshConnection) {
    btnRefreshConnection.addEventListener('click', () => {
      if (socket) {
        socket.close();
      }
      connectWebSocket();
      showToast('Reconnecting telemetry socket...', 'info');
      playRadarBlip(1050);
    });
  }

  // Topbar Alert Pill
  if (btnTopbarAlerts) {
    btnTopbarAlerts.addEventListener('click', () => {
      switchView('view-diagnostics', 'Wi-Fi Diagnostics');
      playRadarBlip(1000);
    });
  }

  // --- In-Game Extension & Overlay Launcher ---
  function openInGameOverlayWindow() {
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

  if (btnTopbarHud) btnTopbarHud.addEventListener('click', openInGameOverlayWindow);
  if (btnOpenOverlayWindow) btnOpenOverlayWindow.addEventListener('click', openInGameOverlayWindow);

  if (btnLaunchNativeOverlay) {
    btnLaunchNativeOverlay.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/launch_native_hud', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
          showToast('Native Always-On-Top In-Game HUD active!', 'success');
          playRadarBlip(1200);
        } else {
          showToast(`HUD Notice: ${data.message}`, 'info');
        }
      } catch (e) {
        showToast('Failed to spawn native HUD window', 'alert');
      }
    });
  }

  if (btnVoiceRecommendation) {
    btnVoiceRecommendation.addEventListener('click', async () => {
      try {
        showToast('Synthesizing tactical in-game voice announcement...', 'info');
        await fetch('/api/announce_voice', { method: 'POST' });
      } catch (e) {}
    });
  }

  // Audio Toggle
  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      btnAudioToggle.classList.toggle('active', audioEnabled);
      if (audioEnabled) {
        playRadarBlip(880);
        showToast('Sound telemetry enabled', 'info');
      } else {
        showToast('Sound telemetry muted', 'info');
      }
    });
  }

  // Active Game Selection
  function selectActiveGame(gameId) {
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

  if (gameSelectDropdown) {
    gameSelectDropdown.addEventListener('change', (e) => {
      selectActiveGame(e.target.value);
      showToast(`Fleet targets updated to ${e.target.options[e.target.selectedIndex].text}`, 'info');
      playRadarBlip(980);
    });
  }

  // Copy In-Game Console Command
  function copyConsoleCmd() {
    if (!radarCmdCode) return;
    const cmdText = radarCmdCode.textContent;
    navigator.clipboard.writeText(cmdText).then(() => {
      showToast(`Copied command: "${cmdText}"`, 'success');
      playRadarBlip(1100);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = cmdText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`Copied command: "${cmdText}"`, 'success');
    });
  }

  if (btnCopyRadarCmd) btnCopyRadarCmd.addEventListener('click', copyConsoleCmd);

  // Radar Range Switcher
  document.querySelectorAll('.range-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      radarMaxRange = parseInt(btn.dataset.range, 10);
      showToast(`Radar sweep range adjusted to ${radarMaxRange}ms`, 'info');
    });
  });

  // Target Angle Mapping for Polar Radar Sweep
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

  // --- WebSocket Connection ---
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Ping Radar] Telemetry stream connected.');
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

  // --- Telemetry Packet Handler ---
  function handleTelemetryUpdate(data) {
    if (data.targets) {
      targets = data.targets;
      totalPacketsReceived += targets.filter(t => t.enabled).length;
    }
    if (data.diagnosis) diagnosis = data.diagnosis;
    if (data.wifi) wifiInfo = data.wifi;
    if (data.recommendation) recommendation = data.recommendation;
    if (data.vpn) updateVpnUI(data.vpn);
    if (data.audio) updateAudioDaemonUI(data.audio);
    if (data.ram) updateRamFreezerUI(data.ram);
    if (data.luminance) updateLuminanceUI(data.luminance);
    if (data.clipboard) updateCleanClipboardUI(data.clipboard);
    if (data.net_diag) updateNetDiagUI(data.net_diag);
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
  }

  // --- Update Dashboard UI (Screenshot Replica) ---
  function updateDashboardUI() {
    const best = recommendation.best_server;
    const gw = targets.find(t => t.is_gateway);
    const ref = targets.find(t => t.is_reference);

    // Stat 1: Optimal Region
    if (dashStatBestRegion) {
      if (best) {
        dashStatBestRegion.textContent = best.region || best.name || 'Frankfurt';
      } else {
        dashStatBestRegion.textContent = 'Scanning...';
      }
    }

    // Stat 2: Wi-Fi Quality
    if (dashStatWifiQuality) {
      if (gw && gw.metrics) {
        const gwRtt = gw.metrics.current_rtt || 2;
        const gwLoss = gw.metrics.packet_loss || 0;
        if (gwLoss === 0 && gwRtt < 5) {
          dashStatWifiQuality.textContent = 'Clean (100%)';
        } else if (gwLoss > 0 || gwRtt > 15) {
          dashStatWifiQuality.textContent = `Degraded (${gwRtt}ms)`;
        } else {
          dashStatWifiQuality.textContent = `Normal (${gwRtt}ms)`;
        }
      } else {
        dashStatWifiQuality.textContent = 'Clean (100%)';
      }
    }

    // Stat 3: Pipeline Status
    if (dashStatOverallStatus) {
      const verdict = (diagnosis.verdict || 'OPTIMAL').replace(/_/g, ' ');
      dashStatOverallStatus.textContent = verdict.charAt(0).toUpperCase() + verdict.slice(1).toLowerCase();
    }

    // Fault Isolation Verdict Card
    if (dashFaultTitle && dashFaultDesc) {
      dashFaultTitle.textContent = diagnosis.title || 'Fault Isolation Verdict';
      dashFaultDesc.textContent = diagnosis.message || 'Wi-Fi hop is 100% clean. Lag spikes originate from remote routing, not your local network.';
    }

    // Donut Stability Meter Calculation
    let stabilityScore = 98;
    if (gw && gw.metrics) {
      const lossDeduct = (gw.metrics.packet_loss || 0) * 3;
      const jitterDeduct = Math.min(25, (gw.metrics.jitter || 0) * 1.5);
      stabilityScore = Math.max(10, Math.min(100, Math.round(100 - lossDeduct - jitterDeduct)));
    }

    if (donutAccuracyVal) donutAccuracyVal.textContent = `${stabilityScore}%`;
    if (donutCircleProgress) {
      const circum = 301.6;
      const offset = circum * (1 - (stabilityScore / 100));
      donutCircleProgress.style.strokeDashoffset = offset;
    }

    // Breakdown Rows
    if (dashGwPing) {
      const r = gw && gw.metrics && gw.metrics.current_rtt !== null ? `${gw.metrics.current_rtt} ms` : '1.8 ms';
      dashGwPing.textContent = r;
    }

    if (dashIspPing) {
      const r = ref && ref.metrics && ref.metrics.current_rtt !== null ? `${ref.metrics.current_rtt} ms` : '24.5 ms';
      dashIspPing.textContent = r;
    }

    if (dashGameBestPing) {
      const r = best && best.metrics && best.metrics.current_rtt !== null ? `${best.metrics.current_rtt} ms` : '42.1 ms';
      dashGameBestPing.textContent = r;
    }

    if (dashPacketLossVal) {
      const loss = gw && gw.metrics ? `${gw.metrics.packet_loss}%` : '0.0%';
      dashPacketLossVal.textContent = loss;
    }

    // Sidebar User IP display
    if (sidebarUserIp && gw) {
      sidebarUserIp.textContent = gw.ip;
    }
    if (inputUserIpSettings && document.activeElement !== inputUserIpSettings && gw && !inputUserIpSettings.value) {
      inputUserIpSettings.value = gw.ip;
    }

    // In-Game Extension Integration Banner
    if (igebGameStatus && igebDesc) {
      if (detectedGame && detectedGame.name) {
        igebGameStatus.textContent = `HOOKED: ${detectedGame.name.toUpperCase()}`;
        igebGameStatus.style.background = 'rgba(0, 229, 153, 0.22)';
        igebGameStatus.style.borderColor = '#00e599';
        igebDesc.textContent = `Telemetry locked onto active process: ${detectedGame.name} (PID ${detectedGame.pid}). Lowest ping server: ${best ? best.name : 'scanning'} (${best && best.metrics ? best.metrics.current_rtt + 'ms' : '--'}).`;
      } else {
        const selName = gameSelectDropdown ? gameSelectDropdown.options[gameSelectDropdown.selectedIndex]?.text : 'Game';
        igebGameStatus.textContent = 'AUTO-HOOK READY';
        igebGameStatus.style.background = 'rgba(0, 229, 153, 0.12)';
        igebGameStatus.style.borderColor = 'rgba(0, 229, 153, 0.3)';
        igebDesc.textContent = `Overlay active telemetry directly on top of your PC game screen. Currently monitoring ${selName} regional fleet.`;
      }
    }
  }

  // --- Update Tactical Radar UI ---
  function updateTacticalRadarUI() {
    const best = recommendation.best_server;
    if (radarBestServerName && best) {
      radarBestServerName.textContent = best.name;
    }
    if (radarBestServerRegion && best) {
      radarBestServerRegion.textContent = best.region;
    }
    if (radarBestPing && best && best.metrics) {
      radarBestPing.textContent = `${best.metrics.current_rtt} ms`;
    }
    if (radarBestJitter && best && best.metrics) {
      radarBestJitter.textContent = `±${best.metrics.jitter} ms`;
    }
    if (radarBestLoss && best && best.metrics) {
      radarBestLoss.textContent = `${best.metrics.packet_loss}%`;
    }

    if (radarCmdCode && recommendation.matchmaking_cmd && recommendation.recommended_max_ping) {
      radarCmdCode.textContent = `${recommendation.matchmaking_cmd} ${recommendation.recommended_max_ping}`;
    }

    if (radarTargetCount) {
      const count = targets.filter(t => t.enabled).length;
      radarTargetCount.textContent = `SERVERS: ${count}`;
    }
  }

  // --- Update Region Ladder UI (Game Optimizer) ---
  function updateRegionLadderUI() {
    if (!ladderList || !recommendation.leaderboard) return;
    ladderList.innerHTML = '';

    recommendation.leaderboard.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'ladder-row';

      const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'standard';
      const rtt = item.metrics.current_rtt !== null ? `${item.metrics.current_rtt} ms` : 'LOST';
      const jitter = `±${item.metrics.jitter} ms`;
      const grade = item.metrics.grade || 'A';
      const gradeClass = grade.startsWith('A') ? 'a' : grade.startsWith('B') ? 'b' : grade.startsWith('C') ? 'c' : 'd';

      row.innerHTML = `
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
      `;
      ladderList.appendChild(row);
    });
  }

  // --- Update Diagnostics UI (Wi-Fi vs Server) ---
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

  // --- Render Server Fleet Grid ---
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

    serversGrid.innerHTML = '';
    filtered.forEach(t => {
      const m = t.metrics || {};
      const rtt = m.current_rtt !== null && m.current_rtt !== undefined ? `${m.current_rtt} ms` : 'LOST';
      const jitter = `±${m.jitter || 0} ms`;

      const card = document.createElement('div');
      card.className = 'server-grid-item';
      card.innerHTML = `
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
      `;
      serversGrid.appendChild(card);
    });
  }

  // Fleet Filter Tabs
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

  // --- Canvas 1: Dashboard Overview Latency Graph ---
  function renderOverviewChart() {
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

    // Dashed Grid Lines (4, 2, 0 style from reference)
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

    // Draw Best Server & Gateway Lines
    const best = targets.find(t => !t.is_gateway && !t.is_reference && t.enabled) || targets[0];
    if (best && best.history && best.history.length > 1) {
      const hist = best.history;
      const step = plotW / 30;

      // Fill Gradient Underneath
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

      // Line Stroke
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
  function renderRadar() {
    if (!radarCtx) return;
    const w = radarCanvas.width;
    const h = radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = cx - 20;

    radarCtx.clearRect(0, 0, w, h);

    // Dark Radar Backdrop
    radarCtx.fillStyle = '#050912';
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, maxR, 0, Math.PI * 2);
    radarCtx.fill();

    // Concentric Range Rings
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach(ratio => {
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

    // Rotating Sweep Beam
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

    // Leading Sweep Needle
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

      // Color coding
      let color = '#34d399';
      if (t.is_gateway) color = '#c084fc';
      else if (m.packet_loss > 5 || rtt > 150) color = '#f43f5e';
      else if (rtt > 90) color = '#fbbf24';
      else if (rtt > 45) color = '#22d3ee';

      // Blip point
      radarCtx.beginPath();
      radarCtx.arc(bx, by, t.is_gateway ? 6 : 4.5, 0, Math.PI * 2);
      radarCtx.fillStyle = color;
      radarCtx.shadowColor = color;
      radarCtx.shadowBlur = 10;
      radarCtx.fill();
      radarCtx.shadowBlur = 0;

      // Server name label
      radarCtx.font = '10px "Plus Jakarta Sans", sans-serif';
      radarCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      radarCtx.fillText(t.name.split(' ')[0], bx + 8, by + 3);
    });

    requestAnimationFrame(renderRadar);
  }

  // --- Canvas 3: History Latency Stream ---
  function renderLatencyChart() {
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

    // Grid lines
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

    // Multi-stream target lines
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
  function renderJitterChart() {
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

  // --- Network Settings View Actions ---
  async function updateUserIp(newIp) {
    if (!newIp) return;
    try {
      const res = await fetch('/api/set_user_ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newIp })
      });
      if (res.ok) {
        showToast(`Client benchmark hop updated to: ${newIp}`, 'success');
        playRadarBlip(1050);
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (btnSaveUserIpSettings) {
    btnSaveUserIpSettings.addEventListener('click', () => {
      const val = inputUserIpSettings.value.trim();
      updateUserIp(val);
    });
  }

  if (btnDetectUserIpSettings) {
    btnDetectUserIpSettings.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/client_ip');
        const data = await res.json();
        const detected = data.client_ip || data.gateway_ip;
        if (detected) {
          inputUserIpSettings.value = detected;
          updateUserIp(detected);
          showToast(`Detected Client IP: ${detected}`, 'success');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (settingsIntervalSelect) {
    settingsIntervalSelect.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      pingSettings.interval = val;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'update_settings', interval: val }));
      }
      if (topbarRateText) topbarRateText.textContent = `${val.toFixed(1)}s`;
      showToast(`Ping sweep frequency updated to ${val}s`, 'info');
    });
  }

  if (btnExportSettings) {
    btnExportSettings.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/export?format=json');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ping_radar_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Telemetry report exported to JSON', 'success');
      } catch (e) {
        console.error(e);
      }
    });
  }

  // --- Add Custom Server Modal Controls ---
  if (btnAddFleetServer) {
    btnAddFleetServer.addEventListener('click', () => {
      modalAdd.classList.add('open');
      document.getElementById('input-ip')?.focus();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', () => modalAdd.classList.remove('open'));
  if (btnCancelModal) btnCancelModal.addEventListener('click', () => modalAdd.classList.remove('open'));

  if (formAdd) {
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
      } catch (err) {
        console.error(err);
      }
    });
  }

  // --- Gaming VPN & IP Cloaking Handlers ---
  async function loadVpnCountries() {
    try {
      const res = await fetch('/api/vpn/countries');
      const data = await res.json();
      vpnCountriesList = data.countries || [];
      renderVpnCountryGrid(vpnCountriesList, data.active || 'de', data.enabled || false);
    } catch (e) {
      console.error('Failed to load VPN countries', e);
    }
  }

  function renderVpnCountryGrid(countries, activeCode, isEnabled) {
    if (!vpnCountryGrid) return;
    vpnCountryGrid.innerHTML = '';
    countries.forEach(c => {
      const card = document.createElement('div');
      const isActive = c.code.toLowerCase() === activeCode.toLowerCase() && isEnabled;
      card.className = `vpn-country-card ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <div class="vcc-top">
          <div class="vcc-flag-name">
            <span class="vcc-flag">${c.flag}</span>
            <div>
              <div class="vcc-name">${escapeHtml(c.name)}</div>
              <div class="vcc-city">${escapeHtml(c.city)}</div>
            </div>
          </div>
          <span class="vcc-ping">${c.ping_est} ms</span>
        </div>
        <div class="vcc-ip">Cloaked Exit IP: ${escapeHtml(c.masked_ip)}</div>
        <div class="vcc-rec">⚡ ${escapeHtml(c.recommended_for)}</div>
      `;
      card.addEventListener('click', () => {
        connectVpn(c.code);
      });
      vpnCountryGrid.appendChild(card);
    });
  }

  async function connectVpn(countryCode) {
    try {
      const res = await fetch('/api/vpn/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_code: countryCode })
      });
      const data = await res.json();
      vpnState = data;
      updateVpnUI(data);
      renderVpnCountryGrid(vpnCountriesList, data.country_code, true);
      showToast(`IP Shield Active: Cloaked origin to ${data.flag} ${data.country_name} (${data.masked_ip})`, 'success');
      playRadarBlip(1250);
    } catch (e) {
      showToast('Failed to connect Gaming VPN', 'alert');
    }
  }

  async function disconnectVpn() {
    try {
      const res = await fetch('/api/vpn/disconnect', { method: 'POST' });
      const data = await res.json();
      vpnState = data;
      updateVpnUI(data);
      renderVpnCountryGrid(vpnCountriesList, data.country_code, false);
      showToast('IP Shield Disconnected. Direct origin IP restored.', 'info');
      playRadarBlip(900);
    } catch (e) {
      showToast('Failed to disconnect Gaming VPN', 'alert');
    }
  }

  function updateVpnUI(vpn) {
    if (!vpn) return;
    vpnState = vpn;
    const isShielded = vpn.enabled;

    // Topbar Pill
    if (btnTopbarVpn && topbarVpnText) {
      btnTopbarVpn.classList.toggle('shield-active', isShielded);
      topbarVpnText.textContent = isShielded ? `IP SHIELD: ${vpn.flag} ${vpn.country_code.toUpperCase()}` : 'IP SHIELD: OFF';
    }

    // Hero Card
    if (vhcShieldEmblem) vhcShieldEmblem.classList.toggle('active', isShielded);
    if (vhcStatusTitle) vhcStatusTitle.textContent = isShielded ? 'IP SHIELD ACTIVE • ORIGIN HIDDEN' : 'IP SHIELD DISCONNECTED';
    if (vhcStatusBadge) {
      vhcStatusBadge.className = `vhc-badge ${isShielded ? 'active' : 'alert'}`;
      vhcStatusBadge.textContent = isShielded ? 'DDoS PROTECTED' : 'REAL IP EXPOSED';
    }
    if (vhcDescText) {
      vhcDescText.textContent = isShielded
        ? `Your real IP is cloaked. All game matchmakers see virtual exit IP: ${vpn.masked_ip} (${vpn.country_name}). SOCKS5 relay active on 127.0.0.1:1080.`
        : 'Your real public IP address is currently exposed to game servers and peers. Connect to a regional node to cloak your true origin.';
    }

    // Stats
    if (vpnStatOrigIp) vpnStatOrigIp.textContent = isShielded ? 'HIDDEN (PROTECTED)' : vpn.original_ip;
    if (vpnStatMaskedIp) vpnStatMaskedIp.textContent = isShielded ? vpn.masked_ip : '--';
    if (vpnStatRelay) vpnStatRelay.textContent = isShielded ? `${vpn.flag} ${vpn.city} (+${vpn.tunnel_latency_ms}ms)` : 'Direct ISP Route';

    // Toggle button
    if (vpnToggleBtnText) {
      vpnToggleBtnText.textContent = isShielded ? '🔌 DISCONNECT SHIELD' : '⚡ CONNECT SHIELD';
    }
    if (btnVpnMainToggle) {
      btnVpnMainToggle.className = isShielded ? 'btn-secondary-action' : 'btn-primary-action';
    }

    // Steam Launch Command
    if (vpnCmdCode) {
      vpnCmdCode.textContent = `+net_public_adr ${vpn.masked_ip} -net_port_try 1`;
    }
  }

  // VPN Event Listeners
  if (btnTopbarVpn) {
    btnTopbarVpn.addEventListener('click', () => {
      switchView('view-vpn', 'VPN & IP Shield');
      playRadarBlip(1000);
    });
  }

  if (btnVpnMainToggle) {
    btnVpnMainToggle.addEventListener('click', () => {
      if (vpnState.enabled) {
        disconnectVpn();
      } else {
        connectVpn(vpnState.country_code || 'de');
      }
    });
  }

  if (btnCopyVpnCmd && vpnCmdCode) {
    btnCopyVpnCmd.addEventListener('click', () => {
      const code = vpnCmdCode.textContent;
      navigator.clipboard.writeText(code).then(() => {
        showToast(`Copied Steam launch option: "${code}"`, 'success');
        playRadarBlip(1100);
      });
    });
  }

  if (chkVpnKillswitch) {
    chkVpnKillswitch.addEventListener('change', async (e) => {
      try {
        await fetch('/api/vpn/toggle_killswitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: e.target.checked })
        });
        showToast(`Emergency Kill Switch ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
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

  // Fetch VPN Status & Countries on Boot
  loadVpnCountries();
  fetch('/api/vpn/status').then(r => r.json()).then(data => updateVpnUI(data)).catch(() => {});

  // =========================================================================
  // UTILITY 1: AUDIO OUTPUT ROULETTE (AUDIO LOCK DAEMON)
  // =========================================================================
  let audioData = null;
  const audioPlaybackList = document.getElementById('audio-playback-list');
  const audioRecordingList = document.getElementById('audio-recording-list');
  const audioLockStatusText = document.getElementById('audio-lock-status-text');
  const audioRevertsCount = document.getElementById('audio-reverts-count');
  const topbarAudioText = document.getElementById('topbar-audio-text');
  const audioLogFeed = document.getElementById('audio-log-feed');
  const btnRefreshAudio = document.getElementById('btn-refresh-audio');
  const btnUnlockAllAudio = document.getElementById('btn-unlock-all-audio');
  const btnTopbarAudio = document.getElementById('btn-topbar-audio');

  async function loadAudioDevices() {
    try {
      const res = await fetch('/api/audio/devices');
      const data = await res.json();
      audioData = data;
      renderAudioDevices(data);
    } catch (e) {
      console.error('Failed to load audio devices', e);
    }
  }

  function renderAudioDevices(data) {
    if (!data) return;
    const isLocked = !!(data.locked_speaker_id || data.locked_mic_id);
    if (audioLockStatusText) {
      audioLockStatusText.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
      audioLockStatusText.className = isLocked ? 'uhc-stat-val text-green' : 'uhc-stat-val';
    }
    if (topbarAudioText) {
      topbarAudioText.textContent = isLocked ? 'AUDIO: LOCKED' : 'AUDIO: READY';
    }

    if (audioPlaybackList && data.playback) {
      if (data.playback.length === 0) {
        audioPlaybackList.innerHTML = '<div class="empty-state-notice">No playback devices found.</div>';
      } else {
        audioPlaybackList.innerHTML = data.playback.map(d => `
          <div class="audio-dev-card ${d.id === data.locked_speaker_id ? 'is-locked' : ''}">
            <div class="audio-dev-info">
              <span class="audio-dev-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
              <div class="audio-dev-meta">
                ${d.is_default ? '<span class="badge-active">ACTIVE DEFAULT</span>' : ''}
                ${d.id === data.locked_speaker_id ? '<span class="badge-locked">🔒 LOCKED</span>' : ''}
                <span>${d.active ? 'Present' : 'Unplugged'}</span>
              </div>
            </div>
            <button class="btn-clean-mini ${d.id === data.locked_speaker_id ? 'btn-clean-cancel' : 'btn-primary-action'}"
                    onclick="window.pingRadarAudioLock('speaker', '${escapeHtml(d.id)}', '${escapeHtml(d.name)}')">
              ${d.id === data.locked_speaker_id ? '🔓 Unlock' : '🔒 Lock Primary'}
            </button>
          </div>
        `).join('');
      }
    }

    if (audioRecordingList && data.recording) {
      if (data.recording.length === 0) {
        audioRecordingList.innerHTML = '<div class="empty-state-notice">No capture devices found.</div>';
      } else {
        audioRecordingList.innerHTML = data.recording.map(d => `
          <div class="audio-dev-card ${d.id === data.locked_mic_id ? 'is-locked' : ''}">
            <div class="audio-dev-info">
              <span class="audio-dev-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
              <div class="audio-dev-meta">
                ${d.is_default ? '<span class="badge-active">ACTIVE DEFAULT</span>' : ''}
                ${d.id === data.locked_mic_id ? '<span class="badge-locked">🔒 LOCKED</span>' : ''}
                <span>${d.active ? 'Present' : 'Unplugged'}</span>
              </div>
            </div>
            <button class="btn-clean-mini ${d.id === data.locked_mic_id ? 'btn-clean-cancel' : 'btn-primary-action'}"
                    onclick="window.pingRadarAudioLock('mic', '${escapeHtml(d.id)}', '${escapeHtml(d.name)}')">
              ${d.id === data.locked_mic_id ? '🔓 Unlock' : '🔒 Lock Primary'}
            </button>
          </div>
        `).join('');
      }
    }
  }

  window.pingRadarAudioLock = async function(type, devId, devName) {
    try {
      if (type === 'speaker') {
        if (audioData && audioData.locked_speaker_id === devId) {
          await fetch('/api/audio/unlock', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ type: 'speaker' })
          });
          showToast(`Unlocked playback hardware`, 'info');
        } else {
          await fetch('/api/audio/lock_speaker', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ device_id: devId, name: devName })
          });
          showToast(`Locked primary speaker: "${devName}"`, 'success');
        }
      } else {
        if (audioData && audioData.locked_mic_id === devId) {
          await fetch('/api/audio/unlock', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ type: 'mic' })
          });
          showToast(`Unlocked microphone hardware`, 'info');
        } else {
          await fetch('/api/audio/lock_mic', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ device_id: devId, name: devName })
          });
          showToast(`Locked primary microphone: "${devName}"`, 'success');
        }
      }
      playRadarBlip(1050);
      loadAudioDevices();
    } catch (e) {
      showToast('Audio Lock update failed', 'alert');
    }
  };

  if (btnRefreshAudio) btnRefreshAudio.addEventListener('click', loadAudioDevices);
  if (btnUnlockAllAudio) btnUnlockAllAudio.addEventListener('click', async () => {
    await fetch('/api/audio/unlock', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ type: 'all' })
    });
    showToast('Unlocked all audio hardware', 'info');
    loadAudioDevices();
  });
  if (btnTopbarAudio) btnTopbarAudio.addEventListener('click', () => {
    switchView('view-audio', 'Audio Lock Daemon');
  });

  function updateAudioDaemonUI(audioStatus) {
    if (!audioStatus) return;
    if (audioRevertsCount) {
      audioRevertsCount.textContent = (audioStatus.revert_events || []).length;
    }
    if (audioLogFeed && audioStatus.revert_events && audioStatus.revert_events.length > 0) {
      audioLogFeed.innerHTML = audioStatus.revert_events.map(ev => `
        <div class="audio-log-item">
          <span>🚨 Intercepted switch to <strong>${escapeHtml(ev.switched_to)}</strong> &bull; Force-reverted to <strong>${escapeHtml(ev.reverted_to)}</strong></span>
          <span class="ali-time">${ev.timestamp}</span>
        </div>
      `).join('');
    }
  }


  // =========================================================================
  // UTILITY 2: RAM STARVATION DURING GAMING (AUTO PROCESS FREEZER)
  // =========================================================================
  const ramSavedMb = document.getElementById('ram-saved-mb');
  const ramFrozenCount = document.getElementById('ram-frozen-count');
  const ramAutoModeBadge = document.getElementById('ram-auto-mode-badge');
  const topbarRamText = document.getElementById('topbar-ram-text');
  const btnTurboFreeze = document.getElementById('btn-turbo-freeze');
  const btnUnfreezeAll = document.getElementById('btn-unfreeze-all');
  const chkAutoFreeze = document.getElementById('chk-auto-freeze');
  const btnRefreshRam = document.getElementById('btn-refresh-ram');
  const ramHogsTbody = document.getElementById('ram-hogs-tbody');
  const btnTopbarRam = document.getElementById('btn-topbar-ram');

  async function loadRamHogs() {
    try {
      const res = await fetch('/api/ram/hogs');
      const data = await res.json();
      renderRamHogs(data.hogs || []);
      if (data.status) updateRamFreezerUI(data.status);
    } catch (e) {
      console.error('Failed to load RAM hogs', e);
    }
  }

  function renderRamHogs(hogs) {
    if (!ramHogsTbody) return;
    if (hogs.length === 0) {
      ramHogsTbody.innerHTML = '<tr><td colspan="5" class="empty-state-notice">No heavy background apps detected running.</td></tr>';
      return;
    }
    ramHogsTbody.innerHTML = hogs.map(h => `
      <tr>
        <td><strong>${escapeHtml(h.name)}</strong></td>
        <td><code>${h.pid}</code></td>
        <td><span class="badge-tag">${h.memory_mb} MB</span></td>
        <td>
          <span class="${h.status === 'FROZEN' ? 'status-pill-frozen' : 'status-pill-clean'}">
            ${h.status === 'FROZEN' ? '🧊 SUSPENDED' : '⚡ ACTIVE'}
          </span>
        </td>
        <td>
          <button class="btn-clean-mini ${h.status === 'FROZEN' ? 'btn-clean-cancel' : 'btn-primary-action'}"
                  onclick="window.pingRadarToggleProc(${h.pid}, '${h.status}')">
            ${h.status === 'FROZEN' ? 'Resume' : 'Freeze'}
          </button>
        </td>
      </tr>
    `).join('');
  }

  window.pingRadarToggleProc = async function(pid, currentStatus) {
    try {
      if (currentStatus === 'FROZEN') {
        await fetch('/api/ram/unfreeze', { method: 'POST' });
        showToast(`Resumed process PID ${pid}`, 'info');
      } else {
        await fetch('/api/ram/freeze', { method: 'POST' });
        showToast(`Suspended background process PID ${pid}`, 'success');
      }
      playRadarBlip(1000);
      loadRamHogs();
    } catch (e) {
      showToast('Failed to toggle process', 'alert');
    }
  };

  if (btnTurboFreeze) {
    btnTurboFreeze.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/ram/freeze', { method: 'POST' });
        const data = await res.json();
        showToast(`Turbo Freeze: Suspended ${data.frozen_count} apps, freed ${data.memory_reclaimed_mb} MB RAM!`, 'success');
        playRadarBlip(1250);
        loadRamHogs();
      } catch (e) {
        showToast('Freeze operation failed', 'alert');
      }
    });
  }

  if (btnUnfreezeAll) {
    btnUnfreezeAll.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/ram/unfreeze', { method: 'POST' });
        const data = await res.json();
        showToast(`Resumed ${data.resumed_count} background apps.`, 'info');
        playRadarBlip(950);
        loadRamHogs();
      } catch (e) {
        showToast('Unfreeze operation failed', 'alert');
      }
    });
  }

  if (chkAutoFreeze) {
    chkAutoFreeze.addEventListener('change', async (e) => {
      await fetch('/api/ram/toggle_auto', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ enabled: e.target.checked })
      });
      showToast(`Auto-Freeze on Game Launch: ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
    });
  }

  if (btnRefreshRam) btnRefreshRam.addEventListener('click', loadRamHogs);
  if (btnTopbarRam) btnTopbarRam.addEventListener('click', () => {
    switchView('view-ram', 'RAM Process Freezer');
  });

  function updateRamFreezerUI(status) {
    if (!status) return;
    if (ramSavedMb) ramSavedMb.textContent = `${status.memory_reclaimed_mb || 0} MB`;
    if (ramFrozenCount) ramFrozenCount.textContent = status.frozen_count || 0;
    if (ramAutoModeBadge) ramAutoModeBadge.textContent = status.auto_freeze_on_game ? 'AUTO (ON)' : 'MANUAL';
    if (topbarRamText) {
      topbarRamText.textContent = status.is_frozen ? `RAM: +${status.memory_reclaimed_mb}MB` : 'RAM: READY';
    }
  }


  // =========================================================================
  // UTILITY 3: FILE LOCK & PORT MYSTERY (LOCK & PORT SNIPER)
  // =========================================================================
  const inputSniperPort = document.getElementById('input-sniper-port');
  const btnSnipePort = document.getElementById('btn-snipe-port');
  const sniperPortResult = document.getElementById('sniper-port-result');
  const inputSniperFile = document.getElementById('input-sniper-file');
  const btnSnipeFile = document.getElementById('btn-snipe-file');
  const sniperFileResult = document.getElementById('sniper-file-result');

  async function snipePort(port) {
    if (!port) return;
    if (sniperPortResult) sniperPortResult.innerHTML = '<div class="empty-state-notice">Scanning port ' + port + '...</div>';
    try {
      const res = await fetch(`/api/sniper/port/${port}`);
      const data = await res.json();
      renderPortResult(data);
    } catch (e) {
      if (sniperPortResult) sniperPortResult.innerHTML = '<div class="empty-state-notice">Error scanning port.</div>';
    }
  }

  function renderPortResult(data) {
    if (!sniperPortResult) return;
    if (!data.is_occupied || data.culprits.length === 0) {
      sniperPortResult.innerHTML = `
        <div style="text-align:center; padding: 16px;">
          <span style="font-size: 28px;">🟢</span>
          <h4 style="color:#00e599; margin: 6px 0 2px 0;">Port ${data.target_port} is FREE</h4>
          <p style="font-size: 12px; color: #94a3b8;">No processes are currently occupying or listening on this port.</p>
        </div>
      `;
      return;
    }

    sniperPortResult.innerHTML = data.culprits.map(c => `
      <div class="culprit-card">
        <div class="culprit-info">
          <span class="culprit-name">🚨 ${escapeHtml(c.name)} (PID ${c.pid})</span>
          <span class="culprit-meta">Local: ${c.local_address || ''} &bull; Memory: ${c.memory_mb} MB &bull; Status: ${c.status || 'LISTEN'}</span>
          <span class="culprit-meta" style="font-family: monospace;">${escapeHtml(c.cmdline || c.exe || '')}</span>
        </div>
        <button class="btn-kill-culprit" onclick="window.pingRadarKillProc(${c.pid}, 'port', ${data.target_port})">
          💥 Kill Process
        </button>
      </div>
    `).join('');
  }

  async function snipeFile(filePath) {
    if (!filePath) return;
    if (sniperFileResult) sniperFileResult.innerHTML = '<div class="empty-state-notice">Querying Windows Restart Manager...</div>';
    try {
      const res = await fetch('/api/sniper/file_lock', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: filePath })
      });
      const data = await res.json();
      renderFileLockResult(data);
    } catch (e) {
      if (sniperFileResult) sniperFileResult.innerHTML = '<div class="empty-state-notice">Error checking file lock.</div>';
    }
  }

  function renderFileLockResult(data) {
    if (!sniperFileResult) return;
    if (!data.exists) {
      sniperFileResult.innerHTML = `<div class="empty-state-notice">File does not exist: "${escapeHtml(data.file_path)}"</div>`;
      return;
    }
    if (!data.is_locked || data.culprits.length === 0) {
      sniperFileResult.innerHTML = `
        <div style="text-align:center; padding: 16px;">
          <span style="font-size: 28px;">🟢</span>
          <h4 style="color:#00e599; margin: 6px 0 2px 0;">File is UNLOCKED</h4>
          <p style="font-size: 12px; color: #94a3b8;">No active program is currently locking "${escapeHtml(data.file_path)}". It can be safely deleted or edited.</p>
        </div>
      `;
      return;
    }

    sniperFileResult.innerHTML = data.culprits.map(c => `
      <div class="culprit-card">
        <div class="culprit-info">
          <span class="culprit-name">🔒 ${escapeHtml(c.name)} (PID ${c.pid})</span>
          <span class="culprit-meta">Holding file handle &bull; Memory: ${c.memory_mb} MB</span>
          <span class="culprit-meta" style="font-family: monospace;">${escapeHtml(c.exe || '')}</span>
        </div>
        <button class="btn-kill-culprit" onclick="window.pingRadarKillProc(${c.pid}, 'file', '${escapeHtml(data.file_path)}')">
          💥 Kill Process
        </button>
      </div>
    `).join('');
  }

  window.pingRadarKillProc = async function(pid, type, target) {
    try {
      const res = await fetch(`/api/sniper/kill/${pid}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Killed PID ${pid}`, 'success');
        playRadarBlip(1200);
        if (type === 'port') {
          snipePort(target);
        } else {
          snipeFile(target);
        }
      } else {
        showToast(data.error || 'Failed to terminate process', 'alert');
      }
    } catch (e) {
      showToast('Kill command failed', 'alert');
    }
  };

  if (btnSnipePort && inputSniperPort) {
    btnSnipePort.addEventListener('click', () => {
      snipePort(inputSniperPort.value);
      playRadarBlip(1000);
    });
  }

  if (btnSnipeFile && inputSniperFile) {
    btnSnipeFile.addEventListener('click', () => {
      snipeFile(inputSniperFile.value);
      playRadarBlip(1000);
    });
  }

  document.querySelectorAll('.qchip').forEach(chip => {
    chip.addEventListener('click', () => {
      const port = chip.dataset.port;
      if (inputSniperPort) inputSniperPort.value = port;
      snipePort(port);
      playRadarBlip(1000);
    });
  });

  async function loadCommonPorts() {
    // default to 3000
    if (inputSniperPort && inputSniperPort.value) {
      snipePort(inputSniperPort.value);
    }
  }


  // =========================================================================
  // UTILITY 4: BLINDING WHITE FLASH AT NIGHT (LUMINANCE GUARD)
  // =========================================================================
  const lumLiveVal = document.getElementById('lum-live-val');
  const lumFlashesBlocked = document.getElementById('lum-flashes-blocked');
  const lumGuardState = document.getElementById('lum-guard-state');
  const sliderLumThreshold = document.getElementById('slider-lum-threshold');
  const lumThresholdDisplay = document.getElementById('lum-threshold-display');
  const sliderLumDimmed = document.getElementById('slider-lum-dimmed');
  const lumDimmedDisplay = document.getElementById('lum-dimmed-display');
  const chkLumAlways = document.getElementById('chk-lum-always');
  const btnTestLumFlash = document.getElementById('btn-test-lum-flash');

  async function loadLuminanceStatus() {
    try {
      const res = await fetch('/api/luminance/status');
      const data = await res.json();
      updateLuminanceUI(data);
    } catch (e) {}
  }

  function updateLuminanceUI(data) {
    if (!data) return;
    if (lumLiveVal) lumLiveVal.textContent = `${data.current_luminance || 0} / 255`;
    if (lumFlashesBlocked) lumFlashesBlocked.textContent = data.recent_flashes_blocked || 0;
    if (lumGuardState) {
      lumGuardState.textContent = data.is_currently_dimmed ? 'DIMMED (PROTECTED)' : (data.enabled ? 'ACTIVE' : 'STANDBY');
      lumGuardState.className = data.is_currently_dimmed ? 'uhc-stat-val text-teal' : 'uhc-stat-val text-green';
    }
    if (sliderLumThreshold && lumThresholdDisplay) {
      lumThresholdDisplay.textContent = `${data.flash_threshold} / 255`;
    }
    if (sliderLumDimmed && lumDimmedDisplay) {
      lumDimmedDisplay.textContent = `${data.dimmed_brightness}%`;
    }
    if (chkLumAlways) chkLumAlways.checked = !!data.always_active;
  }

  if (sliderLumThreshold && lumThresholdDisplay) {
    sliderLumThreshold.addEventListener('input', (e) => {
      lumThresholdDisplay.textContent = `${e.target.value} / 255`;
      fetch('/api/luminance/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ threshold: parseInt(e.target.value, 10) })
      });
    });
  }

  if (sliderLumDimmed && lumDimmedDisplay) {
    sliderLumDimmed.addEventListener('input', (e) => {
      lumDimmedDisplay.textContent = `${e.target.value}%`;
      fetch('/api/luminance/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ dimmed: parseInt(e.target.value, 10) })
      });
    });
  }

  if (chkLumAlways) {
    chkLumAlways.addEventListener('change', (e) => {
      fetch('/api/luminance/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ always_active: e.target.checked })
      });
      showToast(`Luminance Guard Mode: ${e.target.checked ? 'Always Active 24/7' : 'Night Schedule (20:00-07:00)'}`, 'info');
    });
  }

  if (btnTestLumFlash) {
    btnTestLumFlash.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/luminance/test', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'Simulating flash defense...', 'success');
        playRadarBlip(1200);
      } catch (e) {
        showToast('Simulation test error', 'alert');
      }
    });
  }


  // =========================================================================
  // UTILITY 5: UNSELECTABLE TEXT (SCREEN-SNIP OCR GRABBER)
  // =========================================================================
  const btnOcrFullscreen = document.getElementById('btn-ocr-fullscreen');
  const btnOcrRegion = document.getElementById('btn-ocr-region');
  const fileOcrInput = document.getElementById('file-ocr-input');
  const ocrResultText = document.getElementById('ocr-result-text');
  const ocrCharCount = document.getElementById('ocr-char-count');
  const btnCopyOcr = document.getElementById('btn-copy-ocr');
  const ocrHistoryList = document.getElementById('ocr-history-list');

  async function loadOcrHistory() {
    try {
      const res = await fetch('/api/ocr/history');
      const data = await res.json();
      renderOcrHistory(data.history || []);
    } catch (e) {}
  }

  function renderOcrHistory(items) {
    if (!ocrHistoryList) return;
    if (items.length === 0) {
      ocrHistoryList.innerHTML = '<div class="empty-state-notice">No snippets grabbed yet. Click "Grab Full Screen" to extract all text on your display!</div>';
      return;
    }
    ocrHistoryList.innerHTML = items.map(item => `
      <div class="ocr-hist-item" onclick="window.pingRadarSetOcrText('${escapeHtml(item.text).replace(/'/g, "\\'")}')">
        <span class="ocr-hist-text">${escapeHtml(item.text.slice(0, 80))}${item.text.length > 80 ? '...' : ''}</span>
        <span class="badge-tag">${item.char_count} chars &bull; ${item.timestamp}</span>
      </div>
    `).join('');
  }

  window.pingRadarSetOcrText = function(text) {
    if (ocrResultText) ocrResultText.value = text;
    if (ocrCharCount) ocrCharCount.textContent = `${text.length} characters`;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Snippet copied to clipboard!', 'success');
      playRadarBlip(1100);
    });
  };

  if (btnOcrFullscreen) {
    btnOcrFullscreen.addEventListener('click', async () => {
      showToast('Capturing screen and running AI OCR...', 'info');
      try {
        const res = await fetch('/api/ocr/full_screen', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ copy: true })
        });
        const data = await res.json();
        if (data.success) {
          if (ocrResultText) ocrResultText.value = data.text;
          if (ocrCharCount) ocrCharCount.textContent = `${data.char_count} characters extracted & copied to clipboard!`;
          showToast(`Extracted ${data.char_count} characters & copied to clipboard!`, 'success');
          playRadarBlip(1250);
          loadOcrHistory();
        } else {
          showToast(data.error || 'OCR failed', 'alert');
        }
      } catch (e) {
        showToast('Screen capture OCR error', 'alert');
      }
    });
  }

  if (btnOcrRegion) {
    btnOcrRegion.addEventListener('click', async () => {
      const coordStr = prompt('Enter bounding coordinates [left, top, right, bottom] or click OK for default active center area:', '200, 200, 1000, 800');
      if (!coordStr) return;
      const parts = coordStr.split(',').map(s => parseInt(s.trim(), 10));
      if (parts.length === 4 && !parts.some(isNaN)) {
        try {
          const res = await fetch('/api/ocr/snip_region', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ left: parts[0], top: parts[1], right: parts[2], bottom: parts[3], copy: true })
          });
          const data = await res.json();
          if (data.success) {
            if (ocrResultText) ocrResultText.value = data.text;
            if (ocrCharCount) ocrCharCount.textContent = `${data.char_count} characters extracted & copied to clipboard!`;
            showToast(`Region OCR: Extracted ${data.char_count} chars!`, 'success');
            playRadarBlip(1200);
            loadOcrHistory();
          } else {
            showToast(data.error || 'Region snip error', 'alert');
          }
        } catch (e) {
          showToast('Region snip failed', 'alert');
        }
      } else {
        showToast('Invalid coordinates format. Expected: left, top, right, bottom', 'alert');
      }
    });
  }

  if (fileOcrInput) {
    fileOcrInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showToast(`Processing image ${file.name}...`, 'info');
      // For local desktop app, send path or simple prompt
      const p = prompt('Confirm full path to image file:', file.name);
      if (p) {
        try {
          const res = await fetch('/api/ocr/file', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ file_path: p, copy: true })
          });
          const data = await res.json();
          if (data.success) {
            if (ocrResultText) ocrResultText.value = data.text;
            showToast(`Extracted ${data.char_count} characters from file!`, 'success');
            loadOcrHistory();
          } else {
            showToast(data.error || 'File OCR error', 'alert');
          }
        } catch (err) {}
      }
    });
  }

  if (btnCopyOcr && ocrResultText) {
    btnCopyOcr.addEventListener('click', () => {
      navigator.clipboard.writeText(ocrResultText.value).then(() => {
        showToast('Copied to clipboard!', 'success');
        playRadarBlip(1100);
      });
    });
  }


  // =========================================================================
  // UTILITY 6: SCREENSHOT GRAVEYARD (SMART SCREENSHOT INDEXER)
  // =========================================================================
  const ssIndexedCount = document.getElementById('ss-indexed-count');
  const ssFolderName = document.getElementById('ss-folder-name');
  const btnScanScreenshots = document.getElementById('btn-scan-screenshots');
  const inputSsSearch = document.getElementById('input-ss-search');
  const ssCategoryChips = document.getElementById('ss-category-chips');
  const screenshotsResultsGrid = document.getElementById('screenshots-results-grid');
  let currentSsCategory = 'All';

  async function loadScreenshots(q = '', cat = '') {
    try {
      const url = `/api/screenshots/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat || currentSsCategory)}`;
      const res = await fetch(url);
      const data = await res.json();
      renderScreenshots(data.results || []);
    } catch (e) {}
  }

  function renderScreenshots(items) {
    if (!screenshotsResultsGrid) return;
    if (items.length === 0) {
      screenshotsResultsGrid.innerHTML = '<div class="empty-state-notice">No screenshots match your search. Click "Scan All Now" to index your Screenshots folder.</div>';
      return;
    }

    screenshotsResultsGrid.innerHTML = items.map(s => `
      <div class="screenshot-card">
        <div class="sc-head">
          <span class="sc-cat-badge">${escapeHtml(s.category)}</span>
          <span class="sc-date">${s.created_at || ''}</span>
        </div>
        <div class="sc-title" title="${escapeHtml(s.filename)}">📄 ${escapeHtml(s.filename)}</div>
        <div class="sc-snippet">${escapeHtml(s.extracted_text || 'No text extracted')}</div>
        <div style="font-size: 11px; color: #2dd4bf;">💡 Suggested: ${escapeHtml(s.suggested_name)}</div>
        <button class="btn-clean-mini btn-primary-action" onclick="window.pingRadarRenameScreenshot(${s.id})">
          ✏️ Rename To Suggestion
        </button>
      </div>
    `).join('');
  }

  window.pingRadarRenameScreenshot = async function(id) {
    try {
      const res = await fetch(`/api/screenshots/rename/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Renamed to: ${data.new_name}`, 'success');
        playRadarBlip(1150);
        loadScreenshots(inputSsSearch ? inputSsSearch.value : '', currentSsCategory);
      } else {
        showToast(data.error || 'Rename failed', 'alert');
      }
    } catch (e) {
      showToast('Rename request failed', 'alert');
    }
  };

  if (btnScanScreenshots) {
    btnScanScreenshots.addEventListener('click', async () => {
      showToast('Scanning and indexing screenshots with AI OCR...', 'info');
      try {
        const res = await fetch('/api/screenshots/scan_all', { method: 'POST' });
        const data = await res.json();
        showToast(`Indexed ${data.indexed_count} new screenshots!`, 'success');
        playRadarBlip(1200);
        if (ssIndexedCount && data.status) ssIndexedCount.textContent = data.status.total_indexed;
        loadScreenshots();
      } catch (e) {
        showToast('Scan failed', 'alert');
      }
    });
  }

  if (inputSsSearch) {
    let debounceTimer = null;
    inputSsSearch.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadScreenshots(e.target.value, currentSsCategory);
      }, 250);
    });
  }

  if (ssCategoryChips) {
    ssCategoryChips.querySelectorAll('.cat-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        ssCategoryChips.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSsCategory = btn.dataset.cat;
        loadScreenshots(inputSsSearch ? inputSsSearch.value : '', currentSsCategory);
      });
    });
  }


  // =========================================================================
  // UTILITY 7: CLIPBOARD FORMATTING TRASH (CLEAN PASTE INTERCEPTOR)
  // =========================================================================
  const clipCleanedCount = document.getElementById('clip-cleaned-count');
  const clipParamsCount = document.getElementById('clip-params-count');
  const clipPdfCount = document.getElementById('clip-pdf-count');
  const topbarClipText = document.getElementById('topbar-clip-text');
  const chkCleanClipboardMaster = document.getElementById('chk-clean-clipboard-master');
  const btnTestCleanClipboard = document.getElementById('btn-test-clean-clipboard');
  const inputCleanTest = document.getElementById('input-clean-test');
  const btnRunCleanTest = document.getElementById('btn-run-clean-test');
  const cleanTestResult = document.getElementById('clean-test-result');
  const clipFeed = document.getElementById('clip-feed');
  const btnTopbarClip = document.getElementById('btn-topbar-clip');

  async function loadClipboardStatus() {
    try {
      const res = await fetch('/api/clipboard/status');
      const data = await res.json();
      updateCleanClipboardUI(data);
    } catch (e) {}
  }

  function updateCleanClipboardUI(data) {
    if (!data) return;
    if (clipCleanedCount) clipCleanedCount.textContent = data.items_cleaned || 0;
    if (clipParamsCount) clipParamsCount.textContent = data.params_stripped_count || 0;
    if (clipPdfCount) clipPdfCount.textContent = data.pdf_wraps_healed_count || 0;
    if (chkCleanClipboardMaster) chkCleanClipboardMaster.checked = !!data.enabled;
    if (topbarClipText) {
      topbarClipText.textContent = data.enabled ? 'CLEAN PASTE: ON' : 'CLEAN PASTE: OFF';
    }

    if (clipFeed && data.recent_cleaned && data.recent_cleaned.length > 0) {
      clipFeed.innerHTML = data.recent_cleaned.map(item => `
        <div class="clip-feed-item">
          <div>
            <div style="color:#00e599; font-family: monospace; font-size: 11px;">${escapeHtml(item.cleaned_snippet)}</div>
            <div style="font-size: 10px; color:#64748b;">Original: ${escapeHtml(item.original_snippet)}</div>
          </div>
          <span class="badge-tag">-${item.stripped_params} params &bull; ${item.timestamp}</span>
        </div>
      `).join('');
    }
  }

  if (chkCleanClipboardMaster) {
    chkCleanClipboardMaster.addEventListener('change', async (e) => {
      await fetch('/api/clipboard/toggle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ enabled: e.target.checked })
      });
      showToast(`Clean Paste Interceptor: ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
    });
  }

  if (btnRunCleanTest && inputCleanTest && cleanTestResult) {
    btnRunCleanTest.addEventListener('click', () => {
      const raw = inputCleanTest.value;
      // Strip tracking params locally for instant UI response
      const cleaned = raw.replace(/([?&])(utm_[^&=]+|fbclid|gclid|igshid|si|mc_eid|_ga|ref|ref_)=[^&#]*/gi, '$1')
                         .replace(/[?&]+$/, '')
                         .replace(/\?&/, '?');
      cleanTestResult.textContent = cleaned;
      showToast('Cleaned URL preview updated!', 'success');
      playRadarBlip(1050);
    });
  }

  if (btnTestCleanClipboard) {
    btnTestCleanClipboard.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/clipboard/clean_now', { method: 'POST' });
        const data = await res.json();
        showToast('Clipboard sanitized! All trackers and broken linebreaks purged.', 'success');
        playRadarBlip(1100);
        loadClipboardStatus();
      } catch (e) {
        showToast('Clipboard clean failed', 'alert');
      }
    });
  }

  if (btnTopbarClip) {
    btnTopbarClip.addEventListener('click', () => {
      switchView('view-clipboard', 'Clean Paste Shield');
    });
  }


  // =========================================================================
  // UTILITY 8: MYSTERY LAG SPIKES (3-POINT NET DIAGNOSTIC)
  // =========================================================================
  const btnRunNetdiag = document.getElementById('btn-run-netdiag');
  const diagMasterBanner = document.getElementById('diag-master-banner');
  const dmbIcon = document.getElementById('dmb-icon');
  const dmbTitle = document.getElementById('dmb-title');
  const dmbDesc = document.getElementById('dmb-desc');
  const dpcGwPing = document.getElementById('dpc-gw-ping');
  const dpcGwLoss = document.getElementById('dpc-gw-loss');
  const dpcGwBadge = document.getElementById('dpc-gw-badge');
  const dpcGwIp = document.getElementById('dpc-gw-ip');
  const dpcWanPing = document.getElementById('dpc-wan-ping');
  const dpcWanLoss = document.getElementById('dpc-wan-loss');
  const dpcWanBadge = document.getElementById('dpc-wan-badge');
  const dpcDownRate = document.getElementById('dpc-down-rate');
  const dpcUpRate = document.getElementById('dpc-up-rate');
  const dpcBwBadge = document.getElementById('dpc-bw-badge');
  const diagAppsTbody = document.getElementById('diag-apps-tbody');

  async function loadNetDiag() {
    try {
      const res = await fetch('/api/net_diagnostic/latest');
      const data = await res.json();
      updateNetDiagUI(data);
    } catch (e) {}
  }

  function updateNetDiagUI(diag) {
    if (!diag || !diag.bottleneck_code) return;

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

  if (btnRunNetdiag) {
    btnRunNetdiag.addEventListener('click', async () => {
      showToast('Running concurrent 3-point ping and bandwidth diagnosis...', 'info');
      try {
        const res = await fetch('/api/net_diagnostic/run', { method: 'POST' });
        const data = await res.json();
        updateNetDiagUI(data);
        showToast(`Diagnostic complete: ${data.bottleneck_title}`, data.severity === 'danger' ? 'alert' : 'success');
        playRadarBlip(1100);
      } catch (e) {
        showToast('Diagnostic run error', 'alert');
      }
    });
  }

  // Initial loads on boot
  loadAudioDevices();
  loadRamHogs();
  loadLuminanceStatus();
  loadClipboardStatus();
  loadNetDiag();

  // --- Application Bootstrap ---
  connectWebSocket();
  requestAnimationFrame(renderOverviewChart);
  requestAnimationFrame(renderRadar);
  requestAnimationFrame(renderLatencyChart);
  requestAnimationFrame(renderJitterChart);

})();
