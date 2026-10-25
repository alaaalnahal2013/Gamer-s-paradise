/**
 * NAVIGATION MODULE • Sidebar View Routing, Breadcrumbs, & Screen Switcher
 * Provides 100% reliable click interception and dedicated screens for every perk.
 */

import { playRadarBlip } from './utils.js';

let currentActiveView = 'view-dashboard';

export const VIEW_TITLES = {
  'view-dashboard': 'Home',
  'view-radar': 'Tactical Ping Radar',
  'view-optimizer': 'Game Optimizer & Region Ladder',
  'view-diagnostics': 'Wi-Fi Diagnostics',
  'view-history': 'History & Analytics',
  'view-fleet': 'Server Fleet',
  'view-vpn': 'Gaming VPN & IP Shield',
  'view-audio': 'Audio Lock Daemon',
  'view-ram': 'RAM Process Freezer',
  'view-sniper': 'Lock & Port Sniper',
  'view-luminance': 'Luminance Guard',
  'view-ocr': 'Screen-Snip AI OCR',
  'view-screenshots': 'Smart Screenshot Indexer',
  'view-clipboard': 'Clean Paste Interceptor',
  'view-netdiag': '3-Point Net Diagnostic',
  'view-settings': 'Network Settings',
  // 8 New Gaming Suite Views
  'view-input-cage': 'Fullscreen Input Cage',
  'view-blackbox': 'Stutter Blackbox Flight Recorder',
  'view-shader-sweeper': 'Shader Cache Sweeper',
  'view-save-timemachine': 'Save-State Time Machine',
  'view-loadout-switcher': 'Instant Loadout Switcher',
  'view-sens-sync': 'Config & Sens Sync',
  'view-voice-ducking': 'Voice-Ducking Audio Mixer',
  'view-preflight-radar': 'Desktop Server Radar'
};

export function switchView(targetViewId, viewTitle) {
  if (!targetViewId) return;

  const resolvedTitle = viewTitle || VIEW_TITLES[targetViewId] || 'Tactical Radar';
  currentActiveView = targetViewId;

  // 1. Hide all view containers
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => {
    v.classList.remove('active');
  });

  // 2. Display the selected view container
  const targetView = document.getElementById(targetViewId);
  if (targetView) {
    targetView.classList.add('active');
  } else {
    console.warn(`[Navigation] Target view container #${targetViewId} not found.`);
  }

  // 3. Highlight corresponding sidebar navigation item
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 4. Update Topbar Breadcrumb Title
  const breadcrumb = document.getElementById('breadcrumb-title') || document.getElementById('breadcrumb-active-view');
  if (breadcrumb) {
    breadcrumb.textContent = resolvedTitle;
  }

  // 5. Close mobile navigation drawer if open
  const sidebar = document.getElementById('app-sidebar') || document.querySelector('.app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  // 6. Smoothly reset scroll position to top
  const scrollContainer = document.querySelector('.app-scrollable-content') || document.querySelector('.main-content-area');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  // 7. Fire resize event to redraw all tactical canvases at exact container bounds
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });

  console.log(`[Navigation] Navigated to screen: ${targetViewId} (${resolvedTitle})`);
}

export function getCurrentView() {
  return currentActiveView;
}

export function initNavigation() {
  console.log('[Navigation] Initializing navigation event delegation...');

  const sidebar = document.getElementById('app-sidebar') || document.querySelector('.app-sidebar') || document.querySelector('.nav-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  // 1. Global Click Delegator (Intercepts any element with data-view or data-navigate)
  document.addEventListener('click', (e) => {
    // If clicking a form control or canvas without navigation intent, let its native event fire
    const formControl = e.target.closest('input, textarea, select, canvas');
    if (formControl && !formControl.hasAttribute('data-view') && !formControl.hasAttribute('data-navigate')) {
      return;
    }

    const navEl = e.target.closest('[data-view], [data-navigate]');
    if (navEl) {
      e.preventDefault();
      const targetView = navEl.getAttribute('data-view') || navEl.getAttribute('data-navigate');
      if (targetView) {
        const titleSpan = navEl.querySelector('.nav-text') || navEl.querySelector('.nav-label');
        const title = VIEW_TITLES[targetView] || (titleSpan ? titleSpan.textContent.trim() : navEl.getAttribute('title') || 'Gamer\'s Paradise');
        switchView(targetView, title);
        playRadarBlip(1050, 0.03);
        return;
      }
    }

    // Topbar breadcrumb click -> Go Home
    const breadcrumbEl = e.target.closest('.breadcrumb');
    if (breadcrumbEl) {
      switchView('view-dashboard', 'Home');
      playRadarBlip(1050, 0.03);
      return;
    }
  });

  // 2. Mobile drawer hamburger button toggle
  const btnMobileMenu = document.getElementById('btn-mobile-menu');
  if (btnMobileMenu && sidebar) {
    btnMobileMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active', isOpen);
      playRadarBlip(900, 0.02);
    });
  }

  // 3. Mobile backdrop click to close
  if (backdrop && sidebar) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  // 4. Escape key closes mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    }
  });

  // 5. Desktop sidebar collapse toggle
  const btnSidebarCollapse = document.getElementById('btn-toggle-sidebar') || document.getElementById('btn-sidebar-collapse');
  if (btnSidebarCollapse && sidebar) {
    btnSidebarCollapse.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
      playRadarBlip(800, 0.02);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
    });
  }

  // 6. Direct Topbar Shortcuts
  const topbarVpn = document.getElementById('btn-topbar-vpn');
  if (topbarVpn) {
    topbarVpn.style.cursor = 'pointer';
    topbarVpn.addEventListener('click', () => {
      switchView('view-vpn', 'Gaming VPN & IP Shield');
      playRadarBlip(950);
    });
  }

  const topbarAudio = document.getElementById('btn-topbar-audio');
  if (topbarAudio) {
    topbarAudio.style.cursor = 'pointer';
    topbarAudio.addEventListener('click', () => {
      switchView('view-audio', 'Audio Lock Daemon');
      playRadarBlip(950);
    });
  }

  const topbarRam = document.getElementById('btn-topbar-ram');
  if (topbarRam) {
    topbarRam.style.cursor = 'pointer';
    topbarRam.addEventListener('click', () => {
      switchView('view-ram', 'RAM Process Freezer');
      playRadarBlip(950);
    });
  }

  const topbarClip = document.getElementById('btn-topbar-clip');
  if (topbarClip) {
    topbarClip.style.cursor = 'pointer';
    topbarClip.addEventListener('click', () => {
      switchView('view-clipboard', 'Clean Paste Interceptor');
      playRadarBlip(950);
    });
  }

  const topbarAlerts = document.getElementById('btn-topbar-alerts');
  if (topbarAlerts) {
    topbarAlerts.style.cursor = 'pointer';
    topbarAlerts.addEventListener('click', () => {
      switchView('view-history', 'History & Analytics');
      playRadarBlip(950);
    });
  }

  const topbarFlame = document.querySelector('.flame-pill');
  if (topbarFlame) {
    topbarFlame.style.cursor = 'pointer';
    topbarFlame.addEventListener('click', () => {
      switchView('view-netdiag', '3-Point Net Diagnostic');
      playRadarBlip(950);
    });
  }

  const topbarRate = document.querySelector('.topbar-icon-pill[title*="Interval"]');
  if (topbarRate) {
    topbarRate.style.cursor = 'pointer';
    topbarRate.addEventListener('click', () => {
      switchView('view-settings', 'Network Settings');
      playRadarBlip(950);
    });
  }

  // 7. Home Dashboard Stat Card Direct Clicks
  const cardStatRegion = document.getElementById('card-stat-region');
  if (cardStatRegion) {
    cardStatRegion.addEventListener('click', () => switchView('view-optimizer', 'Game Optimizer'));
  }

  const cardStatWifi = document.getElementById('card-stat-wifi');
  if (cardStatWifi) {
    cardStatWifi.addEventListener('click', () => switchView('view-diagnostics', 'Wi-Fi Diagnostics'));
  }

  const cardStatPipeline = document.getElementById('card-stat-pipeline');
  if (cardStatPipeline) {
    cardStatPipeline.addEventListener('click', () => switchView('view-netdiag', '3-Point Net Diagnostic'));
  }

  const btnDashScan = document.getElementById('btn-dash-scan-regions');
  if (btnDashScan) {
    btnDashScan.addEventListener('click', () => switchView('view-optimizer', 'Game Optimizer'));
  }

  const btnDashDiag = document.getElementById('btn-dash-view-diagnostics');
  if (btnDashDiag) {
    btnDashDiag.addEventListener('click', () => switchView('view-diagnostics', 'Wi-Fi Diagnostics'));
  }

  console.log('[Navigation] Navigation handlers wired successfully.');
}
