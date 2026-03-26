// ═══════════════════════════════════════════════════════════════════
// ── RISK OS ─────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 3484–4018)
// ═══════════════════════════════════════════════════════════════════

import { DATA_DP, DATA_ACCURACY, DATA_STOPSHIP } from '../data/index.js';
import { fmt, fmtP, sf } from '../utils/formatters.js';
import { kpiCard, fillSel } from '../utils/dom.js';

// ─── Lazy accessors for data not yet in data/index.js ───────────────────
function _getAVF() { return window.DATA_AVF || []; }

// ─── Module-level state ─────────────────────────────────────────────────
let _rosFilter = 'all';

// ═══════════════════════════════════════════════════════════════════
// ── RISK OS HELPERS ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/** Get accuracy record for a DPCI */
export function getAcc(dpci) {
  return DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null;
}

/** Get stop-ship record for a DPCI */
export function getSS(dpci) {
  return DATA_STOPSHIP.skus.find(s => s.dpci === dpci) || null;
}

/** Get confidence bands for a SKU based on historical MAPE */
export function getFcastBands(dpciOrSku, wkIdx) {
  const acc = typeof dpciOrSku === 'string' ? getAcc(dpciOrSku) : dpciOrSku;
  const mape = acc ? acc.mape_l4w / 100 : 0.20;
  const dp = DATA_DP.skus.find(s => s.dpci === (acc ? acc.dpci : dpciOrSku));
  if (!dp) return { low: 0, base: 0, high: 0, raw: 0, isAnalog: false, adj: null };
  const raw = dp.fcast[wkIdx || 0] || 0;
  // Flag analog estimates (new SKUs with no launch history)
  const analogDqs = ['analog_smoothies_1ct', 'analog_new_format', 'analog_baby_puffs_curve'];
  const isAnalog = acc && analogDqs.includes(acc.data_quality);
  // ── Conservative calibration ──────────────────────────────
  const adj = (typeof window.getConservativeAdj === 'function') ? window.getConservativeAdj(acc ? acc.dpci : dpciOrSku) : null;
  const adjFactor = adj ? Math.max(0.70, 1 + adj.total_adj_pct / 100) : 1;
  const base = raw > 0 ? Math.round(raw * adjFactor) : 0;
  // ── Conservative scenario bands ───────────────────────────
  const bearFactor = Math.max(0.65, 1 - mape * 1.10);  // slightly wider bear
  const bullFactor = Math.min(1.35, 1 + mape * 0.90);  // slightly tighter bull
  return {
    raw: raw,
    base: base,
    low:  raw > 0 ? Math.round(base * bearFactor) : 0,
    high: raw > 0 ? Math.round(base * bullFactor) : 0,
    mape_pct: Math.round(mape * 100),
    adj: adj,
    adjFactor: Math.round(adjFactor * 1000) / 1000,
    isAnalog: isAnalog,
    isPreLaunch: raw === 0
  };
}

/** Trust signal display */
export function trustSignal(level, score) {
  const cfg = {
    High:   { icon: '\u2705', col: 'var(--gr)', bg: 'rgba(0,207,146,.1)' },
    Medium: { icon: '\u26A0\uFE0F', col: 'var(--yw)', bg: 'rgba(255,199,17,.1)' },
    Low:    { icon: '\u{1F534}', col: 'var(--rd)', bg: 'rgba(239,68,68,.1)' }
  };
  const c = cfg[level] || cfg.Medium;
  const tooltip = level === 'High' ? 'Trust score ' + score + '/100 \u2014 strong history, reliable forecast' :
                  level === 'Low'  ? 'Trust score ' + score + '/100 \u2014 high error rate, widen your assumptions' :
                  'Trust score ' + score + '/100 \u2014 monitor, use confidence bands';
  return `<span title="${tooltip}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;background:${c.bg};color:${c.col};font-size:11px;font-weight:700;cursor:help">${c.icon} ${level}</span>`;
}

/** Risk level chip */
export function riskChipOS(level) {
  if (level === 'HIGH') return '<span style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:800">\u{1F534} HIGH</span>';
  if (level === 'MEDIUM') return '<span style="background:rgba(255,199,17,.12);color:#fbbf24;border:1px solid rgba(255,199,17,.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:800">\u{1F7E1} MED</span>';
  return '<span style="background:rgba(0,207,146,.1);color:var(--gr);border:1px solid rgba(0,207,146,.2);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:800">\u{1F7E2} LOW</span>';
}

/** Sell-through bar render */
export function stBar(pct, riskLevel) {
  const col = pct >= 0.90 ? 'var(--gr)' : pct >= 0.75 ? 'var(--yw)' : 'var(--rd)';
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:6px;background:var(--s2);border-radius:3px;overflow:hidden">
      <div style="width:${Math.round(pct * 100)}%;height:100%;background:${col};border-radius:3px"></div>
    </div>
    <span style="font-size:11px;color:${col};font-weight:700;min-width:34px">${Math.round(pct * 100)}%</span>
  </div>`;
}

// ─── Filter handler ─────────────────────────────────────────────────
export function rosFilter(btn, f) {
  _rosFilter = f;
  document.querySelectorAll('#pg-riskos .btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderRosStopShip();
}

// ─── MAIN RISK OS INITIALIZER ─────────────────────────────────────
export function initRISKOS() {
  const DATA_AVF = _getAVF();

  // ── KPI Cards ──────────────────────────────────────────────────
  const totalBearUSD = DATA_STOPSHIP.total_bear_exposure_usd;
  const totalBaseUSD = DATA_STOPSHIP.total_base_exposure_usd;
  const highCt = DATA_STOPSHIP.high_risk_count;
  const medCt = DATA_STOPSHIP.medium_risk_count;
  const ssSkus = DATA_STOPSHIP.skus.filter(s => s.stop_ship_wk <= 13);
  const modelMAPE = DATA_ACCURACY.model_mape_l4w;
  const modelBias = DATA_ACCURACY.model_bias_l4w;

  // Count SKUs pacing behind (from AVF)
  const behind = DATA_AVF.filter(s => s.vs_fcast_pct <= -0.15).length;
  const ahead  = DATA_AVF.filter(s => s.vs_fcast_pct >= 0.10).length;

  const wksTillFirst = Math.min(...DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH').map(s => s.stop_ship_wk - 1));
  document.getElementById('ros-kpis').innerHTML =
    kpiCard('\u{1F4B0}', '$ At Risk (Bear Case)', '--cc:var(--rd)',
      '$' + Math.round(totalBearUSD / 1000) + 'K',
      'Base: $' + Math.round(totalBaseUSD / 1000) + 'K \u00B7 Delta: $' + Math.round((totalBearUSD - totalBaseUSD) / 1000) + 'K additional downside', 'dn',
      highCt + ' HIGH \u00B7 ' + medCt + ' MED risk SKUs \u00B7 ' + DATA_STOPSHIP.total_bear_units.toLocaleString() + ' units') +
    kpiCard('\u{1F534}', 'High Risk Stop-Ships', '--cc:var(--rd)',
      highCt + ' SKUs',
      wksTillFirst <= 6 ? '\u{1F525} First stop ship in ' + wksTillFirst + ' wks \u2014 action NOW' : 'Stop ships over next ' + DATA_STOPSHIP.skus.filter(s => s.risk_level !== 'LOW').map(s => s.stop_ship_wk - 1).join('/' + ' wks'), 'dn',
      [...new Set(DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH').map(s => s.category))].join(', ') + ' at risk') +
    kpiCard('\u{1F4CA}', 'Model Accuracy \u2014 L4W', '--cc:var(--cy)',
      modelMAPE.toFixed(1) + '% MAPE',
      'Bias: ' + (modelBias >= 0 ? '+' : '') + modelBias.toFixed(1) + '% ' + (modelBias > 3 ? '(over-forecasting)' : modelBias < -3 ? '(under-forecasting)' : '(well-calibrated)'),
      Math.abs(modelBias) < 3 ? 'neu' : 'dn',
      behind + ' SKUs \u226515% below fcast \u00B7 ' + ahead + ' beating fcast') +
    kpiCard('\u{1F4C9}', 'SKUs Pacing Below Fcast', '--cc:var(--yw)',
      behind + ' of ' + DATA_AVF.length,
      behind === 0 ? 'All SKUs on or ahead of pace' : behind <= 3 ? 'Monitor \u2014 may correct' : 'Review: demand lower than modeled',
      behind === 0 ? 'up' : behind > 5 ? 'dn' : 'neu',
      'LW actuals vs model \u00B7 threshold \u226515% miss');

  // ── Executive Alert Banner ──────────────────────────────────────
  const alertEl = document.getElementById('ros-exec-alert');
  if (alertEl && (highCt > 0 || totalBearUSD > 100000)) {
    const topRisk = DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH').sort((a, b) => b.risk_usd_bear - a.risk_usd_bear);
    const urgentSkus = DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH' && s.stop_ship_wk <= 6);
    const urgentLabel = urgentSkus.length > 0 ? `<span style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.5);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:800;color:#ef4444;margin-left:8px">\u{1F525} ${urgentSkus.length} URGENT \u2014 stop ship in \u22646 wks</span>` : '';
    alertEl.innerHTML = `<div style="background:rgba(239,68,68,.07);border:2px solid rgba(239,68,68,.4);border-radius:10px;padding:16px 20px;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <span style="font-size:22px">\u{1F6A8}</span>
        <div style="font-size:14px;font-weight:900;color:#ef4444">RISK ALERT \u2014 ${highCt} HIGH RISK SKU${highCt > 1 ? 's' : ''} \u00B7 $${Math.round(totalBearUSD / 1000)}K bear-case exposure</div>
        ${urgentLabel}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:12px">
        ${topRisk.map(s => {
          const wksLeft = s.stop_ship_wk - 1;
          const urg = wksLeft <= 3 ? '\u{1F525}' : wksLeft <= 6 ? '\u23F0' : '\u{1F4C5}';
          return `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px 12px">
            <div style="font-weight:800;font-size:12px;color:var(--tx);margin-bottom:4px">${s.name.substring(0, 38)}</div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--tx2)">
              <span>${urg} <b>${wksLeft} wks left</b></span>
              <span>\u{1F4E6} ${s.leftover_bear.toLocaleString()} units</span>
              <span>\u{1F4B0} <b style="color:#ef4444">$${Math.round(s.risk_usd_bear / 1000)}K</b></span>
            </div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px">${Math.round(s.st_pct_bear * 100)}% worst-case sell-through \u00B7 ${s.stop_ship_date} stop ship</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:16px;font-size:11px;color:var(--tx3);border-top:1px solid rgba(239,68,68,.2);padding-top:10px">
        <span>\u26A1 <b style="color:var(--tx)">Action required:</b> Review Decision Cards below \u00B7 Prioritize promo/markdown acceleration NOW</span>
        <span style="margin-left:auto;color:var(--tx3)">Model bias: +${DATA_ACCURACY.model_bias_l4w.toFixed(1)}% \u2014 forecasts may be slightly optimistic</span>
      </div>
    </div>`;
  }

  // ── Accuracy Summary ────────────────────────────────────────────
  const accEl = document.getElementById('ros-accuracy-summary');
  if (accEl) {
    const catMape = DATA_ACCURACY.cat_mape;
    const catBias = DATA_ACCURACY.cat_bias;
    const cats = Object.keys(catMape);
    let h = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<thead><tr><th style="text-align:left;padding:4px 8px;color:var(--tx3);font-weight:600">Category</th>';
    h += '<th class="tr" style="padding:4px 8px;color:var(--tx3);font-weight:600" title="Mean Absolute % Error \u2014 lower is better. <12% = good, 12\u201322% = monitor, >22% = high error">MAPE L4W \u2193 better</th>';
    h += '<th class="tr" style="padding:4px 8px;color:var(--tx3);font-weight:600" title="Systematic over/under-forecast. Positive = model over-forecasts (optimistic)">Bias (+ = over)</th>';
    h += '<th style="padding:4px 8px;color:var(--tx3);font-weight:600">Signal</th></tr></thead><tbody>';
    cats.forEach(cat => {
      const mape = catMape[cat];
      const bias = catBias[cat] || 0;
      const mapeCol = mape < 12 ? 'var(--gr)' : mape < 22 ? 'var(--yw)' : 'var(--rd)';
      const catSkuCt = DATA_ACCURACY.skus.filter(s => s.category === cat).length;
      const biasIcon = bias > 5 ? '\u2191 over' : bias < -5 ? '\u2193 under' : '\u2248 flat';
      const biasCol = Math.abs(bias) > 10 ? 'var(--rd)' : Math.abs(bias) > 5 ? 'var(--yw)' : 'var(--gr)';
      h += `<tr style="border-bottom:1px solid var(--bd)">
        <td style="padding:6px 8px;font-weight:600">${cat}<span style="font-size:9px;color:var(--tx3);margin-left:4px">(${catSkuCt})</span></td>
        <td class="tr" style="padding:6px 8px;color:${mapeCol};font-weight:700">${mape.toFixed(1)}%</td>
        <td class="tr" style="padding:6px 8px;color:${biasCol};font-size:11px">${biasIcon} (${bias > 0 ? '+' : ''}${bias.toFixed(1)}%)</td>
        <td style="padding:6px 8px">${mape < 12 ? '<span style="color:var(--gr)">\u2705 Good</span>' : mape < 22 ? '<span style="color:var(--yw)">\u26A0\uFE0F Monitor</span>' : '<span style="color:var(--rd)">\u{1F534} High error</span>'}</td>
      </tr>`;
    });
    h += '<tr style="border-top:2px solid var(--bd);background:var(--s2)"><td style="padding:6px 8px;font-weight:800">Total Model</td>';
    h += `<td class="tr" style="padding:6px 8px;font-weight:800;color:${DATA_ACCURACY.model_mape_l4w < 15 ? 'var(--yw)' : 'var(--rd)'}">${DATA_ACCURACY.model_mape_l4w.toFixed(1)}%</td>`;
    const mb = DATA_ACCURACY.model_bias_l4w;
    h += `<td class="tr" style="padding:6px 8px;font-size:11px">${mb > 0 ? '\u2191 over' : '\u2193 under'} (${mb > 0 ? '+' : ''}${mb.toFixed(1)}%)</td>`;
    h += `<td style="padding:6px 8px;font-size:11px;color:${Math.abs(mb) > 5 ? 'var(--rd)' : 'var(--tx3)'}">${Math.abs(mb) > 5 ? '\u26A0\uFE0F Systemic bias \u2014 adjust' : '\u2713 Calibrated'}</td></tr>`;
    h += '</tbody></table>';
    h += `<div style="padding:8px 10px;font-size:10px;color:var(--tx3);border-top:1px solid var(--bd)">
      \u{1F4D0} Model MAPE is volume-weighted across all active SKUs \u00B7 L4W = last 4 weeks \u00B7 Positive bias = model over-forecasts demand
      \u00B7 Per-SKU accuracy in Integrated View below
    </div>`;
    accEl.innerHTML = h;
  }

  // ── Category Risk Map ──────────────────────────────────────────
  const catRiskEl = document.getElementById('ros-cat-risk');
  if (catRiskEl) {
    const cats = ['Baby Snacks', 'Kids Snacks', 'Smoothies', 'Frozen Multiserve', 'YoGos'];
    const avfByCat = {};
    DATA_AVF.forEach(s => {
      const cat = s.category || s.cat;
      if (!avfByCat[cat]) { avfByCat[cat] = { acts: 0, fcasts: 0, ct: 0 }; }
      avfByCat[cat].acts += sf(s.lw_units);
      avfByCat[cat].fcasts += sf(s.fcast_units);
      avfByCat[cat].ct++;
    });
    const ssRiskByCat = {};
    DATA_STOPSHIP.skus.forEach(s => {
      if (!ssRiskByCat[s.category]) ssRiskByCat[s.category] = 0;
      ssRiskByCat[s.category] += s.risk_usd_bear;
    });
    let h = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<thead><tr><th style="text-align:left;padding:4px 8px;color:var(--tx3)">Category</th><th class="tr" style="padding:4px 8px;color:var(--tx3)">LW vs Fcast</th><th class="tr" style="padding:4px 8px;color:var(--tx3)">$ Exposure</th><th style="padding:4px 8px;color:var(--tx3)">Risk</th></tr></thead><tbody>';
    Object.entries(avfByCat).forEach(([cat, d]) => {
      const avfPct = (d.acts - d.fcasts) / (d.fcasts || 1);
      const exp = ssRiskByCat[cat] || 0;
      const riskLvl = exp > 150000 ? 'HIGH' : exp > 30000 ? 'MEDIUM' : 'LOW';
      const avfCol = avfPct >= 0 ? 'var(--gr)' : avfPct >= -0.10 ? 'var(--yw)' : 'var(--rd)';
      h += `<tr style="border-bottom:1px solid var(--bd)">
        <td style="padding:6px 8px;font-weight:600">${cat}</td>
        <td class="tr" style="padding:6px 8px;color:${avfCol};font-weight:700">${avfPct >= 0 ? '+' : ''}${(avfPct * 100).toFixed(1)}%</td>
        <td class="tr" style="padding:6px 8px;font-weight:700;color:${exp > 50000 ? 'var(--rd)' : exp > 0 ? 'var(--yw)' : 'var(--gr)'}">${exp > 0 ? '$' + Math.round(exp / 1000) + 'K' : '\u2014'}</td>
        <td style="padding:6px 8px">${riskChipOS(riskLvl)}</td>
      </tr>`;
    });
    h += '</tbody></table>';
    h += `<div style="padding:8px 10px;font-size:10px;color:var(--tx3);border-top:1px solid var(--bd)">
      $ Exposure = bear-case leftover inventory \u00D7 unit price for stop-ship SKUs in this category \u00B7 LW vs Fcast from Actuals vs Forecast module
    </div>`;
    catRiskEl.innerHTML = h;
  }

  // ── Fill category filter ─────────────────────────────────────
  fillSel('ros-cat-filter', DATA_DP.skus.map(s => s.category));

  // ── Render sub-sections ──────────────────────────────────────
  renderRosStopShip();
  renderRosDecisionCards();
  renderRosIntegrated();
  renderRosCharts();
}

// PART 4: Decision Cards
export function renderRosDecisionCards() {
  const el = document.getElementById('ros-decision-cards');
  if (!el) return;
  const actionSkus = DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH' || s.risk_level === 'MEDIUM')
    .sort((a, b) => b.risk_usd_bear - a.risk_usd_bear);
  if (!actionSkus.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  const wksToDollar = (wks) => wks <= 3 ? '\u{1F525} URGENT \u2014 decision needed NOW' : wks <= 6 ? '\u23F0 Monitor closely \u2014 promo must launch this week' : '\u{1F4C5} On watch \u2014 review at weekly S&OP';

  let h = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">`;
  actionSkus.forEach(s => {
    const wksLeft = s.stop_ship_wk - 1;
    const rlCol = s.risk_level === 'HIGH' ? 'rgba(239,68,68,.12)' : 'rgba(255,199,17,.08)';
    const rlBorder = s.risk_level === 'HIGH' ? 'rgba(239,68,68,.35)' : 'rgba(255,199,17,.3)';
    const rlTextCol = s.risk_level === 'HIGH' ? '#ef4444' : '#fbbf24';
    const acc = getAcc(s.dpci);
    const mapeNote = acc && s.confidence_flag !== 'normal' ?
      `<div style="font-size:10px;color:var(--yw);margin-bottom:6px">\u26A0\uFE0F Low-confidence forecast (${acc.mape_l4w.toFixed(0)}% MAPE) \u2014 actual exposure range is wider</div>` : '';
    h += `<div style="background:${rlCol};border:1px solid ${rlBorder};border-radius:10px;padding:14px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:800;font-size:12px;color:var(--tx);line-height:1.3">${s.name}</div>
        ${riskChipOS(s.risk_level)}
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-bottom:8px;line-height:1.4">
        <b style="color:var(--tx)">Why:</b> ${s.reason}
      </div>
      ${mapeNote}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;text-align:center">
        <div style="background:var(--s2);border-radius:6px;padding:6px 4px">
          <div style="font-size:10px;color:var(--tx3)">Bear $Risk</div>
          <div style="font-weight:800;color:${rlTextCol};font-size:14px">$${Math.round(s.risk_usd_bear / 1000)}K</div>
        </div>
        <div style="background:var(--s2);border-radius:6px;padding:6px 4px">
          <div style="font-size:10px;color:var(--tx3)">Worst-Case ST</div>
          <div style="font-weight:800;color:${s.st_pct_bear < 0.65 ? 'var(--rd)' : 'var(--yw)'};font-size:14px">${Math.round(s.st_pct_bear * 100)}%</div>
        </div>
        <div style="background:var(--s2);border-radius:6px;padding:6px 4px">
          <div style="font-size:10px;color:var(--tx3)">Wks Remaining</div>
          <div style="font-weight:800;color:${wksLeft <= 3 ? 'var(--rd)' : wksLeft <= 6 ? 'var(--yw)' : 'var(--tx2)'};font-size:14px">${wksLeft}</div>
        </div>
      </div>
      <div style="font-size:11px;background:var(--s3);border-radius:6px;padding:8px 10px;line-height:1.5">
        <div style="font-weight:700;color:${rlTextCol};margin-bottom:3px">\u26A1 Recommended Action</div>
        <div style="color:var(--tx2)">${s.action}</div>
      </div>
      <div style="font-size:10px;color:var(--tx3);margin-top:7px">${wksToDollar(wksLeft)}</div>
    </div>`;
  });
  h += '</div>';
  el.innerHTML = h;
}

export function renderRosStopShip() {
  const el = document.getElementById('ros-stopship-table');
  if (!el) return;
  let skus = [...DATA_STOPSHIP.skus];
  if (_rosFilter === 'high') skus = skus.filter(s => s.risk_level === 'HIGH');
  if (_rosFilter === 'medium') skus = skus.filter(s => s.risk_level === 'MEDIUM');
  if (!skus.length) { el.innerHTML = '<div style="color:var(--tx3);padding:20px;text-align:center;font-size:12px">No SKUs match filter</div>'; return; }

  const rlOrd = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  skus.sort((a, b) => {
    if (rlOrd[a.risk_level] !== rlOrd[b.risk_level]) return rlOrd[a.risk_level] - rlOrd[b.risk_level];
    return b.risk_usd_bear - a.risk_usd_bear;
  });

  const TODAY_WK = 1;
  let h = '<table class="dt"><thead><tr>';
  h += '<th style="min-width:200px">SKU \u2014 Stop-Ship Reason</th>';
  h += '<th class="tr">Urgency</th>';
  h += '<th class="tr">DC Available</th>';
  h += '<th class="tr" title="Worst-case (bear): base forecast \u00D7 0.80">Worst-Case ST%</th>';
  h += '<th class="tr" title="Base forecast sell-through">Base ST%</th>';
  h += '<th class="tr">Bear Leftover</th>';
  h += '<th class="tr" style="color:var(--rd)" title="Bear leftover units \u00D7 unit price">$ At Risk</th>';
  h += '<th>Fcast Trust</th>';
  h += '<th>Risk</th>';
  h += '<th style="min-width:220px">\u26A1 Action Required</th>';
  h += '</tr></thead><tbody>';

  skus.forEach(s => {
    const wksLeft = s.stop_ship_wk - TODAY_WK;
    const urgencyCol = wksLeft <= 3 ? 'var(--rd)' : wksLeft <= 6 ? 'var(--yw)' : 'var(--tx2)';
    const urgencyIcon = wksLeft <= 3 ? '\u{1F525}' : wksLeft <= 6 ? '\u23F0' : '\u{1F4C5}';
    const urgencyLabel = wksLeft <= 0 ? 'PAST DUE' : wksLeft === 1 ? '1 WK LEFT' : `${wksLeft} wks`;
    const acc = getAcc(s.dpci);
    const rowBg = s.risk_level === 'HIGH' ? 'background:rgba(239,68,68,.05);border-left:3px solid rgba(239,68,68,.5)' :
                  s.risk_level === 'MEDIUM' ? 'background:rgba(255,199,17,.04);border-left:3px solid rgba(255,199,17,.4)' :
                  'border-left:3px solid transparent';
    const confNote = s.confidence_flag && s.confidence_flag !== 'normal' ?
      `<div style="font-size:9px;color:var(--yw);margin-top:2px">\u26A0\uFE0F ${acc ? acc.mape_l4w.toFixed(0) : '?'}% MAPE \u2014 bear range wider than modeled</div>` : '';

    h += `<tr style="${rowBg}">
      <td>
        <div style="font-weight:700;font-size:12px;margin-bottom:2px">${s.name.substring(0, 36)}</div>
        <div style="font-size:10px;color:var(--tx3);line-height:1.4">${s.reason}</div>
        ${confNote}
      </td>
      <td class="tr">
        <div style="font-weight:800;color:${urgencyCol};font-size:13px">${urgencyIcon} ${urgencyLabel}</div>
        <div style="font-size:10px;color:var(--tx3)">Stop ${s.stop_ship_date}</div>
      </td>
      <td class="tr">
        <div style="font-weight:600">${s.total_available.toLocaleString()} units</div>
        <div style="font-size:10px;color:var(--tx3)">${s.dc_on_hand.toLocaleString()} OH${s.dc_inbound > 0 ? ' + ' + s.dc_inbound.toLocaleString() + ' IB' : ''}</div>
      </td>
      <td class="tr">${stBar(s.st_pct_bear, s.risk_level)}</td>
      <td class="tr" style="color:var(--ac);font-weight:700">${Math.round(s.st_pct_base * 100)}%</td>
      <td class="tr">
        <div style="font-weight:700;color:${s.leftover_bear > 10000 ? 'var(--rd)' : s.leftover_bear > 3000 ? 'var(--yw)' : 'var(--gr)'}">${s.leftover_bear.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--tx3)">units at risk</div>
      </td>
      <td class="tr">
        <div style="font-weight:900;font-size:14px;color:${s.risk_usd_bear > 100000 ? 'var(--rd)' : s.risk_usd_bear > 25000 ? 'var(--yw)' : 'var(--gr)'}">$${Math.round(s.risk_usd_bear / 1000)}K</div>
        <div style="font-size:9px;color:var(--tx3)">bear case</div>
      </td>
      <td>${acc ? trustSignal(acc.trust_level, acc.trust_score) : '\u2014'}</td>
      <td>${riskChipOS(s.risk_level)}</td>
      <td>
        <div style="font-size:11px;color:var(--tx);font-weight:600;line-height:1.4">${s.action}</div>
        ${s.risk_level === 'HIGH' ? '<div style="font-size:10px;color:var(--rd);margin-top:3px;font-weight:700">\u26A1 IMMEDIATE ACTION</div>' : s.risk_level === 'MEDIUM' ? '<div style="font-size:10px;color:var(--yw);margin-top:3px">Monitor weekly</div>' : ''}
      </td>
    </tr>`;
  });
  h += '</tbody></table>';

  // Footer: totals + assumption disclosure
  const totBear = skus.reduce((a, s) => a + s.risk_usd_bear, 0);
  const totUnits = skus.reduce((a, s) => a + s.leftover_bear, 0);
  const totBase = skus.reduce((a, s) => a + s.risk_usd_base, 0);
  h += `<div style="display:flex;gap:16px;padding:10px 12px;background:var(--s2);border-top:1px solid var(--bd);font-size:12px;flex-wrap:wrap;align-items:center">
    <span><b style="color:var(--tx)">Showing ${skus.length} SKUs</b></span>
    <span>\u2502</span>
    <span><b style="color:var(--rd)">Bear exposure: $${Math.round(totBear / 1000)}K</b> (${totUnits.toLocaleString()} units)</span>
    <span><b style="color:var(--ac)">Base exposure: $${Math.round(totBase / 1000)}K</b></span>
    <span style="margin-left:auto;color:var(--tx3);font-size:10.5px">\u2699\uFE0F Bear = base fcast \u00D7 0.80 \u00B7 Bull = \u00D7 1.20 \u00B7 Modeled assumption; actual varies by SKU MAPE</span>
  </div>`;
  el.innerHTML = h;
}

export function renderRosIntegrated() {
  const el = document.getElementById('ros-integrated-table');
  if (!el) return;
  const DATA_AVF = _getAVF();
  const catF = document.getElementById('ros-cat-filter');
  const trustF = document.getElementById('ros-trust-filter');
  const catV = catF ? catF.value : '';
  const trustV = trustF ? trustF.value : '';

  const avfMap = {};
  DATA_AVF.forEach(s => { avfMap[s.dpci] = s; });

  let skus = DATA_DP.skus.filter(s => {
    const acc = getAcc(s.dpci);
    if (catV && s.category !== catV) return false;
    if (trustV && (!acc || acc.trust_level !== trustV)) return false;
    return true;
  });

  if (!skus.length) { el.innerHTML = '<div style="color:var(--tx3);padding:20px;text-align:center">No SKUs match filter</div>'; return; }

  const rlOrdI = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  skus.sort((a, b) => {
    const ssA = getSS(a.dpci); const ssB = getSS(b.dpci);
    const rlA = ssA ? ssA.risk_level : 'LOW'; const rlB = ssB ? ssB.risk_level : 'LOW';
    if (rlOrdI[rlA] !== rlOrdI[rlB]) return rlOrdI[rlA] - rlOrdI[rlB];
    const expA = ssA ? ssA.risk_usd_bear : 0; const expB = ssB ? ssB.risk_usd_bear : 0;
    return expB - expA;
  });

  // escH helper (HTML escape)
  function escH(s) { return (s || '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m] || m)); }

  let h = '<table class="dt"><thead><tr>';
  h += '<th>SKU</th><th>Category</th>';
  h += '<th class="tr" title="Week 1 forecast \u2014 conservatively calibrated (bias-corrected + conservative tilt applied). See Model Learning for methodology.">Wk1 Fcast \u{1F9EE}</th>';
  h += '<th class="tr" style="color:var(--rd)" title="Bear scenario: calibrated base \u00D7 (1 \u2212 1.10\u00D7MAPE) \u2014 realistic downside">\u2193 Bear</th>';
  h += '<th class="tr" style="color:var(--gr)" title="Bull scenario: calibrated base \u00D7 (1 + 0.90\u00D7MAPE) \u2014 conservative upside">\u2191 Bull</th>';
  h += '<th class="tr">LW Actual</th>';
  h += '<th class="tr" title="Last week actual vs last week forecast">LW vs Fcast</th>';
  h += '<th class="tr" title="Mean Absolute Pct Error \u2014 L4W">MAPE L4W</th>';
  h += '<th title="Forecast trust level based on accuracy history">Fcast Trust</th>';
  h += '<th>Stop Ship</th>';
  h += '<th>Risk</th>';
  h += '</tr></thead><tbody>';

  skus.forEach(s => {
    const acc = getAcc(s.dpci);
    const avf = avfMap[s.dpci] || {};
    const ss = getSS(s.dpci);
    const bands = getFcastBands(s.dpci, 0);
    const lwActual = sf(avf.lw_units, 0);
    const lwFcast = sf(avf.fcast_units, 0);
    const vsPct = lwFcast > 0 ? (lwActual - lwFcast) / lwFcast : 0;
    const vsCol = vsPct >= 0.05 ? 'var(--gr)' : vsPct <= -0.15 ? 'var(--rd)' : 'var(--yw)';

    const isNewSKU = acc && (acc.data_quality === 'analog_smoothies_1ct' || acc.data_quality === 'analog_new_format' || acc.data_quality === 'analog_baby_puffs_curve');
    const isPreLaunch = s.fcast[0] === 0 || (isNewSKU && lwActual === 0 && lwFcast === 0);

    let pacingRisk = '';
    if (isPreLaunch) {
      pacingRisk = '<div style="font-size:9px;color:var(--cy);font-style:italic">Pre-launch \u2014 analog forecast</div>';
    } else if (vsPct <= -0.20) {
      pacingRisk = `<div style="color:var(--rd);font-size:10px;font-weight:600">\u2B07 Pacing \u2212${Math.round(Math.abs(vsPct) * 100)}% below</div>`;
    } else if (vsPct >= 0.10) {
      pacingRisk = `<div style="color:var(--gr);font-size:10px;font-weight:600">\u2B06 Beating by +${Math.round(vsPct * 100)}%</div>`;
    }

    const ssInfo = ss ? `<div style="font-weight:700;color:${ss.stop_ship_wk <= 6 ? 'var(--rd)' : ss.stop_ship_wk <= 10 ? 'var(--yw)' : 'var(--tx2)'};font-size:11px">Wk${ss.stop_ship_wk} \u00B7 ${ss.stop_ship_date}</div><div style="font-size:9px;color:var(--tx3)">${riskChipOS(ss.risk_level)}</div>` : '<span style="color:var(--tx3);font-size:11px">None</span>';

    const rl = ss ? ss.risk_level : (vsPct <= -0.20 ? 'HIGH' : vsPct <= -0.10 ? 'MEDIUM' : 'LOW');
    const rowBg = rl === 'HIGH' ? 'background:rgba(239,68,68,.04)' : rl === 'MEDIUM' ? 'background:rgba(255,199,17,.03)' : '';

    const analogLabel = isNewSKU ? '<div style="font-size:9px;color:var(--tx3);font-style:italic">Analog estimate</div>' : '';

    const adjNote = bands.adj && bands.adj.total_adj_pct < -2
      ? `<div style="font-size:8.5px;color:var(--tx3)" title="${escH(bands.adj.reason)}">cal. ${bands.adj.total_adj_pct.toFixed(1)}%</div>`
      : '';
    h += `<tr style="${rowBg}">
      <td style="font-size:12px;font-weight:600;max-width:180px">${s.name.substring(0, 35)}${pacingRisk}</td>
      <td><span class="ch cy2" style="font-size:10px">${s.category}</span></td>
      <td class="tr" style="font-weight:700">${isPreLaunch ? '<span style="color:var(--cy);font-size:10px">Pre-launch</span>' : fmt(bands.base)}${analogLabel}${adjNote}</td>
      <td class="tr" style="color:var(--rd);font-size:11px">${isPreLaunch ? '\u2014' : fmt(bands.low)}</td>
      <td class="tr" style="color:var(--gr);font-size:11px">${isPreLaunch ? '\u2014' : fmt(bands.high)}</td>
      <td class="tr" style="font-weight:600">${isPreLaunch ? '<span style="color:var(--tx3);font-size:10px">Not launched</span>' : (lwActual > 0 ? fmt(lwActual) : '\u2014')}</td>
      <td class="tr" style="color:${vsCol};font-weight:700">${(isPreLaunch || lwFcast === 0) ? '\u2014' : fmtP(vsPct)}</td>
      <td class="tr" style="color:${acc && acc.mape_l4w < 15 ? 'var(--gr)' : acc && acc.mape_l4w < 25 ? 'var(--yw)' : 'var(--rd)'};font-weight:600">${acc ? acc.mape_l4w.toFixed(1) + '%' : '\u2014'}${isNewSKU ? '<span style="font-size:8px;color:var(--tx3);display:block">est.</span>' : ''}</td>
      <td>${acc ? trustSignal(acc.trust_level, acc.trust_score) : '\u2014'}</td>
      <td>${ssInfo}</td>
      <td>${riskChipOS(rl)}</td>
    </tr>`;
  });
  h += '</tbody></table>';
  // Cross-system footnote
  const totalFcastCal = skus.reduce((a, s) => { const b = getFcastBands(s.dpci, 0); return a + b.base; }, 0);
  const totalFcastRaw = skus.reduce((a, s) => { const b = getFcastBands(s.dpci, 0); return a + (b.raw || b.base); }, 0);
  const netCalPct = totalFcastRaw > 0 ? ((totalFcastCal - totalFcastRaw) / totalFcastRaw * 100).toFixed(1) : 0;
  h += `<div style="padding:8px 12px;background:var(--s2);border-top:1px solid var(--bd);font-size:10.5px;color:var(--tx3);display:flex;flex-wrap:wrap;gap:12px;align-items:center">
    <span>Wk1 forecast (${skus.length} SKUs): <b style="color:var(--tx)">${fmt(totalFcastCal)} units</b> <span style="color:var(--tx3)">(raw: ${fmt(totalFcastRaw)} \u00B7 conservatively calibrated ${netCalPct}%)</span></span>
    <span>\u00B7 Confidence bands use per-SKU MAPE L4W \u00B7 Pre-launch SKUs: analog estimate</span>
    <span style="color:var(--ac)" title="Conservative calibration applies bias correction + tilt. See Model Learning tab for details.">\u{1F9EE} Conservative calibration active \u2014 see Model Learning for methodology</span>
  </div>`;
  el.innerHTML = h;
}

export function renderRosCharts() {
  // MAPE by category bar chart
  const catMape = DATA_ACCURACY.cat_mape;
  const cats = Object.keys(catMape);
  const mapeVals = cats.map(c => catMape[c]);
  const mapeColors = mapeVals.map(v => v < 12 ? 'rgba(0,207,146,0.7)' : v < 22 ? 'rgba(255,199,17,0.7)' : 'rgba(239,68,68,0.7)');
  if (document.getElementById('ch-ros-mape')) {
    new Chart(document.getElementById('ch-ros-mape'), {
      type: 'bar',
      data: { labels: cats, datasets: [{
        label: 'MAPE L4W (%)', data: mapeVals,
        backgroundColor: mapeColors, borderRadius: 4, borderSkipped: false
      }] },
      options: { responsive: true, plugins: { legend: { display: false },
        annotation: { annotations: { line1: { type: 'line', yMin: 15, yMax: 15, borderColor: 'rgba(255,199,17,0.6)', borderWidth: 1, borderDash: [4, 3], label: { content: '15% threshold', display: true, position: 'end', font: { size: 9 } } } } } },
        scales: { x: { ticks: { color: '#44608a', font: { size: 10 } } },
          y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => v + '%' }, beginAtZero: true } } }
    });
  }

  // Exposure scenario chart
  const ssSkus = DATA_STOPSHIP.skus.filter(s => s.risk_level !== 'LOW');
  const ssNames = ssSkus.map(s => s.name.substring(0, 18) + '\u2026');
  if (document.getElementById('ch-ros-exposure')) {
    new Chart(document.getElementById('ch-ros-exposure'), {
      type: 'bar',
      data: { labels: ssNames, datasets: [
        { label: 'Bull ($)', data: ssSkus.map(s => s.risk_usd_bull), backgroundColor: 'rgba(0,207,146,0.5)', borderRadius: 3 },
        { label: 'Base ($)', data: ssSkus.map(s => s.risk_usd_base), backgroundColor: 'rgba(0,227,205,0.6)', borderRadius: 3 },
        { label: 'Bear ($)', data: ssSkus.map(s => s.risk_usd_bear), backgroundColor: 'rgba(239,68,68,0.65)', borderRadius: 3 }
      ] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#7b97c8', font: { size: 10 } } } },
        scales: { x: { ticks: { color: '#44608a', font: { size: 10 } } },
          y: { ticks: { color: '#44608a', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'K' }, beginAtZero: true } } }
    });
  }
}
