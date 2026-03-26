// ─── EXECUTIVE SUMMARY ──────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 3047–3352, 4019–4055)

import { DATA_DP, DATA_SHIP, DATA_PROMO, DATA_ACCURACY, DATA_STOPSHIP } from '../data/index.js';
import { fmt, fmtP, fmtN, sf } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';
import { velOverrides } from '../utils/state.js';

// ─── Module-level state ─────────────────────────────────────────────────
let _execS = 'base';

/**
 * DATA_AVF is defined in the monolith but not yet in data/index.js.
 * We import it lazily to avoid circular deps — pages that define it
 * should register it on window or a shared store.
 */
function _getAVF() {
  return window.DATA_AVF || [];
}

export function execScen(s, btn) {
  _execS = s;
  document.querySelectorAll('#exec-sc-tog .btn').forEach(b => b.classList.toggle('on', b === btn));
  initEXEC();
}

export function calcCV(hist) {
  const h = (hist || []).filter(v => v > 0);
  if (h.length < 3) return 0.18;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const variance = h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length;
  return Math.min(Math.sqrt(variance) / mean, 0.45);
}

export function calcBands(baseVal, cv) {
  return { p10: Math.round(baseVal * (1 - 1.28 * cv)), p50: Math.round(baseVal), p90: Math.round(baseVal * (1 + 1.28 * cv)) };
}

export function initEXEC() {
  const mult = { bear: 0.80, base: 1.00, bull: 1.20 }[_execS];
  const skus = DATA_DP.skus;
  const fwks = DATA_DP.fcast_weeks.slice(0, 13);
  const blendedUPC = window._blendedUPC || 13.4;

  // Aggregate 13-wk base forecast
  let tot13Base = 0, tot13Bear = 0, tot13Bull = 0, lwTotal = 0, llwTotal = 0;
  const catData = {};
  skus.forEach(s => {
    const vel = (velOverrides[s.dpci] !== undefined ? velOverrides[s.dpci] : s.lw_upspw) || 1;
    const origVel = s.lw_upspw || vel;
    const scale = origVel > 0 ? vel / origVel : 1;
    const f13 = s.fcast.slice(0, 13).reduce((a, b) => a + b, 0);
    const base = Math.round(f13 * scale);
    tot13Base += base;
    tot13Bear += Math.round(base * 0.80);
    tot13Bull += Math.round(base * 1.20);
    lwTotal += (s.hist[11] || 0);
    llwTotal += (s.hist[10] || 0);
    const cat = s.category || 'Other';
    if (!catData[cat]) catData[cat] = { base: 0, bear: 0, bull: 0, hist4: 0, hist: [], name: cat };
    catData[cat].base += base;
    catData[cat].bear += Math.round(base * 0.80);
    catData[cat].bull += Math.round(base * 1.20);
    catData[cat].hist4 += (s.hist.slice(7, 11).reduce((a, b) => a + b, 0) / 4);
    catData[cat].hist.push(...s.hist);
  });

  const tot13 = _execS === 'bear' ? tot13Bear : _execS === 'bull' ? tot13Bull : tot13Base;
  const wow = llwTotal > 0 ? (lwTotal - llwTotal) / llwTotal : 0;

  // Ship plan aggregates
  let planCases = 0, poCases = 0, fcastCases = 0;
  if (DATA_SHIP && DATA_SHIP.skus) {
    DATA_SHIP.skus.forEach(s => {
      planCases += (s['13-wk Plan Cases'] || 0);
      poCases += (s['13-wk PO Cases'] || 0);
      fcastCases += (s['13-wk Fcast Cases'] || 0);
    });
  }
  const planUnits = Math.round(planCases * blendedUPC);
  const covPct = planCases > 0 ? ((poCases + fcastCases) / planCases) : 0;
  const gapUnits = tot13Base - planUnits;

  // ── KPI cards
  const scCol = { bear: 'var(--rd)', base: 'var(--ac)', bull: 'var(--gr)' }[_execS];
  const scLbl = { bear: 'Bear', base: 'Base', bull: 'Bull' }[_execS];
  document.getElementById('exec-kpis').innerHTML =
    kpiCard('\u{1F4E6}', '13-Wk Forecast (' + scLbl + ')', '--cc:' + scCol, fmt(tot13),
      wow > 0.01 ? fmtP(wow) + ' WoW (actuals)' : wow < -0.01 ? fmtP(wow) + ' WoW decel' : 'Flat WoW',
      wow > 0.01 ? 'up' : wow < -0.05 ? 'dn' : 'neu',
      fmt(tot13Base) + ' base \u00B7 ' + fmt(tot13Bear) + ' bear \u00B7 ' + fmt(tot13Bull) + ' bull') +
    kpiCard('\u{1F3AF}', 'Coverage vs Plan', '--cc:' + (covPct >= 0.90 ? 'var(--gr)' : covPct >= 0.70 ? 'var(--yw)' : 'var(--rd)'),
      covPct > 0 ? (Math.round(covPct * 100) + '%') : '\u2014',
      covPct >= 0.90 ? '\u2713 On track' : covPct >= 0.70 ? '\u26A0 Gap detected' : '\u26A0 Behind plan',
      covPct >= 0.90 ? 'up' : covPct >= 0.70 ? 'neu' : 'dn',
      'Plan: ' + fmt(planCases) + ' cs \u00B7 PO committed: ' + fmt(poCases) + ' cs') +
    kpiCard('\u{1F4C9}', 'Forecast Gap', '--cc:' + (gapUnits >= 0 ? 'var(--gr)' : 'var(--rd)') + ';',
      (gapUnits >= 0 ? '+' : '') + fmt(gapUnits) + ' units',
      gapUnits >= 0 ? 'Ahead of plan' : 'Behind plan',
      gapUnits >= 0 ? 'up' : 'dn',
      'vs plan of ' + fmt(planUnits) + ' units') +
    kpiCard('\u{1F4C8}', 'LW Actuals (Mar 8)', '--cc:var(--cy)', fmt(lwTotal),
      fmtP(wow) + ' vs prior week',
      wow > 0.02 ? 'up' : wow < -0.05 ? 'dn' : 'neu',
      skus.length + ' SKUs \u00B7 LW = week ending Mar 8, 2026');

  // ── Scenario Bars
  const barsEl = document.getElementById('exec-scen-bars');
  if (barsEl) {
    const maxV = Math.max(tot13Bear, tot13Base, tot13Bull) || 1;
    const bars = [
      { lbl: 'Bear', v: tot13Bear, col: '#ef4444', mult: 0.80 },
      { lbl: 'Base', v: tot13Base, col: '#00E3CD', mult: 1.00 },
      { lbl: 'Bull', v: tot13Bull, col: '#00CF92', mult: 1.20 }
    ];
    barsEl.innerHTML = bars.map(b => `
      <div class="scen-bar-row">
        <div class="scen-bar-lbl" style="color:${b.col}">${b.lbl}</div>
        <div class="scen-bar-track">
          <div class="scen-bar-fill" style="width:${Math.round(b.v / maxV * 100)}%;background:${b.col}22;border-right:2px solid ${b.col}80">
            <span style="color:${b.col};font-size:12px">${fmt(b.v)}</span>
          </div>
        </div>
        <div class="scen-bar-val" style="color:${b.col}">\u00D7${b.mult.toFixed(2)}</div>
      </div>`).join('');
    const metaEl = document.getElementById('exec-scen-meta');
    if (metaEl) {
      const promoCount = DATA_PROMO.filter(e => e.wk >= 1 && e.wk <= 13).length;
      metaEl.innerHTML =
        '<b style="color:var(--tx)">Range:</b> ' + fmt(tot13Bear) + '\u2013' + fmt(tot13Bull) + ' units (' + fmt(tot13Bull - tot13Bear) + ' spread) &nbsp;\u00B7&nbsp; ' +
        '<b style="color:var(--tx)">Promo events:</b> ' + promoCount + ' in 13 wks &nbsp;\u00B7&nbsp; ' +
        '<b style="color:var(--tx)">Confirmed:</b> ' + DATA_PROMO.filter(e => e.wk <= 13 && e.status === '\u2713 Confirmed').length + ' events &nbsp;\u00B7&nbsp; ' +
        '<b style="color:var(--tx)">Model MAPE:</b> ' + DATA_ACCURACY.model_mape_l4w.toFixed(1) + '% (use per-SKU bands for precision) &nbsp;\u00B7&nbsp; ' +
        '<span style="color:rgba(239,68,68,.8)">Bear/Bull \u00B120% = illustrative scenarios, not model confidence intervals</span>';
    }
  }

  // ── Next 4 Events
  const evtEl = document.getElementById('exec-events');
  if (evtEl) {
    const next4 = DATA_PROMO.filter(e => e.wk >= 1 && e.wk <= 4);
    if (!next4.length) { evtEl.innerHTML = '<div style="color:var(--tx3);font-size:12px;padding:20px;text-align:center">No events in next 4 weeks</div>'; return; }
    const tCol = { 'TPC': 'var(--ac2)', 'Launch TPC': '#00F9B8', 'DWA': 'var(--yw)', 'Co-space': 'var(--pu)', 'Circle': 'var(--rd)', 'CSTI': 'var(--cy)' };
    evtEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px">' +
      next4.map(e => {
        const col = tCol[e.type] || 'var(--tx2)';
        const conf = e.status === '\u2713 Confirmed';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--s2);border-radius:8px;border-left:3px solid ${col}">
        <div style="min-width:38px;text-align:center">
          <div style="font-size:10px;color:var(--tx3)">Wk ${e.wk}</div>
          <div style="font-size:12.5px;font-weight:800;color:${col}">${e.date}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.event}</div>
          <div style="font-size:10.5px;color:var(--tx3)">${e.mechanic} \u00B7 ${e.stores} stores</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:12.5px;font-weight:800;color:${col}">${e.lift_pct}</div>
          <div style="font-size:10px;color:${conf ? 'var(--gr)' : 'var(--tx3)'}">${conf ? '\u2713 Confirmed' : '\u23F3 Pending'}</div>
        </div>
      </div>`;
      }).join('') + '</div>';
  }

  // ── Risk Watchlist
  const riskEl = document.getElementById('exec-risk');
  const riskCountEl = document.getElementById('exec-risk-count');
  if (riskEl) {
    const risks = [];
    skus.forEach(s => {
      const hAll = s.hist.filter(v => v > 0);
      if (hAll.length < 5) return;
      // hist[-1] is partial CW data — exclude it; use hist[-2] as last FULL week
      const h = hAll.length >= 2 && hAll[hAll.length - 1] < hAll[hAll.length - 2] * 0.5
        ? hAll.slice(0, -1) // drop partial week if it's <50% of prior full week
        : hAll;
      if (h.length < 4) return;
      const lw = h[h.length - 1]; // last FULL completed week
      const lw4 = h[h.length - 5] || h[h.length - 4]; // 4 full weeks prior
      const trend4 = (lw - (lw4 || lw)) / (lw4 || lw || 1);
      const lw4avg = h.slice(-4).reduce((a, b) => a + b, 0) / 4;
      const cv = calcCV(h);
      const isNew = h.length < 8;
      if (isNew) return; // skip still-ramping SKUs
      if (trend4 < -0.15 || cv > 0.28) {
        risks.push({
          name: (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 35),
          cat: (s.category || '').replace(' Multiserve', ''),
          dpci: s.dpci, trend: trend4, cv, lw, lw4avg,
          type: trend4 < -0.15 ? 'declining' : 'volatile'
        });
      }
    });
    risks.sort((a, b) => a.trend - b.trend);
    if (riskCountEl) riskCountEl.textContent = risks.length ? ' \u2014 ' + risks.length + ' SKUs' : '';
    if (!risks.length) {
      riskEl.innerHTML = '<div style="color:var(--gr);font-size:12.5px;padding:20px;text-align:center;line-height:1.8">\u2713 No active risk flags<br><span style="font-size:11px;color:var(--tx3)">All SKUs within normal velocity range</span></div>';
    } else {
      riskEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:5px">' +
        risks.slice(0, 6).map(r => {
          const col = r.type === 'declining' ? 'var(--rd)' : 'var(--yw)';
          const ic = r.type === 'declining' ? '\u{1F4C9}' : '\u26A0\uFE0F';
          const lbl = r.type === 'declining' ? fmtP(r.trend) + ' 4-wk' : 'CV: ' + (r.cv * 100).toFixed(0) + '%';
          return `<div class="risk-item">
          <div style="font-size:16px">${ic}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
            <div style="font-size:10.5px;color:var(--tx3)">${r.cat}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:12.5px;font-weight:700;color:${col}">${lbl}</div>
            <div style="font-size:10.5px;color:var(--tx3)">LW: ${fmt(r.lw)}</div>
          </div>
        </div>`;
        }).join('') + '</div>';
    }
  }

  // ── Auto Callouts
  const calloutsEl = document.getElementById('exec-callouts');
  if (calloutsEl) {
    const calls = [];
    if (covPct >= 0.90)
      calls.push({ cls: 'ci-grn', ic: '\u2705', txt: `<strong>Forecast on track:</strong> PO + modeled forecast covers <strong>${Math.round(covPct * 100)}%</strong> of the 13-week plan target (${fmt(planCases)} cs).` });
    else if (covPct >= 0.70)
      calls.push({ cls: 'ci-yel', ic: '\u26A0\uFE0F', txt: `<strong>Coverage gap:</strong> At ${Math.round(covPct * 100)}%, ~<strong>${fmt(Math.round(planCases * (1 - covPct)))} cs</strong> unplanned. Consider additional PO submissions.` });
    else if (covPct > 0)
      calls.push({ cls: 'ci-red', ic: '\u{1F6A8}', txt: `<strong>Significant shortfall:</strong> Forecast covers only ${Math.round(covPct * 100)}% of plan. Velocity or PO cadence needs immediate review.` });

    const frozenEndcap = DATA_PROMO.find(e => e.category === 'Frozen' && e.type === 'Co-space' && e.wk <= 6);
    if (frozenEndcap)
      calls.push({ cls: 'ci-pur', ic: '\u{1F9CA}', txt: `<strong>Frozen P4 co-space Wk ${frozenEndcap.wk} (${frozenEndcap.date}):</strong> 4-wk endcap at 1,531 stores. Modeled at <strong>1.50x</strong> base velocity \u2014 corrected from previous 2.0x (old model double-counted BOGO).` });

    const dwa = DATA_PROMO.find(e => e.type === 'DWA' && e.wk >= 1 && e.wk <= 13 && e.category === 'Brand-Wide');
    if (dwa)
      calls.push({ cls: 'ci-yel', ic: '\u2B50', txt: `<strong>DWA BOGO 25% Wk ${dwa.wk} (${dwa.date}):</strong> Brand-wide chain event. Largest single demand driver \u2014 models at <strong>1.50\u20131.60x</strong> base velocity depending on category.` });

    if (Math.abs(wow) > 0.04)
      calls.push({ cls: wow > 0 ? 'ci-grn' : 'ci-red', ic: wow > 0 ? '\u{1F4C8}' : '\u{1F4C9}',
        txt: `<strong>${wow > 0 ? 'Positive' : 'Negative'} WoW signal:</strong> LW actuals <strong>${fmtP(wow)}</strong> vs prior week. ${wow > 0 ? 'Early TPC activation likely.' : 'Monitor for TPC lapse or OOS.'}` });

    const kidsNote = DATA_PROMO.find(e => e.type === 'DWA' && e.wk >= 1 && e.wk <= 13 && (e.category || '').includes('Kids'));
    if (kidsNote)
      calls.push({ cls: 'ci-pur', ic: '\u{1F9F8}', txt: `<strong>Kids DWA Wk ${kidsNote.wk}:</strong> Model uses <strong>1.45x</strong> (corrected from 2.0x). Old assumption required elasticity of \u22125x \u2014 structurally incorrect. New: 20%-off event at elasticity \u22122.5 \u2192 1.50x, adjusted to 1.45x.` });

    if (_execS !== 'base')
      calls.push({ cls: 'ci-blu', ic: '\u{1F52E}', txt: `<strong>Viewing ${_execS.toUpperCase()} scenario (\u00D7${mult.toFixed(2)}):</strong> All forward units scaled ${_execS === 'bear' ? 'down' : 'up'} by ${Math.round(Math.abs(mult - 1) * 100)}%. Switch to Base for model-default.` });

    if (!calls.length)
      calls.push({ cls: 'ci-grn', ic: '\u2713', txt: '<strong>Model running normally.</strong> No anomalies detected. All 14 pages initializing, forecast propagating, scenarios active.' });

    calloutsEl.innerHTML = calls.map(c => `<div class="callout-item ${c.cls}"><div class="ci-icon">${c.ic}</div><div class="ci-text">${c.txt}</div></div>`).join('');
  }

  // ── Category Snapshot
  const catSnapEl = document.getElementById('exec-cat-snap');
  if (catSnapEl) {
    const catPlan = {};
    if (DATA_SHIP && DATA_SHIP.skus) {
      DATA_SHIP.skus.forEach(sh => {
        const dpSku = DATA_DP.skus.find(d => d.dpci === sh.dpci);
        const cat = (dpSku?.category || 'Other').replace(' Multiserve', '');
        if (!catPlan[cat]) catPlan[cat] = { plan: 0, po: 0, fcast: 0 };
        catPlan[cat].plan += (sh['13-wk Plan Cases'] || 0) * blendedUPC;
        catPlan[cat].po += (sh['13-wk PO Cases'] || 0) * blendedUPC;
        catPlan[cat].fcast += (sh['13-wk Fcast Cases'] || 0) * blendedUPC;
      });
    }
    const catMeta = { 'Baby Snacks': { col: '#00E3CD', em: '\u{1F476}' }, 'Kids Snacks': { col: '#00CF92', em: '\u{1F9D2}' },
      'Frozen': { col: '#DC7BFF', em: '\u{1F9CA}' }, 'Smoothies': { col: '#FFC711', em: '\u{1F964}' }, 'YoGos': { col: '#18A7FF', em: '\u{1F353}' } };
    const entries = Object.entries(catPlan).filter(([k, v]) => v.plan > 0);
    const maxPlan = Math.max(...entries.map(([, v]) => v.plan), 1);
    catSnapEl.innerHTML = entries.map(([cat, v]) => {
      const m = catMeta[cat] || { col: 'var(--ac)', em: '\u{1F4E6}' };
      const cov = v.plan > 0 ? (v.po + v.fcast) / v.plan : 0;
      const pct = Math.round(cov * 100);
      const barCol = cov >= 0.90 ? '#00CF92' : cov >= 0.70 ? '#FFC711' : '#ef4444';
      const planW = Math.round(v.plan / maxPlan * 100);
      const fillW = Math.round(Math.min(cov, 1) * planW);
      return `<div class="cat-snap-row">
        <div class="cat-snap-name">${m.em} <b>${cat}</b></div>
        <div class="cat-snap-bar-wrap">
          <div class="cat-snap-bar-bg" style="width:${planW}%;position:relative">
            <div class="cat-snap-bar-fg" style="width:${fillW > 0 ? Math.round(fillW / planW * 100) : 0}%;background:${barCol}30;border-right:2px solid ${barCol}"></div>
          </div>
          <div class="cat-snap-bar-sub">
            <span>PO+Fcst: ${fmt(Math.round(v.po + v.fcast))}</span>
            <span>Plan: ${fmt(Math.round(v.plan))}</span>
          </div>
        </div>
        <div class="cat-snap-pct" style="color:${barCol}">${pct}%</div>
      </div>`;
    }).join('') || '<div style="color:var(--tx3);padding:20px;text-align:center;font-size:12px">Loading category coverage data\u2026</div>';
  }

  // ── Risk OS: inject exec-risk-summary ──────────────────────────────
  (function addExecRisk() {
    const execExtra = document.getElementById('exec-risk-summary');
    if (!execExtra || execExtra.innerHTML) return;
    const DATA_AVF = _getAVF();
    const highRisk = DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH');
    const totalBear = DATA_STOPSHIP.total_bear_exposure_usd;
    const modelMAPE = DATA_ACCURACY.model_mape_l4w;
    const behind = DATA_AVF.filter(s => s.vs_fcast_pct <= -0.15).length;
    let h = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
    h += `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:14px 16px">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">\u26A0\uFE0F Inventory at Risk</div>
      <div style="font-size:24px;font-weight:900;color:#ef4444;margin-bottom:4px">$${Math.round(totalBear / 1000)}K <span style="font-size:13px;font-weight:600;opacity:.7">bear case</span></div>
      <div style="font-size:12px;color:var(--tx2);margin-bottom:8px">${highRisk.length} HIGH risk SKU${highRisk.length !== 1 ? 's' : ''} \u00B7 stop-ship constraints active</div>
      ${highRisk.slice(0, 2).map(s => `<div style="font-size:11px;color:var(--tx3);padding:3px 0;border-top:1px solid rgba(239,68,68,.15)">\u{1F534} ${s.name.substring(0, 30)} \u2014 $${Math.round(s.risk_usd_bear / 1000)}K</div>`).join('')}
      <div style="margin-top:8px;font-size:11px;color:#ef4444;cursor:pointer" onclick="nav(document.querySelector('[onclick*=riskos]'),'riskos')">\u2192 Open Risk OS for full analysis \u2197</div>
    </div>`;
    const mapeCol = modelMAPE < 15 ? 'var(--gr)' : modelMAPE < 25 ? 'var(--yw)' : 'var(--rd)';
    h += `<div style="background:rgba(255,199,17,.06);border:1px solid rgba(255,199,17,.2);border-radius:10px;padding:14px 16px">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">\u{1F4CA} Forecast Accuracy Signal</div>
      <div style="font-size:24px;font-weight:900;color:${mapeCol};margin-bottom:4px">${modelMAPE.toFixed(1)}% <span style="font-size:13px;font-weight:600;opacity:.7">MAPE L4W</span></div>
      <div style="font-size:12px;color:var(--tx2);margin-bottom:8px">Model bias: ${DATA_ACCURACY.model_bias_l4w > 0 ? '+' : ''}${DATA_ACCURACY.model_bias_l4w.toFixed(1)}% \u00B7 ${behind} SKUs pacing \u226515% below</div>
      ${Object.entries(DATA_ACCURACY.cat_mape).slice(0, 3).map(([cat, mape]) => `<div style="font-size:11px;color:var(--tx3);padding:3px 0;border-top:1px solid rgba(255,199,17,.15)">${mape > 22 ? '\u{1F534}' : mape > 15 ? '\u{1F7E1}' : '\u2705'} ${cat}: ${mape.toFixed(1)}%</div>`).join('')}
    </div>`;
    h += '</div>';
    execExtra.innerHTML = h;
  })();
}
