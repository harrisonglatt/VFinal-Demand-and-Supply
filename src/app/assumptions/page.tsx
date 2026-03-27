'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import { DATA_DP, DATA_POFC } from '@/data/index';
import { useOverrides } from '@/hooks/useOverrides';
import { fmt, fmtN } from '@/lib/formatters';

/* ── Lift assumptions (actuals-derived baseline) ──────────────────── */
const LIFT_DATA: Record<string, { tpc: number; bogo: number; dwa: number; endcap: number; base: number; evidence: string }> = {
  'Baby Snacks':  { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25, base: 59000, evidence: 'Base: L4W clean avg (wks 8-11). TPC: 2/$8 = 19% off → 1.20x. BOGO/DWA: 1.55x/1.60x. Endcap: 1.25x (CSTI data).' },
  'Kids Snacks':  { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25, base: 22000, evidence: 'Base: L4W clean, established SKUs. TPC: 1.25x. DWA: 1.45x corrected from 2.0x. BOGO: 1.55x.' },
  'Frozen':       { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50, base: 16500, evidence: 'Base: Nov 13,751 x 1.20x store growth = 16,500. Endcap 1.50x corrected from 2.0x. BOGO/DWA: 1.60x. TPC: 1.10x.' },
  'Smoothies':    { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15, base: 29000, evidence: 'Base: L8W clean avg (28,990/wk). TPC: 1.35x from two independent 2/$6 weeks. BOGO/DWA: 1.45x.' },
  'YoGos':        { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20, base: 8900,  evidence: 'Base: 8,891/wk L8W clean. TPC: 1.25x. BOGO: 1.45x / DWA: 1.50x mechanics-based.' },
  'Brand-Wide':   { tpc: 1.20, bogo: 1.50, dwa: 1.50, endcap: 1.25, base: 0,     evidence: 'Weighted avg across 5 categories. Stacking rule: co-space + BOGO = base x endcap x 1.35x incremental.' },
};

/* ── Lift override defaults ───────────────────────────────────────── */
const LIFT_DEFAULTS: Record<string, { tpc: number; bogo: number; dwa: number; endcap: number }> = {
  'Baby Snacks':       { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25 },
  'Kids Snacks':       { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25 },
  'Frozen Multiserve': { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50 },
  'Smoothies':         { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15 },
  'YoGos':             { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20 },
};

const LIFT_TYPES: Record<string, string> = { tpc: 'TPC', bogo: 'BOGO 25%', dwa: 'DWA', endcap: 'Co-space/Endcap' };

/* ── History chart data ───────────────────────────────────────────── */
const HIST_LABELS = ['Sep 1','Sep 8','Sep 15','Sep 22','Sep 29','Oct 6','Oct 13','Oct 20','Oct 27','Nov 3','Nov 10','Nov 17','Nov 24','Dec 1','Dec 8','Dec 15','Dec 22','Dec 29','Jan 5','Jan 12','Jan 19','Jan 26','Feb 2','Feb 9','Feb 16','Feb 23','Mar 2','Mar 9','Mar 16'];
const FRZ_VALS = [241,1784,6601,11160,18578,18710,14525,17260,17065,13805,13697,16005,12504,14188,15047,12969,11248,17294,25115,22898,22738,23116,30368,31643,33551,32293,32735,30957,25244];
const PUF_VALS = [2467,10826,15310,21901,24546,26627,25041,22783,18248,18673,20407,28888,20607,22081,23199,26604,26042,32331,37611,39577,39026,34424,39449,47516,47927,50064,49046,50220,48183];

export default function AssumptionsPage() {
  const { state, velFor, upcFor, liftFor, setVel, clearVel, setLift, clearLift, setUpc, clearUpc, resetAll, overrideCount } = useOverrides();
  const [toast, setToast] = useState<string | null>(null);

  /* ── Show toast ─────────────────────────────────────────────────── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── UPC groups ─────────────────────────────────────────────────── */
  const upcCatGroups = useMemo(() => {
    const groups: Record<string, typeof DATA_POFC.skus> = {};
    DATA_POFC.skus.forEach(s => {
      if (!groups[s.cat]) groups[s.cat] = [];
      groups[s.cat].push(s);
    });
    return groups;
  }, []);

  /* ── Velocity groups ────────────────────────────────────────────── */
  const velCatGroups = useMemo(() => {
    const groups: Record<string, typeof DATA_DP.skus> = {};
    DATA_DP.skus.filter(s => s.stores > 0).forEach(s => {
      const cat = s.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, []);

  /* ── Override status banner ─────────────────────────────────────── */
  const overrideSummary = useMemo(() => {
    const vc = Object.keys(state.velOverrides).length;
    const lc = Object.keys(state.liftOverrides).length;
    const uc = Object.keys(state.upcOverrides).length;
    const total = vc + lc + uc;
    if (total === 0) return 'No overrides active';
    const parts: string[] = [];
    if (vc) parts.push(vc + ' vel');
    if (lc) parts.push(lc + ' lift');
    if (uc) parts.push(uc + ' UPC');
    return total + ' override' + (total > 1 ? 's' : '') + ' active: ' + parts.join(' · ');
  }, [state]);

  /* ── Handlers ───────────────────────────────────────────────────── */
  const handleVelChange = useCallback((dpci: string, val: string) => {
    const v = parseFloat(val);
    if (!v || v <= 0) {
      clearVel(dpci);
    } else {
      setVel(dpci, v);
    }
    showToast('UPSPW override updated');
  }, [setVel, clearVel, showToast]);

  const handleUpcChange = useCallback((dpci: string, val: string) => {
    const v = parseInt(val);
    if (!v || v < 1) return;
    setUpc(dpci, v);
    showToast('UPC override updated');
  }, [setUpc, showToast]);

  const handleLiftChange = useCallback((cat: string, type: string, val: string) => {
    const v = parseFloat(val);
    const k = cat + '|' + type;
    if (!v || v <= 0) {
      clearLift(k);
    } else {
      setLift(k, v);
    }
    showToast('Promo lift override updated');
  }, [setLift, clearLift, showToast]);

  const handleResetAll = useCallback(() => {
    if (confirm('Reset all velocity, lift, and UPC overrides to baseline values?')) {
      resetAll();
      showToast('All overrides reset to baseline');
    }
  }, [resetAll, showToast]);

  return (
    <PageShell
      title="Assumptions & Overrides"
      subtitle="Central control page for velocity, lift, and UPC overrides"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 12,
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: overrideCount > 0 ? 'rgba(255,199,17,.4)' : 'var(--bd)',
            color: overrideCount > 0 ? 'var(--yw)' : 'var(--tx3)',
          }}>
            {overrideSummary}
          </span>
          <button className="btn" onClick={handleResetAll} style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd)', border: '1px solid rgba(239,68,68,.3)' }}>
            Reset to Baseline
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 24px 24px' }}>

        {/* ── Lift Multiplier Table ──────────────────────────────────────── */}
        <div className="cc">
          <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Promo Lift Multipliers — Rebuilt Mar 2026
            <span style={{ fontSize: 10, background: 'rgba(0,207,146,.12)', color: 'var(--gr)', border: '1px solid rgba(0,207,146,.3)', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              Actuals-Derived
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '0 12px 8px' }}>
            Baseline: L8W clean avg (excl promo & endcap wks) · Hierarchical stacking: max(DWA, BOGO) — not multiplicative
          </div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="tr">Stable Base<br /><span style={{ fontWeight: 400, fontSize: 10 }}>units/wk</span></th>
                  <th className="tr">TPC</th>
                  <th className="tr">BOGO 25%</th>
                  <th className="tr">DWA</th>
                  <th className="tr" style={{ color: 'var(--yw)' }}>Co-space/Endcap</th>
                  <th style={{ fontSize: 10.5 }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(LIFT_DATA).map(([cat, d]) => {
                  const isFrz = cat === 'Frozen';
                  return (
                    <tr key={cat} style={isFrz ? { background: 'rgba(99,102,241,.06)' } : undefined}>
                      <td><b>{cat}</b></td>
                      <td className="tr">{d.base ? fmtN(d.base) : '—'}</td>
                      <td className="tr"><b>{d.tpc.toFixed(2)}x</b></td>
                      <td className="tr"><b>{d.bogo.toFixed(2)}x</b></td>
                      <td className="tr"><b>{d.dwa.toFixed(2)}x</b></td>
                      <td className="tr" style={{ fontWeight: 700, color: 'var(--yw)' }}>{d.endcap.toFixed(2)}x</td>
                      <td style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{d.evidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
          <div style={{ margin: '10px 12px', padding: '10px 14px', background: 'rgba(99,102,241,.07)', borderRadius: 8, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.85 }}>
            <b style={{ color: '#a78bfa' }}>Frozen Endcap Fix (Key Change):</b> Old model reported 2.0x by comparing Feb peak to Nov base. That was wrong — Feb included a layered Circle BOGO.
            True endcap-only lift = 23,518 / 16,500 = <b>1.43x (conservative 1.50x)</b>. Feb BOGO overlay = <b>1.35x incremental</b>.
          </div>
          <div style={{ margin: '0 12px 8px', padding: '8px 12px', background: 'rgba(16,185,129,.06)', borderRadius: 8, fontSize: 11, color: 'var(--tx3)' }}>
            <b style={{ color: '#10b981' }}>Stacking Rule:</b> When promo types overlap (co-space + BOGO same week), apply hierarchically: <b>Base x co-space_lift x incremental_BOGO(1.35x)</b> — do NOT multiply standalone BOGO against endcap-inflated base.
          </div>
        </div>

        {/* ── History Chart ────────────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">
            Frozen & Baby Snacks Weekly History (Jul 2025 – Mar 2026)
            <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 12 }}>Source: Omni Analytics</span>
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            <LineChart
              labels={HIST_LABELS}
              datasets={[
                { label: 'Frozen', data: FRZ_VALS, borderColor: 'rgba(99,102,241,.85)', backgroundColor: 'rgba(99,102,241,.06)', fill: true },
                { label: 'Baby Snacks', data: PUF_VALS, borderColor: 'rgba(0,207,146,.85)', backgroundColor: 'rgba(0,207,146,.05)', fill: true },
              ]}
              height={200}
            />
          </div>
        </div>

        {/* ── UPC Override Table ───────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">
            Units Per Case (UPC) — Interactive Override
            <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 12 }}>Edit any value → PO Forecast case math updates instantly · Green = overridden</span>
          </div>
          <div style={{ padding: 12 }}>
            <div className="ch cg2" style={{ marginBottom: 12 }}>
              UPC Values Confirmed: Baby Puffs = 40 · Stellar Puffs = 40 · Frozen = 10 · Smoothies = 8 · Cereal = 12 — edit below to override
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {Object.entries(upcCatGroups).map(([cat, skus]) => (
                <div key={cat} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>{cat}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <tbody>
                      {skus.map(s => {
                        const ovrd = state.upcOverrides[s.dpci];
                        const effUpc = upcFor(s) ?? s.upc;
                        return (
                          <tr key={s.dpci} style={{ borderBottom: '1px solid var(--bd)' }}>
                            <td style={{ padding: '4px 6px', color: 'var(--tx2)' }} title={s.name}>
                              {s.name.length > 28 ? s.name.substring(0, 26) + '…' : s.name}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <input
                                type="number" min={1} max={200}
                                defaultValue={effUpc}
                                style={{
                                  width: 52, padding: '2px 5px', borderRadius: 4,
                                  border: `1px solid ${ovrd ? 'var(--gr)' : 'var(--bd)'}`,
                                  background: 'var(--bg)', color: ovrd ? 'var(--gr)' : 'var(--tx)',
                                  fontSize: 12, textAlign: 'center',
                                }}
                                onBlur={e => handleUpcChange(s.dpci, e.target.value)}
                                title={`Units per case · default: ${s.upc}`}
                              />
                              {' upc'}
                              {ovrd ? <span style={{ fontSize: 10, color: 'var(--tx3)' }}> (orig {s.upc})</span> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── UPSPW Methodology + Key Assumptions ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="cc">
            <div className="ct">UPSPW Methodology</div>
            <div style={{ padding: 12 }}>
              <div className="ch cg2">Anchor: Omni sell-through velocity — lw_upspw x distributed stores · Promo lifts applied per category</div>
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--tx2)' }}>
                UPSPW understates true selling velocity because OOS stores contribute 0 sales but are counted in denominator.
              </p>
              <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
                Rec: use <b>selling-stores-only</b> UPSPW especially for Baby Snacks & YoGos (higher OOS%)
              </p>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 6 }}>OOS 10% → true vel +11% · OOS 20% → +25%</div>
            </div>
          </div>
          <div className="cc">
            <div className="ct">Model Assumptions</div>
            <div style={{ padding: 12, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.8 }}>
              <div><b style={{ color: 'var(--tx)' }}>DC WoS Target:</b> 5 wks (midpoint of Target 4-6 WoS range)</div>
              <div><b style={{ color: 'var(--tx)' }}>Reorder Cycle:</b> Every 2 weeks · Min reorder = 2 WoS</div>
              <div><b style={{ color: 'var(--tx)' }}>O/S Ratio:</b> hist_cases / (hist_units / UPC) · Forward applied</div>
              <div><b style={{ color: 'var(--tx)' }}>Promo Lift:</b> Table above · Endcap stacks on top of TPC if concurrent</div>
              <div><b style={{ color: 'var(--tx)' }}>New Launches:</b> Ramp from demand plan (no historical base)</div>
            </div>
          </div>
        </div>

        {/* ── Velocity Override Editor ─────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">
            Velocity Override — UPSPW per SKU
            <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 12 }}>
              Edit any UPSPW → PO Forecast & Shipment Plan recalculate instantly · Green = overridden
            </span>
          </div>
          <div style={{ padding: '12px 0' }}>
            <div className="ch cy2" style={{ margin: '0 12px 12px', fontSize: 11.5 }}>
              Changes to UPSPW scale the Omni-anchored forecast proportionally (new velocity / current velocity = scale factor applied to all 13 forward weeks)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 14, padding: '0 12px' }}>
              {Object.entries(velCatGroups).map(([cat, skus]) => (
                <div key={cat} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>{cat}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--bd)' }}>
                        <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600, color: 'var(--tx3)', fontSize: 10 }}>SKU</th>
                        <th style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--tx3)', fontSize: 10 }}>Stores</th>
                        <th style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--tx3)', fontSize: 10 }}>Omni UPSPW</th>
                        <th style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--tx3)', fontSize: 10 }}>Override</th>
                        <th style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--tx3)', fontSize: 10, minWidth: 65 }}>Wkly Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skus.map(s => {
                        const ovrd = state.velOverrides[s.dpci];
                        const cur = ovrd !== undefined ? ovrd : s.lw_upspw;
                        const wkly = Math.round(cur * s.stores);
                        return (
                          <tr key={s.dpci} style={{ borderBottom: '1px solid rgba(30,48,84,.3)' }}>
                            <td style={{ padding: '4px 6px', color: 'var(--tx2)' }} title={s.name}>
                              {s.name.length > 26 ? s.name.substring(0, 24) + '…' : s.name}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--tx3)' }}>{s.stores}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--ac2)' }}>{s.lw_upspw.toFixed(2)}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <input
                                type="number" min={0.1} max={50} step={0.01}
                                defaultValue={ovrd !== undefined ? ovrd : s.lw_upspw}
                                key={`${s.dpci}-${ovrd}`}
                                style={{
                                  width: 68, padding: '2px 6px', borderRadius: 4,
                                  border: `1px solid ${ovrd !== undefined ? 'var(--gr)' : 'var(--bd)'}`,
                                  background: 'var(--bg)', color: ovrd !== undefined ? 'var(--gr)' : 'var(--tx)',
                                  fontSize: 11.5, textAlign: 'center',
                                }}
                                onBlur={e => handleVelChange(s.dpci, e.target.value)}
                                title={`UPSPW override · Omni: ${s.lw_upspw.toFixed(2)}`}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: ovrd !== undefined ? 'var(--gr)' : 'var(--tx2)' }}>
                              {wkly.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Promo Lift Override Editor ───────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Promo Lift Overrides — Edit Multipliers by Category</div>
          <div style={{ padding: 12 }}>
            <div className="ch cy2" style={{ marginBottom: 12, fontSize: 11.5 }}>
              Override lift multipliers for any category/promo type · Yellow = overridden from historical baseline
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bd)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--tx3)', fontSize: 10.5 }}>Category</th>
                    {Object.values(LIFT_TYPES).map(lbl => (
                      <th key={lbl} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--tx3)', fontSize: 10.5 }}>{lbl}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(LIFT_DEFAULTS).map(([cat, vals]) => (
                    <tr key={cat} style={{ borderBottom: '1px solid rgba(30,48,84,.3)' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx)' }}>{cat}</td>
                      {Object.keys(LIFT_TYPES).map(typeKey => {
                        const k = cat + '|' + typeKey;
                        const ovrd = liftFor(cat, typeKey);
                        const base = vals[typeKey as keyof typeof vals] || 1.0;
                        const dispVal = ovrd !== null ? ovrd : base;
                        return (
                          <td key={typeKey} style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <input
                              type="number" min={0.5} max={10} step={0.05}
                              defaultValue={dispVal.toFixed(2)}
                              key={`${k}-${ovrd}`}
                              style={{
                                width: 64, padding: '2px 5px', borderRadius: 4, fontSize: 11.5, textAlign: 'center',
                                border: `1px solid ${ovrd !== null ? 'var(--yw)' : 'var(--bd)'}`,
                                background: 'var(--bg)', color: ovrd !== null ? 'var(--yw)' : 'var(--tx)',
                              }}
                              onBlur={e => handleLiftChange(cat, typeKey, e.target.value)}
                              title={`Base: ${base.toFixed(2)}x`}
                            />
                            <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 1 }}>x base {base.toFixed(2)}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Lift Source Legend ────────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Lift Source Legend</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12, padding: '4px 12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>&#128202;</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--tx)' }}>Actuals-Derived</div>
                <div style={{ color: 'var(--tx3)' }}>Calculated from L4W/L8W Omni historical data</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>&#128208;</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--tx)' }}>Mechanics-Based</div>
                <div style={{ color: 'var(--tx3)' }}>Derived from price elasticity (~-2.5) x discount %</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>&#9999;&#65039;</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--tx)' }}>Manual Override</div>
                <div style={{ color: 'var(--tx3)' }}>Set via the override editor above; shown in yellow</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#0d1626', border: '1px solid rgba(0,207,146,.4)', borderRadius: 10,
          padding: '12px 16px', boxShadow: '0 4px 24px rgba(0,0,0,.5)',
          transition: 'opacity .3s',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gr)', marginBottom: 4 }}>
            {toast}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Changes applied to all views</div>
        </div>
      )}
    </PageShell>
  );
}
