// ─── NEW SKU SYSTEM ──────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 5418–5828)

import { DATA_DP, DATA_PROMO, isOnPromo } from '../data/index.js';
import { fmt, sf } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const LS_NEW_SKUS_KEY = 'ls_ti_new_skus_v1';

// Per-category lift table for new SKU forecast computation
const CAT_LIFT_TABLE = {
  'Baby Snacks':      {tpc:1.20, bogo:1.55, dwa:1.60, endcap:1.25},
  'Kids Snacks':      {tpc:1.25, bogo:1.55, dwa:1.45, endcap:1.25},
  'Frozen Multiserve':{tpc:1.10, bogo:1.60, dwa:1.60, endcap:1.50},
  'Smoothies':        {tpc:1.35, bogo:1.45, dwa:1.45, endcap:1.15},
  'YoGos':            {tpc:1.25, bogo:1.45, dwa:1.50, endcap:1.20}
};

// Category average UPSPW (fallback when no analog + no manual baseline)
const CAT_AVG_UPSPW = {
  'Baby Snacks':       11.0,
  'Kids Snacks':        8.5,
  'Frozen Multiserve':  6.0,
  'Smoothies':          9.5,
  'YoGos':              5.0
};

// Maturity display config
const MATURITY_CFG = {
  new_launch:         {label:'New Launch',       cls:'maturity-new'},
  ramping:            {label:'Ramping',           cls:'maturity-ramping'},
  established:        {label:'Established',       cls:'maturity-established'},
  analog_based:       {label:'Analog-Based',      cls:'maturity-analog'},
  manual_assumption:  {label:'Manual',            cls:'maturity-manual'},
  actual_informed:    {label:'Actual-Informed',   cls:'maturity-actual'}
};

// ─── Persistence ────────────────────────────────────────────────────────────
export function getNewSKUs(){
  try{ return JSON.parse(localStorage.getItem(LS_NEW_SKUS_KEY)||'[]'); }
  catch(e){ return []; }
}
export function saveNewSKUs(arr){
  try{ localStorage.setItem(LS_NEW_SKUS_KEY,JSON.stringify(arr)); }catch(e){}
}

// ─── Unified SKU getter (DATA_DP + new SKUs) ────────────────────────────────
export function getAllSKUs(){
  const base = DATA_DP.skus.map(s=>({
    ...s,
    isNew: false,
    maturityStatus: 'established',
    dataStateByWeek: {}
  }));
  const newSkus = getNewSKUs().map(s=>({
    ...s,
    isNew: true,
    hist: [],
    fcast: computeNewSkuForecast(s)
  }));
  return [...base, ...newSkus];
}

// ─── New SKU forecast engine ────────────────────────────────────────────────
export function computeNewSkuForecast(sku){
  // 1) Determine base velocity per store per week
  let basePW = 0;

  if(sku.skuType === 'analog' && sku.analogSkuDpci){
    const analog = DATA_DP.skus.find(s=>s.dpci===sku.analogSkuDpci);
    if(analog){
      const cleanHist = analog.hist.slice(0,12).filter(v=>v>0);
      const l4w = cleanHist.slice(-4);
      const analogUpspw = l4w.length ? l4w.reduce((a,b)=>a+b,0)/l4w.length / analog.stores : (analog.lw_upspw||0);
      const velPct = (sku.analogOverrides && sku.analogOverrides.velocityPct!=null)
        ? sku.analogOverrides.velocityPct / 100 : 1.0;
      basePW = analogUpspw * velPct * sku.stores;
    }
  }

  if(!basePW){
    const upspw = sku.baselineUPSPW || CAT_AVG_UPSPW[sku.category] || 8.0;
    basePW = upspw * (sku.stores || 1000);
  }

  // 2) Determine launch week index (0-based)
  const planStart = new Date('2026-03-22');
  const launchDate = sku.launchDate ? new Date(sku.launchDate) : planStart;
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const launchWkIdx = Math.max(0, Math.floor((launchDate - planStart) / msPerWeek));

  // 3) Build ramp multiplier array
  function getRamp(weeksLive){
    if(sku.rampType==='flat') return 1.0;
    if(sku.rampType==='custom' && sku.rampCustom && sku.rampCustom.length>0){
      return weeksLive < sku.rampCustom.length ? sku.rampCustom[weeksLive] : 1.0;
    }
    // gradual: linear 20%->100% over rampWeeks
    const rw = sku.rampWeeks || 8;
    return Math.min(1.0, 0.20 + (weeksLive / rw) * 0.80);
  }

  // 4) Compute promo lift per week
  const catLifts = CAT_LIFT_TABLE[sku.category] || {};
  function getPromoLift(wkIdx1){
    const events = DATA_PROMO.filter(p=>{
      if(p.wk !== wkIdx1) return false;
      if(p.category && p.category!==sku.category) return false;
      return true;
    });
    if(!events.length) return 1.0;
    let maxLift = 1.0;
    events.forEach(ev=>{
      const m = (ev.mechanic||ev.type||'').toLowerCase();
      const t = (ev.type||'').toLowerCase();
      if(t==='dwa' && sku.promoEligibility && sku.promoEligibility.dwa)
        maxLift = Math.max(maxLift, catLifts.dwa||1.0);
      else if((m.includes('bogo')||t==='bogo') && sku.promoEligibility && sku.promoEligibility.bogo)
        maxLift = Math.max(maxLift, catLifts.bogo||1.0);
      else if(t==='tpc' && sku.promoEligibility && sku.promoEligibility.tpc)
        maxLift = Math.max(maxLift, catLifts.tpc||1.0);
      else if((t==='endcap'||t==='co-space') && sku.promoEligibility && sku.endcapEligible)
        maxLift = Math.max(maxLift, catLifts.endcap||1.0);
    });
    return maxLift;
  }

  // 5) Build 52-week array
  const fcast = [];
  for(let w=0; w<52; w++){
    if(w < launchWkIdx){ fcast.push(0); continue; }
    const weeksLive = w - launchWkIdx;
    const ramp = getRamp(weeksLive);
    const lift = getPromoLift(w+1);
    fcast.push(Math.round(basePW * ramp * lift));
  }
  return fcast;
}

// ─── Maturity status ────────────────────────────────────────────────────────
export function computeMaturityStatus(sku, weeklyActuals){
  const hasActuals = weeklyActuals && Object.keys(weeklyActuals).length > 0;
  if(hasActuals) return 'actual_informed';
  if(sku.skuType==='analog') return 'analog_based';
  if(!sku.baselineUPSPW || sku.baselineUPSPW===0) return 'manual_assumption';
  const planStart = new Date('2026-03-22');
  const launchDate = sku.launchDate ? new Date(sku.launchDate) : planStart;
  const wksLive = Math.floor((new Date() - launchDate) / (7*24*3600*1000));
  if(wksLive <= 0) return 'new_launch';
  if(wksLive < (sku.rampWeeks||8)) return 'ramping';
  return 'established';
}

// ─── initADDSKU page ────────────────────────────────────────────────────────
export function initADDSKU(){
  renderAddSKUKPIs();
  renderNewSKUList();
  // Populate analog selector
  const sel = document.getElementById('ns-analog');
  if(sel && sel.options.length <= 1){
    DATA_DP.skus.forEach(s=>{
      const o = document.createElement('option');
      o.value = s.dpci;
      o.textContent = s.name.length>50 ? s.name.slice(0,48)+'\u2026' : s.name;
      sel.appendChild(o);
    });
  }
  // Populate actuals SKU selector
  const actSku = document.getElementById('act-sku');
  if(actSku){
    actSku.innerHTML = '';
    getAllSKUs().forEach(s=>{
      const o = document.createElement('option');
      o.value = s.name; o.textContent = s.name.length>55 ? s.name.slice(0,53)+'\u2026' : s.name;
      actSku.appendChild(o);
    });
  }
  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  const actDate = document.getElementById('act-date');
  if(actDate && !actDate.value) actDate.value = today;
}

export function nsTypeChange(){
  const t = document.getElementById('ns-type').value;
  document.getElementById('ns-analog-row').style.display  = t==='analog' ? '' : 'none';
  document.getElementById('ns-manual-row').style.display  = t!=='analog' ? '' : 'none';
}
export function nsRampChange(){
  const r = document.getElementById('ns-ramp').value;
  document.getElementById('ns-ramp-wks-row').style.display    = r==='gradual' ? '' : 'none';
  document.getElementById('ns-ramp-custom-row').style.display = r==='custom'  ? '' : 'none';
}
export function nsAnalogPreview(){
  const dpci = document.getElementById('ns-analog').value;
  const velPct = parseFloat(document.getElementById('ns-vel-pct').value)||100;
  const stores  = parseFloat(document.getElementById('ns-stores').value)||1000;
  const prev = document.getElementById('ns-vel-preview');
  if(!prev) return;
  if(!dpci){ prev.textContent='\u2014'; return; }
  const analog = DATA_DP.skus.find(s=>s.dpci===dpci);
  if(!analog){ prev.textContent='\u2014'; return; }
  const l4w = analog.hist.slice(0,12).filter(v=>v>0).slice(-4);
  if(!l4w.length){ prev.textContent='\u2014'; return; }
  const avgTot = l4w.reduce((a,b)=>a+b,0)/l4w.length;
  const upspw  = avgTot / analog.stores;
  const newUpspw = upspw * velPct/100;
  prev.textContent = newUpspw.toFixed(2) + ' UPSPW \u2192 ' + Math.round(newUpspw*stores) + ' u/wk';
}

export function handleAddSKU(){
  const name  = (document.getElementById('ns-name').value||'').trim();
  const cat   = document.getElementById('ns-cat').value;
  const type  = document.getElementById('ns-type').value;
  const price = parseFloat(document.getElementById('ns-price').value)||0;
  const stores= parseInt(document.getElementById('ns-stores').value)||0;
  if(!name){ alert('SKU Name is required.'); return; }
  if(!cat){  alert('Category is required.');  return; }
  if(!price){ alert('Unit Price is required.'); return; }
  if(!stores){ alert('Starting Stores is required.'); return; }

  const analogDpci = document.getElementById('ns-analog').value||null;
  const velPct     = parseFloat(document.getElementById('ns-vel-pct').value)||100;
  const upspw      = parseFloat(document.getElementById('ns-upspw').value)||0;
  const rampType   = document.getElementById('ns-ramp').value;
  const rampWks    = parseInt(document.getElementById('ns-ramp-wks').value)||8;
  const rampCustomRaw = document.getElementById('ns-ramp-custom').value||'';
  const rampCustom = rampCustomRaw.split(',').map(v=>parseFloat(v.trim())).filter(v=>!isNaN(v));

  const newSku = {
    id:   'new-sku-'+Date.now(),
    name, dpci: document.getElementById('ns-dpci').value||('NEW-'+Date.now()),
    category: cat, price, ucase: parseInt(document.getElementById('ns-ucase').value)||12,
    launchDate:  document.getElementById('ns-launch').value||new Date().toISOString().split('T')[0],
    firstShipDate: document.getElementById('ns-ship').value||'',
    stores, baselineUPSPW: upspw,
    promoEligibility:{
      tpc:  document.getElementById('ns-tpc').checked,
      bogo: document.getElementById('ns-bogo').checked,
      dwa:  document.getElementById('ns-dwa').checked
    },
    endcapEligible: document.getElementById('ns-endcap').checked,
    skuType: type,
    analogSkuDpci: type==='analog' ? analogDpci : null,
    analogOverrides: type==='analog' ? {velocityPct: velPct} : {},
    rampType, rampWeeks: rampWks, rampCustom,
    maturityStatus: 'new_launch',
    notes: document.getElementById('ns-notes').value||'',
    createdAt: new Date().toISOString().split('T')[0]
  };

  // Compute forecast
  newSku.fcast = computeNewSkuForecast(newSku);

  // Save
  const arr = getNewSKUs();
  arr.push(newSku);
  saveNewSKUs(arr);

  // Update UI
  renderAddSKUKPIs();
  renderNewSKUList();
  renderAddSKUPreview(newSku);
  // refresh demand plan if visible
  if(window.renderDP && document.getElementById('dp-tbl')) window.renderDP();
  alert('\u2705 "'+name+'" added to forecast! View it in the 52-Week Demand Plan.');
}

export function deleteNewSKU(id){
  if(!confirm('Remove this SKU from the forecast?')) return;
  saveNewSKUs(getNewSKUs().filter(s=>s.id!==id));
  renderNewSKUList();
  renderAddSKUKPIs();
  if(window.renderDP && document.getElementById('dp-tbl')) window.renderDP();
}

export function renderAddSKUKPIs(){
  const el = document.getElementById('addsku-kpis');
  if(!el) return;
  const newSkus = getNewSKUs();
  const totalFcast52 = newSkus.reduce((a,s)=>a+(computeNewSkuForecast(s).reduce((x,y)=>x+y,0)),0);
  const totalRev52   = newSkus.reduce((a,s)=>{
    const fc = computeNewSkuForecast(s);
    return a + fc.reduce((x,y)=>x+y,0)*s.price;
  },0);
  el.innerHTML=
    kpiCard('\uD83D\uDCE6','New SKUs Added','--cc:var(--cy)', newSkus.length,
      'Innovation + line extensions in active forecast','neu','fully modeled in demand plan')+
    kpiCard('\uD83D\uDCCA','52-Wk Fcast Units','--cc:var(--ac)', fmt(totalFcast52),
      'Projected units from new SKUs only','neu','across all 52 forecast weeks')+
    kpiCard('\uD83D\uDCB0','52-Wk Fcast Rev','--cc:var(--gr)', '$'+Math.round(totalRev52/1000)+'K',
      'Revenue contribution of new SKUs','neu','based on unit price \u00d7 forecast')+
    kpiCard('\uD83D\uDE80','Categories Covered','--cc:var(--yw)',
      [...new Set(newSkus.map(s=>s.category))].length||0,
      'Distinct categories with new SKUs','neu','');
}

export function renderNewSKUList(){
  const el = document.getElementById('addsku-list');
  if(!el) return;
  const newSkus = getNewSKUs();
  if(!newSkus.length){
    el.innerHTML='<div style="color:var(--tx3);text-align:center;padding:40px 20px;background:var(--s2);border-radius:10px"><div style="font-size:28px;margin-bottom:8px">\uD83D\uDCE6</div><div>No new SKUs added yet.</div><div style="font-size:11px;margin-top:4px">Fill the form to add your first new SKU to the forecast.</div></div>';
    return;
  }
  let h=`<table class="dt"><thead><tr>
    <th>SKU Name</th><th>Category</th><th>Type</th><th>Maturity</th>
    <th>Stores</th><th>Launch</th><th class="tr">Wk1 Fcast</th><th class="tr">52-Wk Rev</th><th>Actions</th>
  </tr></thead><tbody>`;
  newSkus.forEach(s=>{
    const fc = computeNewSkuForecast(s);
    const wk1 = fc[0]||0;
    const rev52 = fc.reduce((a,b)=>a+b,0)*s.price;
    const matCfg = MATURITY_CFG[s.maturityStatus]||MATURITY_CFG['new_launch'];
    const launchWkIdx = fc.findIndex(v=>v>0);
    const launchLabel = launchWkIdx>=0 ? DATA_DP.fcast_weeks[launchWkIdx]||'Wk '+(launchWkIdx+1) : 'TBD';
    h+=`<tr class="new-sku-row">
      <td style="max-width:200px"><span class="tn" title="${s.name}">${s.name}</span><span class="new-sku-badge">NEW</span></td>
      <td>${s.category}</td>
      <td><span style="font-size:10px;color:var(--tx3)">${s.skuType==='analog'?'Analog':'Innovation'}</span></td>
      <td><span class="${matCfg.cls}">${matCfg.label}</span></td>
      <td class="tr">${fmt(s.stores)}</td>
      <td>${s.launchDate||launchLabel}</td>
      <td class="tr"><b>${fmt(wk1)}</b></td>
      <td class="tr">$${Math.round(rev52/1000)}K</td>
      <td>
        <button class="btn delete-sku-btn" data-sku-id="${s.id}" style="font-size:10px;padding:3px 8px">\u2715 Remove</button>
      </td>
    </tr>`;
    // Show analog source if applicable
    if(s.skuType==='analog' && s.analogSkuDpci){
      const aname = (DATA_DP.skus.find(x=>x.dpci===s.analogSkuDpci)||{}).name||s.analogSkuDpci;
      h+=`<tr class="new-sku-row"><td colspan="9" style="font-size:10.5px;color:var(--tx3);padding:3px 12px 8px">
        \u21B3 Analog: ${aname} \u00b7 ${s.analogOverrides?.velocityPct||100}% velocity
        ${s.notes ? ' \u00b7 '+s.notes : ''}
      </td></tr>`;
    } else if(s.notes) {
      h+=`<tr class="new-sku-row"><td colspan="9" style="font-size:10.5px;color:var(--tx3);padding:3px 12px 8px">\u21B3 ${s.notes}</td></tr>`;
    }
  });
  h+='</tbody></table>';
  el.innerHTML=h;

  // Bind delete buttons
  el.querySelectorAll('.delete-sku-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteNewSKU(btn.dataset.skuId));
  });
}

export function renderAddSKUPreview(sku){
  const panel = document.getElementById('addsku-preview');
  if(!panel) return;
  const fc = computeNewSkuForecast(sku);
  panel.style.display='';
  const canvas = document.getElementById('ch-addsku-preview');
  if(!canvas) return;
  if(canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type:'bar',
    data:{
      labels: DATA_DP.fcast_weeks,
      datasets:[{
        label: sku.name,
        data: fc,
        backgroundColor: fc.map((_,i)=>isOnPromo(i+1,sku.category)?'rgba(255,199,17,.6)':'rgba(0,227,205,.5)'),
        borderRadius:3
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'Units: '+fmt(ctx.parsed.y)}}},
      scales:{
        x:{ticks:{color:'#44608a',font:{size:9},maxRotation:45}},
        y:{ticks:{color:'#44608a',font:{size:10},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}}
      }
    }
  });
}

export function exportNewSKUs(){
  const data = getNewSKUs();
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='ls-new-skus-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
}
export function importNewSKUs(inp){
  const file=inp.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const arr=JSON.parse(e.target.result);
      if(!Array.isArray(arr)) throw new Error('Not an array');
      saveNewSKUs(arr);
      renderNewSKUList(); renderAddSKUKPIs();
      if(window.renderDP && document.getElementById('dp-tbl')) window.renderDP();
      alert('\u2705 Imported '+arr.length+' SKUs.');
    }catch(ex){ alert('Import failed: '+ex.message); }
  };
  reader.readAsText(file);
}

// ─── Export constants for other modules ──────────────────────────────────────
export { CAT_LIFT_TABLE, CAT_AVG_UPSPW, MATURITY_CFG };
