// ─── LAUNCH ───────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1890–1926)

import { DATA_LAUNCH } from '../data/index.js';
import { fmt, sf } from '../utils/formatters.js';

let _laS = 'base';
let _laChart = null;

const RAMP = [.15, .28, .40, .52, .63, .72, .80, .86, .91, .95, .97, .99, 1.0];
const RAMP_WKS = ['W1 3/22', 'W2 3/29', 'W3 4/5', 'W4 4/12', 'W5 4/19', 'W6 4/26', 'W7 5/3', 'W8 5/10', 'W9 5/17', 'W10 5/24', 'W11 5/31', 'W12 6/7', 'W13 6/14'];
const LA_COLS = ['#00E3CD', '#00CF92', '#FFC711', '#DC7BFF'];

export function laScen(s, btn) {
  _laS = s;
  document.querySelectorAll('#la-sc .btn').forEach(b => b.classList.toggle('on', b === btn));
  renderLAUNCH();
}

export function initLAUNCH() { renderLAUNCH(); }

export function renderLAUNCH() {
  const datasets = [];
  document.getElementById('la-cards').innerHTML = DATA_LAUNCH.skus.map((sku, i) => {
    const vel = sf(sku[_laS]);
    const units = RAMP.map(r => Math.round(r * vel * sku.stores));
    const tot = units.reduce((a, b) => a + b, 0);
    datasets.push({ label: sku.name.replace('Stellar Puffs, ', 'SP ').replace('Fruit+Veggie Minis, ', 'FVM '), data: units, bc: LA_COLS[i] });
    return `<div class="lc"><div class="ln">${sku.name}</div>
      <div class="sr">
        <div class="sp bear ${_laS === 'bear' ? 'on' : ''}"><div class="sl">Bear</div><div class="sv">${sku.bear}</div><div style="font-size:10px;color:var(--tx3)">UPSPW</div></div>
        <div class="sp base ${_laS === 'base' ? 'on' : ''}"><div class="sl">Base</div><div class="sv">${sku.base}</div><div style="font-size:10px;color:var(--tx3)">UPSPW</div></div>
        <div class="sp bull ${_laS === 'bull' ? 'on' : ''}"><div class="sl">Bull</div><div class="sv">${sku.bull}</div><div style="font-size:10px;color:var(--tx3)">UPSPW</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--tx2)">
        <span>Wk1: <strong style="color:var(--tx)">${fmt(units[0])}</strong></span>
        <span>Wk13: <strong style="color:var(--tx)">${fmt(units[12])}</strong></span>
        <span>13-Wk: <strong style="color:var(--ac2)">${fmt(tot)}</strong></span>
      </div></div>`;
  }).join('');
  if (_laChart) _laChart.destroy();
  _laChart = new Chart(document.getElementById('ch-launch'), {
    type: 'line', data: {
      labels: RAMP_WKS, datasets: datasets.map(d => ({
        label: d.label, data: d.data, borderColor: d.bc, backgroundColor: d.bc + '12',
        fill: true, tension: .4, pointRadius: 3, borderWidth: 2
      }))
    },
    options: {
      responsive: true, plugins: { legend: { labels: { color: '#7b97c8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#44608a', font: { size: 10 } } },
        y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => fmt(v) } }
      }
    }
  });
}
