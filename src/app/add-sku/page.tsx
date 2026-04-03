'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP } from '@/data/index';
import { useNewSkus, type NewSku } from '@/context/NewSkuContext';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { fmt } from '@/lib/formatters';

const CATS = ['Baby Snacks', 'Kids Snacks', 'Frozen Multiserve', 'Smoothies', 'YoGos'];
const CAT_AVG_UPSPW: Record<string, number> = { 'Baby Snacks': 11.0, 'Kids Snacks': 8.5, 'Frozen Multiserve': 6.0, 'Smoothies': 9.5, 'YoGos': 5.0 };
const RAMP_TYPES = [{ value: 'gradual', label: 'Gradual (8 wk)' }, { value: 'aggressive', label: 'Aggressive (4 wk)' }, { value: 'flat', label: 'Flat (immediate)' }];

const VIEW_OPTS = [
  { value: 'add', label: '+ Add SKU' },
  { value: 'active', label: 'Active SKUs' },
];

function computeForecast(form: typeof INITIAL_FORM): number[] {
  const basePW = (form.baselineUPSPW || CAT_AVG_UPSPW[form.category] || 8.0) * (form.stores || 1000);
  const planStart = new Date('2026-03-22');
  const launchDate = form.setDate ? new Date(form.setDate) : planStart;
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const launchWkIdx = Math.max(0, Math.floor((launchDate.getTime() - planStart.getTime()) / msPerWeek));

  const rampWeeks = form.rampType === 'aggressive' ? 4 : form.rampType === 'flat' ? 0 : 8;

  const fcast: number[] = [];
  for (let w = 0; w < 52; w++) {
    if (w < launchWkIdx) { fcast.push(0); continue; }
    const weeksLive = w - launchWkIdx;
    let ramp = 1.0;
    if (rampWeeks > 0) ramp = Math.min(1.0, 0.20 + (weeksLive / rampWeeks) * 0.80);
    fcast.push(Math.round(basePW * ramp));
  }

  // Add set PO as a spike in the PO arrival week
  if (form.setPOCases > 0 && form.setPOWeeksBefore > 0) {
    const poWkIdx = Math.max(0, launchWkIdx - form.setPOWeeksBefore);
    if (poWkIdx < 52) {
      fcast[poWkIdx] = Math.max(fcast[poWkIdx], form.setPOCases * (form.unitsPerCase || 12));
    }
  }

  return fcast;
}

const INITIAL_FORM = {
  name: '', caseCode: '', category: 'Baby Snacks', subCategory: '',
  unitsPerCase: 12, unitPrice: 0, casePrice: 0,
  setDate: '2026-04-19', launchDate: '2026-04-19', stores: 1800,
  baselineUPSPW: 0, rampType: 'gradual',
  setPOCases: 500, setPOWeeksBefore: 2,
  promoEligible: true, notes: '',
};

export default function AddSkuPage() {
  const [view, setView] = useState('add');
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [errors, setErrors] = useState<string[]>([]);
  const { newSkus, addSku, removeSku } = useNewSkus();

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  // Preview forecast
  const preview = useMemo(() => computeForecast(form), [form]);
  const total52 = preview.reduce((a, b) => a + b, 0);
  const poArrivalWeek = form.setDate ? Math.max(0, Math.floor((new Date(form.setDate).getTime() - new Date('2026-03-22').getTime()) / (7 * 24 * 3600 * 1000)) - form.setPOWeeksBefore) : 0;

  // Validate
  const validate = useCallback(() => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push('SKU name is required');
    if (!form.category) errs.push('Category is required');
    if (!form.setDate) errs.push('Set date is required');
    if (form.stores <= 0) errs.push('Store count must be positive');
    if (form.setPOCases < 0) errs.push('Set PO cases cannot be negative');
    if (form.unitsPerCase <= 0) errs.push('Units per case must be positive');
    return errs;
  }, [form]);

  const handleAdd = useCallback(() => {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    const fcast = computeForecast(form);
    const sku: NewSku = {
      id: `new-sku-${Date.now()}`,
      name: form.name,
      dpci: form.caseCode || `NEW-${Date.now().toString(36).toUpperCase()}`,
      category: form.category,
      price: form.unitPrice,
      stores: form.stores,
      ucase: form.unitsPerCase,
      launchDate: form.setDate,
      baseUpspw: form.baselineUPSPW || CAT_AVG_UPSPW[form.category] || 8.0,
      fcast,
      rampType: form.rampType,
      skuType: 'innovation',
      promoEligibility: form.promoEligible ? ['TPC', 'DWA', 'BOGO'] : [],
      notes: form.notes,
      caseCode: form.caseCode,
      createdAt: new Date().toISOString(),
    };
    addSku(sku);
    setForm({ ...INITIAL_FORM });
    setView('active');
  }, [form, validate, addSku]);

  return (
    <PageShell
      title="Add a SKU"
      subtitle={`System entry point · ${newSkus.length} new SKUs active · Flows to all modules`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard icon="📦" label="New SKUs" style="--cc:var(--ac)" value={String(newSkus.length)} delta="Active in system" deltaClass="neu" sub="Auto-flows to Launch Ramp, Demand Plan, Shipments" />
        <KpiCard icon="🚀" label="52-Wk Preview" style="--cc:var(--gr)" value={fmt(total52)} delta="Units (current form)" deltaClass="neu" sub={form.name || 'Enter SKU details'} />
        <KpiCard icon="📅" label="Set PO Week" style="--cc:var(--cy)" value={`Wk ${poArrivalWeek + 1}`} delta={`${form.setPOCases} cases, ${form.setPOWeeksBefore}wk before set`} deltaClass="neu" sub="" />
        <KpiCard icon="🏪" label="Stores" style="--cc:var(--pu)" value={fmt(form.stores)} delta={form.category} deltaClass="neu" sub="" />
      </KpiGrid>

      {/* ── Add SKU Form ──────────────────────────────────────────── */}
      {view === 'add' && (
        <div style={{ maxWidth: 800, margin: '16px auto' }}>
          {errors.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {e}</div>)}
            </div>
          )}

          {/* Section A: Core SKU Info */}
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ac)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>A. Core SKU Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>SKU Name *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., Strawberry Mango Smoothie 4oz" style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Case Code</label>
                <input type="text" value={form.caseCode} onChange={e => set('caseCode', e.target.value)} placeholder="e.g., LS-WMR25" style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Category *</label>
                <select value={form.category} onChange={e => set('category', e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Sub-Category</label>
                <input type="text" value={form.subCategory} onChange={e => set('subCategory', e.target.value)} placeholder="e.g., Singles, 4pk" style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Units Per Case *</label>
                <input type="number" value={form.unitsPerCase} onChange={e => set('unitsPerCase', parseInt(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Unit Price ($)</label>
                <input type="number" step="0.01" value={form.unitPrice} onChange={e => set('unitPrice', parseFloat(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
            </div>
          </div>

          {/* Section B: Launch Info */}
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#00CF92', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>B. Launch & Set Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Set Date *</label>
                <input type="date" value={form.setDate} onChange={e => set('setDate', e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Stores at Launch *</label>
                <input type="number" value={form.stores} onChange={e => set('stores', parseInt(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Ramp Type</label>
                <select value={form.rampType} onChange={e => set('rampType', e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  {RAMP_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section C: Set PO */}
          <div className="card" style={{ padding: 20, marginBottom: 12, border: '1px solid rgba(0,227,205,.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cy)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>C. Set PO (Initial Order)</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
              The initial purchase order that hits before set date. This flows into the Shipment Plan as a distinct upfront order before standard replenishment begins.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Set PO Quantity (Cases)</label>
                <input type="number" value={form.setPOCases} onChange={e => set('setPOCases', parseInt(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Weeks Before Set</label>
                <input type="number" min="0" max="8" value={form.setPOWeeksBefore} onChange={e => set('setPOWeeksBefore', parseInt(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Derived PO Arrival Week</label>
                <div style={{ padding: '8px', background: 'rgba(0,227,205,.06)', borderRadius: 6, fontSize: 13, fontWeight: 700, color: 'var(--ac)' }}>
                  Week {poArrivalWeek + 1} ({form.setPOCases * form.unitsPerCase} units)
                </div>
              </div>
            </div>
          </div>

          {/* Section D: Forecast Inputs */}
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFC711', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>D. Forecast Inputs</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Baseline UPSPW (leave 0 for category avg: {CAT_AVG_UPSPW[form.category] ?? 8})</label>
                <input type="number" step="0.1" value={form.baselineUPSPW} onChange={e => set('baselineUPSPW', parseFloat(e.target.value) || 0)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Promo Eligible</label>
                <select value={form.promoEligible ? 'yes' : 'no'} onChange={e => set('promoEligible', e.target.value === 'yes')} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  <option value="yes">Yes — TPC, DWA, BOGO eligible</option>
                  <option value="no">No — not promo eligible</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Launch context, analog SKU reference, special considerations..." style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12, minHeight: 60, resize: 'vertical' }} />
            </div>
          </div>

          {/* Forecast Preview */}
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ac)', marginBottom: 8 }}>FORECAST PREVIEW</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>
              52-week: {fmt(total52)} units · Set PO: {form.setPOCases} cases ({fmt(form.setPOCases * form.unitsPerCase)} units) in Wk {poArrivalWeek + 1}
            </div>
            <BarChart
              labels={DATA_DP.fcast_weeks.slice(0, 26).map(w => w)}
              datasets={[{ label: 'Forecast Units', data: preview.slice(0, 26), backgroundColor: preview.slice(0, 26).map((v, i) => i === poArrivalWeek ? 'rgba(0,227,205,.9)' : 'rgba(99,102,241,.6)') }]}
              height={160}
            />
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>Teal bar = Set PO week · Purple = demand ramp</div>
          </div>

          {/* System Flow Summary */}
          <div style={{ padding: '12px 16px', background: 'rgba(0,227,205,.04)', borderRadius: 8, marginBottom: 12, fontSize: 11, color: 'var(--tx3)', lineHeight: 1.8 }}>
            <b style={{ color: 'var(--ac)' }}>When you add this SKU, it will automatically:</b><br />
            ✅ Appear in <b>Launch Ramp Tracker</b> (Week 1 = set date)<br />
            ✅ Add forecast to <b>Demand Plan</b> (52-week row)<br />
            ✅ Set PO reflected in <b>Shipment Plan</b> (Wk {poArrivalWeek + 1} spike)<br />
            ✅ Included in <b>Executive Summary</b> totals<br />
            ✅ Tagged for <b>Promo Calendar</b> eligibility
          </div>

          <button onClick={handleAdd} style={{ width: '100%', padding: '14px', background: 'var(--ac)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Add SKU to System
          </button>
        </div>
      )}

      {/* ── Active SKUs View ──────────────────────────────────────── */}
      {view === 'active' && (
        <>
          {newSkus.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>No new SKUs added yet. Switch to "+ Add SKU" to get started.</div>
          ) : (
            <DataTable>
              <table style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>SKU</th>
                    <th>Category</th>
                    <th>Case Code</th>
                    <th className="tr">Stores</th>
                    <th className="tr">UPC</th>
                    <th className="tr">52-Wk Units</th>
                    <th className="tr">Set PO</th>
                    <th>Set Date</th>
                    <th>Ramp</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {newSkus.map(s => (
                    <tr key={s.id}>
                      <td className="tn"><b>{s.name}</b></td>
                      <td style={{ fontSize: 10 }}>{s.category}</td>
                      <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ac)' }}>{s.caseCode || s.dpci}</td>
                      <td className="tr">{fmt(s.stores)}</td>
                      <td className="tr">{s.ucase}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{fmt(s.fcast.reduce((a, b) => a + b, 0))}</td>
                      <td className="tr">{s.notes || '—'}</td>
                      <td style={{ fontSize: 11 }}>{s.launchDate}</td>
                      <td style={{ fontSize: 10 }}>{s.rampType}</td>
                      <td>
                        <button onClick={() => removeSku(s.id)} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 4, padding: '2px 8px', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </>
      )}
    </PageShell>
  );
}
