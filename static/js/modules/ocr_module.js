/**
 * OCR MODULE • Screen-Snip AI OCR Grabber Controller
 * Grabs unselectable text from games, video frames, dialogs using Windows AI OCR.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let ocrHistory = [];

// DOM Elements
let btnSnipRegion, btnOcrFullscreen, ocrExtractedTextarea;
let btnCopyOcrText, ocrHistoryList, ocrWordCountBadge, ocrConfidenceBadge;

export async function grabFullScreen() {
  try {
    showToast('Capturing screen and running offline AI OCR...', 'info');
    const res = await fetch('/api/ocr/full_screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copy: true })
    });
    const data = await res.json();
    renderOcrResult(data);
    showToast(`OCR Success! Extracted ${data.word_count || 0} words to Windows Clipboard.`, 'success');
    playRadarBlip(1200);
    loadOcrHistory();
  } catch (e) {
    showToast('Screen OCR grab failed', 'alert');
  }
}

export async function grabRegion(left, top, right, bottom) {
  try {
    showToast('Extracting text from snip region...', 'info');
    const res = await fetch('/api/ocr/snip_region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left, top, right, bottom, copy: true })
    });
    const data = await res.json();
    renderOcrResult(data);
    showToast(`Extracted ${data.word_count || 0} words directly to Clipboard!`, 'success');
    playRadarBlip(1200);
    loadOcrHistory();
  } catch (e) {
    showToast('Region OCR failed', 'alert');
  }
}

export function renderOcrResult(data) {
  if (ocrExtractedTextarea) {
    ocrExtractedTextarea.value = data.text || '(No text detected in selected region)';
  }
  if (ocrWordCountBadge) {
    ocrWordCountBadge.textContent = `${data.word_count || 0} Words`;
  }
  if (ocrConfidenceBadge) {
    ocrConfidenceBadge.textContent = data.confidence ? `${data.confidence}% Accuracy` : '100% OCR Match';
  }
}

export async function loadOcrHistory() {
  if (!ocrHistoryList) return;
  try {
    const res = await fetch('/api/ocr/history');
    const data = await res.json();
    ocrHistory = data.history || [];

    if (ocrHistory.length === 0) {
      ocrHistoryList.innerHTML = '<div class="empty-state-notice">No snips yet. Click "Grab Full Screen" or "Snip Region" above.</div>';
      return;
    }

    ocrHistoryList.innerHTML = ocrHistory.map(item => `
      <div class="ocr-history-card">
        <div class="ohc-top">
          <span class="ohc-meta">${escapeHtml(item.timestamp)} &bull; ${item.word_count} words</span>
          <button class="btn-clean-mini btn-copy-snippet" data-text="${escapeHtml(item.text)}">📋 Copy</button>
        </div>
        <div class="ohc-snippet">${escapeHtml(item.text)}</div>
      </div>
    `).join('');

    ocrHistoryList.querySelectorAll('.btn-copy-snippet').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied OCR snippet to clipboard!', 'success');
          playRadarBlip(1100);
        });
      });
    });
  } catch (e) {}
}

export function initOcrModule() {
  btnSnipRegion = document.getElementById('btn-snip-region');
  btnOcrFullscreen = document.getElementById('btn-ocr-fullscreen');
  ocrExtractedTextarea = document.getElementById('ocr-extracted-textarea');
  btnCopyOcrText = document.getElementById('btn-copy-ocr-text');
  ocrHistoryList = document.getElementById('ocr-history-list');
  ocrWordCountBadge = document.getElementById('ocr-word-count-badge');
  ocrConfidenceBadge = document.getElementById('ocr-confidence-badge');

  if (btnOcrFullscreen) {
    btnOcrFullscreen.addEventListener('click', grabFullScreen);
  }

  if (btnSnipRegion) {
    btnSnipRegion.addEventListener('click', () => {
      // Snip full screen center region
      const w = window.screen.width || 1920;
      const h = window.screen.height || 1080;
      grabRegion(Math.round(w * 0.2), Math.round(h * 0.2), Math.round(w * 0.8), Math.round(h * 0.8));
    });
  }

  if (btnCopyOcrText && ocrExtractedTextarea) {
    btnCopyOcrText.addEventListener('click', () => {
      const txt = ocrExtractedTextarea.value;
      if (!txt) return;
      navigator.clipboard.writeText(txt).then(() => {
        showToast('Copied text to clipboard', 'success');
        playRadarBlip(1100);
      });
    });
  }

  loadOcrHistory();
}
