// ─── ACTUALS vs FORECAST (LIVE OMNI) ─────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1452–1517)

import { DATA_AVF, DATA_ACCURACY } from '../data/index.js';
import { fmt, fmtP, fmtD, fmtDol, sf } from '../utils/formatters.js';
import { kpiCard, chip, fillSel } from '../utils/dom.js';

// ─── Local helper ────────────────────────────────────────────────────
function getAcc(dpci) {
  return DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null;
}

export function initAVF() {
  const totA = DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0);
  const totF = DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0);
  const totAS = DATA_AVF.reduce((a, s) => a + sf(s.lw_sales), 0);
  const pct = totF ? (totA - totF) / totF : 0;
  const misses = DATA_AVF.filter(s => sf(s.vs_fcast_pct) < -.25).length;
  const beats = DATA_AVF.filter(s => sf(s.vs_fcast_pct) > .10).length;
  document.getElementById('avf-kpis').innerHTML =
    kpiCard('\u{1F4E6}', 'LW Actual Units (Mar 16)', '--cc:var(--ac)', fmt(totA),
      `${pct >= 0 ? '\u2191' : '\u2193'} ${Math.abs(pct * 100).toFixed(1)}% vs model`, 'dn',
      `${fmtDol(totAS)} revenue \u00B7 Omni source`) +
    kpiCard('\u{1F3AF}', 'vs Locked Plan Fcast (Mar 16)', `--cc:${pct < 0 ? 'var(--rd)' : 'var(--gr)'}`, fmtP(pct),
      `${pct >= 0 ? '\u2191' : '\u2193'} ${fmt(Math.abs(totA - totF))} units`, pct >= 0 ? 'up' : 'dn',
      `Actuals: ${fmt(totA)} \u00B7 Plan fcast: ${fmt(totF)} \u00B7 Basis: original locked plan, not scenario-adjusted`) +
    kpiCard('\u26A0\uFE0F', 'Big Misses (<-25%)', '--cc:var(--rd)', misses, 'SKUs significantly below model', 'dn', '') +
    kpiCard('\u26A1', 'Beats (>+10%)', '--cc:var(--gr)', beats, 'SKUs above model forecast', 'up', '');
  fillSel('avf-cat', DATA_AVF.map(s => s.category));
  renderAVF();
}

export function renderAVF() {
  const cat = document.getElementById('avf-cat').value;
  const st = document.getElementById('avf-st').value;
  const q = (document.getElementById('avf-q').value || '').toLowerCase();
  let skus = [...DATA_AVF].filter(s => {
    const p = sf(s.vs_fcast_pct);
    return (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q)) &&
      (!st || (st === 'miss' ? p < -.25 : st === 'beat' ? p > .10 : (p >= -.25 && p <= .10)));
  }).sort((a, b) => sf(a.vs_fcast_pct) - sf(b.vs_fcast_pct));
  document.getElementById('avf-meta').textContent = skus.length + ' SKUs \u00B7 Omni source';
  let h = '<table><thead><tr>' +
    '<th style="min-width:185px">SKU</th><th>Category</th>' +
    '<th class="tr">LW Actual</th><th class="tr">LW Revenue</th>' +
    '<th class="tr">UPSPW</th><th class="tr">Stores</th>' +
    '<th class="tr">Locked Plan Fcast</th><th class="tr" title="Actuals vs. pre-locked demand plan forecast for week of Mar 16. NOT scenario-adjusted. NOT current editable forecast.">vs Fcast \u2139</th>' +
    '<th class="tr">vs Fcast %</th><th class="tr">L4W Avg</th>' +
    '<th class="tr">CW to Date</th>' +
    '<th class="tr">MAPE L4W</th><th>Trust</th>' +
    '</tr></thead><tbody>';
  skus.forEach(s => {
    const p = sf(s.vs_fcast_pct);
    const pc = p < -.25 ? 'dn' : p > .10 ? 'up' : 'neu';
    h += `<tr>
      <td class="tn" title="${s.name}">${s.name}</td>
      <td>${chip('cb', s.category)}</td>
      <td class="tr">${fmt(s.lw_units)}</td>
      <td class="tr">${fmtDol(s.lw_sales)}</td>
      <td class="tr">${fmtD(s.lw_upspw, 2)}</td>
      <td class="tr">${fmt(s.lw_stores)}</td>
      <td class="tr">${fmt(s.fcast_units)}</td>
      <td class="tr ${pc}">${p >= 0 ? '\u2191' : '\u2193'} ${fmt(Math.abs(s.vs_fcast_units))}</td>
      <td class="tr ${pc}">${p >= 0 ? '\u2191' : '\u2193'} ${Math.abs(p * 100).toFixed(1)}%</td>
      <td class="tr" style="color:var(--tx2)">${fmt(s.l4w_avg_units)}</td>
      <td class="tr" style="color:var(--cy)">${fmt(s.cw_units_to_date)}</td>
      ${(() => {
        const _a = getAcc(s.dpci); if (!_a) return '<td class="tr">\u2014</td><td>\u2014</td>';
        const _mc = _a.mape_l4w < 12 ? 'var(--gr)' : _a.mape_l4w < 22 ? 'var(--yw)' : 'var(--rd)';
        return `<td class="tr" style="color:${_mc};font-weight:700">${_a.mape_l4w.toFixed(1)}%</td>
        <td><span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${_a.trust_level === 'High' ? 'rgba(0,207,146,.12)' : _a.trust_level === 'Medium' ? 'rgba(255,199,17,.10)' : 'rgba(239,68,68,.10)'};color:${_a.trust_level === 'High' ? 'var(--gr)' : _a.trust_level === 'Medium' ? 'var(--yw)' : 'var(--rd)'}">${_a.trust_level === 'High' ? '\u2705' : _a.trust_level === 'Medium' ? '\u26A0\uFE0F' : '\u{1F534}'} ${_a.trust_level}</span></td>`;
      })()}
    </tr>`;
  });
  h += '<tr style="background:rgba(255,199,17,.06)"><td colspan="7" style="padding:10px 12px;font-size:11px;color:var(--yw)"><b>\u26A0\uFE0F Seasonal Step-Down:</b> Smoothies H1\u2192H2 base \u221219.5% (~41,895\u219233,738 units/wk) and YoGos H1\u2192H2 base \u221217.6% (~10,227\u21928,427 units/wk). Reflects organic deceleration after Jan\u2013Mar TPC cadence. All forward fcast uses H2 base from Wk3 (Apr 5) onward.</td></tr>';
  h += '</tbody></table>';
  document.getElementById('avf-ts').innerHTML = h;
}
