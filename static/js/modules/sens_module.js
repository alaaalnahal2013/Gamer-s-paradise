/**
 * CONFIG & SENS SYNC MODULE
 * Physical cm/360 Yaw Mathematics and Unified Aim Sensitivity Synchronization.
 */

import { showToast, playRadarBlip, escapeHtml } from './utils.js';

let numDpi, selSensSourceGame, numSensitivity, btnCalcSens;
let sensCm360, sensIn360, sensEdpi, sensCategory, sensCategoryDesc;
let sensConversionGrid;

export async function calculateSens() {
  const dpi = parseInt(numDpi ? numDpi.value : '800', 10) || 800;
  const sourceGame = selSensSourceGame ? selSensSourceGame.value : 'cs2';
  const sens = parseFloat(numSensitivity ? numSensitivity.value : '1.25') || 1.25;

  try {
    const res = await fetch('/api/sens/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dpi, source_game_id: sourceGame, sensitivity: sens })
    });
    const data = await res.json();
    renderSensResults(data);
  } catch (e) {
    console.error('Failed to calculate sensitivity conversion:', e);
  }
}

export function renderSensResults(data) {
  const m = data.physical_metrics;
  if (sensCm360) sensCm360.textContent = `${m.cm_per_360} cm`;
  if (sensIn360) sensIn360.textContent = `${m.inches_per_360}"`;
  if (sensEdpi) sensEdpi.textContent = m.edpi;
  if (sensCategory) sensCategory.textContent = m.category;
  if (sensCategoryDesc) sensCategoryDesc.textContent = m.description;

  if (sensConversionGrid && data.converted_games) {
    sensConversionGrid.innerHTML = data.converted_games.map(g => `
      <div class="sens-game-card ${g.is_source ? 'source-game-card' : ''}">
        <div class="sg-header">
          <span class="sg-name">${escapeHtml(g.name)}</span>
          <span class="sg-badge">${g.is_source ? 'SOURCE ENGINE' : 'CONVERTED'}</span>
        </div>
        <div class="sg-val-wrap">
          <strong class="sg-val">${g.sensitivity}</strong>
          <span class="sg-edpi">${g.edpi} eDPI</span>
        </div>
        <div class="sg-cmd-pill" data-cmd="${escapeHtml(g.command)}" title="Click to copy command">
          <code>${escapeHtml(g.command)}</code>
          <span class="copy-glyph">📋</span>
        </div>
      </div>
    `).join('');

    sensConversionGrid.querySelectorAll('.sg-cmd-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cmd = pill.getAttribute('data-cmd');
        navigator.clipboard.writeText(cmd).then(() => {
          showToast(`Copied setting: ${cmd}`, 'success');
          playRadarBlip(1100);
        });
      });
    });
  }
}

export function initSensModule() {
  numDpi = document.getElementById('num-dpi');
  selSensSourceGame = document.getElementById('sel-sens-source-game');
  numSensitivity = document.getElementById('num-sensitivity');
  btnCalcSens = document.getElementById('btn-calc-sens');
  sensCm360 = document.getElementById('sens-cm-360');
  sensIn360 = document.getElementById('sens-in-360');
  sensEdpi = document.getElementById('sens-edpi');
  sensCategory = document.getElementById('sens-category');
  sensCategoryDesc = document.getElementById('sens-category-desc');
  sensConversionGrid = document.getElementById('sens-conversion-grid');

  if (btnCalcSens) {
    btnCalcSens.addEventListener('click', () => {
      calculateSens();
      playRadarBlip(950);
    });
  }

  [numDpi, selSensSourceGame, numSensitivity].forEach(el => {
    if (el) el.addEventListener('input', calculateSens);
  });

  calculateSens();
}
