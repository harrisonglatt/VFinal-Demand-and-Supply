'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import { DATA_DP } from '@/data/index';
import { useOverrides } from '@/hooks/useOverrides';
import { usePromo, computeLift } from '@/context/PromoContext';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { fmt } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'lifts', label: 'Promo Lifts' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'overrides', label: 'Active Overrides' },
];

const CATEGORIES = ['Baby Snacks', 'Kids Snacks', 'Frozen Multiserve', 'Smoothies', 'YoGos'];
const PROMO_TYPES = ['TPC', 'Co-Space', 'DWA', 'Circle', 'BOGO'];

export default function AssumptionsPage() {
  const [view, setView] = useState('lifts');
  const [toast, setToast] = useState<string | null>(null);
  const { state, setVel, clearVel, resetAll, overrideCount } = useOverrides();
  const promo = usePromo();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Lift matrix from PromoContext ──────────────────────────────── */
  const liftMatrix = useMemo(() => {
    return CATEGORIES.map(cat => ({
      category: cat,
      lifts: PROMO_TYPES.map(type => {
        const result = computeLift(type, cat);
        return { type, ...result };
      }),
    }));
  }, []);

  /* ── Velocity overrides ─────────────────────────────────────────── */
  const velRows = useMemo(() => {
    return DATA_DP.skus.map(s => ({
      name: s.name.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 35),
      dpci: s.dpci,
      category: s.category,
      defaultVel: s.lw_upspw,
      currentVel: state.velOverrides[s.dpci] ?? s.lw_upspw,
      isOverridden: state.velOverrides[s.dpci] !== undefined,
      stores: s.stores,
    }));
  }, [state.velOverrides]);

  const activeOverrides = useMemo(() => {
    const items: { scope: string; type: string; key: string; defaultVal: string; currentVal: string; timestamp: string }[] = [];

    // Velocity overrides
    for (const [dpci, val] of Object.entries(state.velOverrides)) {
      const sku = DATA_DP.skus.find(s => s.dpci === dpci);
      items.push({
        scope: 'SKU',
        type: 'Velocity (UPSPW)',
        key: sku?.name?.substring(0, 30) ?? dpci,
        defaultVal: (sku?.lw_upspw ?? 0).toFixed(2),
        currentVal: val.toFixed(2),
        timestamp: 'Current session',
      });
    }

    // Lift overrides
    for (const [key, val] of Object.entries(state.liftOverrides)) {
      items.push({
        scope: 'Category',
        type: 'Lift Override',
        key,
        defaultVal: '—',
        currentVal: `×${val.toFixed(2)}`,
        timestamp: 'Current session',
      });
    }

    // UPC overrides
    for (const [dpci, val] of Object.entries(state.upcOverrides)) {
      const sku = DATA_DP.skus.find(s => s.dpci === dpci);
      items.push({
        scope: 'SKU',
        type: 'Units/Case',
        key: sku?.name?.substring(0, 30) ?? dpci,
        defaultVal: String(sku?.ucase ?? 12),
        currentVal: String(val),
        timestamp: 'Current session',
      });
    }

    return items;
  }, [state]);

  return (
    <PageShell
      title="Assumptions & Overrides"
      subtitle="Central control panel · Changes flow to all modules instantly"
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 20, background: 'var(--ac)', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}

      <KpiGrid columns={4}>
        <KpiCard icon="🎛️" label="Active Overrides" style={`--cc:${overrideCount > 0 ? 'var(--yw)' : 'var(--gr)'}`} value={String(overrideCount)} delta={overrideCount > 0 ? 'Manual adjustments active' : 'All defaults'} deltaClass={overrideCount > 0 ? 'neu' : 'up'} sub="" />
        <KpiCard icon="📊" label="Promo Lift Sources" style="--cc:var(--ac)" value={`${CATEGORIES.length * PROMO_TYPES.length}`} delta={`${CATEGORIES.length} categories × ${PROMO_TYPES.length} types`} deltaClass="neu" sub="Category × type lift matrix" />
        <KpiCard icon="📦" label="SKUs in Model" style="--cc:var(--cy)" value={String(DATA_DP.skus.length)} delta={`${velRows.filter(v => v.isOverridden).length} with velocity overrides`} deltaClass="neu" sub="" />
        <KpiCard icon="🔄" label="Reset All" style="--cc:var(--rd)" value={overrideCount > 0 ? 'Reset' : '—'} delta={overrideCount > 0 ? 'Click to clear all overrides' : 'No overrides active'} deltaClass={overrideCount > 0 ? 'dn' : 'neu'} sub="" />
      </KpiGrid>

      {overrideCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={() => { resetAll(); showToast('All overrides reset to defaults'); }} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, padding: '6px 16px', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Reset All Overrides ({overrideCount})
          </button>
        </div>
      )}

      {/* ── Promo Lift Matrix ─────────────────────────────────────── */}
      {view === 'lifts' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 12, marginBottom: 8 }}>
            Lift assumptions by category × promo type. Sources: H = Historical actuals, E = Category estimate, Blended = mixed. These drive the Promo Calendar → Demand Plan → Shipment Plan chain.
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Category</th>
                  {PROMO_TYPES.map(t => <th key={t} className="tr" style={{ minWidth: 90 }}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {liftMatrix.map(row => (
                  <tr key={row.category}>
                    <td style={{ fontWeight: 700 }}>{row.category}</td>
                    {row.lifts.map(l => (
                      <td key={l.type} className="tr" title={l.source}>
                        <div style={{ fontWeight: 700, color: l.liftPct > 30 ? '#00CF92' : l.liftPct > 15 ? 'var(--ac)' : 'var(--tx2)' }}>
                          +{l.liftPct}%
                        </div>
                        <div style={{ fontSize: 9, color: l.confidence === 'high' ? 'var(--gr)' : l.confidence === 'medium' ? 'var(--yw)' : 'var(--tx3)' }}>
                          {l.confidence === 'high' ? '●' : l.confidence === 'medium' ? '◐' : '○'} {l.confidence}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(0,227,205,.04)', borderRadius: 8, fontSize: 11, color: 'var(--tx3)', lineHeight: 1.8 }}>
            <b style={{ color: 'var(--ac)' }}>How lifts flow:</b> Promo Calendar defines events → PromoContext computes lifts using this matrix → Demand Plan applies lift to base forecast → Shipment Plan adjusts cases → Executive Summary reflects promo-adjusted totals.<br />
            <b>Confidence:</b> ● High = 2+ historical events | ◐ Medium = 1 event + model | ○ Low = estimate only
          </div>
        </>
      )}

      {/* ── Velocity Overrides ────────────────────────────────────── */}
      {view === 'velocity' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 12, marginBottom: 8 }}>
            Velocity (UPSPW) drives the base demand forecast. Override here to adjust a SKU&apos;s expected weekly sell-through rate. Changes flow immediately to Demand Plan, Shipment Plan, and Executive Summary.
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>SKU</th>
                  <th>Category</th>
                  <th className="tr">Stores</th>
                  <th className="tr">Default UPSPW</th>
                  <th className="tr" style={{ minWidth: 120 }}>Current UPSPW</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {velRows.map(r => (
                  <tr key={r.dpci} style={{ background: r.isOverridden ? 'rgba(255,199,17,.04)' : undefined }}>
                    <td className="tn"><b>{r.name}</b></td>
                    <td style={{ fontSize: 10 }}>{r.category}</td>
                    <td className="tr">{fmt(r.stores)}</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>{r.defaultVel.toFixed(2)}</td>
                    <td className="tr">
                      <input
                        type="number" step="0.1" min="0" value={r.currentVel.toFixed(2)}
                        onChange={e => { setVel(r.dpci, parseFloat(e.target.value) || 0); showToast(`Velocity updated: ${r.name}`); }}
                        style={{ width: 80, background: r.isOverridden ? 'rgba(255,199,17,.1)' : 'var(--s2)', border: `1px solid ${r.isOverridden ? 'rgba(255,199,17,.3)' : 'var(--bd)'}`, borderRadius: 4, padding: '3px 6px', color: r.isOverridden ? '#FFC711' : 'var(--tx)', fontSize: 12, textAlign: 'right', fontWeight: r.isOverridden ? 700 : 400 }}
                      />
                    </td>
                    <td>
                      {r.isOverridden ? (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,199,17,.12)', color: '#FFC711' }}>Override</span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Default</span>
                      )}
                    </td>
                    <td>
                      {r.isOverridden && (
                        <button onClick={() => { clearVel(r.dpci); showToast(`Reset: ${r.name}`); }} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 4, padding: '2px 8px', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>Reset</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── Active Overrides View ─────────────────────────────────── */}
      {view === 'overrides' && (
        <>
          {activeOverrides.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--gr)', fontSize: 13, marginTop: 16 }}>
              ✅ No active overrides. All modules running on system defaults.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 12, marginBottom: 8 }}>
                All active manual overrides. Each flows through to downstream modules in real-time.
              </div>
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th>Scope</th>
                      <th>Type</th>
                      <th style={{ minWidth: 180 }}>Item</th>
                      <th className="tr">Default</th>
                      <th className="tr">Current</th>
                      <th>Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOverrides.map((o, i) => (
                      <tr key={i} style={{ background: 'rgba(255,199,17,.04)' }}>
                        <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: o.scope === 'SKU' ? 'rgba(99,102,241,.1)' : 'rgba(0,207,146,.1)', color: o.scope === 'SKU' ? '#818cf8' : '#00CF92' }}>{o.scope}</span></td>
                        <td style={{ fontSize: 11 }}>{o.type}</td>
                        <td className="tn" style={{ fontWeight: 600 }}>{o.key}</td>
                        <td className="tr" style={{ color: 'var(--tx3)' }}>{o.defaultVal}</td>
                        <td className="tr" style={{ color: '#FFC711', fontWeight: 700 }}>{o.currentVal}</td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{o.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
