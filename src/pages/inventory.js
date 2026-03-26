// ─── INVENTORY ────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1518–1605)

import { DATA_INV, DATA_TARGET_DC } from '../data/index.js';
import { fmt, fmtD, fmtDol, sf } from '../utils/formatters.js';
import { kpiCard, riskChip } from '../utils/dom.js';

// ─── Module-level state ─────────────────────────────────────────────
let _invVw = 'ls';

export function invView(v, btn) {
  _invVw = v;
  document.querySelectorAll('#inv-vw .btn').forEach(b => b.classList.toggle('on', b === btn));
  renderINV();
}

export function initINV() {
  const s = DATA_INV.summary;
  // DC summary
  const dcLow = DATA_TARGET_DC.skus.filter(s => s.wos_dc < 6).length;
  const dcWatch = DATA_TARGET_DC.skus.filter(s => s.wos_dc >= 6 && s.wos_dc < 10).length;
  const dcAvgWos = (DATA_TARGET_DC.skus.reduce((a, s) => a + s.wos_dc, 0) / DATA_TARGET_DC.skus.length).toFixed(1);
  document.getElementById('inv-kpis').innerHTML =
    kpiCard('\u{1F534}', 'LS OOS Alerts', '--cc:var(--rd)', s.oos_alerts, 'LS WH: SKUs with store OOS', 'dn', fmtDol(s.lost_per_week) + '/wk lost') +
    kpiCard('\u{1F7E1}', 'LS Supply Watch', '--cc:var(--yw)', s.supply_watch, 'SKUs <4 WOS in LS WH', 'neu', fmtDol(s.annualized_loss) + ' annualized') +
    kpiCard('\u{1F3EA}', 'Target DC Low Stock', '--cc:var(--rd)', dcLow, 'SKUs <6 WOS at Target DCs', 'dn', dcWatch + ' SKUs on watch (6\u201310 WOS)') +
    kpiCard('\u{1F4CA}', 'Target DC Avg WOS', '--cc:var(--gr)', dcAvgWos + ' wks', 'Across ' + DATA_TARGET_DC.skus.length + ' SKUs (WOS = DC EOH \u00F7 L4W weekly sell-thru)', 'up', 'Source: Omni \u00B7 ' + DATA_TARGET_DC.as_of + ' \u00B7 High avg driven by well-stocked core SKUs');
  renderINV();
}

export function renderINV() {
  const rf = document.getElementById('inv-rf').value;
  const q = (document.getElementById('inv-q').value || '').toLowerCase();
  const so = document.getElementById('inv-so').value;
  if (_invVw === 'dc') { renderINV_DC(q, so); return; }
  let skus = [...DATA_INV.skus].filter(s => {
    const f = s.risk_flag || '';
    return (!rf || (rf === 'OOS' ? f.includes('OOS') : f.includes('Watch'))) &&
      (!q || s.description.toLowerCase().includes(q));
  }).sort((a, b) => so === 'oos' ? sf(b.oos_pct) - sf(a.oos_pct) : so === 'wos' ? sf(a.wos_current) - sf(b.wos_current) : sf(b.lost_dollar_week) - sf(a.lost_dollar_week));
  document.getElementById('inv-meta').textContent = skus.length + ' SKUs';
  let h = '<table><thead><tr>' +
    '<th style="min-width:175px">SKU</th><th class="tr">Stores</th>' +
    '<th class="tr">L4W UPSPW</th><th class="tr">OOS%</th>' +
    '<th class="tr">WOS Now</th><th class="tr">WOS \u03944W</th>' +
    '<th class="tr">EOH Units</th><th class="tr">On Order</th>' +
    '<th class="tr">Lost$/Wk</th><th>Risk</th>' +
    '</tr></thead><tbody>';
  skus.forEach(s => {
    const op = sf(s.oos_pct) * 100, oc = op > 20 ? 'dn' : op > 10 ? 'neu' : 'up';
    const wt = sf(s.wos_current) - sf(s.wos_4w_ago);
    h += `<tr>
      <td class="tn" title="${s.description}">${s.description.replace('Little Spoon ', '')}</td>
      <td class="tr">${fmt(s.stores_tracked)}</td>
      <td class="tr">${fmtD(s.l4w_upspw, 2)}</td>
      <td class="tr ${oc}">${fmtD(op, 1)}%</td>
      <td class="tr">${fmtD(s.wos_current, 1)}</td>
      <td class="tr ${wt >= 0 ? 'up' : 'dn'}">${wt >= 0 ? '+' : ''}${fmtD(wt, 1)}</td>
      <td class="tr">${fmt(s.eoh_units)}</td>
      <td class="tr">${fmt(s.on_order_units)}</td>
      <td class="tr ${s.lost_dollar_week > 0 ? 'dn' : ''}">${s.lost_dollar_week ? fmtDol(s.lost_dollar_week) : '\u2014'}</td>
      <td>${riskChip(s.risk_flag)}</td>
    </tr>`;
  });
  h += '</tbody></table>';
  document.getElementById('inv-ts').innerHTML = h;
}

export function renderINV_DC(q, so) {
  let skus = [...DATA_TARGET_DC.skus].filter(s =>
    (!q || s.name.toLowerCase().includes(q) || s.dpci.includes(q))
  ).sort((a, b) => so === 'wos' ? a.wos_dc - b.wos_dc : b.oh_units - a.oh_units);
  let h = '<table><thead><tr>' +
    '<th style="min-width:200px">SKU</th><th>DPCI</th>' +
    '<th class="tr">DC On-Hand</th><th class="tr">On Order</th>' +
    '<th class="tr">WOS (DC)</th><th class="tr">UPSPW</th>' +
    '<th class="tr">Stores</th><th>DC Status</th>' +
    '</tr></thead><tbody>';
  skus.forEach(s => {
    const rk = s.dc_risk || '';
    const wc = s.wos_dc < 6 ? 'dn' : s.wos_dc < 10 ? 'neu' : 'up';
    h += '<tr>' +
      '<td class="tn" title="' + s.name + '">' + s.name + '</td>' +
      '<td style="font-size:11px;color:var(--tx3)">' + s.dpci + '</td>' +
      '<td class="tr">' + fmt(s.oh_units) + '</td>' +
      '<td class="tr" style="color:var(--cy)">' + fmt(s.on_order) + '</td>' +
      '<td class="tr ' + wc + '">' + s.wos_dc.toFixed(1) + ' wks</td>' +
      '<td class="tr">' + s.velocity.toFixed(2) + '</td>' +
      '<td class="tr">' + fmt(s.stores) + '</td>' +
      '<td>' +
        (rk.includes('\u{1F534}') ? '<span class="ch cr">\u{1F534} Low</span>' :
         rk.includes('\u{1F7E1}') ? '<span class="ch cy2">\u{1F7E1} Watch</span>' :
         '<span class="ch cg">\u2705 OK</span>') +
      '</td></tr>';
  });
  h += '</tbody></table>';
  const el = document.getElementById('inv-ts');
  if (el) el.innerHTML = h;
  const meta = document.getElementById('inv-meta');
  if (meta) meta.textContent = skus.length + ' SKUs \u00B7 Target DC \u00B7 Omni ' + DATA_TARGET_DC.as_of;
}
