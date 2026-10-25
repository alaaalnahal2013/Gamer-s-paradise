/**
 * DESKTOP SERVER RADAR MODULE
 * Pre-flight server queue, ping, and status watcher before launching games.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let preflightServerGrid, btnAddPreflightServer;
let txtPfName, txtPfGame, txtPfIp, txtPfPort;

export async function loadPreflightServers() {
  try {
    const res = await fetch('/api/preflight/servers');
    const data = await res.json();
    renderPreflightServers(data.servers || []);
  } catch (e) {
    console.error('Failed to load Preflight servers:', e);
  }
}

export function renderPreflightServers(servers) {
  if (!preflightServerGrid) return;
  if (!servers.length) {
    preflightServerGrid.innerHTML = '<div class="empty-state">No servers monitored. Add your favorite community servers below.</div>';
    return;
  }

  preflightServerGrid.innerHTML = servers.map(s => {
    const st = s.status || {};
    const isOnline = !!st.online;
    const latency = st.latency_ms ? `${st.latency_ms} ms` : 'Offline';
    const isFast = st.latency_ms && st.latency_ms < 45;

    return `
      <div class="server-card ${isOnline ? 'online' : 'offline'}">
        <div class="sc-top">
          <div class="sc-main">
            <span class="sc-game-badge">${escapeHtml(s.game)}</span>
            <div class="sc-name">${escapeHtml(s.name)}</div>
            <div class="sc-address">${escapeHtml(s.ip)}:${s.port} &bull; ${escapeHtml(s.region || 'Custom')}</div>
          </div>
          <div class="sc-metrics">
            <span class="sc-ping-badge ${isFast ? 'fast' : ''}">${latency}</span>
            <span class="sc-jitter">±${st.jitter_ms || 0} ms jitter</span>
          </div>
        </div>
        <div class="sc-meta-row">
          <span>👥 Players: <strong>${escapeHtml(st.players || '--')} / ${escapeHtml(st.max_players || '--')}</strong></span>
          <span>🗺 Map: <strong>${escapeHtml(st.map || '--')}</strong></span>
          <span class="sc-status-pill ${isOnline ? 'good' : 'alert'}">${isOnline ? '● ONLINE' : '○ UNREACHABLE'}</span>
        </div>
        <div class="sc-actions">
          <button class="btn-probe-server" data-ip="${escapeHtml(s.ip)}" data-port="${s.port}">
            ⚡ Ping Now
          </button>
          <button class="btn-remove-server" data-id="${escapeHtml(s.id)}" title="Remove from Radar">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  preflightServerGrid.querySelectorAll('.btn-probe-server').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ip = btn.getAttribute('data-ip');
      const port = parseInt(btn.getAttribute('data-port'), 10);
      try {
        btn.textContent = 'Pinging...';
        const res = await fetch('/api/preflight/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port })
        });
        const data = await res.json();
        showToast(`Server responded: ${data.latency_ms || 'Offline'} ms (${data.players} players)`, data.online ? 'success' : 'alert');
        playRadarBlip(1050);
        loadPreflightServers();
      } catch (e) {
        showToast('Probe failed', 'alert');
      }
    });
  });

  preflightServerGrid.querySelectorAll('.btn-remove-server').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      try {
        await fetch('/api/preflight/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        showToast('Server removed from radar', 'info');
        loadPreflightServers();
      } catch (e) {}
    });
  });
}

export function initPreflightModule() {
  preflightServerGrid = document.getElementById('preflight-server-grid');
  btnAddPreflightServer = document.getElementById('btn-add-preflight-server');
  txtPfName = document.getElementById('txt-pf-name');
  txtPfGame = document.getElementById('txt-pf-game');
  txtPfIp = document.getElementById('txt-pf-ip');
  txtPfPort = document.getElementById('txt-pf-port');

  if (btnAddPreflightServer) {
    btnAddPreflightServer.addEventListener('click', async () => {
      const name = txtPfName ? txtPfName.value.trim() : '';
      const game = txtPfGame ? txtPfGame.value.trim() : 'Custom Game';
      const ip = txtPfIp ? txtPfIp.value.trim() : '';
      const port = parseInt(txtPfPort ? txtPfPort.value : '27015', 10) || 27015;

      if (!name || !ip) {
        showToast('Please enter both server name and IP address', 'alert');
        return;
      }

      try {
        const res = await fetch('/api/preflight/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, game, ip, port })
        });
        const data = await res.json();
        showToast(`Added ${name} to Pre-flight Radar!`, 'success');
        playRadarBlip(1100);
        if (txtPfName) txtPfName.value = '';
        if (txtPfIp) txtPfIp.value = '';
        loadPreflightServers();
      } catch (e) {
        showToast('Failed to add server', 'alert');
      }
    });
  }

  loadPreflightServers();
  setInterval(loadPreflightServers, 4000);
}
