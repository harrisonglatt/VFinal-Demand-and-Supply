// ─── PO FORECAST MODULE ────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 2667–3044)

import { DATA_DAILY, DATA_DP, DATA_POFC } from '../data/index.js';
import { fmt as fmtN, fmtP as fmtPct, sf, chgCls } from '../utils/formatters.js';
import { fillSel } from '../utils/dom.js';
import { upcOverrides as _upcOvr, upcFor } from '../utils/state.js';

let _pofcModel = 'plan';
let _pofcCatDone = false;
let _mthfcDone = false;

export function pofcView(v, btn) {
  document.querySelectorAll('#pofc-vw .btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['sku', 'wbw', 'cat', 'mth'].forEach(id => { const el = document.getElementById('pofc-' + id + '-view'); if (el) el.style.display = (id === v ? '' : 'none'); });
  const sf2 = document.getElementById('pofc-cat'), qf = document.getElementById('pofc-q');
  if (sf2) sf2.style.display = (v === 'sku' ? '' : 'none'); if (qf) qf.style.display = (v === 'sku' ? '' : 'none');
  if (v === 'wbw') renderPOFCWbW();
  if (v === 'cat') renderPOFCCat();
  if (v === 'sku') renderPOFCSku();
  if (v === 'mth') renderMTHFC();
}

export function pofcModel(m, btn) {
  document.querySelectorAll('#pofc-model-vw .btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); _pofcModel = m; renderPOFCWbW();
}

export function refreshPOFCKPIs() {
  const d = DATA_POFC;
  const planT = d.totals.plan;
  // Compute scaled totals using current UPC overrides
  let ratioT = 0, covT = 0;
  d.skus.forEach(s => { const sc = s.upc / upcFor(s); ratioT += Math.round(s.ratio_total_cases * sc); covT += Math.round(s.cov_total_cases * sc); });
  const gapR = ratioT - planT, gapC = covT - planT;
  const hasOvr = Object.keys(_upcOvr).length > 0;
  document.getElementById('pofc-kpis').innerHTML = [
    { l: '13-wk Plan Cases', v: fmtN(planT), sub: 'Current committed shipment plan', chg: null },
    { l: 'O/S Ratio Forecast' + (hasOvr ? ' \u270e' : ''), v: fmtN(ratioT), sub: 'Based on hist ship cases \u00f7 (hist units \u00f7 UPC) \u00b7 Applied to 13-wk demand plan' + (hasOvr ? ' \u00b7 UPC overridden' : ''), chg: gapR / planT },
    { l: 'Coverage Forecast' + (hasOvr ? ' \u270e' : ''), v: fmtN(covT), sub: '5-WoS DC target \u00b7 reorder every 2 weeks' + (hasOvr ? ' \u00b7 UPC overridden' : ''), chg: gapC / planT },
    { l: 'Plan Gap (Ratio Model)', v: (gapR >= 0 ? '+' : '') + fmtN(gapR) + ' cs', sub: 'Cases plan may be short vs ratio model', chg: gapR / planT },
  ].map(k => '<div class="kc"><div class="kl">' + k.l + '</div><div class="kv">' + k.v + '</div><div class="ks">' + k.sub + '</div>' + (k.chg != null ? '<div class="kd ' + chgCls(k.chg) + '">' + fmtPct(k.chg) + ' vs plan</div>' : '') + ' </div>').join('');
}

export function initPOFC() {
  fillSel('pofc-cat', DATA_POFC.skus.map(s => s.cat));
  document.getElementById('pofc-cat').style.display = 'none';
  document.getElementById('pofc-q').style.display = 'none';
  refreshPOFCKPIs();
  renderPOFCSku();
}

export function renderPOFCSku() {
  const d = DATA_POFC;
  const cat = document.getElementById('pofc-cat').value;
  const q = (document.getElementById('pofc-q').value || '').toLowerCase();
  let skus = d.skus.filter(s => (!cat || s.cat === cat) && (!q || s.name.toLowerCase().includes(q)));
  document.getElementById('pofc-meta').textContent = skus.length + ' SKUs \u00b7 13-week forward';
  const hasOvr = Object.keys(_upcOvr).length > 0;
  let h = '<table class="dt"><thead><tr><th>SKU</th><th>Cat</th><th class="tr">UPC' + (hasOvr ? '<sup style="color:var(--gr)">\u270e</sup>' : '') + '</th><th class="tr">Plan Cases</th><th class="tr">Ratio Fcst</th><th class="tr">\u0394 Plan</th><th class="tr">Cov Fcst</th><th class="tr">\u0394 Plan</th><th class="tr">O/S Ratio</th><th>Signal</th></tr></thead><tbody>';
  let tP = 0, tR = 0, tC = 0;
  skus.forEach(s => {
    const effUpc = upcFor(s);
    const upcScale = s.upc / effUpc;
    const ratioCs = Math.round(s.ratio_total_cases * upcScale);
    const covCs = Math.round(s.cov_total_cases * upcScale);
    const dR = ratioCs - s.plan_total_cases, dC = covCs - s.plan_total_cases;
    const pR = s.plan_total_cases > 0 ? dR / s.plan_total_cases : 0, pC = s.plan_total_cases > 0 ? dC / s.plan_total_cases : 0;
    tP += s.plan_total_cases; tR += ratioCs; tC += covCs;
    const sig = !ratioCs ? '\u2014' : pR >= 0.25 ? '\ud83d\udd34 Under-planned' : pR <= -0.25 ? '\ud83d\udfe1 Over-planned' : '\u2705 On track';
    const upcOvrd = _upcOvr[s.dpci];
    const upcDisp = upcOvrd ? '<b style="color:var(--gr)">' + effUpc + '</b> <span style="font-size:10px;color:var(--tx3)">(was ' + s.upc + ')</span>' : '' + effUpc;
    h += '<tr><td><b>' + s.name + '</b></td><td><span class="cat-badge cat-' + s.cat.replace(/[\/ ]/g, '-').toLowerCase() + '">' + s.cat + '</span></td>' +
      '<td class="tr">' + upcDisp + '</td><td class="tr"><b>' + fmtN(s.plan_total_cases) + '</b></td>' +
      '<td class="tr">' + fmtN(ratioCs) + '</td><td class="tr ' + chgCls(pR) + '">' + (dR >= 0 ? '+' : '') + fmtN(dR) + '</td>' +
      '<td class="tr">' + fmtN(covCs) + '</td><td class="tr ' + chgCls(pC) + '">' + (dC >= 0 ? '+' : '') + fmtN(dC) + '</td>' +
      '<td class="tr">' + s.os_ratio.toFixed(2) + 'x</td><td>' + sig + '</td></tr>';
  });
  const dRT = tR - tP, dCT = tC - tP;
  h += '<tr style="background:var(--s3);font-weight:700"><td>TOTAL</td><td></td><td></td><td class="tr">' + fmtN(tP) + '</td><td class="tr">' + fmtN(tR) + '</td><td class="tr ' + chgCls(dRT / tP) + '">' + (dRT >= 0 ? '+' : '') + fmtN(dRT) + '</td><td class="tr">' + fmtN(tC) + '</td><td class="tr ' + chgCls(dCT / tP) + '">' + (dCT >= 0 ? '+' : '') + fmtN(dCT) + '</td><td></td><td></td></tr>';
  h += '</tbody></table>';
  document.getElementById('pofc-sku-tbl').innerHTML = h;
}

export function renderPOFCWbW() {
  const d = DATA_POFC;
  const mk = _pofcModel === 'plan' ? 'plan_by_week' : _pofcModel === 'ratio' ? 'ratio_by_week' : 'cov_by_week';
  const lbl = _pofcModel === 'plan' ? 'Planned Cases (committed POs from ship file)' : _pofcModel === 'ratio' ? 'O/S Ratio Forecast (cases) \u2014 historical order/sell-through ratio \u00d7 13-wk demand plan' : 'Coverage-Based Forecast (cases) \u2014 DC target 5 WoS, reorder every 2 wks';
  // Event annotations for each of the 13 forward weeks
  const wkEvents = {
    0: 'Wk1 \u00b7 Smoothies+YoGos TPC \u00b7 F+V Minis Launch',
    1: 'Wk2 \u00b7 Smoothies+YoGos TPC Wk2',
    2: 'Wk3 \u00b7 \ud83e\uddf3 Frozen Co-space Starts',
    3: 'Wk4 \u00b7 \ud83e\uddf3 Frozen BOGO 25% + Co-space Wk2',
    4: 'Wk5 \u00b7 \u2b50 DWA BOGO ALL CATS + \ud83c\udd95 Frozen Broccoli & Cauli Launch',
    5: 'Wk6 \u00b7 \ud83e\uddf3 Frozen Co-space Final \u00b7 CSTI Baby Event',
    6: 'Wk7 \u00b7 Baby Puffs TPC \u00b7 Stellar Puffs TPC',
    7: 'Wk8 \u00b7 Loops TPC Wk2',
    8: 'Wk9 \u00b7 Smoothies TPC',
    9: 'Wk10 \u00b7 Frozen TPC $9.49',
    10: 'Wk11',
    11: 'Wk12 \u00b7 POG Resets',
    12: 'Wk13 \u00b7 Snacks DWA 20% off \u00b7 Frozen BOGO 25%',
  };
  let mx = 0; d.skus.forEach(s => { const sc = s.upc / upcFor(s); (s[mk] || []).forEach(v => { if (Math.round(v * sc) > mx) mx = Math.round(v * sc); }); });
  const wks = ["3/22", "3/29", "4/5", "4/12", "4/19", "4/26", "5/3", "5/10", "5/17", "5/24", "5/31", "6/7", "6/14"];
  // Plan-view explanation banner
  let h = '';
  if (_pofcModel === 'plan') {
    h += '<div style="margin-bottom:10px;padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:12px;color:var(--tx2)">' +
      '<b style="color:var(--yw)">\u2139\ufe0f Plan view (composite):</b> Solid cells = <b>committed POs</b> from ship file. ' +
      'Open weeks (no PO yet) show projected demand: ' +
      '<span style="color:rgba(129,140,248,1)"><b>purple = O/S Ratio model</b></span> \u00b7 ' +
      '<span style="color:rgba(52,211,153,1)"><b>green = Coverage model</b></span>. ' +
      'Most SKUs have POs booked 4\u20136 weeks out \u2014 projections fill the remainder. Open weeks have a subtle purple tint.</div>';
  }
  h += '<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">' + lbl + '</div>';
  h += '<table class="dt" style="font-size:11px"><thead><tr><th style="min-width:150px">SKU</th><th>Cat</th><th class="tr">UPC</th>';
  wks.forEach((w, i) => {
    const hasEv = wkEvents[i];
    const isDWA = (i === 4);
    const isEndcap = (i === 2 || i === 3 || i === 5);
    const hdr = '<th class="tr" style="' + (isDWA ? 'color:var(--gr);font-weight:700' : isEndcap ? 'color:var(--yw)' : '') + '" title="' + (hasEv || w) + '">' + w + (isDWA ? '<br><span style="font-size:8px">\u2b50DWA</span>' : isEndcap ? '<br><span style="font-size:8px">\ud83e\uddf3End</span>' : '') + '</th>';
    h += hdr;
  });
  h += '<th class="tr">13wk Total</th></tr></thead><tbody>';
  d.skus.forEach(s => {
    const effUpc = upcFor(s);
    const upcScale = s.upc / effUpc;
    const rawVals = s[mk] || Array(13).fill(0);
    const vals = rawVals.map(v => Math.round(v * upcScale));
    const tot = vals.reduce((a, b) => a + b, 0);
    const upcOvrd = _upcOvr[s.dpci];
    const upcDisp = upcOvrd ? '<b style="color:var(--gr)">' + effUpc + '</b>' : '' + effUpc;
    h += '<tr><td><b>' + s.name.substring(0, 28) + '</b></td><td><span class="cat-badge cat-' + s.cat.replace(/[\/ ]/g, '-').toLowerCase() + '">' + s.cat + '</span></td><td class="tr">' + upcDisp + '</td>';
    vals.forEach((v, i) => {
      if (_pofcModel === 'plan' && v === 0) {
        // Open week -- show Ratio (R) and Coverage (C) projections clearly
        const sc = s.upc / upcFor(s);
        const rv = Math.round((s.ratio_by_week[i] || 0) * sc);
        const cv = Math.round((s.cov_by_week[i] || 0) * sc);
        const isDWA = (i === 4);
        const cellBg = isDWA ? 'rgba(99,102,241,.18)' : 'rgba(99,102,241,.07)';
        h += '<td class="tr" style="background:' + cellBg + ';padding:3px 5px;vertical-align:middle">';
        if (rv > 0) {
          const rvCol = isDWA ? 'rgba(220,123,255,1)' : 'rgba(129,140,248,.85)';
          h += '<div style="font-size:10.5px;font-weight:600;color:' + rvCol + ';line-height:1.3" title="O/S Ratio model: ' + rv + ' cases">' + fmtN(rv) + '</div>';
        }
        if (cv > 0) {
          const cvCol = isDWA ? 'rgba(0,207,146,1)' : 'rgba(52,211,153,.8)';
          h += '<div style="font-size:9px;color:' + cvCol + ';line-height:1.2" title="Coverage model: ' + cv + ' cases">' + fmtN(cv) + '</div>';
        }
        if (!rv && !cv) h += '<span style="color:var(--tx3)">\u2014</span>';
        h += '</td>';
      } else {
        const intensity = mx > 0 ? v / mx : 0;
        const isHighlight = (i === 4 && v > 0);// DWA week flag
        const bg = v === 0 ? '' : 'rgba(99,102,241,' + (0.12 + intensity * 0.7).toFixed(2) + ')';
        const border = isHighlight ? 'outline:1px solid rgba(16,185,129,.5);' : '';
        h += '<td class="tr" style="' + (bg ? 'background:' + bg + ';font-weight:600' : '') + border + '">' + (v === 0 ? '\u2014' : fmtN(v)) + '</td>';
      }
    });
    h += '<td class="tr"><b>' + fmtN(tot) + '</b></td></tr>';
  });
  // Totals row -- in plan mode, show plan for committed weeks + ratio/coverage for open weeks
  const tots = Array(13).fill(0);
  const totsR = Array(13).fill(0), totsC = Array(13).fill(0);
  d.skus.forEach(s => {
    const sc = s.upc / upcFor(s);
    (s[mk] || []).forEach((v, i) => tots[i] += Math.round(v * sc));
    if (_pofcModel === 'plan') {
      s.ratio_by_week.forEach((v, i) => totsR[i] += Math.round(v * sc));
      s.cov_by_week.forEach((v, i) => totsC[i] += Math.round(v * sc));
    }
  });
  h += '<tr style="background:var(--s3);font-weight:700"><td>TOTAL</td><td></td><td></td>';
  tots.forEach((v, i) => {
    if (_pofcModel === 'plan' && v === 0) {
      const isDWA = (i === 4);
      const cellBg = isDWA ? 'rgba(99,102,241,.22)' : 'rgba(99,102,241,.09)';
      h += '<td class="tr" style="background:' + cellBg + ';padding:3px 5px">';
      if (totsR[i] > 0) {
        const c = isDWA ? 'rgba(220,123,255,1)' : 'rgba(129,140,248,.9)';
        h += '<div style="font-size:10.5px;font-weight:700;color:' + c + '">' + fmtN(totsR[i]) + '</div>';
      }
      if (totsC[i] > 0) {
        const c = isDWA ? 'rgba(0,207,146,1)' : 'rgba(52,211,153,.85)';
        h += '<div style="font-size:9px;color:' + c + '">' + fmtN(totsC[i]) + '</div>';
      }
      h += '</td>';
    } else {
      h += '<td class="tr"' + (i === 4 ? ' style="color:var(--gr)"' : '') + '>' + fmtN(v) + '</td>';
    }
  });
  h += '<td class="tr">' + fmtN(tots.reduce((a, b) => a + b, 0)) + '</td></tr>';
  h += '</tbody></table>';
  // Apr 19 spike explanation
  if (_pofcModel !== 'plan') {
    const apr19Tot = tots[4];
    h += '<div style="margin-top:10px;padding:9px 12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:8px;font-size:11.5px;color:var(--tx2)">' +
      '<b style="color:var(--gr)">\u2b50 Week of 4/19 \u2014 Why is it high?</b> ' +
      'Total ' + fmtN(apr19Tot) + ' cases = two drivers: ' +
      '<b>(1) DWA BOGO 25% all categories</b> = ~1.45\u20131.60x lift on all existing SKUs, and ' +
      '<b>(2) New Frozen SKU initial fills</b>: Broccoli Bites (3,696 cs) + Cauliflower Bites (3,080 cs) = 6,776 cases / 67,760 units front-loaded to ship before the DWA event. ' +
      'The underlying consumer demand lift is the DWA. The new SKU cases are a one-time fill, not recurring velocity.</div>';
  }
  document.getElementById('pofc-wbw-tbl').innerHTML = h;
}

export function renderPOFCCat() {
  if (_pofcCatDone) return; _pofcCatDone = true;
  const d = DATA_POFC;
  const cats = [...new Set(d.skus.map(s => s.cat))];
  const cc = ['rgba(99,102,241,.85)', 'rgba(0,207,146,.85)', 'rgba(255,199,17,.85)', 'rgba(239,68,68,.85)', 'rgba(168,85,247,.85)', 'rgba(20,184,166,.85)'];
  const pb = {}, rb = {}, cb = {}; cats.forEach(c => { pb[c] = 0; rb[c] = 0; cb[c] = 0; });
  d.skus.forEach(s => { pb[s.cat] = (pb[s.cat] || 0) + s.plan_total_cases; rb[s.cat] = (rb[s.cat] || 0) + s.ratio_total_cases; cb[s.cat] = (cb[s.cat] || 0) + s.cov_total_cases; });
  const ce = document.getElementById('ch-pofc-cat');
  if (ce) {
    if (ce._chart) ce._chart.destroy();
    ce._chart = new Chart(ce, {
      type: 'bar', data: {
        labels: cats, datasets: [
          { label: 'Current Plan', data: cats.map(c => pb[c]), backgroundColor: 'rgba(148,163,184,.6)', borderRadius: 3 },
          { label: 'O/S Ratio', data: cats.map(c => rb[c]), backgroundColor: 'rgba(99,102,241,.8)', borderRadius: 3 },
          { label: 'Coverage', data: cats.map(c => cb[c]), backgroundColor: 'rgba(0,207,146,.7)', borderRadius: 3 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtN(ctx.parsed.y) + ' cs' } } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }
    });
  }
  const top = [...d.skus].filter(s => s.plan_total_cases > 0).sort((a, b) => Math.abs(b.ratio_total_cases - b.plan_total_cases) - Math.abs(a.ratio_total_cases - a.plan_total_cases)).slice(0, 12);
  const ge = document.getElementById('ch-pofc-gap');
  if (ge) {
    if (ge._chart) ge._chart.destroy();
    ge._chart = new Chart(ge, {
      type: 'bar', data: { labels: top.map(s => s.name.substring(0, 20)), datasets: [{ label: 'Gap (Ratio\u2212Plan)', data: top.map(s => s.ratio_total_cases - s.plan_total_cases), backgroundColor: top.map(s => (s.ratio_total_cases - s.plan_total_cases) >= 0 ? 'rgba(239,68,68,.8)' : 'rgba(99,102,241,.7)'), borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => (ctx.parsed.x >= 0 ? '+' : '') + fmtN(ctx.parsed.x) + ' cs' } } }, scales: { x: { ticks: { callback: v => (v >= 0 ? '+' : '') + fmtN(v) } } } }
    });
  }
}

// ─── MONTHLY PACE TRACKER ─────────────────────────────────────────────────────
export function renderMTHFC() {
  if (_mthfcDone) return;
  _mthfcDone = true;
  const dp = DATA_DP;

  // Monthly bucket definitions (fcast_weeks index ranges)
  const months = [
    { label: 'March (CW)', short: 'Mar', wkIdxs: [0], wkLabels: ["3/22"], color: 'rgba(99,102,241,.7)' },
    { label: 'April', short: 'Apr', wkIdxs: [1, 2, 3, 4, 5], wkLabels: ["3/29", "4/5", "4/12", "4/19", "4/26"], color: 'rgba(255,199,17,.7)' },
    { label: 'May', short: 'May', wkIdxs: [6, 7, 8, 9, 10], wkLabels: ["5/3", "5/10", "5/17", "5/24", "5/31"], color: 'rgba(0,207,146,.7)' },
    { label: 'June (partial)', short: 'Jun', wkIdxs: [11, 12], wkLabels: ["6/7", "6/14"], color: 'rgba(168,85,247,.7)' },
  ];

  // Compute locked forecast totals per month from DATA_DP.fcast
  months.forEach(m => {
    m.fc_units = m.wkIdxs.reduce((sum, i) => sum + dp.skus.reduce((a, s) => a + sf(s.fcast[i]), 0), 0);
    m.fc_rev = m.wkIdxs.reduce((sum, i) => sum + dp.skus.reduce((a, s) => a + (sf(s.fcast[i]) * (s.price || 0)), 0), 0);
    // Weekly breakdown
    m.wkFc = m.wkIdxs.map(i => ({ wk: dp.fcast_weeks[i], units: dp.skus.reduce((a, s) => a + sf(s.fcast[i]), 0), rev: dp.skus.reduce((a, s) => a + (sf(s.fcast[i]) * (s.price || 0)), 0) }));
  });

  // Actuals from available sources
  const lwActual = dp.skus.reduce((a, s) => a + sf((s.hist || [])[12]), 0);
  const cwPartial = DATA_DAILY.cw_units;
  const cwEstFull = Math.round(cwPartial / DATA_DAILY.days_in * 7);

  const hist2 = dp.skus.reduce((a, s) => a + sf((s.hist || [])[10]), 0); // 3/1
  const hist1 = dp.skus.reduce((a, s) => a + sf((s.hist || [])[11]), 0); // 3/8
  const hist0 = dp.skus.reduce((a, s) => a + sf((s.hist || [])[12]), 0); // 3/15 = LW

  const wkActuals = {
    "3/15 '26": { act: hist0, label: 'Mar 15 (LW)', status: 'actual' },
    "3/22 '26": { act: cwPartial, estFull: cwEstFull, label: 'Mar 22 (CW \u00b7 ' + DATA_DAILY.days_in + '/7 days)', status: 'partial' },
  };

  let h = '<div style="margin-bottom:12px;display:flex;align-items:center;gap:12px">' +
    '<div style="font-size:11px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:5px 10px;color:var(--tx2)">' +
    '\ud83d\udd12 <b>Forecast locked:</b> Mar 25, 2026 \u00b7 Source: Demand Plan (DATA_DP) \u00b7 Promo weeks include lift from promo calendar</div>' +
    '<div style="font-size:11px;color:var(--tx3)">Updated weekly with new Omni actuals</div>' +
    '</div>';

  // Monthly summary cards
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">';
  months.forEach(m => {
    const isActive = m.short === 'Mar';
    const actU = m.short === 'Mar' ? (hist0 + cwEstFull) : null;
    const pctDone = actU != null && m.fc_units > 0 ? actU / m.fc_units : null;
    h += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px;' + (isActive ? 'border-color:' + m.color.replace('.7', '.5') + ';' : '') + '">';
    h += '<div style="font-size:10.5px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em">' + m.label + '</div>';
    h += '<div style="font-size:22px;font-weight:800;color:var(--tx);margin:6px 0">' + fmtN(m.fc_units) + '</div>';
    h += '<div style="font-size:11px;color:var(--tx3)">units locked \u00b7 $' + fmtN(Math.round(m.fc_rev / 1000)) + 'K rev</div>';
    if (pctDone != null) {
      const pctBar = Math.min(pctDone, 1);
      const col = pctDone >= 0.95 ? 'var(--gr)' : pctDone >= 0.75 ? 'var(--yw)' : 'var(--rd)';
      h += '<div style="margin-top:8px;font-size:11px;color:var(--tx2)">' +
        fmtN(actU) + ' actual vs plan \u00b7 <b style="color:' + col + '">' + Math.round(pctDone * 100) + '%</b></div>' +
        '<div style="height:4px;background:var(--s3);border-radius:2px;margin-top:4px">' +
        '<div style="height:4px;width:' + Math.round(pctBar * 100) + '%;background:' + col + ';border-radius:2px"></div></div>';
    } else {
      h += '<div style="margin-top:8px;font-size:11px;color:var(--tx3)">' + m.wkIdxs.length + ' weeks \u00b7 No actuals yet</div>';
    }
    h += '</div>';
  });
  h += '</div>';

  // Weekly detail table -- April
  h += '<div class="cc"><div class="ct">\ud83d\udcc5 Weekly Pace Detail \u2014 April' +
    '<span style="font-size:11px;color:var(--tx3);margin-left:12px">Locked plan vs actuals \u00b7 Gray = no data yet</span></div>' +
    '<table class="dt"><thead><tr>' +
    '<th>Week</th><th class="tr">Locked Forecast</th><th class="tr">Locked Rev</th>' +
    '<th class="tr">Actual Units</th><th class="tr">Variance</th><th class="tr">Var%</th>' +
    '<th>Events</th></tr></thead><tbody>';

  const aprMonth = months[1];
  const aprEvents = {
    "3/29 '26": 'Smoothies+YoGos TPC \u00b7 F+V Minis Wk2',
    "4/5 '26": '\ud83e\uddf3 Frozen Co-space Wk1',
    "4/12 '26": '\ud83e\uddf3 Frozen Circle BOGO 25% + Co-space Wk2',
    "4/19 '26": '\u2b50 DWA BOGO ALL \u00b7 \ud83c\udd95 Frozen launches',
    "4/26 '26": '\ud83e\uddf3 Frozen Co-space Final \u00b7 CSTI Baby',
  };
  let aprFcTot = 0, aprActTot = 0;
  aprMonth.wkFc.forEach(wk => {
    const wkKey = wk.wk;
    const actInfo = wkActuals[wkKey];
    const act = actInfo ? actInfo.act : null;
    const isPartial = actInfo && actInfo.status === 'partial';
    const var_ = act != null ? act - wk.units : null;
    const varPct = var_ != null && wk.units > 0 ? var_ / wk.units : null;
    aprFcTot += wk.units;
    if (act != null) aprActTot += act;
    h += '<tr>' +
      '<td><b>' + wkKey.replace(" '26", '') + '</b>' + (isPartial ? ' <span style="font-size:10px;color:var(--tx3)">(' + DATA_DAILY.days_in + '/7d)</span>' : '') + '</td>' +
      '<td class="tr">' + fmtN(wk.units) + '</td>' +
      '<td class="tr" style="color:var(--tx3)">$' + fmtN(Math.round(wk.rev / 1000)) + 'K</td>' +
      '<td class="tr">' + (act != null ? ('<b>' + (isPartial ? '~' : '') + fmtN(act) + '</b>') : '<span style="color:var(--tx3)">\u2014</span>') + '</td>' +
      '<td class="tr ' + (var_ != null ? chgCls(var_ / wk.units) : '') + '">' + (var_ != null ? ((var_ >= 0 ? '+' : '') + fmtN(var_)) : '\u2014') + '</td>' +
      '<td class="tr ' + (varPct != null ? chgCls(varPct) : '') + '">' + (varPct != null ? fmtPct(varPct) : '\u2014') + '</td>' +
      '<td style="font-size:10.5px;color:var(--tx3)">' + (aprEvents[wkKey] || '') + '</td></tr>';
  });
  // April total
  h += '<tr style="background:var(--s3);font-weight:700"><td>APRIL TOTAL</td>' +
    '<td class="tr">' + fmtN(aprFcTot) + '</td><td></td>' +
    '<td class="tr">' + (aprActTot ? fmtN(aprActTot) : '<span style="color:var(--tx3)">\u2014</span>') + '</td>' +
    '<td></td><td></td><td></td></tr>';
  h += '</tbody></table></div>';

  // March LW summary
  h += '<div class="cc" style="margin-top:12px"><div class="ct">\ud83d\udcc8 March \u2014 Recent Actuals vs Plan</div>' +
    '<table class="dt"><thead><tr><th>Week</th><th class="tr">Plan</th><th class="tr">Actual</th><th class="tr">Var</th><th class="tr">Var%</th></tr></thead><tbody>';
  const marW1Plan = dp.skus.reduce((a, s) => a + sf(s.fcast[0]), 0); // use W1 plan as proxy
  [
    { wk: "3/1 '26", act: hist2, plan: marW1Plan, lbl: 'Mar 1' },
    { wk: "3/8 '26", act: hist1, plan: marW1Plan, lbl: 'Mar 8' },
    { wk: "3/15 '26", act: hist0, plan: marW1Plan, lbl: 'Mar 15 (LW)' },
    { wk: "3/22 '26", act: cwPartial, plan: marW1Plan, partial: true, lbl: 'Mar 22 (' + DATA_DAILY.days_in + '/7d)' },
  ].forEach(r => {
    const v = r.act - r.plan, vp = r.plan > 0 ? v / r.plan : 0;
    h += '<tr><td>' + r.lbl + '</td>' +
      '<td class="tr">' + fmtN(r.plan) + '</td>' +
      '<td class="tr"><b>' + (r.partial ? '~' : '') + fmtN(r.act) + '</b></td>' +
      '<td class="tr ' + chgCls(vp) + '">' + (v >= 0 ? '+' : '') + fmtN(v) + '</td>' +
      '<td class="tr ' + chgCls(vp) + '">' + fmtPct(vp) + '</td></tr>';
  });
  h += '</tbody></table></div>';

  // May + June summary
  h += '<div class="cc" style="margin-top:12px"><div class="ct">\ud83d\udd2d May & June \u2014 Locked Forecast (No Actuals Yet)</div>' +
    '<table class="dt"><thead><tr><th>Week</th><th class="tr">Locked Forecast (units)</th><th class="tr">Forecast Rev</th><th>Events</th></tr></thead><tbody>';
  const mayJunEvents = {
    "5/3 '26": 'Baby Puffs TPC \u00b7 Stellar Puffs TPC',
    "5/10 '26": 'Loops TPC Wk2',
    "5/17 '26": 'Smoothies TPC',
    "5/24 '26": 'Frozen TPC $9.49',
    "6/7 '26": 'POG Resets',
    "6/14 '26": 'Snacks DWA 20% \u00b7 Frozen BOGO 25% \u00b7 Smoothies BOGO 25%',
  };
  [...months[2].wkFc, ...months[3].wkFc].forEach(wk => {
    h += '<tr><td>' + wk.wk.replace(" '26", '') + '</td>' +
      '<td class="tr">' + fmtN(wk.units) + '</td>' +
      '<td class="tr" style="color:var(--tx3)">$' + fmtN(Math.round(wk.rev / 1000)) + 'K</td>' +
      '<td style="font-size:10.5px;color:var(--tx3)">' + (mayJunEvents[wk.wk] || '') + '</td></tr>';
  });
  h += '</tbody></table></div>';

  document.getElementById('pofc-mth-body').innerHTML = h;
}
