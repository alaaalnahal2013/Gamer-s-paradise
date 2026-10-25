/**
 * GAMER'S PARADISE • MAIN APPLICATION ENTRY POINT v3.1
 * - First-time setup modal with localStorage name persistence
 * - Real IP scan + geo-based VPN region recommendation on startup
 * - All 19 modular features initialized
 */

import { initNavigation, switchView } from './modules/navigation.js';
import { initRadarCore, onTelemetryUpdate } from './modules/radar_core.js';
import { initVpnModule, updateVpnUI, loadVpnCountries } from './modules/vpn_module.js';
import { initAudioModule } from './modules/audio_module.js';
import { initRamModule } from './modules/ram_module.js';
import { initSniperModule } from './modules/sniper_module.js';
import { initLuminanceModule } from './modules/luminance_module.js';
import { initOcrModule } from './modules/ocr_module.js';
import { initScreenshotsModule } from './modules/screenshots_module.js';
import { initClipboardModule } from './modules/clipboard_module.js';
import { initNetDiagModule, updateNetDiagUI } from './modules/netdiag_module.js';

// 8 New Gaming Suite Modules
import { initInputCageModule } from './modules/input_cage_module.js';
import { initBlackboxModule } from './modules/blackbox_module.js';
import { initShaderModule } from './modules/shader_module.js';
import { initSaveModule } from './modules/save_module.js';
import { initLoadoutModule } from './modules/loadout_module.js';
import { initSensModule } from './modules/sens_module.js';
import { initVoiceDuckingModule } from './modules/voice_ducking_module.js';
import { initPreflightModule } from './modules/preflight_module.js';

// Expose switchView globally for reliability
window.switchView = switchView;

// ─────────────────────────────────────────────
// USER PROFILE PERSISTENCE  (localStorage)
// ─────────────────────────────────────────────
const LS_NAME_KEY = 'gp_user_name';
const LS_SETUP_DONE = 'gp_setup_done';

function getStoredName() {
  return localStorage.getItem(LS_NAME_KEY) || '';
}

function setStoredName(name) {
  localStorage.setItem(LS_NAME_KEY, name.trim());
  localStorage.setItem(LS_SETUP_DONE, '1');
}

function isSetupDone() {
  return !!localStorage.getItem(LS_SETUP_DONE);
}

function applyUserName(name) {
  const displayName = name || 'Gamer';
  const initials = displayName.slice(0, 2).toUpperCase();

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = displayName;

  const sidebarName = document.getElementById('sidebar-account-name');
  if (sidebarName) sidebarName.textContent = displayName;

  const avatarEl = document.getElementById('sidebar-avatar-initials');
  if (avatarEl) avatarEl.textContent = initials;
}

// ─────────────────────────────────────────────
// IP SCAN + VPN RECOMMENDATION
// ─────────────────────────────────────────────
let scannedIpData = null;

async function scanAndApplyIpInfo(statusEl, statusTextEl) {
  try {
    const res = await fetch('/api/my-ip-info');
    const data = await res.json();
    scannedIpData = data;

    // Update sidebar IP display
    const sidebarIp = document.getElementById('sidebar-user-ip');
    if (sidebarIp) {
      sidebarIp.textContent = data.public_ip !== 'Unknown' ? data.public_ip : 'Local LAN';
    }

    // Update VPN IP scan banner in VPN view
    const vpnScanBanner = document.getElementById('vpn-ip-scan-banner');
    if (vpnScanBanner) {
      vpnScanBanner.innerHTML = `
        <span class="vpn-ipscan-icon">🌍</span>
        <div class="vpn-ipscan-meta">
          <div class="vpn-ipscan-title">Your Real Public IP</div>
          <div class="vpn-ipscan-detail">${data.public_ip} &bull; ${data.city}, ${data.country_name} &bull; ${data.isp}</div>
        </div>
        <span class="vpn-ipscan-badge">Best Node: ${(data.best_node || 'de').toUpperCase()}</span>
      `;
    }

    // Update modal status
    if (statusEl && statusTextEl) {
      statusEl.classList.add('success');
      statusTextEl.textContent = `✅ IP: ${data.public_ip} · ${data.city}, ${data.country_name} · Best VPN: ${(data.best_node || 'de').toUpperCase()}`;
      const spinner = statusEl.querySelector('.setup-ip-spinner');
      if (spinner) spinner.textContent = '✅';
    }

    return data;
  } catch (e) {
    console.warn('[Setup] IP scan failed (offline):', e);
    if (statusEl && statusTextEl) {
      statusEl.classList.add('error');
      statusTextEl.textContent = '⚠️ Network scan failed — you can still use all features offline.';
      const spinner = statusEl.querySelector('.setup-ip-spinner');
      if (spinner) spinner.textContent = '⚠️';
    }
    return null;
  }
}

// ─────────────────────────────────────────────
// FIRST-TIME SETUP MODAL
// ─────────────────────────────────────────────
function showSetupModal() {
  const overlay = document.getElementById('setup-modal-overlay');
  const nameInput = document.getElementById('setup-name-input');
  const submitBtn = document.getElementById('setup-submit-btn');
  const ipStatusEl = document.getElementById('setup-ip-status');
  const ipTextEl = document.getElementById('setup-ip-text');

  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  overlay.style.animation = 'fadeInOverlay 0.3s ease forwards';

  // Kick off IP scan in parallel
  scanAndApplyIpInfo(ipStatusEl, ipTextEl);

  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 100);

    nameInput.addEventListener('input', () => {
      const valid = nameInput.value.trim().length >= 2;
      if (submitBtn) submitBtn.disabled = !valid;
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const valid = nameInput.value.trim().length >= 2;
        if (valid && submitBtn) submitBtn.click();
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name || name.length < 2) return;
      setStoredName(name);
      applyUserName(name);

      // Animate out and hide cleanly
      overlay.style.animation = 'fadeOutOverlay 0.3s ease forwards';
      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }, 300);
    });
  }
}

// ─────────────────────────────────────────────
// MODULE BOOTSTRAP
// ─────────────────────────────────────────────
function bootModules() {
  console.log('[Gamer\'s Paradise] Bootstrapping all modules...');

  const modules = [
    ['Navigation & Layout', initNavigation],
    ['Radar Engine', initRadarCore],
    ['Gaming VPN', initVpnModule],
    ['Audio Daemon', initAudioModule],
    ['RAM Freezer', initRamModule],
    ['Port Sniper', initSniperModule],
    ['Luminance Guard', initLuminanceModule],
    ['Screen OCR', initOcrModule],
    ['Screenshot Indexer', initScreenshotsModule],
    ['Clean Clipboard', initClipboardModule],
    ['Net Diagnostics', initNetDiagModule],
    // 8 New Modules
    ['Input Cage', initInputCageModule],
    ['Stutter Blackbox', initBlackboxModule],
    ['Shader Sweeper', initShaderModule],
    ['Save Time Machine', initSaveModule],
    ['Loadout Switcher', initLoadoutModule],
    ['Sens Sync', initSensModule],
    ['Voice Ducking', initVoiceDuckingModule],
    ['Preflight Radar', initPreflightModule]
  ];

  for (const [name, initFn] of modules) {
    try {
      initFn();
      console.log(`[Gamer's Paradise] ✓ ${name} initialized`);
    } catch (err) {
      console.error(`[Gamer's Paradise] ✗ Failed initializing ${name}:`, err);
    }
  }

  // Real-time Telemetry Dispatcher
  try {
    onTelemetryUpdate((data) => {
      if (data.vpn) updateVpnUI(data.vpn);
      if (data.net_diag) updateNetDiagUI(data.net_diag);
    });
  } catch (err) {
    console.error('[Gamer\'s Paradise] ✗ Telemetry dispatcher failed:', err);
  }

  // Apply stored name after modules init (in case navigation re-renders)
  applyUserName(getStoredName());

  // Run background IP scan to update sidebar IP and VPN banner 
  // (runs even on returning visits, no modal)
  scanAndApplyIpInfo(null, null);

  console.log('[Gamer\'s Paradise] All 19 modules ready. Interactive UI active.');
}

// ─────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────
function boot() {
  console.log('[Gamer\'s Paradise] App starting (readyState: ' + document.readyState + ')...');

  // 1. Boot all 19 modules immediately so navigation, perks, buttons are interactive
  bootModules();

  // 2. Check if user profile is already configured
  const stored = getStoredName();
  if (stored) {
    applyUserName(stored);
  }

  // 3. If first-time user, display the setup modal overlay to prompt for name
  if (!isSetupDone()) {
    showSetupModal();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
