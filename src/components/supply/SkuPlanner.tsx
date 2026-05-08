'use client';

import { useMemo, useState } from 'react';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import DataTable from '@/components/ui/DataTable';
import { LS } from '@/lib/colors';
import { fmt, fmtDol, sf } from '@/lib/formatters';
import { usePlannedPOs, type PlannedPO } from '@/context/PlannedPOsContext';
import { runWeeklySimulation, computeReorderRecommendation, computeWOC } from '@/lib/supply/engine';
import type { SupplySku, LotRecord } from '@/lib/supply/engine';
import type { ScenarioKey } from '@/data/types';
import { SC_MULT } from '@/lib/computations/scenario';

// "Today" baseline used by the engine — kept in sync with engine.ts
const TODAY_ISO = '2026-04-06';

interface Props {
  skus: SupplySku[];
  lotsByDpci: Record<string, LotRecord[]>;
  fcastByDpci: Record<string, number[]>;
  scenario: ScenarioKey;
  weekLabels: string[];
  getPromoLift: (weekIdx: number, category: string) => number;
}

const MS_PER_DAY = 86400 * 1000;

function isoToLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function todayPlusWeeks(weeks: number): string {
  const d = new Date(TODAY_ISO);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weekOffsetFromToday(iso: string): number {
  const a = new Date(TODAY_ISO).getTime();
  const b = new Date(iso).getTime();
  return Math.floor((b - a) / (MS_PER_DAY * 7));
}

export default function SkuPlanner({
  skus,
  lotsByDpci,
  fcastByDpci,
  scenario,
  weekLabels,
  getPromoLift,
}: Props) {
  const planned = usePlannedPOs();
  const [selectedDpci, setSelectedDpci] = useState(skus[0]?.dpci ?? '');

  // ── Form state for adding a new planned PO ─────────────────────────────
  const [formCases, setFormCases] = useState('');
  const [formArrival, setFormArrival] = useState(todayPlusWeeks(4));
  const [formNote, setFormNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const sku = useMemo(() => skus.find(s => s.dpci === selectedDpci) ?? skus[0], [skus, selectedDpci]);
  const fcast = useMemo(() => (sku ? fcastByDpci[sku.dpci] ?? [] : []), [sku, fcastByDpci]);
  const lots = useMemo(() => (sku ? lotsByDpci[sku.dpci] ?? [] : []), [sku, lotsByDpci]);

  // ── PO entries for this SKU ─────────────────────────────────────────────
  const skuPOs = useMemo(() => (sku ? planned.forSku(sku.dpci) : []), [sku, planned]);

  // ── Inbound series (units per week from this SKU's planned POs) ────────
  const plannedInboundSeries = useMemo(() => {
    if (!sku) return new Array<number>(52).fill(0);
    return planned.inboundSeries(sku.dpci, 52, TODAY_ISO);
  }, [sku, planned]);

  // ── Two simulations: with and without planned POs ──────────────────────
  const simWithout = useMemo(() => {
    if (!sku) return [];
    return runWeeklySimulation(sku, fcast, lots, scenario, weekLabels, getPromoLift);
  }, [sku, fcast, lots, scenario, weekLabels, getPromoLift]);

  const simWith = useMemo(() => {
    if (!sku) return [];
    return runWeeklySimulation(sku, fcast, lots, scenario, weekLabels, getPromoLift, plannedInboundSeries);
  }, [sku, fcast, lots, scenario, weekLabels, getPromoLift, plannedInboundSeries]);

  // ── Recommendations: factor in planned POs in lead-time window ─────────
  const leadTimeWeeks = sku ? sku.productionLeadTimeWeeks + sku.transitLeadTimeWeeks + sku.receiptLagWeeks : 0;
  const plannedInboundInLeadTime = useMemo(() => {
    if (!sku) return 0;
    let sum = 0;
    for (let w = 0; w < leadTimeWeeks; w++) sum += plannedInboundSeries[w] ?? 0;
    return sum;
  }, [plannedInboundSeries, leadTimeWeeks, sku]);

  const recWithout = useMemo(() =>
    sku ? computeReorderRecommendation(sku, simWithout, fcast, scenario, weekLabels, 1, 0) : null,
  [sku, simWithout, fcast, scenario, weekLabels]);

  const recWith = useMemo(() =>
    sku
      ? computeReorderRecommendation(sku, simWith, fcast, scenario, weekLabels, 1, plannedInboundInLeadTime)
      : null,
  [sku, simWith, fcast, scenario, weekLabels, plannedInboundInLeadTime]);

  if (!sku) {
    return <div style={{ padding: 24, color: 'var(--tx2)' }}>No SKUs available.</div>;
  }

  // ── Stockout week (first week ending inventory <= 0) ──────────────────
  const stockoutWk = (sim: typeof simWith) => sim.findIndex(r => r.endingUnits <= 0);
  const soWithout = stockoutWk(simWithout);
  const soWith = stockoutWk(simWith);

  const totalPlannedUnits = skuPOs.reduce((a, p) => a + p.units, 0);
  const totalPlannedCases = skuPOs.reduce((a, p) => a + p.cases, 0);

  // ── Form handlers ──────────────────────────────────────────────────────
  const resetForm = () => {
    setFormCases('');
    setFormArrival(todayPlusWeeks(4));
    setFormNote('');
    setEditingId(null);
  };

  const handleSave = () => {
    const cases = parseInt(formCases, 10);
    if (!cases || cases <= 0 || !formArrival) return;
    const units = cases * sku.unitsPerCase;
    if (editingId) {
      planned.dispatch({
        type: 'UPDATE',
        payload: {
          id: editingId,
          patch: {
            cases,
            units,
            arrivalDate: formArrival,
            note: formNote || undefined,
          },
        },
      });
    } else {
      planned.dispatch({
        type: 'ADD',
        payload: {
          dpci: sku.dpci,
          cases,
          units,
          arrivalDate: formArrival,
          source: 'manual',
          status: 'staged',
          supplier: sku.coPacker || undefined,
          note: formNote || undefined,
        },
      });
    }
    resetForm();
  };

  const handleEdit = (po: PlannedPO) => {
    setEditingId(po.id);
    setFormCases(String(po.cases));
    setFormArrival(po.arrivalDate);
    setFormNote(po.note ?? '');
  };

  const handleDelete = (id: string) => {
    planned.dispatch({ type: 'REMOVE', payload: { id } });
    if (editingId === id) resetForm();
  };

  // ── Chart data ─────────────────────────────────────────────────────────
  const labels = simWith.map(r => r.weekLabel);
  const wocWithout = simWithout.map(r => r.woc);
  const wocWith = simWith.map(r => r.woc);
  const targetLine = simWith.map(() => sku.targetWOC);
  const minLine = simWith.map(() => sku.minWOC);

  const inboundUnitsByWeek = simWith.slice(0, 26).map((r, i) => plannedInboundSeries[i] ?? 0);
  const endingInvByWeek = simWith.slice(0, 26).map(r => r.endingUnits);
  const demandByWeek = simWith.slice(0, 26).map(r => r.demandUnits);

  return (
    <div>
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--tx-label)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          SKU
        </label>
        <select
          value={sku.dpci}
          onChange={(e) => { setSelectedDpci(e.target.value); resetForm(); }}
          style={{ minWidth: 280, padding: '8px 12px', border: '1px solid var(--bd)', borderRadius: 8, background: '#fff', fontSize: 13, fontFamily: 'inherit' }}
        >
          {skus.map(s => (
            <option key={s.dpci} value={s.dpci}>{s.name} — {s.caseCode || s.dpci}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx2)' }}>
          {sku.coPacker ? `Co-Packer: ${sku.coPacker} · ` : ''}Lead time: {leadTimeWeeks}wk · Target WOC: {sku.targetWOC} · Min WOC: {sku.minWOC}
        </span>
      </div>

      {/* ── Impact summary ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <ImpactCard
          label="Current WOC"
          before={recWithout?.currentWOC ?? 0}
          after={recWith?.currentWOC ?? 0}
          format={(v) => typeof v === 'number' ? v.toFixed(1) : '—'}
          better="up"
          target={sku.targetWOC}
          min={sku.minWOC}
        />
        <ImpactCard
          label="Stockout Week"
          before={soWithout >= 0 ? soWithout : null}
          after={soWith >= 0 ? soWith : null}
          format={(v) => v == null ? 'None projected' : `Wk ${v}`}
          better="up"
        />
        <ImpactCard
          label="Reorder Severity"
          before={recWithout?.severity ?? 'none'}
          after={recWith?.severity ?? 'none'}
          format={(v) => String(v)}
          better="severity"
        />
        <ImpactCard
          label="Total Planned POs"
          before={skuPOs.length}
          after={skuPOs.length}
          format={() => `${skuPOs.length} POs · ${fmt(totalPlannedCases)} cases · ${fmt(totalPlannedUnits)} units`}
          better="neutral"
        />
      </div>

      {/* ── Layout: chart + form ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* Charts column */}
        <div>
          <div className="cc">
            <div className="ct">
              52-Week WOC — {sku.name}
              <span className="ct-sub">Solid line includes planned POs · dashed line is current state without them</span>
            </div>
            <div style={{ paddingTop: 4 }}>
              <LineChart
                labels={labels}
                datasets={[
                  { label: 'WOC with planned POs', data: wocWith, borderColor: LS.blueDark },
                  { label: 'WOC without planned POs', data: wocWithout, borderColor: LS.gray400, borderDash: [5, 4] },
                  { label: `Target (${sku.targetWOC})`, data: targetLine, borderColor: LS.spinach, borderDash: [3, 3] },
                  { label: `Min (${sku.minWOC})`, data: minLine, borderColor: LS.guava, borderDash: [3, 3] },
                ]}
                height={240}
              />
            </div>
          </div>

          <div className="cc">
            <div className="ct">
              Inventory Burndown · 26 Weeks
              <span className="ct-sub">Inbound bars show when planned POs land</span>
            </div>
            <div style={{ paddingTop: 4 }}>
              <BarChart
                labels={labels.slice(0, 26)}
                datasets={[
                  { label: 'Ending Inventory', data: endingInvByWeek, backgroundColor: LS.blueSoft, borderColor: LS.blueDark, borderWidth: 1 },
                  { label: 'Demand', data: demandByWeek, backgroundColor: LS.gray100 },
                  { label: 'Planned PO Inbound', data: inboundUnitsByWeek, backgroundColor: LS.spinach },
                ]}
                height={200}
              />
            </div>
          </div>
        </div>

        {/* Form + PO list column */}
        <div>
          {/* Add / Edit PO form */}
          <div className="cc">
            <div className="ct">{editingId ? 'Edit Planned PO' : 'Add Planned PO'}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Cases">
                <input
                  type="number"
                  min={1}
                  value={formCases}
                  onChange={(e) => setFormCases(e.target.value)}
                  placeholder="e.g. 1200"
                  className="inp"
                />
              </Field>
              {formCases && parseInt(formCases, 10) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                  = {fmt(parseInt(formCases, 10) * sku.unitsPerCase)} units · {fmtDol(parseInt(formCases, 10) * sku.casePrice)} value
                </div>
              )}
              <Field label="Arrival Date (at LS DC)">
                <input
                  type="date"
                  value={formArrival}
                  onChange={(e) => setFormArrival(e.target.value)}
                  className="inp"
                />
              </Field>
              {formArrival && (
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                  Lands in week {weekOffsetFromToday(formArrival)} from today
                </div>
              )}
              <Field label="Note (optional)">
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="e.g. Q3 promo build"
                  className="inp"
                />
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!parseInt(formCases, 10) || !formArrival}
                  style={{ flex: 1, padding: '9px 14px', fontSize: 13 }}
                >
                  {editingId ? 'Save Changes' : 'Add Planned PO'}
                </button>
                {editingId && (
                  <button
                    className="btn"
                    onClick={resetForm}
                    style={{ padding: '9px 14px', fontSize: 13 }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Existing planned POs for this SKU */}
          <div className="cc" style={{ padding: 0 }}>
            <div className="ct" style={{ padding: '20px 20px 8px' }}>
              Planned POs for this SKU ({skuPOs.length})
            </div>
            {skuPOs.length === 0 ? (
              <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--tx2)' }}>
                No planned POs yet. Add one to see the impact on WOC.
              </div>
            ) : (
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th>Arrival</th>
                      <th className="tr">Cases</th>
                      <th className="tr">Units</th>
                      <th>Source</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuPOs.map(po => (
                      <tr key={po.id}>
                        <td style={{ fontWeight: 600 }}>
                          {isoToLabel(po.arrivalDate)}
                          <div style={{ fontSize: 10, color: 'var(--tx2)', fontWeight: 500 }}>
                            wk {weekOffsetFromToday(po.arrivalDate)}{po.note ? ` · ${po.note}` : ''}
                          </div>
                        </td>
                        <td className="tr">{fmt(po.cases)}</td>
                        <td className="tr">{fmt(po.units)}</td>
                        <td style={{ fontSize: 10, color: 'var(--tx2)' }}>
                          {po.source === 'recommendation' ? 'Rec' : po.source === 'generated' ? 'Generated' : 'Manual'}
                          {po.poNumber && <div style={{ fontFamily: 'monospace', fontSize: 9 }}>{po.poNumber}</div>}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleEdit(po)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--ls-blue-dark)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 4 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(po.id)}
                            style={{ background: 'transparent', border: 'none', color: '#A33E1F', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 4, marginLeft: 4 }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            )}
          </div>

          {/* Recommendation explanation */}
          {recWith && (
            <div className="cc">
              <div className="ct">Engine Recommendation</div>
              <div style={{ fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.6 }}>
                {recWith.rationale}
              </div>
              {recWith.recommendedCases > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--ac-soft)', borderRadius: 8, fontSize: 12 }}>
                  <strong>Suggested action:</strong> Order <strong>{fmt(recWith.recommendedCases)}</strong> cases by <strong>{recWith.orderDate}</strong>. Arrival expected <strong>{recWith.arrivalDate}</strong>.
                  <button
                    onClick={() => {
                      // Convert recommendation into a planned PO
                      planned.dispatch({
                        type: 'ADD',
                        payload: {
                          dpci: sku.dpci,
                          cases: recWith.recommendedCases,
                          units: recWith.recommendedUnits,
                          arrivalDate: isoFromShortDate(recWith.arrivalDate),
                          source: 'recommendation',
                          status: 'staged',
                          supplier: sku.coPacker || undefined,
                          note: 'From engine recommendation',
                        },
                      });
                    }}
                    className="btn btn-accent"
                    style={{ marginTop: 8, fontSize: 12 }}
                  >
                    + Stage this PO
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx-label)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

interface ImpactCardProps {
  label: string;
  before: number | string | null;
  after: number | string | null;
  format: (v: number | string | null) => string;
  better: 'up' | 'down' | 'neutral' | 'severity';
  target?: number;
  min?: number;
}

function ImpactCard({ label, before, after, format, better, target, min }: ImpactCardProps) {
  const isNumeric = typeof before === 'number' && typeof after === 'number';
  const delta = isNumeric ? (after as number) - (before as number) : null;

  let color = 'var(--tx-label)';
  if (better === 'severity') {
    const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
    const b = order[before as keyof typeof order] ?? 4;
    const a = order[after as keyof typeof order] ?? 4;
    if (a > b) color = LS.spinach;
    else if (a < b) color = LS.guava;
  } else if (delta != null && delta !== 0) {
    const isUp = delta > 0;
    if (better === 'up') color = isUp ? LS.spinach : LS.guava;
    else if (better === 'down') color = isUp ? LS.guava : LS.spinach;
  }

  const showThresholds = better === 'up' && typeof target === 'number' && typeof min === 'number';

  return (
    <div className="kc" style={{ ['--cc' as string]: color }}>
      <div className="kl">{label}</div>
      <div className="kv" style={{ fontSize: 18 }}>{format(after)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 6, fontWeight: 500 }}>
        was {format(before)}
        {delta != null && delta !== 0 && (
          <span style={{ marginLeft: 6, color, fontWeight: 700 }}>
            ({delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta})
          </span>
        )}
      </div>
      {showThresholds && (
        <div style={{ fontSize: 10.5, color: 'var(--tx2)', marginTop: 4 }}>
          target {target} · min {min}
        </div>
      )}
    </div>
  );
}

// ── Date helper for engine "Apr 12" → ISO ──
function isoFromShortDate(short: string): string {
  // engine emits e.g. "Apr 12" (no year). Assume current or next year baseline
  const m = short.match(/([A-Z][a-z]{2})\s+(\d+)/);
  if (!m) {
    const d = new Date(short);
    return isNaN(d.getTime()) ? todayPlusWeeks(4) : d.toISOString().slice(0, 10);
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monIdx = months.indexOf(m[1]);
  const day = parseInt(m[2], 10);
  const today = new Date(TODAY_ISO);
  let year = today.getFullYear();
  // If month is earlier than today's month, assume next year
  if (monIdx < today.getMonth()) year += 1;
  const d = new Date(year, monIdx, day);
  return d.toISOString().slice(0, 10);
}
