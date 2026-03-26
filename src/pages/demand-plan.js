// ─── DEMAND PLAN ──────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1411–1451)

import { DATA_DP, PROMO_WKS, isOnPromo } from '../data/index.js';
import { fmt, sf } from '../utils/formatters.js';
import { fillSel } from '../utils/dom.js';

// ─── Module-level state ─────────────────────────────────────────────
let _dpU = 'units', _dpS = 'base';

export function dpUnit(u, btn) {
  _dpU = u;
  document.querySelectorAll('#dp-ut .btn').forEach(b => b.classList.toggle('on', b === btn));
  renderDP();
}

export function dpScen(s, btn) {
  _dpS = s;
  document.querySelectorAll('#dp-sc .btn').forEach(b => b.classList.toggle('on', b === btn));
  renderDP();
}

export function initDP() {
  fillSel('dp-cat', DATA_DP.skus.map(s => s.category));
  renderDP();
}

export function renderDP() {
  const cat = document.getElementById('dp-cat').value;
  const q = (document.getElementById('dp-q').value || '').toLowerCase();
  const mult = { bear: .80, base: 1, bull: 1.20 }[_dpS];
  let skus = DATA_DP.skus.filter(s => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q) || (s.dpci || '').includes(q)));
  const hWks = DATA_DP.hist_weeks, fWks = DATA_DP.fcast_weeks.slice(0, 13);
  let h = '<thead><tr>';
  h += `<th class="st" style="min-width:170px">SKU</th><th style="min-width:60px">Stores</th>`;
  hWks.forEach(w => h += `<th style="min-width:70px">${w}</th>`);
  h += `<th class="dp-div"></th>`;
  fWks.forEach((w, i) => h += `<th style="min-width:70px;background:rgba(0,227,205,.07)">${w}</th>`);
  h += '</tr></thead><tbody>';
  const hTot = hWks.map((_, i) => skus.reduce((a, s) => a + sf(s.hist[i]), 0));
  const fTot = fWks.map((_, i) => skus.reduce((a, s) => a + sf(s.fcast[i]) * mult, 0));
  h += `<tr style="background:var(--s3);font-weight:700"><td class="st" style="background:var(--s3)">TOTAL (${skus.length})</td><td></td>`;
  hTot.forEach(v => h += `<td class="tr">${fmt(_dpU === 'units' ? v : Math.round(v / 12))}</td>`);
  h += `<td class="dp-div"></td>`;
  fTot.forEach((v, i) => { const isP = PROMO_WKS.has(i + 1); h += `<td class="tr" style="${isP ? 'background:rgba(245,158,11,.1)' : 'background:rgba(0,227,205,.05)'}">${fmt(_dpU === 'units' ? v : Math.round(v / 12))}</td>`; });
  h += '</tr>';
  skus.forEach(s => {
    h += '<tr>';
    h += `<td class="st tn" title="${s.name}">${s.name}</td><td class="tr">${fmt(s.stores)}</td>`;
    s.hist.forEach(v => h += `<td class="tr">${fmt(_dpU === 'units' ? sf(v) : Math.round(sf(v) / 12))}</td>`);
    h += `<td class="dp-div"></td>`;
    fWks.forEach((_, i) => {
      const v = _dpU === 'units' ? Math.round(sf(s.fcast[i]) * mult) : Math.round(sf(s.fcast[i]) * mult / 12);
      const isP = isOnPromo(i + 1, s.category);
      h += `<td class="tr" style="${isP ? 'background:rgba(245,158,11,.1)' : 'background:rgba(0,227,205,.04)'}">${fmt(v)}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody>';
  document.getElementById('dp-tbl').innerHTML = h;
  document.getElementById('dp-meta').textContent = `W1: ${fmt(fTot[0])} ${_dpU} \u00B7 ${skus.length} SKUs`;
}
