// ─── SHIPMENT ─────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1606–1720)

import { DATA_SHIP } from '../data/index.js';
import { fmt, sf } from '../utils/formatters.js';
import { kpiCard, chip, fillSel } from '../utils/dom.js';

export function shipEditCell(el, dpci, week) {
  if (el.classList.contains('editing')) return;
  el.classList.add('editing');
  const cur = parseFloat(el.getAttribute('data-val')) || 0;
  el.innerHTML = `<input type="number" min="0" step="1" value="${cur}"
    style="width:54px;font-size:11px;background:rgba(139,92,246,.18);border:1px solid rgba(139,92,246,.6);
    border-radius:4px;color:#c4b5fd;text-align:right;padding:2px 4px"
    onblur="shipSaveCell(this,'${dpci}','${week}')"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.closest('td').classList.remove('editing');renderSHIP();}"
    onclick="event.stopPropagation()">`;
  el.querySelector('input').focus();
  el.querySelector('input').select();
}

export function shipSaveCell(inp, dpci, week) {
  const val = Math.round(parseFloat(inp.value) || 0);
  const sku = DATA_SHIP.skus.find(s => s.dpci === dpci);
  if (sku) {
    sku.weeks[week] = val;
    // Keep as forecast week regardless of edit
    if (!sku.fcast_weeks) sku.fcast_weeks = {};
    sku.fcast_weeks[week] = true;
  }
  renderSHIP();
  updateSHIPKPIs();
}

export function updateSHIPKPIs() {
  const fcastWks_set = new Set(["4/26 '26", "5/3 '26", "5/10 '26", "5/17 '26", "5/24 '26", "5/31 '26", "6/7 '26", "6/14 '26"]);
  const po13 = DATA_SHIP.skus.reduce((a, s) => {
    return a + Object.entries(s.weeks).reduce((t, [w, v]) => {
      if (fcastWks_set.has(w)) return t; // exclude pure forecast weeks from committed PO
      if (['13-wk PO Cases', '13-wk Plan Cases', 'Gap Cases', 'Gap Units', 'Coverage %', '13-wk Fcast Cases'].includes(w)) return t;
      return t; // PO is already stored in 13-wk PO Cases
    }, 0) + sf(s.weeks['13-wk PO Cases']);
  }, 0);
  const pl13 = DATA_SHIP.skus.reduce((a, s) => a + sf(s.weeks['13-wk Plan Cases']), 0);
  const gap = po13 - pl13;
  document.getElementById('ship-kpis').innerHTML =
    kpiCard('\u{1F4E6}', 'Committed PO Cases', '--cc:var(--ac)', fmt(po13), 'Cases on open POs (excl. projected)', 'neu', '') +
    kpiCard('\u{1F4CA}', 'Demand Plan Cases', '--cc:var(--yw)', fmt(pl13), 'Cases needed per plan', 'neu', '') +
    kpiCard('\u26A1', 'Coverage Gap', '--cc:var(--rd)', fmt(gap), 'Committed PO minus Plan', 'dn', '');
}

export function initSHIP() {
  updateSHIPKPIs();
  fillSel('sh-cat', DATA_SHIP.skus.map(s => s.category));
  renderSHIP();
}

export function renderSHIP() {
  const cat = document.getElementById('sh-cat').value;
  const q = (document.getElementById('sh-q').value || '').toLowerCase();
  const vw = document.getElementById('sh-vw').value;
  let skus = DATA_SHIP.skus.filter(s => (!cat || s.category === cat) && (!q || s.description.toLowerCase().includes(q)));
  const meta = ['13-wk PO Cases', '13-wk Plan Cases', 'Gap Cases', 'Gap Units', 'Coverage %', '13-wk Fcast Cases'];
  const allWks = DATA_SHIP.week_labels.filter(w => !meta.includes(w));
  const actWks = allWks.filter(w => w.includes("'25") || w.includes("1/") || w.includes("2/") || (w.includes("3/") && !w.includes("3/22") && !w.includes("3/29")));
  const fctWks = allWks.filter(w => !actWks.includes(w));
  const show = vw === 'act' ? actWks : vw === 'fct' ? fctWks : allWks;

  // Legend row
  let h = `<div style="display:flex;gap:16px;margin-bottom:8px;font-size:11px;color:var(--tx2)">
    <span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:rgba(0,227,205,.15);border-radius:2px;display:inline-block"></span>Committed PO</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:rgba(139,92,246,.15);border-radius:2px;display:inline-block"></span>Projected (POFC) \u2014 click to edit</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:rgba(255,255,255,.04);border-radius:2px;border:1px solid rgba(255,255,255,.08);display:inline-block"></span>Actualized</span>
  </div>`;

  h += '<div style="overflow-x:auto"><table><thead><tr><th style="min-width:175px">SKU</th><th>Cat</th><th class="tr">U/Cs</th>';
  show.forEach(w => {
    const isA = actWks.includes(w);
    const bg = isA ? '' : 'background:rgba(0,227,205,.07)';
    h += `<th class="tr" style="font-size:10px;${bg};white-space:nowrap">${w}</th>`;
  });
  h += '<th class="tr" style="background:rgba(0,227,205,.12);white-space:nowrap">PO Cs</th>';
  h += '<th class="tr" style="background:rgba(139,92,246,.12);white-space:nowrap">Fcast Cs</th>';
  h += '<th class="tr" style="background:rgba(239,68,68,.08);white-space:nowrap">Plan Cs</th>';
  h += '<th class="tr" style="background:rgba(239,68,68,.08);white-space:nowrap">Gap</th>';
  h += '<th class="tr" style="background:rgba(239,68,68,.08);white-space:nowrap">Cov%</th></tr></thead><tbody>';

  skus.forEach(s => {
    const fw = s.fcast_weeks || {};
    const po = sf(s.weeks['13-wk PO Cases']);
    const fc = sf(s.weeks['13-wk Fcast Cases'] || 0);
    const pl = sf(s.weeks['13-wk Plan Cases']);
    const gap = sf(s.weeks['Gap Cases']);
    const totalCov = po + fc;  // combined coverage: committed + projected
    const cov = pl ? Math.round(totalCov / pl * 100) : 0;
    h += `<tr><td class="tn" title="${s.description}">${s.description.replace('Little Spoon ', '').replace('Baby Puffs, ', '')}</td><td>${chip('cb', s.category)}</td><td class="tr">${s.units_per_case}</td>`;
    show.forEach(w => {
      const v = s.weeks[w] || 0;
      const isA = actWks.includes(w);
      const isFcast = fw[w] === true;
      if (isA) {
        // Actualized: grey if zero, normal if value
        h += `<td class="tr" style="color:${v ? 'var(--tx)' : 'var(--tx3)'}">${v ? fmt(v) : '\u2014'}</td>`;
      } else if (isFcast) {
        // Forecast-filled from POFC: purple, editable on click
        h += `<td class="tr editing-cell" data-val="${v}" data-dpci="${s.dpci}" data-week="${w}"
          onclick="shipEditCell(this,'${s.dpci}','${w}')"
          title="Projected (POFC) \u2014 click to edit"
          style="cursor:pointer;background:rgba(139,92,246,.12);color:#c4b5fd;font-weight:500">
          ${v ? fmt(v) : '\u2014'}</td>`;
      } else {
        // Committed PO week: blue tint
        h += `<td class="tr" style="background:rgba(0,227,205,.08);color:${v ? 'var(--ac2)' : 'var(--tx3)'}">${v ? fmt(v) : '\u2014'}</td>`;
      }
    });
    h += `<td class="tr" style="background:rgba(0,227,205,.08);color:var(--ac2);font-weight:500">${po ? fmt(po) : '\u2014'}</td>`;
    h += `<td class="tr" style="background:rgba(139,92,246,.08);color:#c4b5fd;font-weight:500">${fc ? fmt(fc) : '\u2014'}</td>`;
    h += `<td class="tr" style="background:rgba(239,68,68,.05);color:var(--tx2)">${pl ? fmt(pl) : '\u2014'}</td>`;
    h += `<td class="tr ${gap < 0 ? 'dn' : 'up'}" style="font-weight:500">${pl ? (gap < 0 ? '' : '+') + '' + fmt(gap) : '\u2014'}</td>`;
    h += `<td class="tr" style="color:${cov >= 100 ? 'var(--gr)' : cov >= 75 ? 'var(--yw)' : 'var(--rd)'};font-weight:500">${pl ? cov + '%' : '\u2014'}</td></tr>`;
  });
  h += '</tbody></table></div>';
  document.getElementById('sh-ts').innerHTML = h;
}

// ─── Register globals for inline onclick handlers ────────────────────
// The shipment table uses inline onclick="shipEditCell(...)" and
// onblur="shipSaveCell(...)" in generated HTML. These need to be
// accessible from the global scope.
if (typeof window !== 'undefined') {
  window.shipEditCell = shipEditCell;
  window.shipSaveCell = shipSaveCell;
  window.renderSHIP = renderSHIP;
}
