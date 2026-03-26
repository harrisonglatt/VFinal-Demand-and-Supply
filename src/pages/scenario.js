// ─── SCENARIO ANALYSIS ───────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1958–2052, 3353–3438)

import { DATA_DP, DATA_PROMO, DATA_OMNI, FCAST_REV_52WK, PROMO_WKS } from '../data/index.js';
import { fmt, fmtDol, sf } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';
import { velFor } from '../utils/state.js';

let _scS = 'base';
let _scRCh = null;
let _scUCh = null;

const SC_MULT = { bear: 0.80, base: 1.00, bull: 1.20 };
const SC_COL = { bear: '#ef4444', base: '#00E3CD', bull: '#00CF92' };

function calcCV(hist) {
  const h = (hist || []).filter(v => v > 0);
  if (h.length < 3) return 0.18;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const variance = h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length;
  return Math.min(Math.sqrt(variance) / mean, 0.45);
}

export function scScen(s, btn) {
  _scS = s;
  setTimeout(() => { const p = document.getElementById('sc-sku-breakdown'); if (p) p.remove(); setTimeout(buildSCENTable, 80); }, 50);
  document.querySelectorAll('#sc-sc .btn').forEach(b => b.classList.toggle('on', b === btn));
  const lbl = { bear: 'Bear: \u00d70.80', base: 'Base: \u00d71.00', bull: 'Bull: \u00d71.20' };
  document.getElementById('sc-badge').textContent = lbl[s];
  renderSCEN();
}

export function initSCEN() { renderSCEN(); setTimeout(buildSCENTable, 80); }

export function renderSCEN() {
  const m = SC_MULT[_scS];
  const labels = DATA_DP.fcast_weeks;
  const baseU = labels.map((_, i) => DATA_DP.skus.reduce((a, s) => a + sf(s.fcast[i]), 0));
  const bearU = baseU.map(v => Math.round(v * 0.80)), bullU = baseU.map(v => Math.round(v * 1.20));
  const curU = baseU.map(v => Math.round(v * m));
  const bearR = FCAST_REV_52WK.map(v => v * 0.80), baseR = FCAST_REV_52WK, bullR = FCAST_REV_52WK.map(v => v * 1.20);
  const curR = FCAST_REV_52WK.map(v => v * m);
  const totRB = bearR.reduce((a, b) => a + b, 0), totR = baseR.reduce((a, b) => a + b, 0), totRBull = bullR.reduce((a, b) => a + b, 0), totRC = curR.reduce((a, b) => a + b, 0);
  const totUB = bearU.reduce((a, b) => a + b, 0), totU = baseU.reduce((a, b) => a + b, 0), totUBull = bullU.reduce((a, b) => a + b, 0), totUC = curU.reduce((a, b) => a + b, 0);
  const peakR = Math.max(...curR), peakWk = labels[curR.indexOf(peakR)];
  const diff = totRC - totR, diffPct = (m - 1) * 100;
  document.getElementById('sc-kpis').innerHTML =
    kpiCard('\ud83d\udcb0', '52-Wk Revenue', '--cc:' + SC_COL[_scS], fmtDol(totRC),
      (diffPct >= 0 ? '\u2191 ' : '\u2193 ') + fmtDol(Math.abs(diff)) + ' vs base', diffPct >= 0 ? 'up' : 'dn',
      'Bear ' + fmtDol(totRB) + ' \u00b7 Bull ' + fmtDol(totRBull)) +
    kpiCard('\ud83d\udce6', '52-Wk Units', '--cc:' + SC_COL[_scS], fmt(totUC),
      'Avg ' + fmt(Math.round(totUC / 52)) + '/wk', _scS === 'bear' ? 'dn' : _scS === 'bull' ? 'up' : 'neu',
      'Bear ' + fmt(totUB) + ' \u00b7 Bull ' + fmt(totUBull)) +
    kpiCard('\ud83c\udfc6', 'Peak Week Revenue', '--cc:var(--yw)', fmtDol(peakR),
      peakWk, 'neu', fmtDol(Math.round(totRC / 52)) + ' avg weekly') +
    kpiCard('\ud83d\udcc8', 'Fcast vs Omni Run Rate (52-wk)', '--cc:var(--cy)',
      ((totRC / 52 - DATA_OMNI.lw_summary.sales) / DATA_OMNI.lw_summary.sales * 100).toFixed(1) + '%',
      fmtDol(Math.round(totRC / 52)) + ' avg vs ' + fmtDol(DATA_OMNI.lw_summary.sales) + ' LW actual',
      totRC / 52 > DATA_OMNI.lw_summary.sales ? 'up' : 'dn', '52-wk forward avg vs last actual');
  document.getElementById('sc-meta').textContent = labels[0] + ' \u2013 ' + labels[51];
  // Revenue chart
  if (_scRCh) _scRCh.destroy();
  const n = Math.min(6, DATA_OMNI.weekly_totals.length);
  const allL = [...DATA_OMNI.weeks.slice(-n), ...labels];
  const act = [...DATA_OMNI.weekly_totals.slice(-n).map(w => w.sales), ...Array(52).fill(null)];
  const pad = n - 1;
  const bR = [...Array(pad).fill(null), DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1].sales, ...bearR];
  const bsR = [...Array(pad).fill(null), DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1].sales, ...baseR];
  const buR = [...Array(pad).fill(null), DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1].sales, ...bullR];
  _scRCh = new Chart(document.getElementById('ch-scen-rev'), {
    type: 'line', data: {
      labels: allL, datasets: [
        { label: 'Actuals', data: act, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.07)', fill: true, tension: .4, pointRadius: 3, borderWidth: 2, spanGaps: false },
        { label: 'Bear', data: bR, borderColor: '#ef4444', fill: false, tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3], spanGaps: false },
        { label: 'Base', data: bsR, borderColor: '#00CF92', fill: false, tension: .3, pointRadius: 0, borderWidth: 2, spanGaps: false },
        { label: 'Bull', data: buR, borderColor: '#DC7BFF', fill: false, tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3], spanGaps: false }
      ]
    },
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#7b97c8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#44608a', font: { size: 9 }, callback(v, i) { return i % 4 === 0 ? this.getLabelForValue(i) : ''; } } },
        y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' } }
      }
    }
  });
  // Units chart
  if (_scUCh) _scUCh.destroy();
  _scUCh = new Chart(document.getElementById('ch-scen-units'), {
    type: 'line', data: {
      labels, datasets: [
        { label: 'Bull +20%', data: bullU, borderColor: 'rgba(167,139,250,.5)', backgroundColor: 'rgba(167,139,250,.08)', fill: '+1', tension: .3, pointRadius: 0, borderWidth: 1, borderDash: [3, 3] },
        { label: 'Base', data: baseU, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.1)', fill: false, tension: .3, pointRadius: 2, borderWidth: 2 },
        { label: 'Bear \u221220%', data: bearU, borderColor: 'rgba(239,68,68,.5)', fill: false, tension: .3, pointRadius: 0, borderWidth: 1, borderDash: [3, 3] }
      ]
    },
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#7b97c8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#44608a', font: { size: 9 }, callback(v, i) { return i % 4 === 0 ? this.getLabelForValue(i) : ''; } } },
        y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => fmt(v) } }
      }
    }
  });
  // Table
  let h = '<table><thead><tr><th>Week</th><th class="tr">Bear Rev</th><th class="tr">Base Rev</th><th class="tr">Bull Rev</th><th class="tr">Bear Units</th><th class="tr">Base Units</th><th class="tr">Bull Units</th><th>Promos</th></tr></thead><tbody>';
  labels.forEach((w, i) => {
    const isP = PROMO_WKS.has(i + 1);
    const evs = DATA_PROMO.filter(p => p.wk === i + 1).map(p => p.event.substring(0, 28)).join(', ');
    h += '<tr style="' + (isP ? 'background:rgba(245,158,11,.05)' : '') + '">' +
      '<td style="font-weight:' + (isP ? 700 : 400) + ';color:' + (isP ? 'var(--yw)' : 'var(--tx)') + '">' + w + '</td>' +
      '<td class="tr dn">' + fmtDol(bearR[i]) + '</td>' +
      '<td class="tr" style="color:var(--ac2)">' + fmtDol(baseR[i]) + '</td>' +
      '<td class="tr up">' + fmtDol(bullR[i]) + '</td>' +
      '<td class="tr dn">' + fmt(bearU[i]) + '</td>' +
      '<td class="tr" style="color:var(--ac2)">' + fmt(baseU[i]) + '</td>' +
      '<td class="tr up">' + fmt(bullU[i]) + '</td>' +
      '<td style="font-size:11px;color:var(--yw)">' + (evs || '\u2014') + '</td></tr>';
  });
  h += '<tr style="background:var(--s3);font-weight:700;border-top:2px solid var(--bd)">' +
    '<td>TOTAL 52WK</td>' +
    '<td class="tr dn">' + fmtDol(totRB) + '</td>' +
    '<td class="tr" style="color:var(--ac2)">' + fmtDol(totR) + '</td>' +
    '<td class="tr up">' + fmtDol(totRBull) + '</td>' +
    '<td class="tr dn">' + fmt(totUB) + '</td>' +
    '<td class="tr" style="color:var(--ac2)">' + fmt(totU) + '</td>' +
    '<td class="tr up">' + fmt(totUBull) + '</td>' +
    '<td></td></tr></tbody></table>';
  document.getElementById('sc-tbl').innerHTML = h;
}

// ─── SCENARIO SKU BREAKDOWN TABLE ─────────────────────────────────────────
export function buildSCENTable() {
  const container = document.getElementById('sc-tbl');
  if (!container) return;
  // Remove previous upgrade if re-rendering
  const prev = document.getElementById('sc-sku-breakdown');
  if (prev) prev.remove();

  const skus = DATA_DP.skus;
  const catAgg = {};

  let h = '<div id="sc-sku-breakdown" style="margin-top:20px">';
  h += '<div class="ct" style="margin-bottom:10px;font-size:13px;font-weight:600;color:var(--tx2)">' +
    '\ud83d\udccb SKU-Level Breakdown \u2014 13-Week Units (Bear \u00b7 Base \u00b7 Bull)</div>';
  h += '<div style="overflow-x:auto"><table class="sc3-tbl"><thead><tr>' +
    '<th style="text-align:left;min-width:180px">SKU</th>' +
    '<th style="text-align:left">Category</th>' +
    '<th class="tr bear-val">\ud83d\udc3b Bear \u00d70.80</th>' +
    '<th class="tr base-val">\ud83d\udcca Base \u00d71.00</th>' +
    '<th class="tr bull-val">\ud83d\udc02 Bull \u00d71.20</th>' +
    '<th class="tr range-col">Range</th>' +
    '<th class="tr" style="color:var(--tx3)">Volatility</th>' +
    '</tr></thead><tbody>';

  skus.forEach(s => {
    const vel = velFor(s.dpci) || s.lw_upspw || 1;
    const origVel = s.lw_upspw || vel;
    const scale = origVel > 0 ? vel / origVel : 1;
    const f13 = s.fcast.slice(0, 13).reduce((a, b) => a + b, 0);
    const base = Math.round(f13 * scale);
    const bear = Math.round(base * 0.80);
    const bull = Math.round(base * 1.20);
    const cv = calcCV(s.hist);
    const range = bull - bear;
    const cat = (s.category || 'Other').replace(' Multiserve', '');
    if (!catAgg[cat]) catAgg[cat] = { bear: 0, base: 0, bull: 0 };
    catAgg[cat].bear += bear; catAgg[cat].base += base; catAgg[cat].bull += bull;

    const volCol = cv > 0.30 ? '#FF8766' : cv > 0.18 ? '#FFC711' : '#00F9B8';
    const name = (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 36);
    h += `<tr>
      <td style="font-weight:500;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</td>
      <td style="font-size:10.5px;color:var(--tx3)">${cat}</td>
      <td class="tr bear-val">${fmt(bear)}</td>
      <td class="tr base-val">${fmt(base)}</td>
      <td class="tr bull-val">${fmt(bull)}</td>
      <td class="tr range-col">${fmt(range)}</td>
      <td class="tr" style="color:${volCol}">${(cv * 100).toFixed(0)}%</td>
    </tr>`;
  });

  // Category subtotals
  h += '<tr><td colspan="7" style="padding:0;height:4px"></td></tr>';
  Object.entries(catAgg).forEach(([cat, v]) => {
    if (!v.base) return;
    h += `<tr class="cat-row">
      <td colspan="2" style="font-size:12px">\ud83d\udcc2 ${cat} Subtotal</td>
      <td class="tr bear-val" style="font-size:12.5px">${fmt(v.bear)}</td>
      <td class="tr base-val" style="font-size:12.5px">${fmt(v.base)}</td>
      <td class="tr bull-val" style="font-size:12.5px">${fmt(v.bull)}</td>
      <td class="tr range-col">${fmt(v.bull - v.bear)}</td>
      <td class="tr" style="color:var(--tx3)">\u2014</td>
    </tr>`;
  });

  const totB = Object.values(catAgg).reduce((a, v) => a + v.bear, 0);
  const totBa = Object.values(catAgg).reduce((a, v) => a + v.base, 0);
  const totBu = Object.values(catAgg).reduce((a, v) => a + v.bull, 0);
  h += `<tr class="total-row">
    <td colspan="2" style="font-weight:800;font-size:13px">GRAND TOTAL (13 Weeks)</td>
    <td class="tr bear-val" style="font-size:14px;font-weight:800">${fmt(totB)}</td>
    <td class="tr base-val" style="font-size:14px;font-weight:800">${fmt(totBa)}</td>
    <td class="tr bull-val" style="font-size:14px;font-weight:800">${fmt(totBu)}</td>
    <td class="tr range-col" style="font-size:14px;font-weight:800">${fmt(totBu - totB)}</td>
    <td class="tr" style="color:var(--tx3)">\u2014</td>
  </tr>`;
  h += '</tbody></table></div>';
  h += '<div style="margin-top:10px;font-size:11px;color:var(--tx3);line-height:1.8">' +
    '<b>Methodology:</b> Bear/Base/Bull = base velocity \u00d7 {0.80, 1.00, 1.20} \u00b7 ' +
    'Base uses current UPSPW overrides from Assumptions page \u00b7 ' +
    'Volatility = coefficient of variation from 13-week Omni history \u00b7 ' +
    'CV &gt;30% = high risk (red) \u00b7 18\u201330% = moderate (yellow) \u00b7 &lt;18% = stable (green)</div>';
  h += '</div>';
  container.insertAdjacentHTML('beforeend', h);
}
