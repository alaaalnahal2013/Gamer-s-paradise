/**
 * IN-GAME TACTICAL HUD EXTENSION JAVASCRIPT
 * Real-time In-Game Telemetry Stream, Dragging, Opacity Toggling & Command Injector
 */

(() => {
  'use strict';

  let socket = null;
  let currentCmd = 'mm_dedicated_search_maxping 45';
  let opacityMode = 0; // 0 = 100%, 1 = 80%, 2 = 50%
  let isMiniMode = false;

  // DOM Elements
  const hudWindow = document.getElementById('hud-window');
  const hudDragBar = document.getElementById('hud-drag-bar');
  const hudGameName = document.getElementById('hud-game-name');
  const hudVpnBadge = document.getElementById('hud-vpn-badge');
  const btnToggleGhost = document.getElementById('btn-toggle-ghost');
  const btnToggleMini = document.getElementById('btn-toggle-mini');

  const hudBestServer = document.getElementById('hud-best-server');
  const hudBestPing = document.getElementById('hud-best-ping');
  const hudBestJitter = document.getElementById('hud-best-jitter');
  const hudBestLoss = document.getElementById('hud-best-loss');
  const hudServerGrade = document.getElementById('hud-server-grade');

  const btnCopyHudCmd = document.getElementById('btn-copy-hud-cmd');
  const hudCmdText = document.getElementById('hud-cmd-text');
  const hudCopyBadge = document.getElementById('hud-copy-badge');

  const hudDiagBar = document.getElementById('hud-diag-bar');
  const hudDiagText = document.getElementById('hud-diag-text');
  const hudLadderList = document.getElementById('hud-ladder-list');

  const btnVoiceAnnounce = document.getElementById('btn-voice-announce');
  const btnNativeHudLaunch = document.getElementById('btn-native-hud-launch');

  // --- Dragging Logic ---
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  hudDragBar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hud-controls')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = hudWindow.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    hudWindow.style.position = 'fixed';
    hudWindow.style.left = `${initialLeft}px`;
    hudWindow.style.top = `${initialTop}px`;
    hudWindow.style.margin = '0';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    hudWindow.style.left = `${Math.max(10, initialLeft + dx)}px`;
    hudWindow.style.top = `${Math.max(10, initialTop + dy)}px`;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // --- Ghost Opacity Mode ---
  btnToggleGhost.addEventListener('click', () => {
    opacityMode = (opacityMode + 1) % 3;
    hudWindow.classList.remove('ghost-80', 'ghost-50');
    if (opacityMode === 1) {
      hudWindow.classList.add('ghost-80');
      btnToggleGhost.textContent = '👻 80%';
    } else if (opacityMode === 2) {
      hudWindow.classList.add('ghost-50');
      btnToggleGhost.textContent = '👻 50%';
    } else {
      btnToggleGhost.textContent = '👻 100%';
    }
  });

  // --- Mini Mode Toggle ---
  btnToggleMini.addEventListener('click', () => {
    isMiniMode = !isMiniMode;
    hudWindow.classList.toggle('mini-mode', isMiniMode);
    btnToggleMini.textContent = isMiniMode ? '▲' : '_';
  });

  // --- Copy Command ---
  btnCopyHudCmd.addEventListener('click', () => {
    navigator.clipboard.writeText(currentCmd).then(() => {
      hudCopyBadge.textContent = 'COPIED!';
      hudCopyBadge.style.background = '#38bdf8';
      setTimeout(() => {
        hudCopyBadge.textContent = 'COPY';
        hudCopyBadge.style.background = '#00e599';
      }, 1500);
    });
  });

  // --- Voice Announcement ---
  if (btnVoiceAnnounce) {
    btnVoiceAnnounce.addEventListener('click', async () => {
      btnVoiceAnnounce.textContent = '🗣 Speaking...';
      try {
        await fetch('/api/announce_voice', { method: 'POST' });
      } catch (e) {}
      setTimeout(() => {
        btnVoiceAnnounce.textContent = '🗣 Announce';
      }, 2500);
    });
  }

  // --- Launch Native Python Always-On-Top Window ---
  if (btnNativeHudLaunch) {
    btnNativeHudLaunch.addEventListener('click', async () => {
      btnNativeHudLaunch.textContent = '🚀 Launching...';
      try {
        const res = await fetch('/api/launch_native_hud', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
          btnNativeHudLaunch.textContent = '✓ Native Active';
        }
      } catch (e) {
        btnNativeHudLaunch.textContent = 'Native Error';
      }
      setTimeout(() => {
        btnNativeHudLaunch.textContent = '🚀 Native Window';
      }, 3000);
    });
  }

  // --- WebSocket Connection ---
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateUI(data);
      } catch (err) {}
    };

    socket.onclose = () => {
      setTimeout(connect, 1500);
    };
  }

  function updateUI(data) {
    const rec = data.recommendation || {};
    const det = data.detected_game;
    const diag = data.diagnosis || {};
    const targets = data.targets || [];

    // Game Title & VPN Shield Badge
    const gName = (det && det.name) || rec.game_name || (data.selected_game_id || 'CS2').toUpperCase();
    hudGameName.textContent = `${gName.toUpperCase()} EXTENSION`;

    if (data.vpn && hudVpnBadge) {
      if (data.vpn.enabled) {
        hudVpnBadge.textContent = `🛡️ ${data.vpn.flag} ${data.vpn.masked_ip}`;
        hudVpnBadge.style.color = '#00e599';
        hudVpnBadge.style.background = 'rgba(0, 229, 153, 0.12)';
        hudVpnBadge.style.borderColor = 'rgba(0, 229, 153, 0.3)';
      } else {
        hudVpnBadge.textContent = '🛡️ IP: REAL (EXPOSED)';
        hudVpnBadge.style.color = '#f59e0b';
        hudVpnBadge.style.background = 'rgba(245, 158, 11, 0.12)';
        hudVpnBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      }
    }

    // Best Server
    const best = rec.best_server;
    if (best && best.metrics) {
      hudBestServer.textContent = `${best.name}`;
      hudBestPing.textContent = `${best.metrics.current_rtt} ms`;
      hudBestJitter.textContent = `±${best.metrics.jitter} ms`;
      hudBestLoss.textContent = `${best.metrics.packet_loss}%`;
      hudServerGrade.textContent = `RANK #1 • ${best.metrics.grade || 'A+'}`;
    }

    // In-game console command
    if (rec.matchmaking_cmd && rec.recommended_max_ping) {
      currentCmd = `${rec.matchmaking_cmd} ${rec.recommended_max_ping}`;
      hudCmdText.textContent = currentCmd;
    }

    // Diagnostics / Wi-Fi hop
    // 3-Point Diagnostic or Gateway Fallback
    if (data.net_diag && data.net_diag.bottleneck_title) {
      if (data.net_diag.severity === 'danger') {
        hudDiagBar.classList.add('alert');
        hudDiagText.textContent = `🚨 ${data.net_diag.bottleneck_title}`;
      } else if (data.net_diag.severity === 'warning') {
        hudDiagBar.classList.add('alert');
        hudDiagText.textContent = `⚠️ ${data.net_diag.bottleneck_title}`;
      } else {
        hudDiagBar.classList.remove('alert');
        hudDiagText.textContent = `● Wi-Fi & Core: Clean (${data.net_diag.bottleneck_title})`;
      }
    } else {
      const gw = targets.find(t => t.is_gateway);
      if (gw && gw.metrics) {
        const gwRtt = gw.metrics.current_rtt;
        const gwLoss = gw.metrics.packet_loss || 0;
        if (gwLoss > 0 || (gwRtt && gwRtt > 15)) {
          hudDiagBar.classList.add('alert');
          hudDiagText.textContent = `⚠️ Local Wi-Fi Bottleneck (+${gwRtt}ms) - Check Router`;
        } else {
          hudDiagBar.classList.remove('alert');
          hudDiagText.textContent = `● Wi-Fi: ${gwRtt || 1.1} ms (Clean) • Route: Optimal`;
        }
      }
    }

    // Top 3 Regional Clusters
    if (rec.leaderboard && hudLadderList) {
      hudLadderList.innerHTML = '';
      rec.leaderboard.slice(0, 3).forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'hls-row';
        const rtt = item.metrics.current_rtt !== null ? `${item.metrics.current_rtt} ms` : 'LOST';
        row.innerHTML = `
          <span class="hls-name">#${idx + 1} ${escapeHtml(item.name)}</span>
          <span class="hls-ping">${rtt}</span>
        `;
        hudLadderList.appendChild(row);
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  connect();
})();
