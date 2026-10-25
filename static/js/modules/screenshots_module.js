/**
 * SCREENSHOTS MODULE • Smart Screenshot Indexer Controller
 * Instant SQLite full-text search across all saved screenshots, game scoreboards, and receipts.
 * Completely isolated from other modules.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let currentCategoryFilter = '';
let searchDebounceTimer = null;

// DOM Elements
let inputScreenshotSearch, btnScanScreenshots, screenshotsIndexedCount, screenshotsWatchStatus;
let screenshotsGalleryGrid, categoryPills;

export async function searchScreenshots(query = '', category = '') {
  try {
    const url = `/api/screenshots/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`;
    const res = await fetch(url);
    const data = await res.json();
    renderScreenshotsGrid(data.results || []);
    if (screenshotsIndexedCount) {
      screenshotsIndexedCount.textContent = `${data.count || 0} Indexed`;
    }
  } catch (e) {
    console.error('Failed to search screenshots', e);
  }
}

export function renderScreenshotsGrid(items) {
  if (!screenshotsGalleryGrid) return;

  if (items.length === 0) {
    screenshotsGalleryGrid.innerHTML = `
      <div class="empty-state-notice" style="grid-column: 1 / -1;">
        No screenshots matched your search query. Try clicking "Scan Watch Folder" or search for "receipt", "wifi", or "error".
      </div>
    `;
    return;
  }

  screenshotsGalleryGrid.innerHTML = items.map(item => `
    <div class="screenshot-card">
      <div class="sc-meta">
        <span class="sc-category-tag">${escapeHtml(item.category || 'General')}</span>
        <span class="sc-time">${escapeHtml(item.created_at || '')}</span>
      </div>
      <div class="sc-title">${escapeHtml(item.smart_title || item.original_filename)}</div>
      <div class="sc-snippet">
        ${escapeHtml(item.ocr_text || '(No text indexed)')}
      </div>
      <div class="sc-foot">
        <span class="sc-path" title="${escapeHtml(item.file_path)}">${escapeHtml(item.original_filename)}</span>
        <button class="btn-clean-mini btn-rename-shot" data-id="${item.id}">
          ✨ Smart Rename
        </button>
      </div>
    </div>
  `).join('');

  screenshotsGalleryGrid.querySelectorAll('.btn-rename-shot').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      await smartRenameScreenshot(id);
    });
  });
}

export async function smartRenameScreenshot(itemId) {
  try {
    showToast('Applying AI descriptive filename...', 'info');
    const res = await fetch(`/api/screenshots/rename/${itemId}`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast(`Renamed to: ${data.new_filename}`, 'success');
      playRadarBlip(1200);
      searchScreenshots(inputScreenshotSearch ? inputScreenshotSearch.value : '', currentCategoryFilter);
    } else {
      showToast(`Rename failed: ${data.message}`, 'alert');
    }
  } catch (e) {
    showToast('Smart rename failed', 'alert');
  }
}

export async function scanWatchFolder() {
  try {
    showToast('Scanning Pictures/Screenshots directory for new images...', 'info');
    const res = await fetch('/api/screenshots/scan_all', { method: 'POST' });
    const data = await res.json();
    showToast(`Scan complete: ${data.indexed_count} screenshots indexed!`, 'success');
    playRadarBlip(1100);
    searchScreenshots('', currentCategoryFilter);
  } catch (e) {
    showToast('Folder scan failed', 'alert');
  }
}

export function initScreenshotsModule() {
  inputScreenshotSearch = document.getElementById('input-screenshot-search');
  btnScanScreenshots = document.getElementById('btn-scan-screenshots');
  screenshotsIndexedCount = document.getElementById('screenshots-indexed-count');
  screenshotsWatchStatus = document.getElementById('screenshots-watch-status');
  screenshotsGalleryGrid = document.getElementById('screenshots-gallery-grid');
  categoryPills = document.querySelectorAll('.category-filter-pill');

  if (inputScreenshotSearch) {
    inputScreenshotSearch.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchScreenshots(e.target.value.trim(), currentCategoryFilter);
      }, 300);
    });
  }

  if (categoryPills) {
    categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        categoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategoryFilter = pill.getAttribute('data-cat') || '';
        searchScreenshots(inputScreenshotSearch ? inputScreenshotSearch.value.trim() : '', currentCategoryFilter);
        playRadarBlip(950);
      });
    });
  }

  if (btnScanScreenshots) {
    btnScanScreenshots.addEventListener('click', scanWatchFolder);
  }

  searchScreenshots();
}
