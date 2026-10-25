/**
 * CLIPBOARD MODULE • Clean Paste Interceptor Controller
 * Strips URL tracking parameters (utm_source, gclid), heals broken PDF line-wraps,
 * and purges messy HTML styles.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip } from './utils.js';

let clipboardStatus = null;

// DOM Elements
let chkClipboardCleaner, btnCleanClipboardHero, btnCleanClipboardNow;
let clipTrackersPurged, clipPdfHealed, clipStylesStripped;
let clipTestInput, clipTestOutput, btnTestClipboardClean;

export async function loadClipboardStatus() {
  try {
    const res = await fetch('/api/clipboard/status');
    const data = await res.json();
    clipboardStatus = data;
    renderClipboardUI(data);
  } catch (e) {
    console.error('Failed to load clipboard status', e);
  }
}

export function renderClipboardUI(data) {
  if (!data) return;

  if (chkClipboardCleaner) {
    chkClipboardCleaner.checked = !!data.running;
  }

  if (clipTrackersPurged) {
    clipTrackersPurged.textContent = data.trackers_purged || 0;
  }

  if (clipPdfHealed) {
    clipPdfHealed.textContent = data.pdf_wraps_healed || 0;
  }

  if (clipStylesStripped) {
    clipStylesStripped.textContent = data.styles_stripped || 0;
  }
}

export async function toggleClipboardCleaner(enable) {
  try {
    const res = await fetch('/api/clipboard/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable })
    });
    const data = await res.json();
    renderClipboardUI(data);
    showToast(`Clean Paste Interceptor: ${enable ? 'ACTIVE' : 'STANDBY'}`, enable ? 'success' : 'info');
    playRadarBlip(1000);
  } catch (e) {
    showToast('Failed to toggle Clipboard Cleaner', 'alert');
  }
}

export async function cleanCurrentClipboard() {
  try {
    showToast('Sanitizing Windows clipboard...', 'info');
    const res = await fetch('/api/clipboard/clean_now', { method: 'POST' });
    const data = await res.json();

    if (data.details && data.details.was_modified) {
      const reasons = [];
      if (data.details.trackers_removed > 0) reasons.push(`${data.details.trackers_removed} tracking tags purged`);
      if (data.details.pdf_healed) reasons.push('PDF line breaks healed');
      showToast(`Clipboard Cleaned: ${reasons.join(', ')}!`, 'success');
    } else {
      showToast('Clipboard was already 100% clean plain text!', 'info');
    }
    playRadarBlip(1150);
    loadClipboardStatus();
  } catch (e) {
    showToast('Failed to clean clipboard', 'alert');
  }
}

export function testCleaner(inputText) {
  if (!inputText) return;
  // Local preview cleaner regex matching backend rules
  let cleaned = inputText;

  // 1. Remove URL tracking parameters
  try {
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, (url) => {
      try {
        const u = new URL(url);
        const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'mc_eid', 'igshid', '_ga'];
        trackingKeys.forEach(k => u.searchParams.delete(k));
        return u.toString();
      } catch (err) {
        return url;
      }
    });
  } catch (e) {}

  // 2. Heal broken PDF line breaks
  cleaned = cleaned.replace(/([a-zA-Z0-9,;])\r?\n([a-zA-Z0-9])/g, '$1 $2');

  if (clipTestOutput) {
    clipTestOutput.value = cleaned;
  }
  showToast('Test sanitization applied!', 'success');
  playRadarBlip(1100);
}

export function initClipboardModule() {
  chkClipboardCleaner = document.getElementById('chk-clipboard-cleaner');
  btnCleanClipboardHero = document.getElementById('btn-clean-clipboard-hero');
  btnCleanClipboardNow = document.getElementById('btn-clean-clipboard-now');
  clipTrackersPurged = document.getElementById('clip-trackers-purged');
  clipPdfHealed = document.getElementById('clip-pdf-healed');
  clipStylesStripped = document.getElementById('clip-styles-stripped');
  clipTestInput = document.getElementById('clip-test-input');
  clipTestOutput = document.getElementById('clip-test-output');
  btnTestClipboardClean = document.getElementById('btn-test-clipboard-clean');

  if (chkClipboardCleaner) {
    chkClipboardCleaner.addEventListener('change', (e) => {
      toggleClipboardCleaner(e.target.checked);
    });
  }

  if (btnCleanClipboardHero) {
    btnCleanClipboardHero.addEventListener('click', cleanCurrentClipboard);
  }

  if (btnCleanClipboardNow) {
    btnCleanClipboardNow.addEventListener('click', cleanCurrentClipboard);
  }

  if (btnTestClipboardClean && clipTestInput) {
    btnTestClipboardClean.addEventListener('click', () => {
      testCleaner(clipTestInput.value);
    });
  }

  loadClipboardStatus();
}
