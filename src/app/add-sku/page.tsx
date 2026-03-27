'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP, DATA_PROMO, isOnPromo } from '@/data/index';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { fmt } from '@/lib/formatters';

const LS_NEW_SKUS_KEY = 'ls_ti_new_skus_v1';

const CAT_LIFT_TABLE: Record<string, Record<string, number>> = {
  'Baby Snacks': { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25 },
  'Kids Snacks': { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25 },
  'Frozen Multiserve': { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50 },
  'Smoothies': { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15 },
  'YoGos': { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20 },
};
const CAT_AVG_UPSPW: Record<string, number> = { 'Baby Snacks': 11.0, 'Kids Snacks': 8.5, 'Frozen Multiserve': 6.0, 'Smoothies': 9.5, 'YoGos': 5.0 };
const CATS = ['Baby Snacks', 'Kids Snacks', 'Frozen Multiserve', 'Smoothies', 'YoGos'];

interface NewSku {
  id: string; name: string; dpci: string; category: string; price: number; ucase: number;
  launchDate: string; stores: number; baselineUPSPW: number;
  promoEligibility: { tpc: boolean; bogo: boolean; dwa: boolean }; endcapEligible: boolean;
  skuType: string; analogSkuDpci: string | null; analogOverrides: { velocityPct?: number };
  rampType: string; rampWeeks: number; rampCustom: number[]; notes: string; createdAt: string;
  fcast?: number[];
}

function computeNewSkuForecast(sku: NewSku): number[] {
  let basePW = 0;
  if (sku.skuType === 'analog' && sku.analogSkuDpci) {
    const analog = DATA_DP.skus.find(s => s.dpci === sku.analogSkuDpci);
    if (analog) {
      const cleanHist = analog.hist.slice(0, 12).filter(v => v > 0);
      const l4w = cleanHist.slice(-4);
      const analogUpspw = l4w.length ? l4w.reduce((a, b) => a + b, 0) / l4w.length / analog.stores : (analog.lw_upspw || 0);
      const velPct = (sku.analogOverrides?.velocityPct != null) ? sku.analogOverrides.velocityPct / 100 : 1.0;
      basePW = analogUpspw * velPct * sku.stores;
    }
  }
  if (!basePW) basePW = (sku.baselineUPSPW || CAT_AVG_UPSPW[sku.category] || 8.0) * (sku.stores || 1000);

  const planStart = new Date('2026-03-22');
  const launchDate = sku.launchDate ? new Date(sku.launchDate) : planStart;
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const launchWkIdx = Math.max(0, Math.floor((launchDate.getTime() - planStart.getTime()) / msPerWeek));

  function getRamp(weeksLive: number) {
    if (sku.rampType === 'flat') return 1.0;
    if (sku.rampType === 'custom' && sku.rampCustom?.length > 0) return weeksLive < sku.rampCustom.length ? sku.rampCustom[weeksLive] : 1.0;
    const rw = sku.rampWeeks || 8;
    return Math.min(1.0, 0.20 + (weeksLive / rw) * 0.80);
  }

  const catLifts = CAT_LIFT_TABLE[sku.category] || {};
  function getPromoLift(wkIdx1: number) {
    const events = DATA_PROMO.filter(p => p.wk === wkIdx1 && (!p.category || p.category === sku.category));
    if (!events.length) return 1.0;
    let maxLift = 1.0;
    events.forEach(ev => {
      const t = (ev.type || '').toLowerCase();
      if (t === 'dwa' && sku.promoEligibility?.dwa) maxLift = Math.max(maxLift, catLifts.dwa || 1.0);
      else if (t.includes('bogo') && sku.promoEligibility?.bogo) maxLift = Math.max(maxLift, catLifts.bogo || 1.0);
      else if (t === 'tpc' && sku.promoEligibility?.tpc) maxLift = Math.max(maxLift, catLifts.tpc || 1.0);
    });
    return maxLift;
  }

  const fcast: number[] = [];
  for (let w = 0; w < 52; w++) {
    if (w < launchWkIdx) { fcast.push(0); continue; }
    fcast.push(Math.round(basePW * getRamp(w - launchWkIdx) * getPromoLift(w + 1)));
  }
  return fcast;
}

export default function AddSkuPage() {
  const [newSkus, setNewSkus] = useLocalStorage<NewSku[]>(LS_NEW_SKUS_KEY, []);
  const [previewSku, setPreviewSku] = useState<NewSku | null>(null);

  /* ── Form state ─────────────────────────────────────────────────── */
  const [name, setName] = useState('');
  const [cat, setCat] = useState('');
  const [skuType, setSkuType] = useState('innovation');
  const [price, setPrice] = useState('');
  const [stores, setStores] = useState('');
  const [dpci, setDpci] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [upspw, setUpspw] = useState('');
  const [ucase, setUcase] = useState('12');
  const [analogDpci, setAnalogDpci] = useState('');
  const [velPct, setVelPct] = useState('100');
  const [rampType, setRampType] = useState('gradual');
  const [rampWks, setRampWks] = useState('8');
  const [tpc, setTpc] = useState(true);
  const [bogo, setBogo] = useState(true);
  const [dwa, setDwa] = useState(true);
  const [endcap, setEndcap] = useState(false);
  const [notes, setNotes] = useState('');

  /* ── KPI data ───────────────────────────────────────────────────── */
  const kpiData = useMemo(() => {
    const totalFcast = newSkus.reduce((a, s) => a + computeNewSkuForecast(s).reduce((x, y) => x + y, 0), 0);
    const totalRev = newSkus.reduce((a, s) => a + computeNewSkuForecast(s).reduce((x, y) => x + y, 0) * s.price, 0);
    return { count: newSkus.length, totalFcast, totalRev, cats: [...new Set(newSkus.map(s => s.category))].length };
  }, [newSkus]);

  const handleAdd = useCallback(() => {
    if (!name) { alert('SKU Name is required.'); return; }
    if (!cat) { alert('Category is required.'); return; }
    if (!price) { alert('Unit Price is required.'); return; }
    if (!stores) { alert('Starting Stores is required.'); return; }
    const newSku: NewSku = {
      id: 'new-sku-' + Date.now(), name, dpci: dpci || ('NEW-' + Date.now()),
      category: cat, price: parseFloat(price), ucase: parseInt(ucase) || 12,
      launchDate: launchDate || new Date().toISOString().split('T')[0],
      stores: parseInt(stores), baselineUPSPW: parseFloat(upspw) || 0,
      promoEligibility: { tpc, bogo, dwa }, endcapEligible: endcap,
      skuType, analogSkuDpci: skuType === 'analog' ? analogDpci : null,
      analogOverrides: skuType === 'analog' ? { velocityPct: parseFloat(velPct) } : {},
      rampType, rampWeeks: parseInt(rampWks) || 8, rampCustom: [],
      notes, createdAt: new Date().toISOString().split('T')[0],
    };
    newSku.fcast = computeNewSkuForecast(newSku);
    setNewSkus(prev => [...prev, newSku]);
    setPreviewSku(newSku);
    setName(''); setDpci(''); setPrice(''); setStores(''); setUpspw(''); setNotes('');
  }, [name, cat, skuType, price, stores, dpci, launchDate, upspw, ucase, analogDpci, velPct, rampType, rampWks, tpc, bogo, dwa, endcap, notes, setNewSkus]);

  const handleDelete = useCallback((id: string) => {
    if (confirm('Remove this SKU from the forecast?')) setNewSkus(prev => prev.filter(s => s.id !== id));
  }, [setNewSkus]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(newSkus, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ls-new-skus-' + new Date().toISOString().split('T')[0] + '.json'; a.click();
  }, [newSkus]);

  return (
    <PageShell title="Add New SKU" subtitle="Innovation pipeline · New SKU forecast engine">
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <KpiGrid columns={4}>
          <KpiCard icon="&#128230;" label="New SKUs Added" style="--cc:var(--cy)" value={kpiData.count} delta="In active forecast" deltaClass="neu" sub="Fully modeled in demand plan" />
          <KpiCard icon="&#128202;" label="52-Wk Fcast Units" style="--cc:var(--ac)" value={fmt(kpiData.totalFcast)} delta="Projected from new SKUs" deltaClass="neu" sub="Across all 52 forecast weeks" />
          <KpiCard icon="&#128176;" label="52-Wk Fcast Rev" style="--cc:var(--gr)" value={'$' + Math.round(kpiData.totalRev / 1000) + 'K'} delta="Revenue contribution" deltaClass="neu" sub="Based on unit price x forecast" />
          <KpiCard icon="&#128640;" label="Categories Covered" style="--cc:var(--yw)" value={kpiData.cats || 0} delta="With new SKUs" deltaClass="neu" sub="" />
        </KpiGrid>

        {/* ── New SKU Form ─────────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Add New SKU</div>
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>SKU Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Category *</label>
              <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
                <option value="">Select...</option>{CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Unit Price ($) *</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Starting Stores *</label>
              <input type="number" value={stores} onChange={e => setStores(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>DPCI</label>
              <input type="text" value={dpci} onChange={e => setDpci(e.target.value)} placeholder="Auto-generated if blank" style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Launch Date</label>
              <input type="date" value={launchDate} onChange={e => setLaunchDate(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={skuType} onChange={e => setSkuType(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
                <option value="innovation">Innovation</option><option value="analog">Analog</option>
              </select></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Baseline UPSPW</label>
              <input type="number" step="0.1" value={upspw} onChange={e => setUpspw(e.target.value)} placeholder="Uses category avg if blank" style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            {skuType === 'analog' && (
              <>
                <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Analog SKU</label>
                  <select value={analogDpci} onChange={e => setAnalogDpci(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
                    <option value="">Select...</option>{DATA_DP.skus.map(s => <option key={s.dpci} value={s.dpci}>{s.name.substring(0, 50)}</option>)}
                  </select></div>
                <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Velocity % of Analog</label>
                  <input type="number" value={velPct} onChange={e => setVelPct(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
              </>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Promo Eligibility</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ color: 'var(--tx2)' }}><input type="checkbox" checked={tpc} onChange={e => setTpc(e.target.checked)} /> TPC</label>
                <label style={{ color: 'var(--tx2)' }}><input type="checkbox" checked={bogo} onChange={e => setBogo(e.target.checked)} /> BOGO</label>
                <label style={{ color: 'var(--tx2)' }}><input type="checkbox" checked={dwa} onChange={e => setDwa(e.target.checked)} /> DWA</label>
                <label style={{ color: 'var(--tx2)' }}><input type="checkbox" checked={endcap} onChange={e => setEndcap(e.target.checked)} /> Endcap</label>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} style={{ background: 'var(--ac)', color: '#000', border: 'none', borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Add SKU</button>
              <button onClick={handleExport} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '5px 13px', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11.5 }}>Export SKUs</button>
            </div>
          </div>
        </div>

        {/* ── Existing SKU List ────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">New SKUs in Forecast</div>
          {newSkus.length === 0 ? (
            <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: '40px 20px' }}>No new SKUs added yet. Fill the form above to add your first new SKU.</div>
          ) : (
            <DataTable>
              <table className="dt">
                <thead><tr>
                  <th>SKU Name</th><th>Category</th><th>Type</th><th>Stores</th><th>Launch</th><th className="tr">Wk1 Fcast</th><th className="tr">52-Wk Rev</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {newSkus.map(s => {
                    const fc = computeNewSkuForecast(s);
                    const rev52 = fc.reduce((a, b) => a + b, 0) * s.price;
                    return (
                      <tr key={s.id}>
                        <td style={{ maxWidth: 200 }}>{s.name} <span style={{ fontSize: 9, background: 'rgba(0,227,205,.15)', color: 'var(--ac)', borderRadius: 3, padding: '1px 5px' }}>NEW</span></td>
                        <td>{s.category}</td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.skuType === 'analog' ? 'Analog' : 'Innovation'}</td>
                        <td className="tr">{fmt(s.stores)}</td>
                        <td>{s.launchDate}</td>
                        <td className="tr"><b>{fmt(fc[0])}</b></td>
                        <td className="tr">${Math.round(rev52 / 1000)}K</td>
                        <td><button onClick={() => handleDelete(s.id)} className="btn" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--rd)' }}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          )}
        </div>

        {/* ── Preview Chart ────────────────────────────────────────────── */}
        {previewSku && (
          <div className="cc">
            <div className="ct">Forecast Preview — {previewSku.name}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={DATA_DP.fcast_weeks}
                datasets={[{
                  label: previewSku.name,
                  data: computeNewSkuForecast(previewSku),
                  backgroundColor: 'rgba(0,227,205,.5)',
                }]}
                height={200}
              />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
