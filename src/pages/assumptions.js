// ─── ASSUMPTIONS ─────────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html
// Lines 2145–2404 (initASSUMP, aRow)
// Lines 1028–1157 (refreshDependentViews, showAssumpToast, resetAllAssumptions,
//                   updateAssumpCounter, updVel, updLift, updUPC, recalcPOFCVelocity)

import { DATA_DP, DATA_SHIP } from '../data/index.js';
import { fmt, fmtN, fmtP, sf2 } from '../utils/formatters.js';
import { velOverrides, upcOverrides, liftOverrides, velFor } from '../utils/state.js';
import { pgInited } from '../utils/state.js';

// ─── Lazy accessors for data not yet in data/index.js ───────────────────
function _getPOFC() { return window.DATA_POFC || { skus: [] }; }
function _getAVF()  { return window.DATA_AVF || []; }

// ─── External page renderers (called by refreshDependentViews) ──────────
// These will be registered by the pages that own them.
// We call them via try/catch so missing pages don't break the flow.
function _tryCall(fn) { try { fn(); } catch (e) { /* page not loaded yet */ } }

// ─── Historical baseline constants ──────────────────────────────────────
const HIST_BASELINE = {
  puff:     { base: 19540, janLvl: 38594, febLvl: 47722, note: 'Baby Snacks / Baby+Stellar Puffs' },
  snack:    { base: 15566, janLvl: 21648, febLvl: 21020, note: 'Kids Snacks / Oat Bakes / Loops / Minis' },
  frozen:   { base: 13751, janLvl: 23128, febLvl: 31964, note: '\u{1F9CA} Frozen multiserve' },
  smoothie: { base: 43487, janLvl: 41478, febLvl: 40847, note: 'Smoothies tubes + multipacks' },
  cereal:   { base: 5252,  janLvl: 8084,  febLvl: 8762,  note: 'Baby Cereal + Oat Bakes bars' },
};

// ─── recalcPOFCVelocity ─────────────────────────────────────────────────
function recalcPOFCVelocity(dpci) {
  const DATA_POFC = _getPOFC();
  const psku = DATA_POFC.skus.find(s => s.dpci === dpci);
  const dsku = DATA_DP.skus.find(s => s.dpci === dpci);
  if (!psku || !dsku || !(dsku.stores > 0)) return;
  const origVel = dsku.lw_upspw;
  const newVel = velFor(dsku);
  if (origVel === 0 || newVel === origVel) return;
  const scaleFactor = newVel / origVel;
  psku.ratio_by_week = psku.ratio_by_week.map(v => Math.round(v * scaleFactor));
  psku.cov_by_week = psku.cov_by_week.map(v => Math.round(v * scaleFactor));
  const ssku = DATA_SHIP.skus.find(s => s.dpci === dpci);
  if (ssku && ssku.fcast_weeks) {
    const fw13 = DATA_DP.fcast_weeks.slice(0, 13);
    fw13.forEach((wk, i) => {
      if (ssku.fcast_weeks[wk] === true) { ssku.weeks[wk] = psku.ratio_by_week[i] || 0; }
    });
    const fcastWks = Object.keys(ssku.fcast_weeks).filter(w => ssku.fcast_weeks[w] === true);
    ssku.weeks['13-wk Fcast Cases'] = fcastWks.reduce((a, w) => a + sf2(ssku.weeks[w]), 0);
  }
}

// ─── updateAssumpCounter ────────────────────────────────────────────────
export function updateAssumpCounter() {
  const velCt = Object.keys(velOverrides).length;
  const liftCt = Object.keys(liftOverrides).length;
  const upcCt = Object.keys(upcOverrides).length;
  const total = velCt + liftCt + upcCt;
  const el = document.getElementById('assump-change-count');
  if (!el) return;
  if (total === 0) {
    el.textContent = 'No overrides active';
    el.style.color = 'var(--tx3)';
    el.style.borderColor = 'var(--bd)';
  } else {
    const parts = [];
    if (velCt) parts.push(velCt + ' vel');
    if (liftCt) parts.push(liftCt + ' lift');
    if (upcCt) parts.push(upcCt + ' UPC');
    el.textContent = total + ' override' + (total > 1 ? 's' : '') + ' active: ' + parts.join(' \u00B7 ');
    el.style.color = 'var(--yw)';
    el.style.borderColor = 'rgba(255,199,17,.4)';
  }
}

// ─── showAssumpToast ────────────────────────────────────────────────────
export function showAssumpToast(label, modules, ms) {
  let toast = document.getElementById('assump-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'assump-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:340px;transition:opacity .3s;';
    document.body.appendChild(toast);
  }
  clearTimeout(toast._t);
  toast.style.opacity = '1';
  toast.innerHTML = `<div style="background:#0d1626;border:1px solid rgba(0,207,146,.4);border-radius:10px;padding:12px 16px;box-shadow:0 4px 24px rgba(0,0,0,.5)">
    <div style="font-size:12px;font-weight:700;color:var(--gr);margin-bottom:4px">\u2705 ${label}</div>
    <div style="font-size:11px;color:var(--tx2)">Updated: ${modules.join(' \u00B7 ')}</div>
    <div style="font-size:10px;color:var(--tx3);margin-top:3px">${ms}ms \u00B7 Changes applied to all views</div>
  </div>`;
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

// ─── refreshDependentViews ──────────────────────────────────────────────
// Called whenever any assumption override changes; propagates to ALL dependent views.
export function refreshDependentViews(changeType) {
  const t0 = Date.now();
  let refreshed = [];
  // Always refresh: Shipment Plan (uses velocity + UPC)
  _tryCall(() => { if (typeof window.renderSHIP === 'function') { window.renderSHIP(); refreshed.push('Shipment Plan'); } });
  // Always refresh: POFC (uses velocity + UPC + cases)
  _tryCall(() => {
    if (typeof window.refreshPOFCKPIs === 'function') { window.refreshPOFCKPIs(); }
    if (document.getElementById('pg-pofc') && document.getElementById('pg-pofc').classList.contains('active')) {
      if (typeof window.renderPOFCSku === 'function') window.renderPOFCSku();
      if (typeof window.renderPOFCWbW === 'function') window.renderPOFCWbW();
    }
    refreshed.push('PO Forecast');
  });
  // Always refresh: Executive Summary (uses velFor for scenario totals)
  _tryCall(() => { if (typeof window.initEXEC === 'function') { window.initEXEC(); refreshed.push('Exec Summary'); } });
  // Refresh Scenario if initialized
  _tryCall(() => {
    if (pgInited.scen || (document.getElementById('pg-scenario') && document.getElementById('pg-scenario').classList.contains('active'))) {
      if (typeof window.buildSCENTable === 'function') { window.buildSCENTable(); refreshed.push('Scenario'); }
    }
  });
  // Refresh Demand Plan if active
  if (document.getElementById('pg-demand') && document.getElementById('pg-demand').classList.contains('active')) {
    _tryCall(() => { if (typeof window.renderDP === 'function') { window.renderDP(); refreshed.push('Demand Plan'); } });
  }
  // Refresh AVF if active
  if (document.getElementById('pg-avf') && document.getElementById('pg-avf').classList.contains('active')) {
    _tryCall(() => { if (typeof window.initAVF === 'function') { window.initAVF(); refreshed.push('AVF'); } });
  }
  // Show toast
  updateAssumpCounter();
  showAssumpToast(changeType || 'Assumption updated', refreshed, Date.now() - t0);
}

// ─── resetAllAssumptions ────────────────────────────────────────────────
export function resetAllAssumptions() {
  if (!confirm('Reset all velocity, lift, and UPC overrides to baseline values?')) return;
  Object.keys(velOverrides).forEach(k => delete velOverrides[k]);
  Object.keys(liftOverrides).forEach(k => delete liftOverrides[k]);
  Object.keys(upcOverrides).forEach(k => delete upcOverrides[k]);
  // Rebuild POFC and Ship data from scratch (reload original values)
  const DATA_POFC = _getPOFC();
  DATA_DP.skus.forEach(s => {
    const psku = DATA_POFC.skus.find(p => p.dpci === s.dpci);
    if (psku) {
      // Restore POFC from original stored baseline if available
      if (psku._origRatioByWeek) psku.ratio_by_week = [...psku._origRatioByWeek];
      if (psku._origCovByWeek)   psku.cov_by_week = [...psku._origCovByWeek];
    }
  });
  // Re-init assumptions page to clear yellow/green highlights
  try { initASSUMP(); } catch (e) { /* ok */ }
  updateAssumpCounter();
  refreshDependentViews('Reset to baseline');
}

// ─── updVel ─────────────────────────────────────────────────────────────
export function updVel(dpci, val, el) {
  const v = parseFloat(val);
  const dsku = DATA_DP.skus.find(s => s.dpci === dpci);
  if (!dsku) return;
  if (!v || v <= 0) {
    delete velOverrides[dpci];
    el.style.border = '1px solid var(--bd)'; el.style.color = 'var(--tx)';
  } else {
    velOverrides[dpci] = v;
    el.style.border = '1px solid var(--gr)'; el.style.color = 'var(--gr)';
    recalcPOFCVelocity(dpci);
  }
  // Update weekly units preview inline
  const wklyEl = document.getElementById('vel-wkly-' + dpci);
  if (wklyEl) {
    const cur = velOverrides[dpci] !== undefined ? velOverrides[dpci] : dsku.lw_upspw;
    wklyEl.textContent = Math.round(cur * dsku.stores).toLocaleString();
    wklyEl.style.color = velOverrides[dpci] !== undefined ? 'var(--gr)' : 'var(--tx2)';
  }
  // Propagate to ALL dependent views
  refreshDependentViews('UPSPW override: ' + dsku.name.substring(0, 28));
}

// ─── updLift ────────────────────────────────────────────────────────────
export function updLift(cat, type, val, el) {
  const v = parseFloat(val);
  const k = cat + '|' + type;
  if (!v || v <= 0) {
    delete liftOverrides[k];
    el.style.border = '1px solid var(--bd)'; el.style.color = 'var(--tx)';
  } else {
    liftOverrides[k] = v;
    el.style.border = '1px solid var(--yw)'; el.style.color = 'var(--yw)';
  }
  // Propagate to ALL dependent views
  refreshDependentViews('Promo lift override: ' + cat + ' ' + type.toUpperCase());
}

// ─── updUPC ─────────────────────────────────────────────────────────────
export function updUPC(dpci, val, el) {
  const v = parseInt(val);
  if (!v || v < 1) { if (el) { el.style.border = '1px solid var(--rd)'; el.style.color = 'var(--rd)'; } return; }
  if (el) { el.style.border = '1px solid var(--gr)'; el.style.color = 'var(--gr)'; }
  upcOverrides[dpci] = v;
  // Propagate to ALL dependent views
  const nm = (DATA_DP.skus.find(s => s.dpci === dpci) || {}).name || dpci;
  refreshDependentViews('UPC override: ' + nm.substring(0, 28) + ' \u2192 ' + v);
}

// ─── aRow helper ────────────────────────────────────────────────────────
export function aRow(lbl, val, unit, cls) {
  return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(30,48,84,.4)">' +
    '<span style="font-size:11.5px;color:var(--tx2)">' + lbl + '</span>' +
    '<span style="font-size:12px;font-weight:600" class="' + cls + '">' + val +
    ' <span style="color:var(--tx3);font-weight:400">' + unit + '</span></span></div>';
}

// ─── initASSUMP ─────────────────────────────────────────────────────────
export function initASSUMP() {
  const DATA_POFC = _getPOFC();

  // Data-backed lift table
  const lift = {
    "Baby Snacks": { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25, base: 59000, evidence: "Base: L4W clean avg (wks 8\u201311, 4 SKUs at current dist). TPC: 2/$8 = 19% off \u2192 1.20x; May 3 partial-chain (~800/1,743 stores = 1.09x blended). BOGO/DWA: 1.55x/1.60x \u2014 25% discount, elasticity ~\u20132.5; old 1.75x/1.85x overstated. Endcap: 1.25x (CSTI data +25\u201330%)." },
    "Kids Snacks": { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25, base: 22000, evidence: "Base: L4W clean, established SKUs (Oat Bakes + Loops; new Stellar/Minis excluded, still ramping). TPC: 1.25x (Loops 2/$10 = 17% off; no clear hist spike). DWA: 1.45x vs old 2.00x \u2014 FIXED: Jun 14 20%-off DWA cannot produce 2.0x; elasticity \u20132.5 \u00D7 20% = 1.50x, adj to 1.45x net. BOGO: 1.55x (25% discount, same mechanics as Baby)." },
    "Frozen":      { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50, base: 16500, evidence: "\u{1F9CA} Base: Nov 13,751 \u00D7 1.20x store growth (1,500\u21921,800 stores Nov\u2192Mar) = 16,500. Endcap 1.50x vs old 2.00x \u2014 FIXED: Jan co-space reading 23,518 \u00F7 corrected base 16,500 = 1.43x; old 2.0x mistakenly included Feb BOGO+co-space stacked. BOGO/DWA: 1.60x (Feb BOGO overlay on endcap = 1.35x incremental; standalone BOGO \u2192 1.60x). TPC: 1.10x (May $9.49 vs $9.99 = only 5% off)." },
    "Smoothies":   { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15, base: 29000, evidence: "Base: L8W clean excl spike wks (28,990/wk). Old 43,487 was Nov holiday/DWA-elevated (Nov 29 DWA BOGO confirmed in promo cal). TPC: 1.35x vs old 1.25x \u2014 two independent 2/$6 TPC weeks (Feb 15, Mar 1) both showed 1.40x; 1.35x conservative. BOGO/DWA: 1.45x (Apr 19 BOGO 25% chain-wide; consistent with mechanics)." },
    "YoGos":       { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20, base: 8900,  evidence: "Base: 8,891/wk L8W clean, excluding anomalous inventory-dip wks 6\u20137 (35% step-down, confirmed non-organic DC issue). TPC: 1.25x vs old 1.45x \u2014 max observed lift = 1.28x; upcoming 2/$6 same as Smoothies mechanics \u2192 1.25x. BOGO: 1.45x / DWA: 1.50x \u2014 no hist BOGO observed; mechanics-based correction (old 1.85x/1.90x unsupported)." },
    "Brand-Wide":  { tpc: 1.20, bogo: 1.50, dwa: 1.50, endcap: 1.25, base: 0,     evidence: "Weighted avg across 5 categories. \u26A0\uFE0F Stacking rule: when co-space + BOGO concurrent (e.g., Apr 12 Frozen), use Base \u00D7 endcap \u00D7 1.35x incremental BOGO \u2014 NOT Base \u00D7 endcap \u00D7 standalone BOGO. Apr 12 validation: 16,500 \u00D7 1.50 \u00D7 1.35 = 33,412 \u2713 matches Feb\u2013Mar observed 31,744." },
  };

  let h = '<div style="display:flex;flex-direction:column;gap:20px">';

  // ── Lift Table ──────────────────────────────────────────────────────────────
  h += '<div class="cc"><div class="ct" style="display:flex;align-items:center;gap:10px">\u{1F4CA} Promo Lift Multipliers \u2014 Rebuilt Mar 2026<span style="font-size:10px;background:rgba(0,207,146,.12);color:var(--gr);border:1px solid rgba(0,207,146,.3);border-radius:4px;padding:2px 7px;font-weight:600">\u{1F4CA} Actuals-Derived</span>' +
    '<span style="font-size:11px;color:var(--tx3);margin-left:12px">Baseline: L8W clean avg (excl promo &amp; endcap wks) \u00B7 Hierarchical stacking: max(DWA, BOGO) \u2014 not multiplicative \u00B7 \u{1F4CA} = actuals-derived \u00B7 \u{1F4D0} = mechanics-based (elasticity) \u00B7 \u270F\uFE0F = manual override</span></div>' +
    '<table class="dt"><thead><tr><th>Category</th>' +
    '<th class="tr">Stable Base<br><span style="font-weight:400;font-size:10px">units/wk</span></th>' +
    '<th class="tr">TPC</th><th class="tr">BOGO 25%</th><th class="tr">DWA</th>' +
    '<th class="tr" style="color:var(--yw)">Co-space/<br>Endcap</th>' +
    '<th style="font-size:10.5px">Evidence</th></tr></thead><tbody>';
  Object.entries(lift).forEach(([cat, d]) => {
    const isFrz = cat === 'Frozen';
    h += '<tr' + (isFrz ? ' style="background:rgba(99,102,241,.06)"' : '') + '>' +
      '<td><b>' + (isFrz ? '\u{1F9CA} ' : '') + cat + '</b></td>' +
      '<td class="tr">' + (d.base ? fmtN(d.base) : '\u2014') + '</td>' +
      '<td class="tr"><b>' + d.tpc.toFixed(2) + 'x</b></td>' +
      '<td class="tr"><b>' + d.bogo.toFixed(2) + 'x</b></td>' +
      '<td class="tr"><b>' + d.dwa.toFixed(2) + 'x</b></td>' +
      '<td class="tr" style="font-weight:700;color:var(--yw)">' + d.endcap.toFixed(2) + 'x</td>' +
      '<td style="font-size:10.5px;color:var(--tx3)">' + d.evidence + '</td></tr>';
  });
  h += '</tbody></table>' +
    '<div style="margin-top:10px;padding:10px 14px;background:rgba(99,102,241,.07);border-radius:8px;font-size:11.5px;color:var(--tx2);line-height:1.85">' +
    '<b style="color:#a78bfa">\u{1F9CA} Frozen Endcap Fix (Key Change):</b> Old model reported 2.0x endcap by comparing Feb peak (31,964) to Nov base (13,751). That was wrong \u2014 Feb included a layered Circle BOGO on top of the co-space. ' +
    'Correcting: <b>Jan co-space-only</b> avg = 23,518 \u00B7 Nov base adjusted for store growth (1,500\u21921,800 stores) = <b>16,500</b> \u00B7 ' +
    'True endcap-only lift = 23,518 \u00F7 16,500 = <b>1.43x \u2192 conservative 1.50x</b>. ' +
    'Feb BOGO overlay = 31,744 \u00F7 23,518 = <b>1.35x incremental</b> (apply separately, not multiplicative with standalone BOGO). ' +
    'Validation: 16,500 \u00D7 1.50 \u00D7 1.35 = <b>33,412</b> \u2713 matches Feb\u2013Mar observed 31,744. ' +
    'TPC: $9.49 vs $9.99 = 5% off \u2192 <b>1.10x only</b>.</div>' +
    '<div style="margin-top:8px;padding:8px 12px;background:rgba(16,185,129,.06);border-radius:8px;font-size:11px;color:var(--tx3)">' +
    '<b style="color:#10b981">\u26A0\uFE0F Stacking Rule:</b> When promo types overlap (co-space + BOGO same week), apply hierarchically: <b>Base \u00D7 co-space_lift \u00D7 incremental_BOGO(1.35x)</b> \u2014 do NOT multiply standalone BOGO column against endcap-inflated base. DWA on clean base = apply DWA column directly.</div>' +
  '</div>';

  // ── History Chart ────────────────────────────────────────────────────────────
  h += '<div class="cc"><div class="ct">\u{1F4C8} Frozen & Baby Snacks Weekly History (Jul 2025\u2013Mar 2026)' +
    '<span style="font-size:11px;color:var(--tx3);margin-left:12px">Source: Omni Analytics \u00B7 Used to derive baselines and lift multipliers above</span></div>' +
    '<canvas id="ch-hist-lift" style="max-height:200px"></canvas>' +
    '<div id="hist-lift-ann" style="margin-top:8px;font-size:10.5px;color:var(--tx3);line-height:1.8">' +
    '<b>Frozen events:</b> Sep 22 = launch endcap start \u00B7 Oct 13 = endcap ends \u00B7 Jan 5 = distribution expansion \u00B7 Feb 2 = new co-space period \u00B7 Mar 16 = co-space winding down' +
    '</div></div>';

  // ── UPC Input Table ──────────────────────────────────────────────────────────
  h += '<div class="cc"><div class="ct">\u{1F4E6} Units Per Case (UPC) \u2014 Interactive Override' +
    '<span style="font-size:11px;color:var(--tx3);margin-left:12px">Edit any value \u2192 PO Forecast case math updates instantly \u00B7 Green = overridden from default</span></div>' +
    '<div style="padding:12px">' +
    '<div class="ch cg2" style="margin-bottom:12px">\u2705 UPC Values Confirmed: Baby Puffs = 40 units/case \u00B7 Stellar Puffs = 40 units/case \u00B7 Frozen = 10 units/case \u00B7 Smoothies = 8 units/case \u00B7 Cereal = 12 units/case \u2014 edit below to override' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px" id="upc-grids"></div>' +
    '<div style="margin-top:8px;font-size:11px;color:var(--tx3)">\u270E Changes scale model case forecasts proportionally: new_cases = old_cases \u00D7 (orig_upc \u00F7 new_upc)</div>' +
    '</div></div></div>';

  // ── UPSPW + Key Assumptions ──────────────────────────────────────────────────
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    '<div class="cc"><div class="ct">\u{1F4D0} UPSPW Methodology</div>' +
    '<div style="padding:12px">' +
    '<div class="ch cg2">\u{1F4E1} Anchor: Omni sell-through velocity \u2014 lw_upspw \u00D7 distributed stores \u00B7 Promo lifts applied per category</div>' +
    '<p style="margin-top:8px;font-size:13px;color:var(--tx2)">UPSPW understates true selling velocity because OOS stores contribute 0 sales but are counted in denominator.</p>' +
    '<p style="font-size:13px;color:var(--tx2)">Rec: use <b>selling-stores-only</b> UPSPW especially for Baby Snacks &amp; YoGos (higher OOS%)</p>' +
    '<div style="font-size:11.5px;color:var(--tx3);margin-top:6px">OOS 10% \u2192 true vel +11% \u00B7 OOS 20% \u2192 +25%</div>' +
    '</div></div>' +
    '<div class="cc"><div class="ct">\u{1F511} Model Assumptions</div>' +
    '<div style="padding:12px;font-size:12px;color:var(--tx2);line-height:1.8">' +
    '<div><b style="color:var(--tx)">DC WoS Target:</b> 5 wks (midpoint of Target 4\u20136 WoS range)</div>' +
    '<div><b style="color:var(--tx)">Reorder Cycle:</b> Every 2 weeks \u00B7 Min reorder = 2 WoS</div>' +
    '<div><b style="color:var(--tx)">O/S Ratio:</b> hist_cases \u00F7 (hist_units \u00F7 UPC) \u00B7 Forward applied</div>' +
    '<div><b style="color:var(--tx)">Promo Lift:</b> Table above \u00B7 Endcap stacks on top of TPC if concurrent</div>' +
    '<div><b style="color:var(--tx)">New Launches:</b> Ramp from demand plan (no historical base)</div>' +
    '</div></div>' +
  '</div>';

  // ── Velocity (UPSPW) Override Editor ────────────────────────────────────────
  h += '<div class="cc"><div class="ct">\u26A1 Velocity Override \u2014 UPSPW per SKU' +
    '<span style="font-size:11px;color:var(--tx3);margin-left:12px">' +
    'Edit any UPSPW \u2192 PO Forecast &amp; Shipment Plan recalculate instantly \u00B7 Green = overridden \u00B7 Omni anchor shown for reference</span></div>' +
    '<div style="padding:12px 0" id="vel-editor-wrap">' +
    '<div class="ch cy2" style="margin-bottom:12px;font-size:11.5px">' +
    '\u26A1 Changes to UPSPW scale the Omni-anchored forecast proportionally (new velocity \u00F7 current velocity = scale factor applied to all 13 forward weeks)</div>' +
    '<div id="vel-grids" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:14px"></div>' +
    '</div></div>';

  // ── Promo Lift Multiplier Overrides ──────────────────────────────────────────
  h += '<div class="cc"><div class="ct">\u{1F3AF} Promo Lift Overrides \u2014 Edit Multipliers by Category</div>' +
    '<div style="padding:12px" id="lift-editor-wrap">' +
    '<div class="ch cy2" style="margin-bottom:12px;font-size:11.5px">' +
    '\u{1F4DD} Override lift multipliers for any category/promo type \u00B7 Yellow = overridden from historical baseline</div>' +
    '<div id="lift-grids"></div>' +
    '</div></div>';

  h += '<div class="cc" style="margin-top:14px"><div class="ct">\u{1F50D} Lift Source Legend</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:12px;padding:4px 0"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:15px">\u{1F4CA}</span><div><div style="font-weight:700;color:var(--tx)">Actuals-Derived</div><div style="color:var(--tx3)">Calculated from L4W/L8W Omni historical data, excluding promo+endcap weeks</div></div></div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:15px">\u{1F4D0}</span><div><div style="font-weight:700;color:var(--tx)">Mechanics-Based</div><div style="color:var(--tx3)">Derived from price elasticity (~-2.5) \u00D7 discount %, no historical obs available</div></div></div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:15px">\u270F\uFE0F</span><div><div style="font-weight:700;color:var(--tx)">Manual Override</div><div style="color:var(--tx3)">Set via the override editor above; shown in yellow in the table</div></div></div></div></div>';
  h += '</div>';

  const phEl = document.getElementById('pg-assumptions').querySelector('.ph');
  if (!document.getElementById('assump-body')) {
    phEl.insertAdjacentHTML('afterend', '<div id="assump-body" style="padding:0 24px 24px">' + h + '</div>');
  } else {
    document.getElementById('assump-body').innerHTML = h;
  }

  // Build UPC input grids by category
  const catGrps = {};
  DATA_POFC.skus.forEach(s => { if (!catGrps[s.cat]) catGrps[s.cat] = []; catGrps[s.cat].push(s); });
  let gH = '';
  Object.entries(catGrps).forEach(([cat, skus]) => {
    gH += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:10px">' +
      '<div style="font-size:10.5px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">' + cat + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
    skus.forEach(s => {
      const ovrd = upcOverrides[s.dpci];
      const dispNm = s.name.length > 28 ? s.name.substring(0, 26) + '\u2026' : s.name;
      gH += '<tr style="border-bottom:1px solid var(--bd)">' +
        '<td style="padding:4px 6px;color:var(--tx2)" title="' + s.name + '">' + dispNm + '</td>' +
        '<td style="padding:4px 6px;text-align:right;white-space:nowrap">' +
        '<input type="number" min="1" max="200" value="' + (ovrd || s.upc) + '" ' +
        'style="width:52px;padding:2px 5px;border-radius:4px;border:1px solid ' + (ovrd ? 'var(--gr)' : 'var(--bd)') + ';background:var(--bg);color:var(--tx);font-size:12px;text-align:center" ' +
        'onchange="updUPC(\'' + s.dpci + '\',this.value,this)" ' +
        'title="Units per case \u00B7 default: ' + s.upc + '"> upc' +
        (ovrd ? ' <span style="font-size:10px;color:var(--tx3)">(orig ' + s.upc + ')</span>' : '') +
        '</td></tr>';
    });
    gH += '</table></div>';
  });
  const upcGrid = document.getElementById('upc-grids');
  if (upcGrid) upcGrid.innerHTML = gH;

  // ── Populate velocity override grids ─────────────────────────────────────
  const velCatGrps = {};
  DATA_DP.skus.filter(s => s.stores > 0).forEach(s => {
    const cat = s.category || 'Other';
    if (!velCatGrps[cat]) velCatGrps[cat] = [];
    velCatGrps[cat].push(s);
  });
  let vH = '';
  Object.entries(velCatGrps).forEach(([cat, skus]) => {
    vH += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:10px">' +
      '<div style="font-size:10.5px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">' + cat + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead>' +
      '<tr style="border-bottom:1px solid var(--bd)">' +
      '<th style="padding:3px 6px;text-align:left;font-weight:600;color:var(--tx3);font-size:10px">SKU</th>' +
      '<th style="padding:3px 6px;text-align:right;font-weight:600;color:var(--tx3);font-size:10px">Stores</th>' +
      '<th style="padding:3px 6px;text-align:right;font-weight:600;color:var(--tx3);font-size:10px">Omni UPSPW</th>' +
      '<th style="padding:3px 6px;text-align:right;font-weight:600;color:var(--tx3);font-size:10px">Override</th>' +
      '<th style="padding:3px 6px;text-align:right;font-weight:600;color:var(--tx3);font-size:10px;min-width:65px">Wkly Units</th>' +
      '</tr></thead><tbody>';
    skus.forEach(s => {
      const ovrd = velOverrides[s.dpci];
      const cur = ovrd !== undefined ? ovrd : s.lw_upspw;
      const wkly = Math.round(cur * s.stores);
      const dispNm = s.name.length > 26 ? s.name.substring(0, 24) + '\u2026' : s.name;
      vH += '<tr style="border-bottom:1px solid rgba(30,48,84,.3)">' +
        '<td style="padding:4px 6px;color:var(--tx2)" title="' + s.name + '">' + dispNm + '</td>' +
        '<td style="padding:4px 6px;text-align:right;color:var(--tx3)">' + s.stores + '</td>' +
        '<td style="padding:4px 6px;text-align:right;color:var(--ac2)">' + s.lw_upspw.toFixed(2) + '</td>' +
        '<td style="padding:4px 6px;text-align:right;white-space:nowrap">' +
        '<input type="number" min="0.1" max="50" step="0.01" value="' + (ovrd !== undefined ? ovrd : s.lw_upspw) + '" ' +
        'style="width:68px;padding:2px 6px;border-radius:4px;border:1px solid ' + (ovrd !== undefined ? 'var(--gr)' : 'var(--bd)') +
        ';background:var(--bg);color:' + (ovrd !== undefined ? 'var(--gr)' : 'var(--tx)') + ';font-size:11.5px;text-align:center" ' +
        'onchange="updVel(\'' + s.dpci + '\',this.value,this)" ' +
        'title="UPSPW override \u00B7 Omni: ' + s.lw_upspw.toFixed(2) + '"> upspw' +
        '</td>' +
        '<td style="padding:4px 6px;text-align:right;color:' + (ovrd !== undefined ? 'var(--gr)' : 'var(--tx2)') + '">' +
        '<span id="vel-wkly-' + s.dpci + '">' + wkly.toLocaleString() + '</span>' +
        '</td></tr>';
    });
    vH += '</tbody></table></div>';
  });
  const velGrid = document.getElementById('vel-grids');
  if (velGrid) velGrid.innerHTML = vH;

  // ── Populate promo lift override grids ────────────────────────────────────
  const liftDef = {
    "Baby Snacks":       { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25 },
    "Kids Snacks":       { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25 },
    "Frozen Multiserve": { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50 },
    "Smoothies":         { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15 },
    "YoGos":             { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20 },
  };
  const types = { tpc: 'TPC', bogo: 'BOGO 25%', dwa: 'DWA', endcap: 'Co-space/Endcap' };
  let lH = '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:1px solid var(--bd)">' +
    '<th style="padding:6px 10px;text-align:left;color:var(--tx3);font-size:10.5px">Category</th>';
  Object.entries(types).forEach(([k, lbl]) => {
    lH += '<th style="padding:6px 10px;text-align:center;color:var(--tx3);font-size:10.5px">' + lbl + '</th>';
  });
  lH += '</tr></thead><tbody>';
  Object.entries(liftDef).forEach(([cat, vals]) => {
    lH += '<tr style="border-bottom:1px solid rgba(30,48,84,.3)"><td style="padding:6px 10px;font-weight:600;color:var(--tx)">' + cat + '</td>';
    Object.entries(types).forEach(([typeKey]) => {
      const k = cat + '|' + typeKey;
      const ovrd = liftOverrides[k];
      const base = vals[typeKey] || 1.0;
      const dispVal = ovrd !== undefined ? ovrd : base;
      lH += '<td style="padding:5px 8px;text-align:center">' +
        '<input type="number" min="0.5" max="10" step="0.05" value="' + dispVal.toFixed(2) + '" ' +
        'style="width:64px;padding:2px 5px;border-radius:4px;font-size:11.5px;text-align:center;' +
        'border:1px solid ' + (ovrd !== undefined ? 'var(--yw)' : 'var(--bd)') +
        ';background:var(--bg);color:' + (ovrd !== undefined ? 'var(--yw)' : 'var(--tx)') + '" ' +
        'onchange="updLift(\'' + cat + '\',\'' + typeKey + '\',this.value,this)" ' +
        'title="Base: ' + base.toFixed(2) + 'x \u00B7 Yellow = overridden">' +
        '<div style="font-size:9.5px;color:var(--tx3);margin-top:1px">\u00D7 base ' + base.toFixed(2) + '</div></td>';
    });
    lH += '</tr>';
  });
  lH += '</tbody></table></div>';
  const liftGrid = document.getElementById('lift-grids');
  if (liftGrid) liftGrid.innerHTML = lH;

  // Render history chart
  setTimeout(() => {
    const ce = document.getElementById('ch-hist-lift');
    if (!ce) return;
    if (ce._chart) ce._chart.destroy();
    const wkLbls = ['Sep 1', 'Sep 8', 'Sep 15', 'Sep 22', 'Sep 29', 'Oct 6', 'Oct 13', 'Oct 20', 'Oct 27', 'Nov 3', 'Nov 10', 'Nov 17', 'Nov 24', 'Dec 1', 'Dec 8', 'Dec 15', 'Dec 22', 'Dec 29', 'Jan 5', 'Jan 12', 'Jan 19', 'Jan 26', 'Feb 2', 'Feb 9', 'Feb 16', 'Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const frzVals = [241, 1784, 6601, 11160, 18578, 18710, 14525, 17260, 17065, 13805, 13697, 16005, 12504, 14188, 15047, 12969, 11248, 17294, 25115, 22898, 22738, 23116, 30368, 31643, 33551, 32293, 32735, 30957, 25244];
    const pufVals = [2467, 10826, 15310, 21901, 24546, 26627, 25041, 22783, 18248, 18673, 20407, 28888, 20607, 22081, 23199, 26604, 26042, 32331, 37611, 39577, 39026, 34424, 39449, 47516, 47927, 50064, 49046, 50220, 48183];
    ce._chart = new Chart(ce, { type: 'line', data: { labels: wkLbls, datasets: [
      { label: 'Frozen', data: frzVals, borderColor: 'rgba(99,102,241,.85)', backgroundColor: 'rgba(99,102,241,.06)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
      { label: 'Baby Snacks', data: pufVals, borderColor: 'rgba(0,207,146,.85)', backgroundColor: 'rgba(0,207,146,.05)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
    ] }, options: { responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: true, position: 'top' },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtN(ctx.parsed.y) + ' units' } } },
      scales: { y: { ticks: { callback: v => fmtN(v) }, grid: { color: 'rgba(255,255,255,.05)' } },
        x: { ticks: { maxRotation: 45, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
  }, 100);
}
