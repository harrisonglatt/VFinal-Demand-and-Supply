// ─── PROMO ────────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 1721–1889)

import { DATA_PROMO, DATA_HIST_PROMO } from '../data/index.js';
import { fmt } from '../utils/formatters.js';
import { kpiCard, chip, fillSel } from '../utils/dom.js';

// ─── Module-level state ─────────────────────────────────────────────
let _prView = 'forward';

export function prView(v, btn) {
  _prView = v;
  document.querySelectorAll('#pr-view-tog .btn').forEach(b => b.classList.toggle('on', b === btn));
  const fwd = document.getElementById('pr-list');
  const hist = document.getElementById('pr-hist-list');
  if (fwd) fwd.style.display = v === 'forward' ? '' : 'none';
  if (hist) hist.style.display = v === 'historical' ? '' : 'none';
  if (v === 'historical') renderHistPROMO();
  else renderPROMO();
}

export function initPROMO() {
  fillSel('pr-cat', DATA_PROMO.map(p => p.category));
  renderPROMO();
}

export function renderPROMO() {
  const cat = document.getElementById('pr-cat').value, tp = document.getElementById('pr-tp').value, st = document.getElementById('pr-st').value;
  let ev = DATA_PROMO.filter(p => (!cat || p.category === cat) && (!tp || (p.type || '').includes(tp)) && (!st || (p.status || '').includes(st)));
  document.getElementById('pr-meta').textContent = ev.length + ' events';
  const tc = { 'TPC': 'cb', 'Endcap': 'cp', 'Digital': 'cy2', 'Clearance': 'cr', 'TPR': 'cy2' };
  document.getElementById('pr-list').innerHTML = '<div class="pl">' + ev.map(p => {
    const lv = parseInt((p.lift_pct || '0').replace('%', '')) || 0;
    const isConf = p.status.toLowerCase().includes('confirm') || p.status.includes('\u2713');
    return `<div class="pc"><div class="pw"><strong>W${p.wk}</strong>${p.date}</div>
      <div class="pi"><div class="pe">${p.event}</div>
        <div class="pd">${p.mechanic ? p.mechanic + ' \u00B7 ' : ''}Stores: ${p.stores || 'All'} \u00B7 <span class="${p.confidence === 'High' ? 'up' : p.confidence === 'Medium' ? 'neu' : 'dn'}">${p.confidence || '\u2014'}</span></div>
      </div>
      <div class="pr">${chip(tc[p.type] || 'cgr', p.type || '\u2014')}${chip(isConf ? 'cg' : 'cy2', isConf ? '\u2713 Confirmed' : '\u23F3 Tentative')}<div class="plift">${lv > 0 ? '+' : ''}${lv}%</div></div>
    </div>`;
  }).join('') + '</div>';
}

export function renderHistPROMO() {
  const el = document.getElementById('pr-hist-list');
  if (!el) return;

  // Summary KPIs across all historical events
  const totalEvents = DATA_HIST_PROMO.length;
  const overFcast = DATA_HIST_PROMO.filter(p => p.over_under === 'over');
  const underFcast = DATA_HIST_PROMO.filter(p => p.over_under === 'under');
  const avgModelLift = DATA_HIST_PROMO.reduce((a, p) => a + p.model_lift_pct, 0) / totalEvents;
  const avgActualLift = DATA_HIST_PROMO.reduce((a, p) => a + p.actual_lift_pct, 0) / totalEvents;
  const avgBias = avgModelLift - avgActualLift;
  const totalModelUnits = DATA_HIST_PROMO.reduce((a, p) => a + p.model_units, 0);
  const totalActualUnits = DATA_HIST_PROMO.reduce((a, p) => a + p.actual_units, 0);
  const portfolioBias = ((totalActualUnits - totalModelUnits) / totalModelUnits * 100).toFixed(1);

  let h = `
  <div style="margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:4px">\u{1F4D6} Historical Promo Performance \u2014 Dec 28 2025 \u2013 Mar 15 2026</div>
    <div style="font-size:11.5px;color:var(--tx3)">
      ${totalEvents} completed events \u00B7 Actual lift vs model assumption \u00B7 Positive delta% = model over-forecasted (common pattern)
    </div>
  </div>

  <div class="kpis k4" style="margin-bottom:20px">
    ${kpiCard('\u{1F4CA}', 'Events Reviewed', '--cc:var(--cy)', totalEvents, 'Completed promo weeks with actuals', 'neu', overFcast.length + ' over-forecast \u00B7 ' + underFcast.length + ' under-forecast')}
    ${kpiCard('\u{1F3AF}', 'Avg Model Lift', '--cc:var(--yw)', '+' + avgModelLift.toFixed(0) + '%', 'What model assumed across events', 'dn', 'Portfolio avg across all promo types')}
    ${kpiCard('\u{1F4C9}', 'Avg Actual Lift', '--cc:var(--ac)', '+' + avgActualLift.toFixed(0) + '%', 'What actually happened', 'up', 'Systematically below model assumption')}
    ${kpiCard('\u26A0\uFE0F', 'Portfolio Overcast', '--cc:var(--rd)', portfolioBias + '%', 'Total model vs actual units (' + fmt(totalModelUnits) + ' modeled / ' + fmt(totalActualUnits) + ' actual)', 'dn', 'Model over-predicted by this much across all events')}
  </div>

  <div class="cc" style="margin-bottom:20px">
    <div class="ct">\u26A0\uFE0F Key Insight: Promo Lift Is Systematically Over-Modeled</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12.5px;padding:4px 0">
      <div>
        <div style="color:var(--tx3);line-height:1.8">
          Across ${totalEvents} historical events, the model <b style="color:var(--rd)">over-forecasted lift by an average of ${avgBias.toFixed(0)} percentage points</b>
          (${avgModelLift.toFixed(0)}% modeled vs ${avgActualLift.toFixed(0)}% actual).
          <br><br>
          Frozen endcap events were the most accurate (within \u00B15%). TPC and DWA events showed the most over-forecasting.
          The conservative calibration engine automatically adjusts forward forecasts using these patterns.
        </div>
      </div>
      <div>
        <div style="font-weight:700;color:var(--tx);margin-bottom:8px">By Promo Type:</div>
        ${['TPC', 'Co-space', 'Circle + Co-space', 'DWA'].map(t => {
          const evs = DATA_HIST_PROMO.filter(p => p.type === t || p.type.includes(t.split(' ')[0]));
          if (!evs.length) return '';
          const avgOver = evs.reduce((a, p) => a + (p.model_lift_pct - p.actual_lift_pct), 0) / evs.length;
          const col = Math.abs(avgOver) < 5 ? 'var(--gr)' : Math.abs(avgOver) < 12 ? 'var(--yw)' : 'var(--rd)';
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--bd);font-size:12px">
            <span style="color:var(--tx)">${t} (${evs.length} events)</span>
            <span style="color:${col};font-weight:700">${avgOver > 0 ? 'Over +' : 'Under ' + (Math.abs(avgOver).toFixed(0))}${avgOver > 0 ? avgOver.toFixed(0) + 'pp' : 'pp'}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:12px">`;

  DATA_HIST_PROMO.forEach(p => {
    const delta = p.actual_lift_pct - p.model_lift_pct;
    const deltaAbs = Math.abs(delta);
    const isOver = delta < 0; // actual < model = over-forecast
    const accuracy = deltaAbs < 3 ? '\u2705 Very Accurate' : deltaAbs < 8 ? '\u{1F7E1} Minor Miss' : deltaAbs < 15 ? '\u{1F7E0} Meaningful Miss' : '\u{1F534} Significant Miss';
    const accCol = deltaAbs < 3 ? 'var(--gr)' : deltaAbs < 8 ? 'var(--yw)' : deltaAbs < 15 ? 'rgba(255,140,0,.9)' : 'var(--rd)';
    const typeColors = { 'TPC': 'rgba(0,227,205,.7)', 'Co-space': 'rgba(220,123,255,.7)', 'Circle + Co-space': 'rgba(255,199,17,.7)', 'DWA': 'rgba(239,68,68,.7)' };
    const typeCol = typeColors[p.type] || 'rgba(123,151,200,.6)';
    const barModel = Math.min(p.model_lift_pct, 120);
    const barActual = Math.min(p.actual_lift_pct, 120);
    const confidenceNote = p.confidence_in_actual === 'High' ? '' : '<span style="color:var(--tx3);font-size:9.5px;margin-left:4px">(derived \u2014 medium confidence)</span>';

    h += `<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px 16px;border-left:3px solid ${accCol}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">

        <div style="flex:1;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="background:var(--s1);border:1px solid var(--bd);border-radius:5px;padding:2px 8px;font-size:10.5px;font-weight:700;color:var(--tx3);white-space:nowrap">${p.date}</div>
            <div style="font-size:10.5px;padding:2px 8px;border-radius:5px;background:${typeCol}22;color:${typeCol};border:1px solid ${typeCol}44;font-weight:700">${p.type}</div>
            <div style="font-size:10.5px;color:var(--tx3)">${p.category}</div>
          </div>
          <div style="font-weight:700;font-size:13.5px;color:var(--tx);margin-bottom:2px">${p.event}</div>
          <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">${p.mechanic}</div>
          <div style="font-size:11px;color:var(--tx3)"><span style="color:var(--tx2);font-weight:600">SKUs: </span>${p.key_skus}</div>
        </div>

        <div style="flex:1;min-width:260px">
          <div style="font-size:11.5px;font-weight:700;color:var(--tx);margin-bottom:8px">Model vs Actual Lift</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:80px;font-size:11px;color:var(--tx3)">Model</div>
              <div style="flex:1;height:8px;background:var(--s1);border-radius:4px;overflow:hidden">
                <div style="width:${barModel}%;height:100%;background:rgba(123,151,200,.5);border-radius:4px"></div>
              </div>
              <div style="width:50px;font-size:12px;font-weight:700;color:var(--tx3);text-align:right">+${p.model_lift_pct}%</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:80px;font-size:11px;color:var(--ac)">Actual${confidenceNote}</div>
              <div style="flex:1;height:8px;background:var(--s1);border-radius:4px;overflow:hidden">
                <div style="width:${barActual}%;height:100%;background:${isOver ? 'var(--rd)' : 'var(--gr)'};border-radius:4px"></div>
              </div>
              <div style="width:50px;font-size:12px;font-weight:800;color:${isOver ? 'var(--rd)' : 'var(--gr)'};text-align:right">+${p.actual_lift_pct}%</div>
            </div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11.5px">
              <span style="color:var(--tx3)">Units: </span>
              <span style="text-decoration:line-through;color:var(--tx3)">${fmt(p.model_units)}</span>
              <span style="color:var(--tx);font-weight:700;margin-left:6px">${fmt(p.actual_units)} actual</span>
            </div>
            <div style="font-size:11px;font-weight:800;color:${isOver ? 'var(--rd)' : 'var(--gr)'}">
              ${isOver ? 'Over ' : 'Under '}+${Math.abs(p.delta_pct).toFixed(1)}pp
            </div>
          </div>
        </div>

        <div style="min-width:140px;text-align:right">
          <div style="font-size:11px;font-weight:700;color:${accCol};margin-bottom:4px">${accuracy}</div>
          <div style="font-size:10.5px;color:var(--tx3)">${p.confidence_in_actual} confidence</div>
        </div>
      </div>

      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd);font-size:11.5px;color:var(--tx3);line-height:1.6">
        <span style="color:var(--tx2);font-weight:600">\u{1F4DD} Notes: </span>${p.notes}
      </div>
    </div>`;
  });

  h += `</div>
  <div style="margin-top:14px;padding:10px 14px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;font-size:11px;color:var(--tx3)">
    <b style="color:var(--tx)">Methodology note:</b> Frozen Co-space actuals (Jan 5\u2013Feb 2) sourced from DATA_ENDCAP_HISTORY with high confidence.
    TPC and DWA actuals (Feb 9\u2013Mar 15) are derived from walk-forward hist[6..11] clean-week baseline vs promo week actuals \u2014 medium confidence.
    All actuals feed the Conservative Calibration Engine to reduce forward overforecasting.
  </div>`;

  el.innerHTML = h;
}
