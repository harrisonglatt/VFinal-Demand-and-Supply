// ─── WALK-FORWARD BACKTEST ENGINE ────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 4667–5017)

import { DATA_DP, DATA_BACKTEST } from '../data/index.js';
import { fmt, fmtDol, sf } from '../utils/formatters.js';
import { chip, kpiCard } from '../utils/dom.js';
import { HIST_PROMO_MAP } from './forecast-versions.js';
import { escH } from './forecast-versions.js';

// ─── Module state ───────────────────────────────────────────────────────────
let _btChartInst = null;

// ─── Core backtest functions ────────────────────────────────────────────────

export function calcMAPE(preds,actuals){
  if(!preds.length) return 0;
  const errs=preds.map((p,i)=>actuals[i]?Math.abs(p-actuals[i])/actuals[i]:0);
  return errs.reduce((a,b)=>a+b,0)/errs.length;
}
export function calcMAPE_arr(absErrors){
  return absErrors.length?absErrors.reduce((a,b)=>a+b,0)/absErrors.length:0;
}
export function calcBias(preds,actuals){
  if(!preds.length) return 0;
  const errs=preds.map((p,i)=>actuals[i]?(p-actuals[i])/actuals[i]:0);
  return errs.reduce((a,b)=>a+b,0)/errs.length;
}

// ─── Walk-forward backtest engine ───────────────────────────────────────────
export function runWalkForward(){
  const testIndices=[4,5,6,7,8,9,10,11];
  const results={
    byWeek:[], bySku:[], byCat:{},
    baselineErrors:[], promoErrors:[],
    liftCalibration:[],
    frozenRampWarning:true,
    frozenCleanPoints:0
  };

  DATA_DP.skus.forEach(s=>{
    if(!s.hist||s.hist.length<12) return;
    const hist=s.hist.slice(0,12);
    const isFrozen=(s.category||'').includes('Frozen');
    const skuErrors=[];

    testIndices.forEach(t=>{
      const trainData=hist.slice(0,t);
      if(trainData.length<4) return;

      let cleanTrain;
      if(isFrozen){
        cleanTrain=trainData.filter((_,idx)=>!HIST_PROMO_MAP[idx]);
        if(cleanTrain.length<2) cleanTrain=trainData.slice(0,1);
      } else {
        cleanTrain=trainData.slice(-4);
      }

      const baselineAvg=cleanTrain.length
        ? cleanTrain.reduce((a,b)=>a+(b||0),0)/cleanTrain.length
        : (hist[0]||0);

      const promoInfo=HIST_PROMO_MAP[t];
      let pred;
      let isPromoWeek=false;
      if(promoInfo && isFrozen){
        const modelLift=(t===5)?2.025:1.50;
        pred=Math.round(baselineAvg*modelLift);
        isPromoWeek=true;
      } else {
        pred=Math.round(baselineAvg);
      }

      const actual=hist[t]||0;
      if(!actual) return;
      const err=(pred-actual)/actual;
      const absErr=Math.abs(err);

      skuErrors.push({t,pred,actual,err,absErr,isPromoWeek});

      if(isPromoWeek){
        results.promoErrors.push(absErr);
        const promoInfo2=HIST_PROMO_MAP[t];
        if(promoInfo2){
          const frozenBase=isFrozen?baselineAvg:(actual);
          const actualLiftObs=frozenBase>0?(actual/frozenBase):1;
          const modelLiftUsed=(t===5)?2.025:1.50;
          results.liftCalibration.push({
            t, skuName:s.name, cat:s.category,
            type:promoInfo2.type,
            modelLift:modelLiftUsed,
            actualLift:actualLiftObs,
            refActualLift:promoInfo2.lift,
            calErr:(modelLiftUsed-actualLiftObs)/actualLiftObs
          });
        }
      } else {
        results.baselineErrors.push(absErr);
      }
    });

    if(skuErrors.length){
      const skuMAPE=calcMAPE(skuErrors.map(e=>e.pred),skuErrors.map(e=>e.actual));
      const skuBias=calcBias(skuErrors.map(e=>e.pred),skuErrors.map(e=>e.actual));
      const baselineOnly=skuErrors.filter(e=>!e.isPromoWeek);
      const baseMAPE=baselineOnly.length?calcMAPE(baselineOnly.map(e=>e.pred),baselineOnly.map(e=>e.actual)):null;
      results.bySku.push({
        name:s.name.replace(/,\s+[\d.]+\s+oz.*/i,'').substring(0,30),
        cat:s.category, dpci:s.dpci,
        mape:skuMAPE, bias:skuBias, baseMAPE,
        weeks:skuErrors.length
      });
      if(!results.byCat[s.category]) results.byCat[s.category]={errors:[],weeks:0};
      skuErrors.forEach(e=>results.byCat[s.category].errors.push(e.absErr));
      results.byCat[s.category].weeks+=skuErrors.length;
    }
  });

  // Build week-level aggregates for chart
  const testIdxToLabel={
    4:"Jan 26",5:"Feb 2",6:"Feb 8",7:"Feb 15",
    8:"Feb 22",9:"Mar 1",10:"Mar 8",11:"Mar 15"
  };
  [4,5,6,7,8,9,10,11].forEach(t=>{
    const weekResults=DATA_DP.skus.filter(s=>s.hist&&s.hist.length>=12).map(s=>{
      const isFrozen=(s.category||'').includes('Frozen');
      const hist=s.hist.slice(0,12);
      const trainData=hist.slice(0,t);
      let cleanTrain;
      if(isFrozen){
        cleanTrain=trainData.filter((_,idx)=>!HIST_PROMO_MAP[idx]);
        if(cleanTrain.length<2) cleanTrain=trainData.slice(0,1);
      } else {
        cleanTrain=trainData.slice(-4);
      }
      const baselineAvg=cleanTrain.length?cleanTrain.reduce((a,b)=>a+(b||0),0)/cleanTrain.length:0;
      const promoInfo=HIST_PROMO_MAP[t];
      const modelLift=(isFrozen&&promoInfo)?(t===5?2.025:1.50):1.0;
      const pred=Math.round(baselineAvg*modelLift);
      return {pred, actual:hist[t]||0};
    }).filter(r=>r.actual>0);
    const totPred=weekResults.reduce((a,r)=>a+r.pred,0);
    const totActual=weekResults.reduce((a,r)=>a+r.actual,0);
    results.byWeek.push({
      label:testIdxToLabel[t]||('Wk '+t),
      pred:totPred, actual:totActual,
      isPromo:!![4,5].includes(t),
      err:totActual?(totPred-totActual)/totActual:0
    });
  });

  // Summary stats
  const allErrors=[...results.baselineErrors,...results.promoErrors];
  results.overallMAPE=allErrors.length?calcMAPE_arr(allErrors):0;
  results.baselineMAPE=results.baselineErrors.length?calcMAPE_arr(results.baselineErrors):0;
  results.promoMAPE=results.promoErrors.length?calcMAPE_arr(results.promoErrors):0;
  results.overallBias=results.byWeek.length
    ?results.byWeek.reduce((a,w)=>a+w.err,0)/results.byWeek.length:0;

  // Frozen clean training points
  const _frozenSkus=DATA_DP.skus.filter(s=>(s.category||'').includes('Frozen'));
  let _minClean=999;
  _frozenSkus.forEach(s=>{
    const _h=(s.hist||[]).slice(0,12);
    [4,5,6].forEach(t=>{
      const _c=_h.slice(0,t).filter((_,i)=>!HIST_PROMO_MAP[i]);
      if(_c.length<_minClean) _minClean=_c.length;
    });
  });
  results.frozenCleanPoints=_minClean;

  return results;
}

// ─── Backtest Lab UI ────────────────────────────────────────────────────────
export function initBACKTEST(){
  const kpisEl=document.getElementById('backtest-kpis');
  const contentEl=document.getElementById('backtest-content');
  if(!kpisEl||!contentEl) return;

  const _btResult=runWalkForward();
  const r=_btResult;

  // Make backtest result available for other modules
  window._btResult = _btResult;

  // ── KPIs ────────────────────────────────────────────────────────────────
  const biasLabel=Math.abs(r.overallBias)<0.02?'Approx. unbiased':
    r.overallBias>0?'Model trends HIGH':'Model trends LOW';
  kpisEl.innerHTML=
    kpiCard('\uD83C\uDFAF','Baseline MAPE','--cc:'+(r.baselineMAPE<0.08?'var(--gr)':r.baselineMAPE<0.15?'var(--yw)':'var(--rd)'),
      (r.baselineMAPE*100).toFixed(1)+'%',
      'Mean Abs % Error \u2014 non-promo weeks',r.baselineMAPE<0.10?'up':'dn',
      r.byWeek.filter(w=>!w.isPromo).length+' baseline test points')+
    kpiCard('\uD83C\uDFAA','Promo Week MAPE','--cc:'+(r.promoMAPE<0.12?'var(--gr)':r.promoMAPE<0.20?'var(--yw)':'var(--rd)'),
      (r.promoMAPE*100).toFixed(1)+'%',
      'Forecast error during historical promo events','neu',
      r.byWeek.filter(w=>w.isPromo).length+' promo test points (Frozen endcap)')+
    kpiCard('\uD83D\uDCCA','Forecast Bias','--cc:'+(Math.abs(r.overallBias)<0.03?'var(--gr)':'var(--yw)'),
      (r.overallBias>=0?'+':'')+(r.overallBias*100).toFixed(1)+'%',
      biasLabel,'neu',
      'Positive = over-forecast tendency')+
    kpiCard('\uD83D\uDD2C','Walk-Forward Windows','--cc:var(--cy)',
      r.bySku.reduce((a,s)=>a+s.weeks,0),
      'Total SKU\u00d7week test points','neu',
      DATA_DP.skus.length+' SKUs \u00d7 up to 8 history wks each');

  // ── Frozen ramp-period warning ─────────────────────────────────────────
  const warnEl=document.getElementById('backtest-ramp-warn');
  if(warnEl){
    warnEl.innerHTML=`<div class="ch yw2" style="margin:0 0 16px;font-size:11.5px;padding:10px 14px">
      \u26A0\uFE0F <b>Frozen Multiserve MAPE note:</b> Historical promo weeks (Jan\u2013Feb 2026, hist[1\u20135]) are excluded from Frozen baseline training.
      At the earliest test point (hist[6]), only <b>1 clean training observation</b> was available (hist[0] = Dec 2025, pre-expansion).
      Frozen category promo MAPE of ${(r.promoMAPE*100).toFixed(1)}% reflects this ramp-period instability \u2014
      the model predicts with 1 data pt, vs an expanding store base (1,500\u21921,800 stores).
      <b>Baseline MAPE of ${(r.baselineMAPE*100).toFixed(1)}% (non-promo weeks) is more reliable.</b>
    </div>`;
    warnEl.style.display='block';
  }

  // ── Chart: predicted vs actual by week ─────────────────────────────────
  if(_btChartInst){_btChartInst.destroy();_btChartInst=null;}
  const chEl=document.getElementById('ch-backtest-main');
  if(chEl){
    const wkLabels=r.byWeek.map(w=>w.label+(w.isPromo?' \u2B50':''));
    const preds=r.byWeek.map(w=>w.pred);
    const actuals=r.byWeek.map(w=>w.actual);
    const errPcts=r.byWeek.map(w=>(w.err*100).toFixed(1));
    _btChartInst=new Chart(chEl,{type:'bar',data:{
      labels:wkLabels,
      datasets:[
        {label:'Model Forecast',data:preds,backgroundColor:'rgba(0,227,205,.55)',borderRadius:3},
        {label:'Actual',data:actuals,backgroundColor:'rgba(255,199,17,.65)',borderRadius:3}
      ]
    },options:{responsive:true,
      plugins:{legend:{labels:{color:'#7b97c8',font:{size:11}}},
        tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+fmt(ctx.parsed.y),
          afterBody:(items)=>{
            const i=items[0]?.dataIndex;
            if(i===undefined) return [];
            return ['Error: '+(errPcts[i]>=0?'+':'')+errPcts[i]+'%'];
          }}}},
      scales:{
        x:{ticks:{color:'#44608a',font:{size:10}}},
        y:{ticks:{color:'#44608a',font:{size:10},callback:v=>(v/1000).toFixed(0)+'k'}}
      }
    }});
  }

  // ── By-Week detail table ──────────────────────────────────────────────
  let h=`<div class="cc" style="margin-bottom:16px">
    <div class="ct">\uD83D\uDCC5 Walk-Forward Validation \u2014 Week by Week</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:10px">
      \u2B50 = historical promo week (Frozen endcap Jan\u2013Feb 2026). Model uses data available <em>at that point in time only</em>.
    </div>
    <table class="dt"><thead><tr>
      <th>Week</th><th>Type</th>
      <th class="tr">Model Forecast</th><th class="tr">Actual Units</th>
      <th class="tr">Error</th><th class="tr">Abs Error</th><th>Assessment</th>
    </tr></thead><tbody>`;

  r.byWeek.forEach(w=>{
    const pct=(w.err*100).toFixed(1);
    const absPct=(Math.abs(w.err)*100).toFixed(1);
    const assess=Math.abs(w.err)<0.05?'\u2705 Excellent':Math.abs(w.err)<0.10?'\uD83D\uDFE2 Good':
      Math.abs(w.err)<0.20?'\uD83D\uDFE1 Acceptable':'\uD83D\uDD34 High Error';
    h+=`<tr style="${w.isPromo?'background:rgba(255,199,17,.04)':''}">
      <td style="color:${w.isPromo?'var(--yw)':'var(--tx)'}">${w.label}${w.isPromo?' \u2B50':''}</td>
      <td>${chip(w.isPromo?'cy2':'cgr',w.isPromo?'Promo':'Baseline')}</td>
      <td class="tr">${fmt(w.pred)}</td>
      <td class="tr"><b>${fmt(w.actual)}</b></td>
      <td class="tr ${w.err>0.05?'dn':w.err<-0.05?'up':'neu'}">${w.err>=0?'+':''}${pct}%</td>
      <td class="tr">${absPct}%</td>
      <td style="font-size:12px">${assess}</td>
    </tr>`;
  });
  h+='</tbody></table></div>';

  // ── By-SKU MAPE table ─────────────────────────────────────────────────
  h+=`<div class="cc">
    <div class="ct">\uD83D\uDCE6 Forecast Accuracy by SKU</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:10px">
      MAPE = Mean Absolute % Error \u00b7 Bias = tendency to over (+) or under (\u2212) forecast
    </div>
    <table class="dt"><thead><tr>
      <th>SKU</th><th>Category</th>
      <th class="tr">MAPE</th><th class="tr">Baseline MAPE</th>
      <th class="tr">Bias</th><th class="tr">Test Wks</th><th>Grade</th>
    </tr></thead><tbody>`;

  r.bySku.sort((a,b)=>b.mape-a.mape).forEach(s=>{
    const grade=s.mape<0.05?'A':s.mape<0.10?'B':s.mape<0.18?'C':s.mape<0.25?'D':'F';
    const gradeCol={A:'var(--gr)',B:'rgba(0,207,146,.7)',C:'var(--yw)',D:'rgba(255,140,0,.8)',F:'var(--rd)'};
    h+=`<tr>
      <td title="${escH(s.name)}">${escH(s.name.substring(0,28))}</td>
      <td><span class="cat-badge cat-${(s.cat||'').replace(/[\/ ]/g,'-').toLowerCase()}">${(s.cat||'').replace(' Multiserve','')}</span></td>
      <td class="tr ${s.mape>0.15?'dn':s.mape<0.08?'up':'neu'}">${(s.mape*100).toFixed(1)}%</td>
      <td class="tr">${s.baseMAPE!=null?(s.baseMAPE*100).toFixed(1)+'%':'\u2014'}</td>
      <td class="tr ${s.bias>0.05?'dn':s.bias<-0.05?'up':'neu'}">${s.bias>=0?'+':''}${(s.bias*100).toFixed(1)}%</td>
      <td class="tr">${s.weeks}</td>
      <td><b style="color:${gradeCol[grade]||'var(--tx)'}">${grade}</b></td>
    </tr>`;
  });
  h+='</tbody></table></div>';

  // ── Systematic Over-Forecast Analysis ──────────────────────────────────
  h+=`<div class="cc">
    <div class="ct">\u26A0\uFE0F Systematic Over-Forecast Analysis \u2014 Explicit Bias by Category &amp; Promo Type</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:14px">
      Derived from L8W walk-forward results + DATA_BACKTEST segmented analysis.
      <b style="color:var(--rd)">Positive bias = model forecasts higher than actuals</b> (over-forecasting).
      These biases feed directly into forward forecast calibration.
    </div>`;

  // Promo type bias summary
  h+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:18px">`;
  Object.entries(DATA_BACKTEST.promo_type_bias).forEach(([ptype,pd])=>{
    const col=pd.bias_pct>12?'var(--rd)':pd.bias_pct>6?'var(--yw)':'var(--gr)';
    const icon=pd.bias_pct>12?'\uD83D\uDD34':pd.bias_pct>6?'\uD83D\uDFE1':'\u2705';
    h+=`<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-weight:700;color:var(--tx);font-size:13px">${icon} ${ptype}</div>
        <div style="font-weight:800;color:${col};font-size:16px">${pd.bias_pct>0?'+':''}${pd.bias_pct.toFixed(1)}%</div>
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-bottom:6px">${pd.n_obs} historical observations \u00b7 MAPE ${pd.mape_pct.toFixed(1)}%</div>
      <div style="font-size:11.5px;color:var(--tx);line-height:1.5;margin-bottom:6px">${pd.summary}</div>
      <div style="font-size:11px;color:${col};font-style:italic">${pd.action}</div>
    </div>`;
  });
  h+=`</div>`;

  // Category baseline bias table
  h+=`<table class="dt"><thead><tr>
    <th>Category</th><th class="tr">Baseline Bias</th><th class="tr">Baseline MAPE</th>
    <th class="tr">Obs</th><th>Trend &amp; Calibration Action</th>
  </tr></thead><tbody>`;
  Object.entries(DATA_BACKTEST.cat_baseline).forEach(([cat,cd])=>{
    const bpct=cd.bias_base.toFixed(1)+'%';
    const cls=cd.bias_base>5?'dn':cd.bias_base<-3?'up':'neu';
    h+=`<tr>
      <td><span class="cat-badge cat-${cat.replace(/[\/ ]/g,'-').toLowerCase()}">${cat.replace(' Multiserve','')}</span></td>
      <td class="tr ${cls}">${cd.bias_base>=0?'+':''}${bpct}</td>
      <td class="tr">${cd.mape_base.toFixed(1)}%</td>
      <td class="tr">${cd.n_obs}</td>
      <td style="font-size:11.5px;color:var(--tx3)">${cd.trend}</td>
    </tr>`;
  });
  h+=`</tbody></table>
  <div style="font-size:11px;color:var(--tx3);margin-top:8px">
    \u2139\uFE0F These biases are applied automatically to forward forecasts via the Conservative Calibration Engine (see Model Learning tab for per-SKU adjustments).
  </div>
  </div>`;

  contentEl.innerHTML=h;
}
