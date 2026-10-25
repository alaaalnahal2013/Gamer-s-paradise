/**
 * GAMING VPN MODULE • Built-in IP Cloaking Shield & Country Datacenter Relay Controller
 * Isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let vpnState = {
  enabled: false,
  country_code: 'de',
  country_name: 'Germany',
  city: 'Frankfurt',
  flag: '🇩🇪',
  original_ip: 'Detecting...',
  masked_ip: '--',
  kill_switch: true,
  system_proxy: false
};

let vpnCountriesList = [];

// DOM Element References
let btnTopbarVpn, topbarVpnText;
let vhcShieldEmblem, vhcStatusTitle, vhcStatusBadge, vhcDescText;
let vpnStatOrigIp, vpnStatMaskedIp, vpnStatRelay;
let btnVpnMainToggle, vpnToggleBtnText, chkVpnKillswitch, chkVpnSystemProxy;
let vpnCountriesGrid, vpnCmdCode, btnCopyVpnCmd;

export async function loadVpnStatus() {
  try {
    const res = await fetch('/api/vpn/status');
    const data = await res.json();
    updateVpnUI(data);
  } catch (e) {
    console.error('Failed to load VPN status:', e);
  }
}

export async function loadVpnCountries() {
  try {
    const res = await fetch('/api/vpn/countries');
    const data = await res.json();
    vpnCountriesList = data.countries || [];
    renderVpnCountryGrid(vpnCountriesList, data.active, data.enabled);
  } catch (e) {
    console.error('Failed to load VPN countries:', e);
  }
}

export function renderVpnCountryGrid(countries, activeCode, isEnabled) {
  if (!vpnCountriesGrid) return;
  vpnCountriesGrid.innerHTML = countries.map(c => {
    const isThisActive = isEnabled && (c.code.toLowerCase() === (activeCode || '').toLowerCase());
    return `
      <div class="vpn-country-card ${isThisActive ? 'active-node' : ''}" data-country="${c.code}">
        <div class="vcc-top">
          <div class="vcc-flag-title">
            <span class="vcc-flag">${c.flag}</span>
            <div>
              <div class="vcc-country-name">${escapeHtml(c.name)}</div>
              <div class="vcc-city-name">${escapeHtml(c.city)}</div>
            </div>
          </div>
          <span class="vcc-latency-badge ${c.ping_est < 45 ? 'fast' : ''}">${c.ping_est} ms</span>
        </div>
        <div class="vcc-meta">
          <div class="vcc-ip-row">
            <span>Relay Exit IP:</span>
            <span class="vcc-ip-val">${c.masked_ip}</span>
          </div>
          <div class="vcc-rec-row">Recommended for: ${escapeHtml(c.recommended_for)}</div>
        </div>
        <button class="btn-node-connect ${isThisActive ? 'btn-node-active' : ''}">
          ${isThisActive ? '⚡ ACTIVE RELAY NODE' : 'SELECT &amp; ROUTE'}
        </button>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  vpnCountriesGrid.querySelectorAll('.vpn-country-card').forEach(card => {
    const code = card.getAttribute('data-country');
    const btn = card.querySelector('.btn-node-connect');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        connectVpn(code);
      });
    }
    card.addEventListener('click', () => {
      connectVpn(code);
    });
  });
}

export async function connectVpn(countryCode) {
  try {
    showToast(`Routing game traffic through ${countryCode.toUpperCase()} relay node...`, 'info');
    const res = await fetch('/api/vpn/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_code: countryCode })
    });
    const data = await res.json();
    updateVpnUI(data);
    renderVpnCountryGrid(vpnCountriesList, data.country_code, true);
    showToast(`IP Cloaking Active! Masked IP: ${data.masked_ip} (${data.country_name})`, 'success');
    playRadarBlip(1200);
  } catch (e) {
    showToast('Failed to connect to Gaming VPN node', 'alert');
  }
}

export async function disconnectVpn() {
  try {
    showToast('Restoring direct ISP route and public IP...', 'info');
    const res = await fetch('/api/vpn/disconnect', { method: 'POST' });
    const data = await res.json();
    updateVpnUI(data);
    renderVpnCountryGrid(vpnCountriesList, data.country_code, false);
    showToast('IP Shield Disconnected. Direct origin IP restored.', 'info');
    playRadarBlip(900);
  } catch (e) {
    showToast('Failed to disconnect Gaming VPN', 'alert');
  }
}

export function updateVpnUI(vpn) {
  if (!vpn) return;
  vpnState = vpn;
  const isShielded = !!vpn.enabled;

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

export function initVpnModule() {
  btnTopbarVpn = document.getElementById('btn-topbar-vpn');
  topbarVpnText = document.getElementById('topbar-vpn-text');
  vhcShieldEmblem = document.getElementById('vhc-shield-emblem');
  vhcStatusTitle = document.getElementById('vhc-status-title');
  vhcStatusBadge = document.getElementById('vhc-status-badge');
  vhcDescText = document.getElementById('vhc-desc-text');
  vpnStatOrigIp = document.getElementById('vpn-stat-orig-ip');
  vpnStatMaskedIp = document.getElementById('vpn-stat-masked-ip');
  vpnStatRelay = document.getElementById('vpn-stat-relay');
  btnVpnMainToggle = document.getElementById('btn-vpn-main-toggle');
  vpnToggleBtnText = document.getElementById('vpn-toggle-btn-text');
  chkVpnKillswitch = document.getElementById('chk-vpn-killswitch');
  chkVpnSystemProxy = document.getElementById('chk-vpn-system-proxy');
  vpnCountriesGrid = document.getElementById('vpn-countries-grid');
  vpnCmdCode = document.getElementById('vpn-cmd-code');
  btnCopyVpnCmd = document.getElementById('btn-copy-vpn-cmd');

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

  if (chkVpnSystemProxy) {
    chkVpnSystemProxy.addEventListener('change', async (e) => {
      try {
        await fetch('/api/vpn/toggle_system_proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: e.target.checked })
        });
        showToast(`Windows System Proxy Routing ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
      } catch (err) {}
    });
  }

  loadVpnCountries();
  loadVpnStatus();
}
