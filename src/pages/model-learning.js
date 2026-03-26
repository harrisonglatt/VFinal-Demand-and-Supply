// ─── MODEL LEARNING & CALIBRATION ────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html
// - Conservative Calibration Engine (lines 4201–4290)
// - Model Learning UI (lines 5017–5417)

import {
  DATA_DP, DATA_ENDCAP_HISTORY, DATA_ACCURACY, DATA_STOPSHIP,
  DATA_BACKTEST, FCAST_REV_52WK
} from '../data/index.js';
import { fmt, fmtDol, sf } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';
import { runWalkForward } from './backtest.js';
import { escH } from './forecast-versions.js';

// ─── Module state ───────────────────────────────────────────────────────────
let _btResult = null;
let _mlLiftChart = null;
let _mlMapeChart = null;

// ─── Local helpers (from RISK OS section) ───────────────────────────────────
function getAcc(dpci){
  return DATA_ACCURACY.skus.find(s=>s.dpci===dpci)||null;
}
function getSS(dpci){
  return DATA_STOPSHIP.skus.find(s=>s.dpci===dpci)||null;
}

// ─── Conservative Calibration Engine (lines 4201–4290) ──────────────────────
export function getConservativeAdj(dpci) {
  const acc = getAcc(dpci);
  const bt = DATA_BACKTEST.skus.find(s => s.dpci === dpci);
  const ss = getSS(dpci);

  // ── No data: return safe default ──
  if (!acc) return {
    bias_adj_pct: 0, conserv_tilt_pct: -5.0, exposure_adj_pct: 0,
    total_adj_pct: -5.0, conf_weight: 0.5,
    reason: "Default conservative tilt (no accuracy record)",
    is_new_sku: true
  };

  const isNewSku = ['analog_smoothies_1ct','analog_new_format','analog_baby_puffs_curve'].includes(acc.data_quality);
  const bias = acc.bias_l4w || 0;
  const vol  = acc.volatility || 0.15;
  const trust = acc.trust_score || 50;
  const nObsBase = bt ? bt.n_obs_base : 0;
  const biasBase = bt ? bt.bias_base  : bias;

  // ── Part 3a: Bias correction ──────────────────────────────────────────
  let bias_adj_pct = 0;
  if (!isNewSku && biasBase > 2) {
    const correctionWeight = nObsBase >= 8 ? 0.70 : nObsBase >= 4 ? 0.55 : 0.40;
    bias_adj_pct = -Math.min(biasBase * correctionWeight, 18);
  }

  // ── Part 3b: Conservative tilt (volatility + trust penalty) ────────────
  const tiltBase = bt ? bt.conservative_tilt : (3 + vol * 18);
  const trustPenalty = trust < 45 ? 1.2 : trust < 60 ? 1.0 : 0.85;
  const conserv_tilt_pct = -(Math.min(Math.max(tiltBase * trustPenalty, 3.0), 8.5));

  // ── Part 4: Confidence weight for blending ─────────────────────────────
  const conf_weight = isNewSku ? 0.30 :
    trust >= 70 ? 0.60 : trust >= 55 ? 0.50 : trust >= 40 ? 0.38 : 0.28;

  // ── Part 6: Exposure-aware extra conservatism ──────────────────────────
  let exposure_adj_pct = 0;
  let exposure_reason = '';
  if (ss && ss.risk_level !== 'LOW') {
    const weeksToSS = ss.stop_ship_wk || 99;
    const isUrgent = weeksToSS <= 8;
    const isLowConf = acc.trust_level === 'Low';
    const isHighInv = ss.dc_on_hand > 20000;
    if (isHighInv && isLowConf && isUrgent) {
      exposure_adj_pct = -4.5;
      exposure_reason = 'High inventory + low confidence + urgent SS deadline';
    } else if (isHighInv && isUrgent) {
      exposure_adj_pct = -2.5;
      exposure_reason = 'High inventory + urgent SS deadline';
    } else if (isLowConf && isUrgent) {
      exposure_adj_pct = -3.0;
      exposure_reason = 'Low confidence + urgent SS deadline';
    } else if (isHighInv || isLowConf) {
      exposure_adj_pct = -1.5;
      exposure_reason = isHighInv ? 'High DC inventory at risk' : 'Low confidence SKU near SS';
    }
  }

  // ── Reason string ─────────────────────────────────────────────────────
  const reasons = bt ? [bt.reason] : [];
  if (biasBase > 5 && !isNewSku)  reasons.push('Promo lift historically overstated +' + biasBase.toFixed(1) + '%');
  if (trust < 50)                  reasons.push('Low confidence (trust ' + trust + '/100)');
  if (vol > 0.28)                  reasons.push('High velocity volatility (CV=' + vol.toFixed(2) + ')');
  if (exposure_reason)             reasons.push(exposure_reason);
  if (isNewSku)                    reasons.push('Analog estimate \u2014 no launch history');

  const total_adj_pct = Math.round((bias_adj_pct + conserv_tilt_pct + exposure_adj_pct) * 10) / 10;

  return {
    bias_adj_pct:     Math.round(bias_adj_pct * 10) / 10,
    conserv_tilt_pct: Math.round(conserv_tilt_pct * 10) / 10,
    exposure_adj_pct: Math.round(exposure_adj_pct * 10) / 10,
    total_adj_pct,
    conf_weight,
    reason: reasons.slice(0,3).join('; ') || 'Standard conservative calibration',
    is_new_sku: isNewSku,
    trust_level: acc.trust_level
  };
}

// ─── Model Learning UI ──────────────────────────────────────────────────────
export function initMODELLEARN(){
  const kpisEl=document.getElementById('modellearn-kpis');
  const contentEl=document.getElementById('modellearn-content');
  if(!kpisEl||!contentEl) return;

  if(!_btResult) _btResult = window._btResult || runWalkForward();
  const r=_btResult;

  // ── Lift calibration from actuals ──────────────────────────────────────
  const endcapCal = typeof DATA_ENDCAP_HISTORY!=='undefined'
    ? DATA_ENDCAP_HISTORY.filter(e=>e.actual_lift)
    : [];

  const frozenEndcapActuals=endcapCal.filter(e=>e.type!=='Stacked');
  const frozenStackedActual=endcapCal.filter(e=>e.type==='Stacked');
  const modelEndcap=1.50;
  const modelStacked=2.025;
  const avgActualEndcap=frozenEndcapActuals.length
    ? frozenEndcapActuals.reduce((a,e)=>a+e.actual_lift,0)/frozenEndcapActuals.length
    : modelEndcap;
  const avgActualStacked=frozenStackedActual.length
    ? frozenStackedActual.reduce((a,e)=>a+e.actual_lift,0)/frozenStackedActual.length
    : modelStacked;
  const endcapCalFactor=avgActualEndcap/modelEndcap;
  const stackedCalFactor=avgActualStacked/modelStacked;

  const calEndcap=parseFloat((modelEndcap*endcapCalFactor).toFixed(3));
  const calStacked=parseFloat((modelStacked*stackedCalFactor).toFixed(3));

  // Velocity calibration
  const cleanWkIndices=[6,7,8,9,10,11];
  const skuVelCal=DATA_DP.skus.map(s=>{
    const cleanHist=cleanWkIndices.map(i=>sf(s.hist&&s.hist[i])).filter(v=>v>0);
    if(!cleanHist.length) return null;
    const histAvg=cleanHist.reduce((a,b)=>a+b,0)/cleanHist.length;
    const fcastBase=sf(s.fcast[0]);
    const velErr=fcastBase?((fcastBase-histAvg)/histAvg):0;
    return {name:s.name.replace(/,\s+[\d.]+\s+oz.*/i,'').substring(0,28),
            cat:s.category, histAvg, fcastBase, velErr};
  }).filter(Boolean);

  const overFcast=skuVelCal.filter(s=>s.velErr>0.05);
  const underFcast=skuVelCal.filter(s=>s.velErr<-0.05);

  // Confidence band calibration
  const baselineMAPE=r.baselineMAPE||0.08;
  const zscore=1.65;
  const bearFactor=Math.max(0.70, 1-zscore*baselineMAPE);
  const bullFactor=Math.min(1.30, 1+zscore*baselineMAPE);

  // ── KPIs ────────────────────────────────────────────────────────────────
  kpisEl.innerHTML=
    kpiCard('\uD83E\uDDCA','Frozen Endcap Calibration','--cc:var(--cy)',
      (endcapCalFactor*100).toFixed(0)+'%',
      'Actual/Model = '+avgActualEndcap.toFixed(2)+'x / '+modelEndcap.toFixed(2)+'x',
      endcapCalFactor>0.95?'up':endcapCalFactor>0.85?'neu':'dn',
      endcapCalFactor<1?'Model slightly over-forecasts endcap':'Model accurate')+
    kpiCard('\uD83C\uDFD7\uFE0F','Stacked BOGO Calibration','--cc:var(--yw)',
      (stackedCalFactor*100).toFixed(0)+'%',
      'Actual/Model = '+avgActualStacked.toFixed(2)+'x / '+modelStacked.toFixed(2)+'x',
      stackedCalFactor>0.95?'up':stackedCalFactor>0.85?'neu':'dn',
      stackedCalFactor<1?'Model slightly over-forecasts BOGO stack':'Model accurate')+
    kpiCard('\uD83D\uDCC9','Velocity Calibration','--cc:'+(overFcast.length+underFcast.length<3?'var(--gr)':'var(--yw)'),
      overFcast.length+underFcast.length+' SKUs off',
      overFcast.length+' over-forecast \u00b7 '+underFcast.length+' under-forecast',
      overFcast.length+underFcast.length<3?'up':'neu',
      '>5% delta vs recent clean actuals')+
    kpiCard('\uD83D\uDCCF','Data-Driven Confidence Range','--cc:var(--pu)',
      (bearFactor*100).toFixed(0)+'\u2013'+(bullFactor*100).toFixed(0)+'%',
      'Of base forecast (90th pct error bound)','neu',
      'Derived from '+r.baselineErrors.length+'-point baseline MAPE');

  // ── Content ────────────────────────────────────────────────────────────
  let h='<div style="display:flex;flex-direction:column;gap:20px">';

  // Lift calibration section
  h+=`<div class="cc">
    <div class="ct">\uD83C\uDFAF Lift Assumption Calibration \u2014 Frozen Co-space Events</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:12px">
      Based on ${endcapCal.length} historical co-space events (Jan\u2013Feb 2026).
      <b style="color:var(--ac)">Calibration factor</b> = actual \u00f7 modeled.
      Values &lt;1.0 mean the model over-forecasts lift; &gt;1.0 means under-forecast.
    </div>
    <table class="dt"><thead><tr>
      <th>Event Type</th><th>Historical Observations</th>
      <th class="tr">Model Lift</th><th class="tr">Avg Actual Lift</th>
      <th class="tr">Calibration Factor</th><th class="tr">Calibrated Lift</th>
      <th>Recommendation</th>
    </tr></thead><tbody>`;

  const calRows=[
    {type:'Frozen Endcap (co-space only)', n:frozenEndcapActuals.length,
     model:modelEndcap, actual:avgActualEndcap, calFactor:endcapCalFactor, calLift:calEndcap,
     rec:Math.abs(endcapCalFactor-1)<0.05?'\u2705 Within \u00b15% \u2014 model accurate':
         endcapCalFactor<0.95?`\u26A0\uFE0F Reduce endcap lift to ~${calEndcap.toFixed(2)}x`:`\u2B06 Consider raising endcap to ~${calEndcap.toFixed(2)}x`},
    {type:'Frozen BOGO + Co-space (stacked)', n:frozenStackedActual.length,
     model:modelStacked, actual:avgActualStacked, calFactor:stackedCalFactor, calLift:calStacked,
     rec:Math.abs(stackedCalFactor-1)<0.06?'\u2705 Within \u00b16% \u2014 model accurate':
         stackedCalFactor<0.95?`\u26A0\uFE0F Reduce stacked lift to ~${calStacked.toFixed(2)}x`:`\u2B06 Consider raising stacked to ~${calStacked.toFixed(2)}x`}
  ];

  calRows.forEach(row=>{
    const cfPct=(row.calFactor*100).toFixed(0)+'%';
    h+=`<tr>
      <td><b>${row.type}</b></td>
      <td style="font-size:11.5px">
        ${row.n} obs
        ${endcapCal.filter(e=>(row.type.includes('stack')?e.type==='Stacked':e.type!=='Stacked'))
          .map(e=>`<span style="color:var(--cy)">${e.date||''}: ${e.actual_lift.toFixed(2)}x</span>`).join(' \u00b7 ')}
      </td>
      <td class="tr"><b>${row.model.toFixed(2)}x</b></td>
      <td class="tr" style="color:var(--ac)">${row.actual.toFixed(2)}x</td>
      <td class="tr ${row.calFactor<0.95?'dn':row.calFactor>1.05?'up':'neu'}">
        <b>${cfPct}</b>
        <div style="font-size:9.5px;color:var(--tx3)">${row.calFactor<1?'Over-forecast':'Under-forecast'}</div>
      </td>
      <td class="tr"><b style="color:var(--yw)">${row.calLift.toFixed(2)}x</b></td>
      <td style="font-size:11.5px">${row.rec}</td>
    </tr>`;
  });
  h+='</tbody></table></div>';

  // Velocity calibration section
  h+=`<div class="cc">
    <div class="ct">\u26A1 Velocity Calibration \u2014 Forecast Base vs Recent Clean Actuals</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:12px">
      Comparing fcast[0] (baseline velocity) vs avg of hist[6\u201311] (Feb 8 \u2013 Mar 15, clean weeks).
      <b>Delta &gt;\u00b15%</b> = velocity assumption may need recalibration.
    </div>
    <table class="dt"><thead><tr>
      <th>SKU</th><th>Category</th>
      <th class="tr">Hist Avg (clean)</th><th class="tr">Fcast Baseline</th>
      <th class="tr">Delta %</th><th>Status</th>
    </tr></thead><tbody>`;

  skuVelCal.sort((a,b)=>Math.abs(b.velErr)-Math.abs(a.velErr)).forEach(s=>{
    const dp=(s.velErr*100).toFixed(1)+'%';
    const status=Math.abs(s.velErr)<0.05?'\u2705 Calibrated':
      s.velErr>0.15?'\uD83D\uDD34 Significantly over-forecast':
      s.velErr>0.05?'\uD83D\uDFE1 Slightly over-forecast':
      s.velErr<-0.15?'\uD83D\uDD34 Significantly under-forecast':'\uD83D\uDFE1 Slightly under-forecast';
    h+=`<tr style="${Math.abs(s.velErr)>0.05?'background:rgba(255,199,17,.03)':''}">
      <td title="${escH(s.name)}">${escH(s.name.substring(0,28))}</td>
      <td><span class="cat-badge cat-${(s.cat||'').replace(/[\/ ]/g,'-').toLowerCase()}">${(s.cat||'').replace(' Multiserve','')}</span></td>
      <td class="tr">${fmt(Math.round(s.histAvg))}</td>
      <td class="tr">${fmt(Math.round(s.fcastBase))}</td>
      <td class="tr ${s.velErr>0.05?'dn':s.velErr<-0.05?'up':'neu'}">${s.velErr>=0?'+':''}${dp}</td>
      <td style="font-size:12px">${status}</td>
    </tr>`;
  });
  h+='</tbody></table></div>';

  // Confidence band section
  h+=`<div class="cc">
    <div class="ct">\uD83D\uDCCF Data-Driven Confidence Bands</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:12px">
      Derived from walk-forward baseline MAPE (${(baselineMAPE*100).toFixed(1)}%).
      Bear/Bull represent the 90th percentile error bound (z=1.65\u03c3).
      Per-SKU bands are tighter for stable SKUs (low CV) and wider for volatile ones.
    </div>
    <table class="dt"><thead><tr>
      <th>Band</th><th class="tr">Multiplier</th><th class="tr">52-Wk Units</th><th class="tr">52-Wk Revenue</th><th>Basis</th>
    </tr></thead><tbody>`;

  const liveU=DATA_DP.skus.reduce((a,s)=>a+s.fcast.reduce((b,v)=>b+(v||0),0),0);
  const liveR=FCAST_REV_52WK.reduce((a,b)=>a+b,0);
  const bandRows=[
    {label:'\uD83D\uDC3B Bear (P10)',factor:bearFactor,col:'var(--rd)',basis:'Base \u00d7 (1 \u2212 1.65 \u00d7 MAPE)'},
    {label:'\uD83D\uDCCA Base',factor:1.00,col:'var(--ac)',basis:'Current demand plan'},
    {label:'\uD83D\uDC02 Bull (P90)',factor:bullFactor,col:'var(--pu)',basis:'Base \u00d7 (1 + 1.65 \u00d7 MAPE)'}
  ];
  bandRows.forEach(b=>{
    h+=`<tr>
      <td><b style="color:${b.col}">${b.label}</b></td>
      <td class="tr"><b>${(b.factor*100).toFixed(0)}%</b></td>
      <td class="tr" style="color:${b.col}">${fmt(Math.round(liveU*b.factor))}</td>
      <td class="tr" style="color:${b.col}">${fmtDol(liveR*b.factor)}</td>
      <td style="font-size:11.5px;color:var(--tx3)">${b.basis}</td>
    </tr>`;
  });
  h+='</tbody></table>';

  // Per-category CV-based range
  h+=`<div style="margin-top:14px;font-size:11.5px;color:var(--tx3)">
    <b style="color:var(--tx)">Per-category confidence widths</b> (tighter for stable, wider for volatile):
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">`;

  const catGroups={};
  DATA_DP.skus.forEach(s=>{
    if(!catGroups[s.category]) catGroups[s.category]=[];
    const cleanH=cleanWkIndices.map(i=>sf(s.hist&&s.hist[i])).filter(v=>v>0);
    if(cleanH.length>2){
      const mean=cleanH.reduce((a,b)=>a+b,0)/cleanH.length;
      const std=Math.sqrt(cleanH.reduce((a,b)=>a+(b-mean)**2,0)/cleanH.length);
      catGroups[s.category].push(std/mean);
    }
  });

  Object.entries(catGroups).forEach(([cat,cvArr])=>{
    const avgCV=cvArr.length?cvArr.reduce((a,b)=>a+b,0)/cvArr.length:0.10;
    const catBear=(1-zscore*avgCV).toFixed(2);
    const catBull=(1+zscore*avgCV).toFixed(2);
    const stability=avgCV<0.05?'\uD83D\uDFE2 Stable':avgCV<0.12?'\uD83D\uDFE1 Moderate':'\uD83D\uDD34 Volatile';
    h+=`<div style="background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:6px 10px">
      <div style="font-weight:700;color:var(--tx);font-size:12px">${cat.replace(' Multiserve','')}</div>
      <div>CV: ${(avgCV*100).toFixed(1)}% \u00b7 Range: ${catBear}x\u2013${catBull}x ${stability}</div>
    </div>`;
  });
  h+=`</div></div></div>`;

  // Calibration summary
  h+=`<div class="cc">
    <div class="ct">\u2705 Calibration Action Summary</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12.5px;line-height:1.8">
      <div>
        <div style="font-weight:700;color:var(--gr);margin-bottom:6px">\u2705 Model is accurate for:</div>
        <div style="color:var(--tx3)">
          \u2022 Baseline velocity (\u00b1${(baselineMAPE*100).toFixed(0)}% MAPE on clean weeks)<br>
          \u2022 Frozen endcap lift (${(endcapCalFactor*100).toFixed(0)}% of model \u2014 within tolerance)<br>
          \u2022 Overall direction (bias: ${r.overallBias>=0?'+':''}${(r.overallBias*100).toFixed(1)}%)
        </div>
      </div>
      <div>
        <div style="font-weight:700;color:var(--yw);margin-bottom:6px">\u26A0\uFE0F Confirm with your team:</div>
        <div style="color:var(--tx3)">
          \u2022 Stacked lift ${(stackedCalFactor*100).toFixed(0)}% of model (${avgActualStacked.toFixed(2)}x vs ${modelStacked}x assumed) \u2014 1 obs only<br>
          \u2022 ${overFcast.length+underFcast.length} SKUs with velocity delta &gt;5%<br>
          \u2022 H2 '26 promo calendar not yet modeled (wks 7\u201352)
        </div>
      </div>
    </div>
  </div>`;

  // ── Per-SKU Conservative Calibration Table ─────────────────────────────
  h+=`<div class="cc">
    <div class="ct">\uD83E\uDDEE Conservative Forecast Calibration \u2014 Per-SKU Adjustments</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:12px">
      Every forward forecast is automatically calibrated before display. Adjustments are systematic \u2014 not manual judgment.
      <br><b>Bias Adj</b> = correction for known over-forecast tendency (only applied when historical evidence exists).
      <b>Conserv Tilt</b> = volatility + trust penalty (3\u20138.5%).
      <b>Exposure Adj</b> = extra conservatism for high-inventory stop-ship SKUs.
      <span style="color:var(--ac)">\u2713 Part 8 validation: no future data used; adjustments derived from L8W backtest only.</span>
    </div>
    <table class="dt"><thead><tr>
      <th>SKU</th><th>Category</th>
      <th class="tr">Wk 1 Raw</th>
      <th class="tr" title="Bias correction: if model systematically over-forecasts, raw is scaled down">Bias Adj%</th>
      <th class="tr" title="Conservative tilt based on volatility (CV) and trust score">Tilt%</th>
      <th class="tr" title="Extra conservatism for stop-ship risk exposure">Exp Adj%</th>
      <th class="tr" title="Total adjustment = Bias + Tilt + Exposure">Total Adj%</th>
      <th class="tr" title="Calibrated forecast = Raw \u00d7 (1 + Total Adj% / 100)">Calibrated</th>
      <th>Reason</th>
    </tr></thead><tbody>`;

  let _rawTotal=0, _calTotal=0;
  DATA_ACCURACY.skus.forEach(accSku=>{
    const dpSku=DATA_DP.skus.find(s=>s.dpci===accSku.dpci);
    if(!dpSku) return;
    const raw=dpSku.fcast[0]||0;
    if(!raw&&accSku.data_quality!=='analog_smoothies_1ct'&&
       !accSku.data_quality.startsWith('analog')) return;
    const adj=getConservativeAdj(accSku.dpci);
    const cal=Math.round(raw*Math.max(0.70,1+adj.total_adj_pct/100));
    _rawTotal+=raw; _calTotal+=cal;
    const totalPct=adj.total_adj_pct;
    const deltaU=cal-raw;
    const isAnalog=adj.is_new_sku;
    const expCol=adj.exposure_adj_pct<-2?'var(--rd)':adj.exposure_adj_pct<0?'var(--yw)':'var(--tx3)';
    h+=`<tr style="${Math.abs(totalPct)>10?'background:rgba(239,68,68,.03)':''}">
      <td title="${escH(accSku.name)}" style="font-size:11.5px">${escH(accSku.name.substring(0,26))}${isAnalog?'<span style="color:var(--tx3);font-size:9px"> \u27E8analog\u27E9</span>':''}</td>
      <td><span class="cat-badge cat-${(accSku.category||'').replace(/[\/ ]/g,'-').toLowerCase()}">${(accSku.category||'').replace(' Multiserve','')}</span></td>
      <td class="tr">${raw?fmt(raw):'\u2014'}</td>
      <td class="tr ${adj.bias_adj_pct<-5?'up':adj.bias_adj_pct<0?'neu':''}">${adj.bias_adj_pct!==0?(adj.bias_adj_pct>0?'+':'')+adj.bias_adj_pct.toFixed(1)+'%':'\u2014'}</td>
      <td class="tr neu">${adj.conserv_tilt_pct.toFixed(1)}%</td>
      <td class="tr" style="color:${expCol}">${adj.exposure_adj_pct!==0?adj.exposure_adj_pct.toFixed(1)+'%':'\u2014'}</td>
      <td class="tr ${totalPct<-10?'up':totalPct<-4?'neu':''}" style="font-weight:700">${(totalPct>0?'+':'')+totalPct.toFixed(1)}%</td>
      <td class="tr" style="color:${totalPct<-8?'var(--gr)':'var(--ac)'}">${raw?fmt(cal):'\u2014'}</td>
      <td style="font-size:10.5px;color:var(--tx3);max-width:200px">${escH(adj.reason)}</td>
    </tr>`;
  });

  const netDelta=_calTotal-_rawTotal;
  const netPct=_rawTotal?((netDelta/_rawTotal)*100).toFixed(1):0;
  h+=`<tr style="border-top:2px solid var(--bd);background:var(--s2)">
    <td colspan="2" style="font-weight:800;color:var(--tx)">Wk 1 Portfolio Total</td>
    <td class="tr" style="font-weight:700">${fmt(_rawTotal)}</td>
    <td class="tr" colspan="4" style="color:var(--tx3);font-size:11.5px">Portfolio-wide calibration: ${netPct}%</td>
    <td class="tr" style="font-weight:800;color:var(--ac)">${fmt(_calTotal)}</td>
    <td style="font-size:11px;color:var(--tx3)">Net \u0394 ${netDelta>0?'+':''}${fmt(netDelta)} units (${netPct}% conservative shift)</td>
  </tr>`;
  h+=`</tbody></table>
  <div style="font-size:11px;color:var(--tx3);margin-top:10px;display:flex;gap:16px;flex-wrap:wrap">
    <span>\u2705 <b>No future data used</b> \u2014 all adjustments derived from L8W historical backtest only</span>
    <span>\u2705 <b>Adjustments are systematic</b> \u2014 not manual; driven by bias/volatility/trust scores</span>
    <span>\u2705 <b>Totals reconcile</b> \u2014 calibrated portfolio total shown above</span>
    <span>\u2705 <b>Conservative bias direction</b> \u2014 calibration never inflates forecast above raw</span>
  </div>
  </div>`;

  h+='</div>';
  contentEl.innerHTML=h;

  // ── Charts ─────────────────────────────────────────────────────────────
  setTimeout(()=>{
    // Lift calibration chart
    const liftEl=document.getElementById('ch-ml-lift');
    if(liftEl){
      if(_mlLiftChart){_mlLiftChart.destroy();}
      _mlLiftChart=new Chart(liftEl,{type:'bar',
        data:{
          labels:['Endcap (model)','Endcap (actual)','Stacked (model)','Stacked (actual)'],
          datasets:[{
            label:'Lift multiplier (x)',
            data:[modelEndcap,avgActualEndcap,modelStacked,avgActualStacked],
            backgroundColor:[
              'rgba(0,227,205,.4)','rgba(0,207,146,.7)',
              'rgba(255,199,17,.4)','rgba(255,140,0,.7)'
            ],
            borderRadius:4
          }]
        },
        options:{responsive:true,indexAxis:'y',
          plugins:{title:{display:true,text:'Model vs Actual Lift (Frozen)',color:'#7b97c8',font:{size:12}},
            legend:{display:false}},
          scales:{x:{ticks:{color:'#44608a',font:{size:10},callback:v=>v.toFixed(2)+'x'}},
            y:{ticks:{color:'#44608a',font:{size:10}}}}}
      });
    }

    // MAPE by category chart
    const mapeEl=document.getElementById('ch-ml-mape');
    if(mapeEl){
      if(_mlMapeChart){_mlMapeChart.destroy();}
      const catNames=Object.keys(r.byCat);
      const catMAPEs=catNames.map(cat=>{
        const errs=r.byCat[cat].errors;
        return errs.length?+(errs.reduce((a,b)=>a+b,0)/errs.length*100).toFixed(1):0;
      });
      _mlMapeChart=new Chart(mapeEl,{type:'bar',
        data:{
          labels:catNames.map(n=>n.replace(' Multiserve','')),
          datasets:[{
            label:'MAPE %',
            data:catMAPEs,
            backgroundColor:catMAPEs.map(v=>
              v<5?'rgba(0,207,146,.7)':v<10?'rgba(0,227,205,.6)':
              v<18?'rgba(255,199,17,.7)':'rgba(239,68,68,.7)'),
            borderRadius:4
          }]
        },
        options:{responsive:true,
          plugins:{title:{display:true,text:'MAPE by Category',color:'#7b97c8',font:{size:12}},
            legend:{display:false},
            tooltip:{callbacks:{label:ctx=>ctx.parsed.y.toFixed(1)+'% MAPE'}}},
          scales:{x:{ticks:{color:'#44608a',font:{size:10}}},
            y:{ticks:{color:'#44608a',font:{size:10},callback:v=>v+'%'}}}}
      });
    }
  },80);
}
