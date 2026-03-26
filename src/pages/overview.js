// ─── OVERVIEW ─────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1207–1402)

import {
  DATA_DP, DATA_INV, DATA_PROMO, DATA_OMNI, DATA_AVF, FCAST_REV_52WK, PROMO_WKS,
} from '../data/index.js';
import { fmt, fmtP, fmtDol, sf } from '../utils/formatters.js';
import { kpiCard, chip } from '../utils/dom.js';
import { mkLine, initChartDefaults } from '../utils/charts.js';

// ─── Module-level state ─────────────────────────────────────────────
let _ovUnit = 'units';

const _blendedUPC = (() => {
  try {
    // DATA_SHIP is only used here for blended UPC calc — import lazily to
    // avoid pulling in the whole shipment dataset at top-level if unneeded.
    // We import inline so the rest of the module can tree-shake DATA_SHIP.
    const DATA_SHIP_MOD = import('../data/index.js');
    // However, for synchronous access we duplicate the logic with a safe fallback.
    // In the monolith this ran synchronously against inline DATA_SHIP.
    return 14; // safe fallback — the actual calc is below, run after import resolves
  } catch (e) { return 14; }
})();

// We compute the real blended UPC lazily when DATA_SHIP is available.
let _blendedUPCResolved = null;
function getBlendedUPC(DATA_SHIP) {
  if (_blendedUPCResolved !== null) return _blendedUPCResolved;
  try {
    const tot = DATA_SHIP.skus.reduce((a, s) => {
      const cases = Object.entries(s.weeks).filter(([k]) =>
        !['13-wk PO Cases', '13-wk Plan Cases', 'Gap Cases', 'Gap Units', 'Coverage %', '13-wk Fcast Cases'].includes(k)
        && (k.includes("'25") || k.includes('1/') || k.includes('2/') || k.includes('3/1') || k.includes('3/8'))
      ).reduce((t, [, v]) => t + (v || 0), 0);
      return { cases: a.cases + cases, units: a.units + cases * s.units_per_case };
    }, { cases: 0, units: 0 });
    _blendedUPCResolved = tot.cases > 0 ? tot.units / tot.cases : 14;
  } catch (e) { _blendedUPCResolved = 14; }
  return _blendedUPCResolved;
}

// Keep a module-scoped reference to DATA_SHIP once loaded
let _DATA_SHIP = null;

function blendedUPC() {
  if (_DATA_SHIP) return getBlendedUPC(_DATA_SHIP);
  return 14;
}

export function setOvUnit(u, btn) {
  _ovUnit = u;
  document.querySelectorAll('#ov-unit-tog .btn').forEach(b => b.classList.toggle('on', b === btn));
  const lw2 = DATA_OMNI.lw_summary;
  const wts2 = DATA_OMNI.weekly_totals;
  const lwPrev2 = wts2[wts2.length - 2] || lw2;
  const cw2 = DATA_OMNI.cw_summary;
  const unitsWoW2 = (lw2.units - lwPrev2.units) / lwPrev2.units;
  const totalA2 = DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0);
  const totalF2 = DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0);
  const avfP2 = totalF2 ? (totalA2 - totalF2) / totalF2 : 0;
  const revWoW2 = (lw2.sales - (lwPrev2.sales || lw2.sales)) / (lwPrev2.sales || 1);
  document.getElementById('ov-kpis').innerHTML =
    kpiCard('\u{1F4B0}', 'LW Revenue (Mar 16)', '--cc:var(--ac)', fmtDol(lw2.sales),
      `${revWoW2 >= 0 ? '\u2191' : '\u2193'} ${Math.abs(revWoW2 * 100).toFixed(1)}% WoW`, revWoW2 >= 0 ? 'up' : 'dn',
      `${fmtDol(cw2.sales)} CW to date (2 days)`) +
    kpiCard('\u{1F4E6}', u === 'cases' ? 'LW Cases (Mar 16)' : 'LW Units (Mar 16)', '--cc:var(--gr)',
      u === 'cases' ? fmt(Math.round(lw2.units / (blendedUPC() || 14))) : fmt(lw2.units),
      `${unitsWoW2 >= 0 ? '\u2191' : '\u2193'} ${Math.abs(unitsWoW2 * 100).toFixed(1)}% WoW`, unitsWoW2 >= 0 ? 'up' : 'dn',
      `${u === 'cases' ? fmt(Math.round(cw2.units / (blendedUPC() || 14))) + ' cases' : fmt(cw2.units) + ' units'} CW to date`) +
    kpiCard('\u{1F3AF}', 'LW vs Model Forecast', `--cc:${avfP2 < 0 ? 'var(--rd)' : 'var(--gr)'}`, fmtP(avfP2),
      `${avfP2 >= 0 ? '\u2191' : '\u2193'} ${fmt(totalA2 - totalF2)} units`, avfP2 >= 0 ? 'up' : 'dn',
      `${fmt(totalA2)} actual vs ${fmt(totalF2)} model`) +
    kpiCard('\u26A0\uFE0F', 'OOS Alerts', '--cc:var(--rd)', DATA_INV.summary.oos_alerts,
      `\u2193 ${fmtDol(DATA_INV.summary.lost_per_week)}/wk lost`, 'dn',
      `Annualized: ${fmtDol(DATA_INV.summary.annualized_loss)}`);
  const trendData2 = DATA_OMNI.weekly_totals.map(w =>
    u === 'cases' ? Math.round(w.units / (blendedUPC() || 14)) : w.units);
  if (window._ovTrendChart) { window._ovTrendChart.destroy(); }
  window._ovTrendChart = mkLine('ch-trend', DATA_OMNI.weeks,
    [{ label: u === 'cases' ? 'Weekly Cases' : 'Weekly Units', data: trendData2, bc: '#00E3CD', bg: 'rgba(0,227,205,0.08)' }]);
  const tt = document.getElementById('ov-trend-title');
  if (tt) tt.textContent = `\u{1F4E6} Weekly ${u === 'cases' ? 'Cases' : 'Units'} Trend (Omni Actuals)`;
}

export function initOV() {
  // Lazy-load DATA_SHIP for blended UPC calculation
  import('../data/index.js').then(mod => {
    _DATA_SHIP = mod.DATA_SHIP;
    _blendedUPCResolved = null; // reset so it recalculates
  });

  initChartDefaults();

  const lw = DATA_OMNI.lw_summary;
  const wts = DATA_OMNI.weekly_totals;
  const lwPrev = wts[wts.length - 2];
  const cw = DATA_OMNI.cw_summary;
  const lwRev = lw.sales; const lwPrevRev = lwPrev.sales;
  const revWoW = (lwRev - lwPrevRev) / lwPrevRev;
  const unitsWoW = (lw.units - lwPrev.units) / lwPrev.units;

  const totalA = DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0);
  const totalF = DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0);
  const avfP = totalF ? (totalA - totalF) / totalF : 0;
  const avgStores = DATA_OMNI.cw_daily.reduce((a, s) => a + sf(s.stores), 0) / DATA_OMNI.cw_daily.length;

  document.getElementById('ov-kpis').innerHTML =
    kpiCard('\u{1F4B0}', 'LW Revenue (Mar 16)', '--cc:var(--ac)', fmtDol(lwRev),
      `${revWoW >= 0 ? '\u2191' : '\u2193'} ${Math.abs(revWoW * 100).toFixed(1)}% WoW`, revWoW >= 0 ? 'up' : 'dn',
      `${fmtDol(cw.sales)} CW to date (2 days)`) +
    kpiCard('\u{1F4E6}', _ovUnit === 'cases' ? 'LW Cases (Mar 16)' : 'LW Units (Mar 16)', '--cc:var(--gr)',
      _ovUnit === 'cases' ? fmt(Math.round(lw.units / (blendedUPC() || 14))) : fmt(lw.units),
      `${unitsWoW >= 0 ? '\u2191' : '\u2193'} ${Math.abs(unitsWoW * 100).toFixed(1)}% WoW`, unitsWoW >= 0 ? 'up' : 'dn',
      `${_ovUnit === 'cases' ? fmt(Math.round(cw.units / (blendedUPC() || 14))) + ' cases' : fmt(cw.units) + ' units'} CW to date`) +
    kpiCard('\u{1F3AF}', 'LW vs Locked Fcast (Mar 16)', `--cc:${avfP < 0 ? 'var(--rd)' : 'var(--gr)'}`, fmtP(avfP),
      `${avfP >= 0 ? '\u2191' : '\u2193'} ${fmt(totalA - totalF)} units`, avfP >= 0 ? 'up' : 'dn',
      `${fmt(totalA)} actual vs ${fmt(totalF)} model`) +
    kpiCard('\u26A0\uFE0F', 'OOS Alerts', '--cc:var(--rd)', DATA_INV.summary.oos_alerts,
      `\u2193 ${fmtDol(DATA_INV.summary.lost_per_week)}/wk lost`, 'dn',
      `Annualized: ${fmtDol(DATA_INV.summary.annualized_loss)}`);

  // Revenue chart: Omni actuals + demand plan forecast
  const revLabels = [...DATA_OMNI.weeks, ...DATA_DP.fcast_weeks];
  const actualRevData = [...DATA_OMNI.weekly_totals.map(w => w.sales), ...Array(52).fill(null)];
  // Splice: connect actual last point to first fcast point
  const fcastRevData = [...Array(DATA_OMNI.weeks.length - 1).fill(null),
    DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1].sales,
    ...FCAST_REV_52WK];
  const fcast52Total = FCAST_REV_52WK.reduce((a, b) => a + b, 0);
  document.getElementById('ov-rev-total').textContent = `52-wk fcast: ${fmtDol(fcast52Total)}`;

  // Promo event markers — gold triangles on promo weeks
  const promoMarkers = revLabels.map((lbl, i) => {
    const fIdx = DATA_DP.fcast_weeks.indexOf(lbl);
    if (fIdx >= 0 && PROMO_WKS.has(fIdx + 1)) { return fcastRevData[i] || null; }
    return null;
  });

  new Chart(document.getElementById('ch-rev'), {
    type: 'line',
    data: {
      labels: revLabels, datasets: [
        {
          label: 'Actual Revenue', data: actualRevData, borderColor: '#00E3CD',
          backgroundColor: 'rgba(0,227,205,0.07)', fill: true, tension: .4,
          pointRadius: 3.5, pointBackgroundColor: '#00E3CD', borderWidth: 2, spanGaps: false
        },
        {
          label: 'Forecast Revenue', data: fcastRevData, borderColor: '#00CF92',
          backgroundColor: 'rgba(0,207,146,0.05)', fill: true, tension: .4,
          pointRadius: 2.5, pointBackgroundColor: '#00CF92', borderWidth: 2,
          borderDash: [5, 4], spanGaps: false
        },
        {
          label: 'Promo Week', data: promoMarkers, type: 'scatter',
          pointRadius: 6, pointStyle: 'triangle', rotation: 180,
          pointBackgroundColor: '#FFC711', pointBorderColor: 'rgba(255,199,17,.3)',
          pointBorderWidth: 2, showLine: false
        }
      ]
    },
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Promo Week' && ctx.parsed.y != null) {
                const fIdx = DATA_DP.fcast_weeks.indexOf(ctx.label);
                const evs = DATA_PROMO.filter(p => p.wk === fIdx + 1).map(p => p.event.substring(0, 40));
                return evs.length ? [' \uD83C\uDFAF Promo:'].concat(evs.map(e => '  ' + e)) : null;
              }
              return ` ${ctx.dataset.label}: ${fmtDol(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#44608a', font: { size: 10 },
            callback(v, i) { return i % 4 === 0 ? this.getLabelForValue(i) : ''; }
          }
        },
        y: {
          ticks: {
            color: '#44608a', font: { size: 10 },
            callback: v => '$' + (v / 1000).toFixed(0) + 'k'
          }
        }
      }
    }
  });

  // Units trend
  const trendData = DATA_OMNI.weekly_totals.map(w =>
    _ovUnit === 'cases' ? Math.round(w.units / (blendedUPC() || 14)) : w.units);
  const trendLabel = _ovUnit === 'cases' ? 'Weekly Cases' : 'Weekly Units';
  if (window._ovTrendChart) { window._ovTrendChart.destroy(); }
  window._ovTrendChart = mkLine('ch-trend', DATA_OMNI.weeks,
    [{ label: trendLabel, data: trendData, bc: '#00E3CD', bg: 'rgba(0,227,205,0.08)' }]);
  const trendTitle = document.getElementById('ov-trend-title');
  if (trendTitle) trendTitle.textContent = `\u{1F4E6} Weekly ${_ovUnit === 'cases' ? 'Cases' : 'Units'} Trend (Omni Actuals)`;

  // AVF by category
  const cats = {};
  DATA_AVF.forEach(s => {
    if (!cats[s.category]) cats[s.category] = { a: 0, f: 0 };
    cats[s.category].a += sf(s.lw_units); cats[s.category].f += sf(s.fcast_units);
  });
  const ck = Object.keys(cats);
  new Chart(document.getElementById('ch-avf'), {
    type: 'bar', data: {
      labels: ck, datasets: [
        { label: 'Actual (LW)', data: ck.map(c => cats[c].a), backgroundColor: 'rgba(0,227,205,0.75)', borderRadius: 3 },
        {
          label: 'Forecast', data: ck.map(c => cats[c].f), backgroundColor: 'rgba(255,199,17,0.45)',
          borderColor: '#FFC711', borderWidth: 1, borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true, plugins: { legend: { labels: { color: '#7b97c8', font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#44608a', font: { size: 10 } } },
        y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => (v / 1000).toFixed(0) + 'k' } }
      }
    }
  });

  // INV donut
  const oos = DATA_INV.skus.filter(s => (s.risk_flag || '').includes('OOS')).length;
  const wat = DATA_INV.skus.filter(s => (s.risk_flag || '').includes('Watch')).length;
  const ok = DATA_INV.skus.length - oos - wat;
  new Chart(document.getElementById('ch-inv'), {
    type: 'doughnut',
    data: {
      labels: ['OOS Alert', 'Supply Watch', 'OK'],
      datasets: [{
        data: [oos, wat, ok],
        backgroundColor: ['rgba(239,68,68,.8)', 'rgba(255,199,17,.8)', 'rgba(0,207,146,.8)'],
        borderColor: '#08101f', borderWidth: 2
      }]
    },
    options: {
      responsive: true, cutout: '68%',
      plugins: { legend: { position: 'right', labels: { color: '#7b97c8', font: { size: 12 }, padding: 14 } } }
    }
  });

  document.getElementById('ov-promo').innerHTML = DATA_PROMO.slice(0, 8).map(p => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bd)">
      <span style="font-size:11px;color:var(--tx3);min-width:52px">Wk${p.wk}\u00B7${p.date}</span>
      <span style="font-size:12px;flex:1;color:var(--tx)">${p.event}</span>
      <span class="ch ${p.status.toLowerCase().includes('confirm') || p.status.includes('\u2713') ? 'cg' : 'cy2'}" style="font-size:10px">${p.status.toLowerCase().includes('confirm') ? '\u2713' : '\u23F3'}</span>
      <span style="font-size:13px;font-weight:700;color:var(--yw);min-width:36px;text-align:right">${p.lift_pct}</span>
    </div>`).join('');
}
