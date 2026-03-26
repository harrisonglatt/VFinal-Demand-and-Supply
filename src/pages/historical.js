// ─── HISTORICAL ───────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1927–1957)

import { DATA_HIST } from '../data/index.js';
import { fmt, sf } from '../utils/formatters.js';
import { chip, fillSel } from '../utils/dom.js';

let _hiV = 'units';

export function hiView(v, btn) {
  _hiV = v;
  document.querySelectorAll('#hi-vt .btn').forEach(b => b.classList.toggle('on', b === btn));
  renderHIST();
}

export function initHIST() {
  fillSel('hi-pl', DATA_HIST.skus.map(s => s.product_line));
  renderHIST();
}

export function renderHIST() {
  const pl = document.getElementById('hi-pl').value,
    q = (document.getElementById('hi-q').value || '').toLowerCase();
  let skus = DATA_HIST.skus.filter(s => (!pl || s.product_line === pl) && (!q || s.product.toLowerCase().includes(q)));
  document.getElementById('hi-meta').textContent = skus.length + ' SKUs';
  const wks = DATA_HIST.weeks.slice(-13);
  let maxV = 1;
  if (_hiV === 'heat') skus.forEach(s => wks.forEach(w => { if (sf(s.weeks[w]) > maxV) maxV = sf(s.weeks[w]); }));
  const heatCol = v => { if (!v) return 'transparent'; const p = sf(v) / maxV; return `rgba(${Math.round(59 + 180 * p)},${Math.round(130 - 62 * p)},${Math.round(246 - 178 * p)},${.25 + p * .55})`; };
  let h = '<table><thead><tr><th style="min-width:155px">Product</th><th>Line</th>' +
    wks.map(w => `<th class="tr" style="font-size:10px">${w}</th>`).join('') +
    '<th class="tr">Total</th><th class="tr">Trend</th></tr></thead><tbody>';
  skus.forEach(s => {
    const vals = wks.map(w => sf(s.weeks[w]));
    const tot = vals.reduce((a, b) => a + b, 0);
    const l4 = vals.slice(-4).reduce((a, b) => a + b, 0) / 4 || 1, f4 = vals.slice(0, 4).reduce((a, b) => a + b, 0) / 4 || 1;
    const tr = (l4 - f4) / f4;
    h += `<tr><td class="tn">${s.product}</td><td>${chip('cgr', s.product_line || '\u2014')}</td>
      ${vals.map(v => `<td class="tr" style="${_hiV === 'heat' ? 'background:' + heatCol(v) + ';' : ''}">${v ? fmt(v) : '\u2014'}</td>`).join('')}
      <td class="tr" style="font-weight:600">${fmt(tot)}</td>
      <td class="tr ${tr > .05 ? 'up' : tr < -.05 ? 'dn' : 'neu'}">${tr >= 0 ? '\u2191' : '\u2193'}${Math.abs(tr * 100).toFixed(0)}%</td>
    </tr>`;
  });
  h += '</tbody></table>';
  document.getElementById('hi-ts').innerHTML = h;
}
