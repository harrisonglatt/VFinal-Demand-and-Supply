// ─── ENDCAP LIFT ─────────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 2053–2144)

import { DATA_DP, DATA_PROMO, DATA_ENDCAP_HISTORY, FCAST_REV_52WK } from '../data/index.js';
import { fmt, fmtDol, sf } from '../utils/formatters.js';
import { chip, kpiCard } from '../utils/dom.js';

export function initENDCAP() {
  const histEvents = (typeof DATA_ENDCAP_HISTORY !== 'undefined' ? DATA_ENDCAP_HISTORY : []);
  const futureEvents = DATA_PROMO.filter(p => p.type && (p.type.toLowerCase().includes('co-space') || p.mechanic && p.mechanic.toLowerCase().includes('endcap')));
  const endcaps = [...histEvents, ...futureEvents].sort((a, b) => a.wk - b.wk);
  const proc = endcaps.map(p => {
    const isHist = p.wk <= 0; // historical event (pre-launch window)
    let bU, bR, lf, iU, iR;
    if (isHist) {
      // Historical: use actual_lift vs stable Frozen base (13,751/wk x ~$8.25 avg price)
      const histBase = 13751; // HIST_BASELINE.frozen.base -- stable Nov 2025 period
      const histAvgPrice = 8.25; // blended Frozen avg price/unit
      const actualLift = p.actual_lift || 1;
      bU = histBase;
      bR = Math.round(histBase * histAvgPrice);
      lf = actualLift - 1; // incremental fraction above base
      iU = Math.round(bU * lf);
      iR = bR * lf;
    } else {
      const wi = p.wk - 1;
      bU = DATA_DP.skus.reduce((a, s) => a + sf(s.fcast[Math.min(wi, 51)]), 0);
      bR = FCAST_REV_52WK[Math.max(0, wi)] || bU * 5.5;
      const rawL = (p.lift_pct || '0%').replace('%', '').replace('+', '').replace('~', '').trim();
      const numMatch = rawL.match(/(\d+(?:\.\d+)?)/);
      const lp = numMatch ? parseFloat(numMatch[0]) : 0; // keep as percent number e.g. 45
      lf = lp / 100; // convert to fraction e.g. 0.45
      iU = Math.round(bU * lf);
      iR = bR * lf;
    }
    return Object.assign({}, p, { baseUnits: bU, baseRev: bR, liftPct: lf, inclUnits: iU, inclRev: iR, isHist });
  });
  const totIncl = proc.reduce((a, p) => a + p.inclRev, 0);
  const totInclU = proc.reduce((a, p) => a + p.inclUnits, 0);
  const histProc = proc.filter(p => p.isHist);
  const histTotalIncr = histProc.reduce((a, p) => a + p.inclRev, 0);
  const futureProc = proc.filter(p => p.wk > 0);
  const futureTotalIncr = futureProc.reduce((a, p) => a + p.inclRev, 0);
  const conf = proc.filter(p => p.status && (p.status.includes('\u2713') || p.status.toLowerCase().includes('confirm')));
  const confR = conf.reduce((a, p) => a + p.inclRev, 0);
  // Avg lift: only count future events that actually have a deal mechanic (liftPct > 0)
  const futureWithLift = futureProc.filter(p => p.liftPct > 0);
  const avgLift = futureWithLift.length ? futureWithLift.reduce((a, p) => a + p.liftPct, 0) / futureWithLift.length : 0;
  const peakLift = proc.filter(p => !p.isHist).reduce((mx, p) => Math.max(mx, p.liftPct), 0);
  document.getElementById('ec-kpis').innerHTML =
    kpiCard('\ud83d\udcd0', 'Endcap Placements', '--cc:var(--cy)', proc.length, histProc.length + ' historical \u00b7 ' + futureProc.length + ' upcoming', 'neu', conf.filter(p => !p.isHist).length + ' future confirmed \u00b7 ' + (futureProc.length - conf.filter(p => !p.isHist).length) + ' proposed') +
    kpiCard('\ud83d\udce6', 'Total Incr. Units', '--cc:var(--gr)', fmt(totInclU), 'vs stable baseline velocity', 'up', fmt(histProc.reduce((a, p) => a + p.inclUnits, 0)) + ' actual hist \u00b7 ' + fmt(futureProc.reduce((a, p) => a + p.inclUnits, 0)) + ' fcast') +
    kpiCard('\ud83d\udcb0', 'Total Incr. Revenue', '--cc:var(--yw)', fmtDol(futureTotalIncr), 'Forward-looking only (upcoming)', 'up', fmtDol(histTotalIncr) + ' hist actuals (realized)') +
    kpiCard('\ud83d\udccd', 'Avg Lift %', '--cc:var(--pu)', (avgLift * 100).toFixed(0) + '%', 'Future events with deal mechanic', 'neu', (peakLift * 100).toFixed(0) + '% peak \u00b7 excl. co-space-only');
  const ev = proc.map(p => p.isHist ? ('\u21a9 ' + p.date) : ('Wk' + p.wk + ' ' + p.category.substring(0, 7)));
  const er = proc.map(p => p.inclRev);
  const ec = proc.map(p => {
    if (p.isHist) return 'rgba(24,167,255,.55)'; // blue for historical
    const ok = p.status && (p.status.includes('\u2713') || p.status.toLowerCase().includes('confirm'));
    return ok ? 'rgba(0,207,146,.8)' : 'rgba(255,199,17,.6)';
  });
  new Chart(document.getElementById('ch-ec-lift'), {
    type: 'bar', data: { labels: ev, datasets: [{ label: 'Incr. Revenue', data: er, backgroundColor: ec, borderRadius: 4 }] },
    options: {
      responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fmtDol(ctx.parsed.y) } } },
      scales: { x: { ticks: { color: '#44608a', font: { size: 9 } } }, y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' } } }
    }
  });
  new Chart(document.getElementById('ch-ec-split'), {
    type: 'doughnut', data: { labels: ['Confirmed', 'Proposed'], datasets: [{ data: [confR, totIncl - confR], backgroundColor: ['rgba(0,207,146,.8)', 'rgba(255,199,17,.6)'], borderColor: '#08101f', borderWidth: 2 }] },
    options: { responsive: true, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: '#7b97c8', font: { size: 12 } } } } }
  });
  let h = '<table><thead><tr><th>Week</th><th>Event</th><th>Category</th><th>Type</th><th>Stores</th><th class="tr">Lift %</th><th class="tr">Base Units</th><th class="tr">Incr. Units</th><th class="tr">Base Rev</th><th class="tr">Incr. Rev</th><th>Status</th></tr></thead><tbody>' +
    '<tr><td colspan="11" style="background:rgba(24,167,255,.06);color:var(--cy);font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:5px 12px;border-bottom:1px solid rgba(24,167,255,.18)">\u21a9 HISTORICAL EVENTS \u2014 Jan\u2013Feb 2026 \u00b7 Realized actuals vs stable baseline (' + fmt(13751) + ' units/wk)</td></tr>';
  // Separator row before future events
  let pastShown = false;
  proc.forEach(p => {
    if (!pastShown && !p.isHist) {
      pastShown = true;
      h += '<tr><td colspan="11" style="background:rgba(0,227,205,.05);color:var(--tx3);font-size:10.5px;font-weight:700;letter-spacing:.05em;padding:6px 12px;border-top:1px solid rgba(0,227,205,.2);border-bottom:1px solid rgba(0,227,205,.2)">\u25b6 UPCOMING EVENTS</td></tr>';
    }
    const ok = p.status && (p.status.includes('\u2713') || p.status.toLowerCase().includes('confirm'));
    const isHist = !!p.isHist;
    const liftDisplay = isHist
      ? (p.actual_lift ? ((p.actual_lift - 1) * 100).toFixed(0) + '% actual' : '\u2014')
      : (p.liftPct * 100).toFixed(0) + '%';
    const liftColor = isHist ? 'color:var(--cy)' : '';
    h += '<tr style="' + (isHist ? 'opacity:0.82;background:rgba(24,167,255,.04)' : '') + '">' +
      '<td>' + chip(isHist ? 'cy2' : 'cb', (isHist ? '\u21a9 ' : 'Wk' + p.wk + ' ') + p.date) + '</td>' +
      '<td class="tn" title="' + p.event + '" style="max-width:200px">' + p.event + '</td>' +
      '<td>' + chip('cgr', p.category.substring(0, 12)) + '</td>' +
      '<td>' + chip('cp', p.type) + '</td>' +
      '<td style="font-size:11.5px">' + p.stores + '</td>' +
      '<td class="tr up" style="' + liftColor + '">' + liftDisplay + '</td>' +
      '<td class="tr">' + fmt(p.baseUnits) + '</td>' +
      '<td class="tr up">' + fmt(p.inclUnits) + '</td>' +
      '<td class="tr">' + fmtDol(p.baseRev) + '</td>' +
      '<td class="tr up">' + fmtDol(p.inclRev) + '</td>' +
      '<td>' + (isHist ? '<span class="ch" style="background:rgba(24,167,255,.15);color:var(--cy)">\ud83d\udccb Historical</span>' : ok ? '<span class="ch cg">\u2713 Confirmed</span>' : '<span class="ch cy2">\u23f3 Proposed</span>') + '</td></tr>';
  });
  h += '</tbody></table>';
  document.getElementById('ec-tbl').innerHTML = h;
}
