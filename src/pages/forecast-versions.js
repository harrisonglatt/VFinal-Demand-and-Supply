// ─── FORECAST VERSIONS (Lock / Compare / Audit) ─────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 4291–4667)

import {
  DATA_DAILY, DATA_DP, DATA_PROMO, DATA_ENDCAP_HISTORY,
  FCAST_REV_52WK, PROMO_WKS
} from '../data/index.js';
import { fmt, fmtDol, sf, fmtP } from '../utils/formatters.js';
import { kpiCard } from '../utils/dom.js';
import { pgInited } from '../utils/state.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const LS_LOCK_KEY = 'ls_ti_fc_locks_v2';

// Historical promo week mapping (hist index → DATA_ENDCAP_HISTORY)
const HIST_PROMO_MAP = {
  1: {cat:'Frozen Multiserve', lift:1.43, type:'endcap'},
  2: {cat:'Frozen Multiserve', lift:1.53, type:'endcap'},
  3: {cat:'Frozen Multiserve', lift:1.48, type:'endcap'},
  4: {cat:'Frozen Multiserve', lift:1.51, type:'endcap'},
  5: {cat:'Frozen Multiserve', lift:1.91, type:'endcap+bogo'}
};
const HIST_CLEAN_INDICES = [0,6,7,8,9,10,11];

const HIST_FROZEN_BASE = (()=>{
  const frozenSkus = DATA_DP.skus.filter(s=>s.category==='Frozen Multiserve');
  const cleanIdx = [6,7,8,9,10,11];
  const total = frozenSkus.reduce((acc,s)=>{
    const avg = cleanIdx.reduce((a,i)=>a+(s.hist[i]||0),0)/cleanIdx.length;
    return acc+avg;
  },0);
  return Math.round(total);
})();
const HIST_FROZEN_PRICE = 8.25;

// ─── STATE ──────────────────────────────────────────────────────────────────
let _activeLockId = null;

// ─── LOCK STORAGE HELPERS ───────────────────────────────────────────────────
export function _getLocks(){
  try{return JSON.parse(localStorage.getItem(LS_LOCK_KEY)||'[]');}
  catch(e){return [];}
}
export function _saveLocks(arr){
  try{localStorage.setItem(LS_LOCK_KEY,JSON.stringify(arr));}
  catch(e){console.warn('Lock save failed',e);}
}
export function getActiveLock(){
  if(!_activeLockId) return null;
  return _getLocks().find(l=>l.id===_activeLockId)||null;
}

// ─── Helper: get current scenario from window (set by other modules) ────────
function _getScenario(){
  return window._scS || 'base';
}

// ─── HTML escape ────────────────────────────────────────────────────────────
export function escH(s){return (s||'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]||m));}

// ─── LOCK CREATION ──────────────────────────────────────────────────────────
export function lockCurrentForecast(name, note){
  const locks = _getLocks();
  const now = new Date();
  const liftTable = {
    'Baby Snacks':       {tpc:1.20,bogo:1.55,dwa:1.60,endcap:1.25},
    'Kids Snacks':       {tpc:1.25,bogo:1.55,dwa:1.45,endcap:1.25},
    'Frozen Multiserve': {tpc:1.10,bogo:1.60,dwa:1.60,endcap:1.50},
    'Smoothies':         {tpc:1.35,bogo:1.45,dwa:1.45,endcap:1.15},
    'YoGos':             {tpc:1.25,bogo:1.45,dwa:1.50,endcap:1.20}
  };
  const snap = {
    id: now.getTime(),
    name: name || ('Lock '+(locks.length+1)+' \u2014 '+now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})),
    note: note||'',
    ts: now.toISOString(),
    scenario: _getScenario(),
    fcast_weeks: [...DATA_DP.fcast_weeks],
    skus: DATA_DP.skus.map(s=>({
      dpci:s.dpci, name:s.name, cat:s.category,
      price:s.price, ucase:s.ucase,
      fcast:[...s.fcast], hist:[...s.hist]
    })),
    rev52: [...FCAST_REV_52WK],
    promoEvents: DATA_PROMO.map(p=>Object.assign({},p)),
    liftTable,
    totalUnits52: DATA_DP.skus.reduce((a,s)=>a+s.fcast.reduce((b,v)=>b+(v||0),0),0),
    totalRev52: FCAST_REV_52WK.reduce((a,b)=>a+b,0),
    totalCases52: DATA_DP.skus.reduce((a,s)=>a+s.fcast.reduce((b,v)=>b+Math.ceil((v||0)/s.ucase),0),0),
    auditLog: _buildAuditLog()
  };
  locks.unshift(snap);
  if(locks.length>25) locks.length=25;
  _saveLocks(locks);
  return snap;
}

export function _buildAuditLog(){
  return {
    timestamp: new Date().toISOString(),
    dataAsOf: DATA_DAILY.as_of,
    promoWeeks: DATA_PROMO.filter(p=>p.wk>0).map(p=>({wk:p.wk,event:p.event,lift_pct:p.lift_pct})),
    forecastWindow: (DATA_DP.fcast_weeks[0]||'')+'\u2013'+(DATA_DP.fcast_weeks[51]||''),
    totalPromoEvents: DATA_PROMO.filter(p=>p.wk>0).length,
    stackingRule: 'max(DWA,BOGO); endcap+BOGO=base\u00d7endcap\u00d71.35x incremental',
    generatedBy: 'LS Target Demand Intelligence v2.0'
  };
}

export function deleteLock(id){
  let locks=_getLocks().filter(l=>l.id!==id);
  _saveLocks(locks);
  if(_activeLockId===id) _activeLockId=null;
  initFCASTVER();
}

export function setActiveLock(id){
  _activeLockId=(id===_activeLockId)?null:id; // toggle
  if(pgInited.avf){pgInited.avf=false; if(window.initAVF) window.initAVF();}
  initFCASTVER();
}

export function exportLocks(){
  const locks=_getLocks();
  if(!locks.length){alert('No locks to export.');return;}
  const blob=new Blob([JSON.stringify({
    exported: new Date().toISOString(),
    tool: 'LS Target Demand Intelligence v2.0',
    locks
  },null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='LS-forecast-locks-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
}

export function importLocksFile(file){
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const parsed=JSON.parse(e.target.result);
      const arr=Array.isArray(parsed)?parsed:(parsed.locks||[]);
      if(!arr.length) throw new Error('Empty');
      _saveLocks(arr);
      alert('Imported '+arr.length+' lock(s).');
      initFCASTVER();
    }catch(err){alert('Import failed: '+err.message);}
  };
  rd.readAsText(file);
}

// ─── FORECAST VERSIONS UI ───────────────────────────────────────────────────
export function initFCASTVER(){
  const kpisEl=document.getElementById('fcastver-kpis');
  const contentEl=document.getElementById('fcastver-content');
  if(!kpisEl||!contentEl) return;

  const locks=_getLocks();
  const activeLock=getActiveLock();
  const liveTotU=DATA_DP.skus.reduce((a,s)=>a+s.fcast.reduce((b,v)=>b+(v||0),0),0);
  const liveTotR=FCAST_REV_52WK.reduce((a,b)=>a+b,0);

  // ── KPIs ────────────────────────────────────────────────────────────────
  let kh='';
  if(activeLock){
    const dU=(liveTotU-activeLock.totalUnits52)/activeLock.totalUnits52;
    const dR=(liveTotR-activeLock.totalRev52)/activeLock.totalRev52;
    kh+=kpiCard('\uD83D\uDD12','Active Baseline','--cc:var(--ac)',
      escH(activeLock.name.substring(0,22)),
      new Date(activeLock.ts).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),
      'neu', activeLock.scenario.toUpperCase()+' scenario');
    kh+=kpiCard('\uD83D\uDCE6','52-Wk Units \u0394','--cc:'+(Math.abs(dU)<0.02?'var(--gr)':dU>0?'var(--yw)':'var(--rd)'),
      (dU>=0?'+':'')+(dU*100).toFixed(1)+'%',
      fmt(liveTotU)+' live \u00b7 '+fmt(activeLock.totalUnits52)+' locked',
      dU>0.005?'up':dU<-0.005?'dn':'neu',
      fmt(Math.abs(Math.round(liveTotU-activeLock.totalUnits52)))+' unit delta');
    kh+=kpiCard('\uD83D\uDCB0','52-Wk Revenue \u0394','--cc:'+(Math.abs(dR)<0.02?'var(--gr)':dR>0?'var(--yw)':'var(--rd)'),
      (dR>=0?'+':'')+(dR*100).toFixed(1)+'%',
      fmtDol(liveTotR)+' live \u00b7 '+fmtDol(activeLock.totalRev52)+' locked',
      dR>0.005?'up':dR<-0.005?'dn':'neu',
      fmtDol(Math.abs(Math.round(liveTotR-activeLock.totalRev52)))+' rev delta');
  }
  kh+=kpiCard('\uD83D\uDCCB','Saved Versions','--cc:var(--cy)',locks.length,
    activeLock?'Baseline: '+escH(activeLock.name.substring(0,18)):'No baseline selected',
    'neu', 'Click any version to set as comparison baseline');
  kpisEl.innerHTML=kh;

  // ── Lock creation form ─────────────────────────────────────────────────
  let h=`<div class="cc" style="margin-bottom:16px">
    <div class="ct">\uD83D\uDD12 Lock Current Forecast</div>
    <div style="font-size:12px;color:var(--tx3);margin-bottom:12px;line-height:1.6">
      Creates an immutable snapshot of the current 52-week forecast, velocity assumptions, promo lifts,
      stacking rules, and scenario. Locked forecasts <strong>do not change</strong> when live assumptions are edited.
      Use these as baseline anchors for finance sign-off or plan-of-record tracking.
    </div>
    <div style="display:grid;grid-template-columns:2fr 3fr auto;gap:10px;align-items:start">
      <input id="lock-name-inp" type="text" placeholder="Version name (e.g. Mar 25 Base Plan)"
        style="background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 12px;color:var(--tx);font-family:Roboto,sans-serif;font-size:13px">
      <input id="lock-note-inp" type="text" placeholder="Note for stakeholders (optional)"
        style="background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 12px;color:var(--tx);font-family:Roboto,sans-serif;font-size:13px">
      <button id="lock-now-btn"
        style="background:var(--ac);color:#000;border:none;border-radius:6px;padding:9px 20px;
               cursor:pointer;font-weight:700;font-size:13px;white-space:nowrap">
        \uD83D\uDD12 Lock Now
      </button>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="export-locks-btn" style="background:var(--s2);border:1px solid var(--bd);border-radius:5px;
        padding:5px 13px;color:var(--tx3);cursor:pointer;font-size:11.5px">\u2B07 Export (.json)</button>
      <label style="background:var(--s2);border:1px solid var(--bd);border-radius:5px;
        padding:5px 13px;color:var(--tx3);cursor:pointer;font-size:11.5px">
        \u2B06 Import (.json)
        <input id="import-locks-inp" type="file" accept=".json" style="display:none">
      </label>
    </div>
  </div>`;

  // ── Versions table ─────────────────────────────────────────────────────
  if(!locks.length){
    h+='<div class="cc" style="text-align:center;padding:40px;color:var(--tx3);font-size:13.5px">'+
       'No forecast locks yet.<br><span style="font-size:12px">Lock your current forecast above to start tracking.</span></div>';
  } else {
    h+=`<div class="cc">
      <div class="ct" style="display:flex;justify-content:space-between;align-items:center">
        <span>\uD83D\uDCCB Saved Forecast Versions</span>
        <span style="font-size:11px;color:var(--tx3);font-weight:400">
          ${activeLock?'Baseline: <b style="color:var(--ac)">'+escH(activeLock.name.substring(0,25))+'</b>':'Click a version to set as comparison baseline'}
        </span>
      </div>
      <table class="dt"><thead><tr>
        <th>Version</th><th>Locked</th><th>Scenario</th>
        <th class="tr">52-wk Units</th><th class="tr">52-wk Cases</th><th class="tr">52-wk Revenue</th>
        <th>Note</th><th style="text-align:center">Actions</th>
      </tr></thead><tbody>`;

    locks.forEach(lk=>{
      const isActive=_activeLockId===lk.id;
      const dt=new Date(lk.ts);
      const dU=lk.totalUnits52?(liveTotU-lk.totalUnits52)/lk.totalUnits52:0;
      const scCols={bear:'var(--rd)',base:'var(--gr)',bull:'var(--pu)'};
      const scBgs={bear:'rgba(239,68,68,.12)',base:'rgba(0,207,146,.12)',bull:'rgba(220,123,255,.12)'};
      h+=`<tr style="${isActive?'background:rgba(0,227,205,.05);outline:1px solid rgba(0,227,205,.25)':''}">
        <td><b style="color:${isActive?'var(--ac)':'var(--tx)'}">${isActive?'\u2713 ':''}${escH(lk.name)}</b></td>
        <td style="font-size:11px;color:var(--tx3)">
          ${dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}<br>
          ${dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
        </td>
        <td><span class="ch" style="background:${scBgs[lk.scenario]||scBgs.base};color:${scCols[lk.scenario]||scCols.base}">
          ${lk.scenario||'base'}
        </span></td>
        <td class="tr">
          ${fmt(lk.totalUnits52)}
          <div style="font-size:9.5px;color:${Math.abs(dU)<0.01?'var(--tx3)':dU>0?'var(--gr)':'var(--rd)'}">
            ${dU>=0?'\u2191':'\u2193'}${(Math.abs(dU)*100).toFixed(1)}% vs live
          </div>
        </td>
        <td class="tr">${fmt(lk.totalCases52||0)}</td>
        <td class="tr">${fmtDol(lk.totalRev52)}</td>
        <td style="font-size:11px;color:var(--tx3);max-width:200px;white-space:normal">${escH(lk.note||'\u2014')}</td>
        <td style="text-align:center;white-space:nowrap">
          <button data-action="set-baseline" data-lock-id="${lk.id}"
            style="background:${isActive?'rgba(0,227,205,.15)':'var(--s2)'};border:1px solid ${isActive?'rgba(0,227,205,.4)':'var(--bd)'};
                   border-radius:5px;padding:4px 10px;color:${isActive?'var(--ac)':'var(--tx3)'};cursor:pointer;font-size:11px;margin-right:4px">
            ${isActive?'\u2713 Active':'Set Baseline'}
          </button>
          <button data-action="delete-lock" data-lock-id="${lk.id}" data-lock-name="${escH(lk.name).replace(/'/g,"\\'")}"
            style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);
                   border-radius:5px;padding:4px 8px;color:var(--rd);cursor:pointer;font-size:11px">\uD83D\uDDD1</button>
        </td>
      </tr>`;
    });
    h+='</tbody></table></div>';

    // ── Weekly variance table if baseline is set ─────────────────────────
    if(activeLock){
      h+=buildWeeklyVarianceTable(activeLock);
      h+=buildAuditTrail(activeLock);
    }
  }

  contentEl.innerHTML=h;

  // ── Bind event listeners (replacing inline onclick) ────────────────────
  const lockNowBtn = document.getElementById('lock-now-btn');
  if(lockNowBtn){
    lockNowBtn.addEventListener('click', ()=>{
      const nm=document.getElementById('lock-name-inp').value.trim();
      const nt=document.getElementById('lock-note-inp').value.trim();
      lockCurrentForecast(nm,nt);
      document.getElementById('lock-name-inp').value='';
      document.getElementById('lock-note-inp').value='';
      initFCASTVER();
    });
  }
  const exportBtn = document.getElementById('export-locks-btn');
  if(exportBtn) exportBtn.addEventListener('click', exportLocks);
  const importInp = document.getElementById('import-locks-inp');
  if(importInp) importInp.addEventListener('change', ()=> importLocksFile(importInp.files[0]));

  // Delegate table action buttons
  contentEl.querySelectorAll('[data-action="set-baseline"]').forEach(btn=>{
    btn.addEventListener('click', ()=> setActiveLock(Number(btn.dataset.lockId)));
  });
  contentEl.querySelectorAll('[data-action="delete-lock"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm('Delete \''+btn.dataset.lockName+'\' ?')) deleteLock(Number(btn.dataset.lockId));
    });
  });
}

export function buildWeeklyVarianceTable(lock){
  let h=`<div class="cc" style="margin-top:16px">
    <div class="ct">\uD83D\uDCCA Week-by-Week: Live vs Locked Forecast</div>
    <div style="font-size:11.5px;color:var(--tx3);margin-bottom:10px">
      Baseline: <b style="color:var(--ac)">${escH(lock.name)}</b> locked
      ${new Date(lock.ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
    </div>
    <div style="overflow-x:auto">
    <table class="dt"><thead><tr>
      <th>Week</th>
      <th class="tr">Locked Units</th><th class="tr">Live Units</th>
      <th class="tr">\u0394 Units</th><th class="tr">\u0394 %</th>
      <th class="tr">Locked Rev</th><th class="tr">Live Rev</th>
      <th class="tr">\u0394 Rev</th><th>Promo</th>
    </tr></thead><tbody>`;

  let cumLockU=0,cumLiveU=0,cumLockR=0,cumLiveR=0;
  DATA_DP.fcast_weeks.forEach((wk,i)=>{
    const lockU=lock.skus.reduce((a,s)=>a+(sf(s.fcast[i])||0),0);
    const liveU=DATA_DP.skus.reduce((a,s)=>a+(sf(s.fcast[i])||0),0);
    const lockR=sf(lock.rev52[i]);
    const liveR=sf(FCAST_REV_52WK[i]);
    const dU=liveU-lockU, dR=liveR-lockR;
    const dPct=lockU?(dU/lockU):0;
    cumLockU+=lockU;cumLiveU+=liveU;cumLockR+=lockR;cumLiveR+=liveR;
    const isPromo=PROMO_WKS&&PROMO_WKS.has(i+1);
    const cls=Math.abs(dPct)<0.02?'':dU>0?'up':'dn';
    h+=`<tr style="${isPromo?'background:rgba(255,199,17,.04)':''}">
      <td style="font-size:11.5px;color:${isPromo?'var(--yw)':'var(--tx)'}">${wk}</td>
      <td class="tr">${fmt(lockU)}</td>
      <td class="tr">${fmt(liveU)}</td>
      <td class="tr ${cls}">${dU>=0?'+':''}${fmt(Math.round(dU))}</td>
      <td class="tr ${cls}">${dU>=0?'+':''}${(dPct*100).toFixed(1)}%</td>
      <td class="tr">${fmtDol(lockR)}</td>
      <td class="tr">${fmtDol(liveR)}</td>
      <td class="tr ${dR>=0?'up':'dn'}">${dR>=0?'+':'\u2212'}${fmtDol(Math.abs(dR))}</td>
      <td style="font-size:10px;color:var(--yw)">${isPromo?'\u2B50':'\u2014'}</td>
    </tr>`;
  });
  const totDU=cumLiveU-cumLockU, totDR=cumLiveR-cumLockR;
  const totDPct=cumLockU?(totDU/cumLockU):0;
  h+=`<tr style="background:var(--s3);font-weight:700;border-top:2px solid var(--bd)">
    <td>TOTAL 52WK</td>
    <td class="tr">${fmt(cumLockU)}</td><td class="tr">${fmt(cumLiveU)}</td>
    <td class="tr ${totDU>=0?'up':'dn'}">${totDU>=0?'+':''}${fmt(Math.round(totDU))}</td>
    <td class="tr ${totDPct>=0?'up':'dn'}">${totDU>=0?'+':''}${(totDPct*100).toFixed(1)}%</td>
    <td class="tr">${fmtDol(cumLockR)}</td><td class="tr">${fmtDol(cumLiveR)}</td>
    <td class="tr ${totDR>=0?'up':'dn'}">${totDR>=0?'+':'\u2212'}${fmtDol(Math.abs(totDR))}</td>
    <td></td>
  </tr>`;
  h+='</tbody></table></div></div>';
  return h;
}

export function buildAuditTrail(lock){
  const al=lock.auditLog||{};
  return `<div class="cc" style="margin-top:16px">
    <div class="ct">\uD83E\uDDFE Forecast Audit Trail \u2014 ${escH(lock.name)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;line-height:1.7">
      <div>
        <div style="color:var(--tx3)">Locked</div>
        <div style="color:var(--tx)">${new Date(lock.ts).toLocaleString('en-US',{dateStyle:'long',timeStyle:'short'})}</div>
        <div style="color:var(--tx3);margin-top:8px">Scenario</div>
        <div style="color:var(--tx)">${lock.scenario||'base'}</div>
        <div style="color:var(--tx3);margin-top:8px">Forecast Window</div>
        <div style="color:var(--tx)">${al.forecastWindow||'\u2014'}</div>
        <div style="color:var(--tx3);margin-top:8px">Data As-Of</div>
        <div style="color:var(--tx)">${al.dataAsOf||'\u2014'}</div>
      </div>
      <div>
        <div style="color:var(--tx3)">Promo Events Included</div>
        <div style="color:var(--tx)">${al.totalPromoEvents||0} events</div>
        <div style="color:var(--tx3);margin-top:8px">Stacking Rule</div>
        <div style="color:var(--tx);font-size:11px">${al.stackingRule||'\u2014'}</div>
        <div style="color:var(--tx3);margin-top:8px">Total SKUs</div>
        <div style="color:var(--tx)">${lock.skus?lock.skus.length:0} SKUs</div>
        <div style="color:var(--tx3);margin-top:8px">Generated By</div>
        <div style="color:var(--tx)">${al.generatedBy||'LS Target Demand Intelligence'}</div>
      </div>
    </div>
    <div style="margin-top:12px;border-top:1px solid var(--bd);padding-top:12px">
      <div style="font-size:11px;color:var(--tx3);font-weight:700;margin-bottom:6px">LIFT ASSUMPTIONS AT LOCK TIME</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${Object.entries(lock.liftTable||{}).map(([cat,d])=>
          `<span style="font-size:11px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 8px;color:var(--tx)">
            <b style="color:var(--ac2)">${cat.split(' ')[0]}</b>
            TPC ${(d.tpc).toFixed(2)}x \u00b7 BOGO ${(d.bogo).toFixed(2)}x \u00b7 DWA ${(d.dwa).toFixed(2)}x \u00b7 Endcap ${(d.endcap).toFixed(2)}x
          </span>`
        ).join('')}
      </div>
    </div>
  </div>`;
}

// ─── Exported constants for other modules ────────────────────────────────────
export { HIST_PROMO_MAP, HIST_CLEAN_INDICES, HIST_FROZEN_BASE, HIST_FROZEN_PRICE };
