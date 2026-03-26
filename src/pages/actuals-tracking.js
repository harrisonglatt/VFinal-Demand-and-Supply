// ─── DAILY ACTUALS TRACKING SYSTEM ───────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 5828–6232)

import { DATA_DP } from '../data/index.js';
import { fmt, fmtP, sf } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';
import { getAllSKUs } from './add-sku.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const LS_DAILY_ACT_KEY = 'ls_ti_daily_act_v1';

// ─── Module state ───────────────────────────────────────────────────────────
let _actualsTab = 'wtd';

// ─── Daily actuals persistence ──────────────────────────────────────────────
export function getDailyActuals(){
  try{ return JSON.parse(localStorage.getItem(LS_DAILY_ACT_KEY)||'{}'); }
  catch(e){ return {}; }
}
export function saveDailyActuals(obj){
  try{ localStorage.setItem(LS_DAILY_ACT_KEY,JSON.stringify(obj)); }catch(e){}
}

// ─── Helper: week start (Sunday) for a given date ───────────────────────────
export function getWeekStart(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

// ─── Get all week-start dates covered by daily actuals ──────────────────────
export function getActualsWeeks(){
  const act = getDailyActuals();
  const weeks = new Set(Object.keys(act).map(d=>getWeekStart(d)));
  return [...weeks].sort();
}

// ─── Aggregate daily actuals to WTD for a given week start ──────────────────
export function computeWTD(weekStart){
  const act = getDailyActuals();
  const result = {};
  const days = [];
  for(let i=0;i<7;i++){
    const d=new Date(weekStart+'T00:00:00'); d.setDate(d.getDate()+i);
    days.push(d.toISOString().split('T')[0]);
  }
  days.forEach(day=>{
    if(!act[day]) return;
    Object.entries(act[day]).forEach(([skuName,v])=>{
      if(!result[skuName]) result[skuName]={units:0,revenue:0,days:0,daysData:[]};
      result[skuName].units   += v.units||0;
      result[skuName].revenue += v.revenue||0;
      result[skuName].days    += 1;
      result[skuName].daysData.push({day, units:v.units||0, revenue:v.revenue||0});
    });
  });
  return result;
}

// ─── Data state for a SKU in a given week ───────────────────────────────────
export function getWeekDataState(skuName, weekStart){
  const wtd = computeWTD(weekStart);
  if(!wtd[skuName]) return 'no_data';
  const days = wtd[skuName].days;
  if(days >= 7) return 'complete';
  return 'partial';
}

// ─── Run-rate projection ────────────────────────────────────────────────────
export function computeRunRate(skuName, weekStart){
  const wtd = computeWTD(weekStart);
  if(!wtd[skuName]) return null;
  const {units, days} = wtd[skuName];
  if(!days) return null;
  const perDay = units / days;
  const projected = Math.round(perDay * 7);
  return {wtdUnits: units, daysIn: days, perDay, projected};
}

// ─── Get fcast for a SKU for a given week index ─────────────────────────────
export function getSkuFcastForWeek(skuName, weekIdx){
  const allSkus = getAllSKUs();
  const sku = allSkus.find(s=>s.name===skuName);
  if(!sku || !sku.fcast) return 0;
  return sf(sku.fcast[weekIdx]) || 0;
}

// ─── Get week index (0-based) from week start date ──────────────────────────
export function getWeekIdxFromDate(weekStart){
  const planStart = new Date('2026-03-22T00:00:00');
  const ws = new Date(weekStart+'T00:00:00');
  return Math.max(0, Math.floor((ws - planStart) / (7*24*3600*1000)));
}

// ─── initACTUALS page ───────────────────────────────────────────────────────
export function initACTUALS(){
  // Populate week selector
  const sel = document.getElementById('act-week-sel');
  if(sel){
    const weeks = getActualsWeeks();
    const planWeeks = [];
    for(let i=0;i<13;i++){
      const d=new Date('2026-03-22T00:00:00'); d.setDate(d.getDate()+i*7);
      planWeeks.push(d.toISOString().split('T')[0]);
    }
    const allWeeks = [...new Set([...weeks,...planWeeks])].sort();
    const curVal = sel.value;
    sel.innerHTML='';
    allWeeks.forEach(w=>{
      const o=document.createElement('option');
      o.value=w;
      const d=new Date(w+'T00:00:00');
      o.textContent='Wk of '+(d.getMonth()+1)+'/'+(d.getDate())+'/'+d.getFullYear().toString().slice(2);
      sel.appendChild(o);
    });
    if(!curVal) sel.value='2026-03-22';
    else sel.value=curVal;
  }
  // Populate actuals SKU selector
  const actSku = document.getElementById('act-sku');
  if(actSku && actSku.options.length<2){
    getAllSKUs().forEach(s=>{
      const o=document.createElement('option'); o.value=s.name; o.textContent=s.name.length>55?s.name.slice(0,53)+'\u2026':s.name;
      actSku.appendChild(o);
    });
  }
  // Set today default for date input
  const today=new Date().toISOString().split('T')[0];
  const actDate=document.getElementById('act-date');
  if(actDate && !actDate.value) actDate.value=today;

  renderActualsKPIs();
  renderActualsTab('wtd');
  renderActualsFeedback();
}

export function showActualsTab(tab, btn){
  _actualsTab=tab;
  document.querySelectorAll('#pg-actuals .btn').forEach(b=>{
    if(['WTD Summary','Daily Detail','Run-Rate / Pace'].some(t=>b.textContent.includes(t.split(' ')[0])))
      b.classList.remove('on');
  });
  if(btn) btn.classList.add('on');
  ['wtd','daily','pace'].forEach(t=>{
    const p=document.getElementById('actuals-'+t+'-panel');
    if(p) p.style.display=(t===tab?'':'none');
  });
  renderActualsTab(tab);
}

export function renderActualsTab(tab){
  const weekStart = (document.getElementById('act-week-sel')||{}).value || '2026-03-22';
  if(tab==='wtd')   renderWTDTable(weekStart);
  if(tab==='daily') renderDailyTable(weekStart);
  if(tab==='pace')  renderPaceTable(weekStart);
}

export function renderActualsKPIs(){
  const el=document.getElementById('actuals-kpis');
  if(!el) return;
  const weekStart = (document.getElementById('act-week-sel')||{}).value||'2026-03-22';
  const wkIdx = getWeekIdxFromDate(weekStart);
  const allSkus = getAllSKUs();
  const wtd = computeWTD(weekStart);
  const totalWTD = Object.values(wtd).reduce((a,v)=>a+v.units,0);
  const totalFcast = allSkus.reduce((a,s)=>a+sf(s.fcast[wkIdx]),0);
  const skusWithData = Object.keys(wtd).length;
  const daysIn = Math.max(...Object.values(wtd).map(v=>v.days),0);
  const paceTotal = daysIn>0 ? Math.round(totalWTD / daysIn * 7) : 0;
  const paceVsFcast = totalFcast>0 ? (paceTotal - totalFcast)/totalFcast : null;
  const paceLabel = paceVsFcast===null?'\u2014':(paceVsFcast>=0?'+':'')+Math.round(paceVsFcast*100)+'% vs forecast';
  el.innerHTML=
    kpiCard('\uD83D\uDCC5','Days In (CW)','--cc:var(--cy)', daysIn||'0',
      'Days of actuals available for current week','neu',weekStart)+
    kpiCard('\uD83D\uDCE6','WTD Units','--cc:var(--ac)', fmt(totalWTD)||'\u2014',
      daysIn+' day actual vs '+fmt(totalFcast)+' wk fcast','neu',skusWithData+' SKUs with data')+
    kpiCard('\uD83D\uDCC8','Run-Rate Projection','--cc:'+(paceVsFcast===null?'var(--cy)':paceVsFcast>=-0.02?'var(--gr)':paceVsFcast>=-0.10?'var(--yw)':'var(--rd)'),
      paceTotal?fmt(paceTotal):'\u2014',
      'Projected end-of-week at current pace',paceVsFcast===null?'neu':paceVsFcast>=0?'up':'dn', paceLabel)+
    kpiCard('\uD83D\uDFE2','SKUs w/ Actuals','--cc:var(--gr)', skusWithData,
      'SKUs with at least 1 day of data this week','neu', allSkus.length+' total active SKUs');
}

export function renderWTDTable(weekStart){
  const el=document.getElementById('actuals-wtd-table'); if(!el) return;
  const wkIdx = getWeekIdxFromDate(weekStart);
  const wtd = computeWTD(weekStart);
  const allSkus = getAllSKUs();

  let h=`<table class="dt"><thead><tr>
    <th>SKU</th><th>Category</th><th>State</th>
    <th class="tr">Fcast (Week)</th><th class="tr">WTD Actual</th>
    <th class="tr">Days In</th><th class="tr">Daily Pace</th>
    <th class="tr">Projected EOW</th><th class="tr">EOW vs Fcast</th>
  </tr></thead><tbody>`;

  allSkus.forEach(s=>{
    const fcast = sf(s.fcast[wkIdx]);
    const d = wtd[s.name];
    const state = d ? (d.days>=7?'complete':'partial') : 'no_data';
    const stateChip = state==='complete'?'<span class="ds-complete">\u25CF Complete</span>':
      state==='partial'?'<span class="ds-partial">\u25D1 Partial</span>':
      '<span class="ds-none">\u25CB No Data</span>';
    const wtdU = d?d.units:null;
    const pace  = d&&d.days?Math.round(d.units/d.days):null;
    const proj  = pace?Math.round(pace*7):null;
    const vsF   = proj&&fcast ? (proj-fcast)/fcast : null;
    const vsCls = vsF===null?'':vsF>=0.05?'cgr':vsF<=-0.05?'cr':'cy2';
    h+=`<tr>
      <td class="tn" style="max-width:180px" title="${s.name}">${s.name}${s.isNew?'<span class="new-sku-badge">NEW</span>':''}</td>
      <td><span style="font-size:10px;color:var(--tx3)">${s.category}</span></td>
      <td>${stateChip}</td>
      <td class="tr">${fmt(fcast)||'\u2014'}</td>
      <td class="tr"><b>${wtdU!=null?fmt(wtdU):'\u2014'}</b></td>
      <td class="tr">${d?d.days:'\u2014'}</td>
      <td class="tr">${pace?fmt(pace):pace===0?'0':'\u2014'}</td>
      <td class="tr" style="${proj&&fcast?'font-weight:600':'color:var(--tx3)'}">${proj?fmt(proj):'\u2014'}</td>
      <td class="tr ${vsCls}">${vsF!==null?fmtP(vsF):'\u2014'}</td>
    </tr>`;
  });
  // Total row
  const totFcast = allSkus.reduce((a,s)=>a+sf(s.fcast[wkIdx]),0);
  const totWTD   = Object.values(wtd).reduce((a,v)=>a+v.units,0);
  const totDays  = Math.max(...Object.values(wtd).map(v=>v.days),0);
  const totPace  = totDays>0?Math.round(totWTD/totDays):null;
  const totProj  = totPace?Math.round(totPace*7):null;
  const totVsF   = totProj&&totFcast?(totProj-totFcast)/totFcast:null;
  const tvCls    = totVsF===null?'':totVsF>=0.05?'cgr':totVsF<=-0.05?'cr':'cy2';
  h+=`<tr style="background:var(--s3);font-weight:700">
    <td>TOTAL</td><td></td><td></td>
    <td class="tr">${fmt(totFcast)}</td>
    <td class="tr"><b>${fmt(totWTD)||'\u2014'}</b></td>
    <td class="tr">${totDays||'\u2014'}</td>
    <td class="tr">${totPace?fmt(totPace):'\u2014'}</td>
    <td class="tr">${totProj?fmt(totProj):'\u2014'}</td>
    <td class="tr ${tvCls}">${totVsF!==null?fmtP(totVsF):'\u2014'}</td>
  </tr></tbody></table>`;
  el.innerHTML=h;
}

export function renderDailyTable(weekStart){
  const el=document.getElementById('actuals-daily-table'); if(!el) return;
  const act=getDailyActuals();
  const days=[]; for(let i=0;i<7;i++){const d=new Date(weekStart+'T00:00:00');d.setDate(d.getDate()+i);days.push(d.toISOString().split('T')[0]);}
  const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const allSkus=getAllSKUs();
  let h=`<table class="dt"><thead><tr><th>SKU</th>`;
  days.forEach((d,i)=>h+=`<th class="tr">${dayLabels[i]}<br><span style="font-size:9px;color:var(--tx3)">${d.slice(5)}</span></th>`);
  h+=`<th class="tr">WTD</th></tr></thead><tbody>`;
  allSkus.forEach(s=>{
    const dayVals=days.map(d=>(act[d]&&act[d][s.name])?act[d][s.name].units:null);
    const wtdTotal=dayVals.reduce((a,v)=>a+(v||0),0);
    if(!dayVals.some(v=>v!=null)) return;
    h+=`<tr><td class="tn" style="max-width:180px" title="${s.name}">${s.name}${s.isNew?'<span class="new-sku-badge">NEW</span>':''}</td>`;
    dayVals.forEach(v=>h+=`<td class="tr" style="${v!=null?'':'color:var(--tx3)'}">${v!=null?fmt(v):'\u2014'}</td>`);
    h+=`<td class="tr"><b>${fmt(wtdTotal)}</b></td></tr>`;
  });
  // Day totals
  const dayTots=days.map(d=>act[d]?Object.values(act[d]).reduce((a,v)=>a+(v.units||0),0):null);
  h+=`<tr style="background:var(--s3);font-weight:700"><td>TOTAL</td>`;
  dayTots.forEach(t=>h+=`<td class="tr">${t!=null?fmt(t):'\u2014'}</td>`);
  h+=`<td class="tr">${fmt(dayTots.reduce((a,v)=>a+(v||0),0))}</td></tr>`;
  h+='</tbody></table>';
  el.innerHTML = h.includes('<tr>') ? h : '<div style="color:var(--tx3);padding:20px;text-align:center">No daily actuals for this week. Use the form below to ingest data, or click "Load Demo Actuals".</div>';
}

export function renderPaceTable(weekStart){
  const el=document.getElementById('actuals-pace-content'); if(!el) return;
  const wkIdx=getWeekIdxFromDate(weekStart);
  const wtd=computeWTD(weekStart);
  const allSkus=getAllSKUs().filter(s=>wtd[s.name]);
  if(!allSkus.length){
    el.innerHTML='<div style="color:var(--tx3);padding:20px;text-align:center">No actuals for this week \u2014 load demo data or ingest actuals first.</div>';
    return;
  }
  let h=`<table class="dt"><thead><tr>
    <th>SKU</th><th>Category</th>
    <th class="tr">Fcast</th><th class="tr">WTD</th><th class="tr">Days In</th>
    <th class="tr">Daily Avg</th><th class="tr">Proj EOW</th><th class="tr">Delta</th><th>Pace Signal</th>
  </tr></thead><tbody>`;
  allSkus.forEach(s=>{
    const fcast=sf(s.fcast[wkIdx]);
    const d=wtd[s.name];
    const pace=d.days?Math.round(d.units/d.days):0;
    const proj=Math.round(pace*7);
    const delta=proj-fcast;
    const pct=fcast>0?(proj-fcast)/fcast:null;
    const signal=pct===null?'\u2014':pct>0.10?'\uD83D\uDE80 Running hot':pct>0.02?'\u2705 Pacing ahead':pct>=-0.02?'\u2705 On track':pct>=-0.10?'\u26A0\uFE0F Slightly behind':'\uD83D\uDD34 Tracking low';
    const sigCls=pct===null?'':pct>0.02?'cgr':pct<-0.05?'cr':'cy2';
    h+=`<tr>
      <td class="tn" title="${s.name}">${s.name}${s.isNew?'<span class="new-sku-badge">NEW</span>':''}</td>
      <td style="font-size:10px;color:var(--tx3)">${s.category}</td>
      <td class="tr">${fmt(fcast)}</td><td class="tr">${fmt(d.units)}</td>
      <td class="tr">${d.days}</td><td class="tr">${fmt(pace)}</td>
      <td class="tr"><b>${fmt(proj)}</b></td>
      <td class="tr ${delta>=0?'cgr':'cr'}">${delta>=0?'+':''}${fmt(delta)}</td>
      <td><span class="${sigCls}">${signal}</span></td>
    </tr>`;
  });
  h+='</tbody></table>';
  el.innerHTML=h;
}

export function renderActualsFeedback(){
  const el=document.getElementById('actuals-feedback'); if(!el) return;
  const weekStart=(document.getElementById('act-week-sel')||{}).value||'2026-03-22';
  const wkIdx=getWeekIdxFromDate(weekStart);
  const wtd=computeWTD(weekStart);
  const allSkus=getAllSKUs();
  const insights=[];
  allSkus.forEach(s=>{
    const d=wtd[s.name]; if(!d||!d.days) return;
    const fcast=sf(s.fcast[wkIdx]);
    const proj=Math.round(d.units/d.days*7);
    const pct=fcast>0?(proj-fcast)/fcast:null;
    if(pct===null) return;
    if(Math.abs(pct)>=0.10){
      insights.push({name:s.name, cat:s.category, pct, proj, fcast,
        type: pct>0 ? 'over' : 'under',
        action: pct>0
          ? 'Consider bumping short-term forecast upward. If pattern persists, recalibrate base velocity in Model Learning.'
          : 'Check promo execution, distribution, or competitive pricing. Flag for review if week ends below plan.'
      });
    }
  });
  if(!insights.length){
    el.innerHTML='<div style="color:var(--tx3);text-align:center;padding:30px">No significant pace deviations this week \u2014 all SKUs within \u00b110% of forecast. \u2705</div>';
    return;
  }
  let h='<div style="display:grid;gap:10px">';
  insights.forEach(ins=>{
    const cls=ins.type==='over'?'cgr':'cr';
    h+=`<div class="cc" style="border-left:3px solid ${ins.type==='over'?'var(--gr)':'var(--rd)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div><b style="font-size:13px">${ins.name}</b><span style="font-size:10.5px;color:var(--tx3);margin-left:8px">${ins.cat}</span></div>
        <span class="${cls}" style="font-size:13px;font-weight:700">${ins.pct>=0?'+':''}${Math.round(ins.pct*100)}% vs fcast</span>
      </div>
      <div style="font-size:11.5px;color:var(--tx3)">Proj EOW: <b style="color:var(--tx)">${fmt(ins.proj)}</b> vs Fcast: ${fmt(ins.fcast)}</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:5px;border-top:1px solid var(--s3);padding-top:5px">
        <b>Suggested action:</b> ${ins.action}
      </div>
    </div>`;
  });
  h+='</div>';
  el.innerHTML=h;
}

// ─── Ingest form handler ────────────────────────────────────────────────────
export function ingestActualsRow(){
  const date  = (document.getElementById('act-date').value||'').trim();
  const skuN  = (document.getElementById('act-sku').value||'').trim();
  const units = parseFloat(document.getElementById('act-units').value)||0;
  const rev   = parseFloat(document.getElementById('act-rev').value)||0;
  if(!date||!skuN){ alert('Date and SKU are required.'); return; }
  const act=getDailyActuals();
  if(!act[date]) act[date]={};
  if(!act[date][skuN]) act[date][skuN]={units:0,revenue:0};
  act[date][skuN].units   += units;
  act[date][skuN].revenue += rev;
  saveDailyActuals(act);
  document.getElementById('act-units').value='';
  document.getElementById('act-rev').value='';
  initACTUALS();
}

export function clearAllActuals(){
  if(!confirm('Clear ALL daily actuals? This cannot be undone.')) return;
  saveDailyActuals({});
  initACTUALS();
}
export function exportActuals(){
  const blob=new Blob([JSON.stringify(getDailyActuals(),null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='ls-daily-actuals-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
}

// ─── Demo actuals seeding ───────────────────────────────────────────────────
export function seedDemoActuals(){
  const act=getDailyActuals();
  const allSkus=DATA_DP.skus;
  // Last week: Mar 15-21 (complete)
  const LW_START='2026-03-15';
  allSkus.forEach(s=>{
    const lw7 = s.hist[11]||0;
    const perDay=Math.round(lw7/7);
    for(let i=0;i<7;i++){
      const d=new Date(LW_START+'T00:00:00'); d.setDate(d.getDate()+i);
      const ds=d.toISOString().split('T')[0];
      if(!act[ds]) act[ds]={};
      const variation=0.92+Math.random()*0.16;
      act[ds][s.name]={units:Math.round(perDay*variation), revenue:Math.round(perDay*variation*s.price)};
    }
  });
  // Current week: Mar 22-24 (3 days in)
  const CW_DAYS=['2026-03-22','2026-03-23','2026-03-24'];
  allSkus.forEach(s=>{
    const cw3 = s.hist[12]||0;
    const perDayCW = cw3 > 0 ? Math.round(cw3/3) : Math.round((s.hist[11]||0)/7);
    CW_DAYS.forEach((ds,i)=>{
      if(!act[ds]) act[ds]={};
      const variation=0.90+Math.random()*0.20;
      const dayMult=[0.90,1.08,1.05][i]||1.0;
      act[ds][s.name]={units:Math.round(perDayCW*variation*dayMult), revenue:Math.round(perDayCW*variation*dayMult*s.price)};
    });
  });
  saveDailyActuals(act);
  initACTUALS();
  alert('\u2705 Demo actuals loaded: last week (complete, 7 days) + current week (partial, 3 days).');
}
