// ─── DAILY PERFORMANCE ────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 2445–2666)

import { DATA_DAILY } from '../data/index.js';
import { fmt as fmtN, fmtP as fmtPct, sf, chgCls } from '../utils/formatters.js';
import { fillSel } from '../utils/dom.js';

let _dp2V = 'wow';
let _dp2TU = false;
let _dp2Donut = false;

export function dp2View(v, btn) {
  document.querySelectorAll('#dp2-vw .btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['wow', 'trend', 'product', 'sku'].forEach(id => {
    const el = document.getElementById('dp2-' + id + '-view');
    if (el) el.style.display = (id === v ? '' : 'none');
  });
  // hide filters unless sku
  const catEl = document.getElementById('dp2-cat');
  const qEl = document.getElementById('dp2-q');
  if (catEl) catEl.style.display = (v === 'sku' ? '' : 'none');
  if (qEl) qEl.style.display = (v === 'sku' ? '' : 'none');
  if (v === 'trend' && !_dp2TU) renderDP2Trend();
  if (v === 'product' && !_dp2Donut) renderDP2Product();
  if (v === 'sku') renderDP2SKU();
}

export function initDP2() {
  const d = DATA_DAILY;
  const pace_u = (d.cw_daily_avg_u / d.lw_daily_avg_u - 1);
  const pace_s = (d.cw_daily_avg_s / d.lw_daily_avg_s - 1);
  const lw_2day_u = d.lw_daily_avg_u * d.days_in;
  const lw_2day_s = d.lw_daily_avg_s * d.days_in;
  const wow_u = (d.cw_units - lw_2day_u) / lw_2day_u;
  const wow_s = (d.cw_sales - lw_2day_s) / lw_2day_s;
  const kpis = [
    { l: 'CW Units (' + d.days_in + 'd)', v: fmtN(d.cw_units), sub: 'LW pace: ' + fmtN(d.lw_daily_avg_u) + '/day', chg: wow_u },
    { l: 'CW Revenue (' + d.days_in + 'd)', v: '$' + fmtN(Math.round(d.cw_sales)), sub: 'LW pace: $' + fmtN(Math.round(d.lw_daily_avg_s)) + '/day', chg: wow_s },
    { l: 'Daily Avg Units', v: fmtN(d.cw_daily_avg_u), sub: 'LW: ' + fmtN(d.lw_daily_avg_u) + '/day', chg: pace_u },
    { l: 'Daily Avg Revenue', v: '$' + fmtN(Math.round(d.cw_daily_avg_s)), sub: 'LW: $' + fmtN(Math.round(d.lw_daily_avg_s)) + '/day', chg: pace_s },
  ];
  document.getElementById('dp2-kpis').innerHTML = kpis.map(k =>
    '<div class="kc"><div class="kl">' + k.l + '</div><div class="kv">' + k.v + '</div>' +
    '<div class="ks">' + k.sub + '</div>' +
    (k.chg != null ? '<div class="kd ' + chgCls(k.chg) + '">' + fmtPct(k.chg) + ' vs LW same days</div>' : '') +
    '</div>'
  ).join('');
  // populate category filter
  fillSel('dp2-cat', DATA_DAILY.skus.map(s => s.cat));
  // hide sku filters initially
  document.getElementById('dp2-cat').style.display = 'none';
  document.getElementById('dp2-q').style.display = 'none';
  // charts are rendered lazily on first nav to this page (page hidden at boot = 0x0 canvas)
}

export function renderDP2WoW() {
  const d = DATA_DAILY;
  const cw = d.dow_compare;
  const labels = cw.map(r => r.dow);
  const lwU = cw.map(r => r.lw_units);
  const cwU = cw.map(r => r.cw_units);
  const lwS = cw.map(r => r.lw_sales);
  const cwS = cw.map(r => r.cw_sales);

  const cu = document.getElementById('ch-dp2-units');
  if (cu) {
    if (cu._chart) cu._chart.destroy();
    cu._chart = new Chart(cu, {
      type: 'bar', data: {
        labels, datasets: [
          { label: 'LW ' + d.lw_label, data: lwU, backgroundColor: 'rgba(148,163,184,0.55)', borderRadius: 4 },
          { label: 'CW ' + d.cw_label, data: cwU, backgroundColor: 'rgba(99,102,241,0.85)', borderRadius: 4 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtN(ctx.parsed.y) + ' units' } } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }
    });
  }
  const cr = document.getElementById('ch-dp2-rev');
  if (cr) {
    if (cr._chart) cr._chart.destroy();
    cr._chart = new Chart(cr, {
      type: 'bar', data: {
        labels, datasets: [
          { label: 'LW ' + d.lw_label, data: lwS.map(v => Math.round(v)), backgroundColor: 'rgba(148,163,184,0.55)', borderRadius: 4 },
          { label: 'CW ' + d.cw_label, data: cwS.map(v => Math.round(v)), backgroundColor: 'rgba(0,207,146,0.85)', borderRadius: 4 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + fmtN(Math.round(ctx.parsed.y)) } } }, scales: { y: { ticks: { callback: v => '$' + fmtN(Math.round(v)) } } } }
    });
  }

  // DOW comparison table
  let h = '<table class="dt"><thead><tr><th>Day</th><th>LW Date</th><th class="tr">LW Units</th><th class="tr">LW Revenue</th><th>CW Date</th><th class="tr">CW Units</th><th class="tr">CW Revenue</th><th class="tr">Units WoW</th><th class="tr">Rev WoW</th></tr></thead><tbody>';
  let twU = 0, twS = 0, tlwU = 0, tlwS = 0;
  d.dow_compare.forEach(r => {
    const du = (r.cw_units - r.lw_units) / r.lw_units;
    const ds = (r.cw_sales - r.lw_sales) / r.lw_sales;
    twU += r.cw_units; twS += r.cw_sales; tlwU += r.lw_units; tlwS += r.lw_sales;
    h += '<tr><td><b>' + r.dow + '</b></td><td style="color:var(--tx3)">' + r.lw_date + '</td>' +
      '<td class="tr">' + fmtN(r.lw_units) + '</td><td class="tr">$' + fmtN(Math.round(r.lw_sales)) + '</td>' +
      '<td style="color:var(--ac2)">' + r.cw_date + '</td>' +
      '<td class="tr"><b>' + fmtN(r.cw_units) + '</b></td><td class="tr"><b>$' + fmtN(Math.round(r.cw_sales)) + '</b></td>' +
      '<td class="tr ' + chgCls(du) + '"><b>' + fmtPct(du) + '</b></td>' +
      '<td class="tr ' + chgCls(ds) + '"><b>' + fmtPct(ds) + '</b></td></tr>';
  });
  const du2 = (twU - tlwU) / tlwU, ds2 = (twS - tlwS) / tlwS;
  h += '<tr style="background:var(--s3);font-weight:700"><td colspan="2">CW Total (' + d.days_in + 'd)</td>' +
    '<td class="tr">' + fmtN(tlwU) + '</td><td class="tr">$' + fmtN(Math.round(tlwS)) + '</td>' +
    '<td></td><td class="tr">' + fmtN(twU) + '</td><td class="tr">$' + fmtN(Math.round(twS)) + '</td>' +
    '<td class="tr ' + chgCls(du2) + '">' + fmtPct(du2) + '</td>' +
    '<td class="tr ' + chgCls(ds2) + '">' + fmtPct(ds2) + '</td></tr>';
  h += '</tbody></table>';
  document.getElementById('dp2-dow-tbl').innerHTML = h;
}

export function renderDP2Trend() {
  _dp2TU = true;
  const d = DATA_DAILY;
  const all = d.daily_totals;
  const labels = all.map(r => r.date + ' (' + r.dow + ')');
  const udata = all.map(r => r.units);
  const sdata = all.map(r => Math.round(r.sales));
  const bgs = all.map(r => r.wk === 'CW' ? 'rgba(99,102,241,0.9)' : r.wk === 'LW' ? 'rgba(0,207,146,0.75)' : 'rgba(148,163,184,0.5)');
  const bgsR = all.map(r => r.wk === 'CW' ? 'rgba(99,102,241,0.9)' : r.wk === 'LW' ? 'rgba(0,207,146,0.75)' : 'rgba(148,163,184,0.5)');

  const cu = document.getElementById('ch-dp2-trend-u');
  if (cu) {
    if (cu._chart) cu._chart.destroy();
    cu._chart = new Chart(cu, {
      type: 'bar', data: {
        labels, datasets: [
          { label: 'Units/Day', data: udata, backgroundColor: bgs, borderRadius: 3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtN(ctx.parsed.y) + ' units' } } }, scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } }, y: { ticks: { callback: v => fmtN(v) } } } }
    });
  }
  const cr = document.getElementById('ch-dp2-trend-r');
  if (cr) {
    if (cr._chart) cr._chart.destroy();
    cr._chart = new Chart(cr, {
      type: 'bar', data: {
        labels, datasets: [
          { label: 'Revenue/Day', data: sdata, backgroundColor: bgsR, borderRadius: 3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '$' + fmtN(Math.round(ctx.parsed.y)) } } }, scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } }, y: { ticks: { callback: v => '$' + fmtN(Math.round(v)) } } } }
    });
  }
}

export function renderDP2Product() {
  _dp2Donut = true;
  const d = DATA_DAILY;
  const cats = d.cat_summary;
  const catLabels = cats.map(c => c.cat);
  const catColors = ['rgba(99,102,241,0.85)', 'rgba(0,207,146,0.85)', 'rgba(255,199,17,0.85)', 'rgba(239,68,68,0.85)', 'rgba(168,85,247,0.85)'];

  // Donut - Revenue
  const cd = document.getElementById('ch-dp2-donut');
  if (cd) {
    if (cd._chart) cd._chart.destroy();
    cd._chart = new Chart(cd, {
      type: 'doughnut', data: {
        labels: catLabels,
        datasets: [{ data: cats.map(c => Math.round(c.cw_sales)), backgroundColor: catColors, borderWidth: 2, borderColor: '#1e293b' }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '60%', plugins: {
          legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': $' + fmtN(Math.round(ctx.parsed)) + ' (' + Math.round(ctx.parsed / cats.reduce((a, c) => a + c.cw_sales, 0) * 100) + '%)' } },
        }
      }
    });
  }

  // Bar - Units by category
  const cb = document.getElementById('ch-dp2-cat-bar');
  if (cb) {
    if (cb._chart) cb._chart.destroy();
    cb._chart = new Chart(cb, {
      type: 'bar', data: {
        labels: catLabels,
        datasets: [
          { label: 'LW same 3d', data: cats.map(c => sf(c.lw_3day_units)), backgroundColor: 'rgba(148,163,184,0.45)', borderRadius: 3 },
          { label: 'CW ' + d.days_in + 'd', data: cats.map(c => c.cw_units), backgroundColor: catColors, borderRadius: 3 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtN(ctx.parsed.y) + ' units' } } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }
    });
  }

  // Product table sorted by CW revenue desc
  const prods = [...d.skus].sort((a, b) => b.cw_sales - a.cw_sales);
  let h = '<table class="dt"><thead><tr>' +
    '<th>Product</th><th>Category</th>' +
    '<th class="tr">CW Units (' + d.days_in + 'd)</th><th class="tr">CW Revenue</th>' +
    '<th class="tr">LW Same 3D</th><th class="tr">LW Rev Same 3D</th>' +
    '<th class="tr">Units WoW</th><th class="tr">Rev WoW</th>' +
    '</tr></thead><tbody>';
  let totalCwU = 0, totalCwS = 0, totalLwU = 0, totalLwS = 0;
  prods.forEach(s => {
    const flagU = s.wow_units_pct >= 0.15 ? '\ud83d\ude80' : s.wow_units_pct <= -0.15 ? '\u26a0\ufe0f' : '';
    const flagS = s.wow_sales_pct >= 0.15 ? '\ud83d\ude80' : s.wow_sales_pct <= -0.15 ? '\u26a0\ufe0f' : '';
    totalCwU += s.cw_units; totalCwS += s.cw_sales;
    totalLwU += sf(s.lw_3day_units); totalLwS += sf(s.lw_3day_sales);
    h += '<tr>' +
      '<td><b>' + s.name + '</b></td>' +
      '<td><span class="cat-badge cat-' + s.cat.replace(/[\/ ]/g, '-').toLowerCase() + '">' + s.cat + '</span></td>' +
      '<td class="tr">' + fmtN(s.cw_units) + '</td>' +
      '<td class="tr"><b>$' + fmtN(Math.round(s.cw_sales)) + '</b></td>' +
      '<td class="tr" style="color:var(--tx3)">' + fmtN(sf(s.lw_3day_units)) + '</td>' +
      '<td class="tr" style="color:var(--tx3)">$' + fmtN(Math.round(sf(s.lw_3day_sales))) + '</td>' +
      '<td class="tr ' + chgCls(s.wow_units_pct) + '">' + flagU + ' ' + fmtPct(s.wow_units_pct) + '</td>' +
      '<td class="tr ' + chgCls(s.wow_sales_pct) + '">' + flagS + ' ' + fmtPct(s.wow_sales_pct) + '</td>' +
      '</tr>';
  });
  const totWoWU = (totalCwU - totalLwU) / totalLwU, totWoWS = (totalCwS - totalLwS) / totalLwS;
  h += '<tr style="background:var(--s3);font-weight:700"><td>TOTAL</td><td></td>' +
    '<td class="tr">' + fmtN(totalCwU) + '</td><td class="tr">$' + fmtN(Math.round(totalCwS)) + '</td>' +
    '<td class="tr">' + fmtN(totalLwU) + '</td><td class="tr">$' + fmtN(Math.round(totalLwS)) + '</td>' +
    '<td class="tr ' + chgCls(totWoWU) + '">' + fmtPct(totWoWU) + '</td>' +
    '<td class="tr ' + chgCls(totWoWS) + '">' + fmtPct(totWoWS) + '</td>' +
    '</tr></tbody></table>';
  document.getElementById('dp2-prod-tbl').innerHTML = h;
}

export function renderDP2SKU() {
  const d = DATA_DAILY;
  const cat = document.getElementById('dp2-cat').value;
  const q = (document.getElementById('dp2-q').value || '').toLowerCase();
  let skus = d.skus.filter(s => (!cat || s.cat === cat) && (!q || s.name.toLowerCase().includes(q)));
  document.getElementById('dp2-meta').textContent = skus.length + ' SKUs \u00b7 Through ' + d.as_of;
  let h = '<table class="dt"><thead><tr>' +
    '<th>SKU</th><th>Category</th>' +
    '<th class="tr">CW Units (' + d.days_in + 'd)</th><th class="tr">CW Revenue</th>' +
    '<th class="tr">LW Same Days</th><th class="tr">LW Rev Same Days</th>' +
    '<th class="tr">Units WoW</th><th class="tr">Rev WoW</th>' +
    '</tr></thead><tbody>';
  skus.forEach(s => {
    const flagU = s.wow_units_pct >= 0.20 ? '\ud83d\ude80' : s.wow_units_pct <= -0.20 ? '\u26a0\ufe0f' : '';
    const flagS = s.wow_sales_pct >= 0.20 ? '\ud83d\ude80' : s.wow_sales_pct <= -0.20 ? '\u26a0\ufe0f' : '';
    h += '<tr>' +
      '<td><b>' + s.name + '</b></td>' +
      '<td><span class="cat-badge cat-' + s.cat.replace(/[\/ ]/g, '-').toLowerCase() + '">' + s.cat + '</span></td>' +
      '<td class="tr">' + fmtN(s.cw_units) + '</td>' +
      '<td class="tr"><b>$' + fmtN(Math.round(s.cw_sales)) + '</b></td>' +
      '<td class="tr" style="color:var(--tx3)">' + fmtN(sf(s.lw_3day_units)) + '</td>' +
      '<td class="tr" style="color:var(--tx3)">$' + fmtN(Math.round(sf(s.lw_3day_sales))) + '</td>' +
      '<td class="tr ' + chgCls(s.wow_units_pct) + '">' + flagU + ' ' + fmtPct(s.wow_units_pct) + '</td>' +
      '<td class="tr ' + chgCls(s.wow_sales_pct) + '">' + flagS + ' ' + fmtPct(s.wow_sales_pct) + '</td>' +
      '</tr>';
  });
  h += '</tbody></table>';
  document.getElementById('dp2-sku-tbl').innerHTML = h;
}
