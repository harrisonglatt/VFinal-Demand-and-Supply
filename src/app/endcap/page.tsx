'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import FilterBar from '@/components/ui/FilterBar';
import SelectFilter from '@/components/ui/SelectFilter';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import LineChart from '@/components/charts/LineChart';
import { DATA_HIST_PROMO, DATA_OMNI } from '@/data/index';
import { usePromo } from '@/context/PromoContext';
import { fmt } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'summary', label: 'Performance' },
  { value: 'events', label: 'Event Detail' },
  { value: 'sku', label: 'SKU Attribution' },
  { value: 'insights', label: 'Insights' },
];

/* ── Trailing 4-week Omni baseline ──────────────────────────────────── */
function getBaseline(): { units: number } {
  const wt = DATA_OMNI.weekly_totals;
  if (wt.length < 4) return { units: 15000 };
  const t4 = wt.slice(-4);
  return { units: Math.round(t4.reduce((a, w) => a + w.units, 0) / 4) };
}

/* ── Unified event type ─────────────────────────────────────────────── */
type LiftStatus = 'completed' | 'active' | 'upcoming';

interface LiftEvent {
  id: string;
  week: string;
  event: string;
  category: string;
  type: string;
  mechanic: string;
  stores: string;
  baselineUnits: number;
  modelLift: number;       // %
  actualLift: number | null; // % — null for upcoming
  modelUnits: number;
  actualUnits: number | null;
  delta: number | null;    // actual - model in pp
  overUnder: string | null;
  keySkus: string;
  notes: string;
  confidence: string;
  status: LiftStatus;
}

/* ── Heatmap colour helper ──────────────────────────────────────────── */
function heatBg(v: number | null) {
  if (v === null) return 'transparent';
  if (v > 40) return 'rgba(0,227,205,.22)';
  if (v > 20) return 'rgba(0,227,205,.10)';
  if (v > 0) return 'rgba(0,227,205,.04)';
  return 'rgba(255,90,90,.08)';
}

export default function PromoLiftPage() {
  const [view, setView] = useState('summary');
  const [catFilter, setCatFilter] = useState('');
  const [mechFilter, setMechFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const promoCtx = usePromo();
  const baseline = getBaseline();

  /* ── Build unified event list ──────────────────────────────────────── */
  const allEvents = useMemo<LiftEvent[]>(() => {
    const list: LiftEvent[] = [];

    // 1. Historical completed events — ground truth actuals
    DATA_HIST_PROMO.forEach((e, i) => {
      list.push({
        id: `hist-${i}`,
        week: e.date,
        event: e.event,
        category: e.category,
        type: e.type,
        mechanic: e.mechanic,
        stores: '',
        baselineUnits: e.model_units > 0
          ? Math.round(e.model_units / (e.model_lift_x - 1 || 1))
          : 13751,
        modelLift: e.model_lift_pct,
        actualLift: e.actual_lift_pct,
        modelUnits: e.model_units,
        actualUnits: e.actual_units,
        delta: e.delta_pct,
        overUnder: e.over_under,
        keySkus: e.key_skus || '',
        notes: e.notes || '',
        confidence: e.confidence_in_actual || 'High',
        status: 'completed',
      });
    });

    // 2. PromoContext events → active or upcoming
    promoCtx.events
      .filter(e => e.status !== 'rejected' && e.status !== 'blocked' && e.status !== 'info')
      .forEach(e => {
        const incrUnits = Math.round(baseline.units * e.liftPct / 100);
        list.push({
          id: e.id,
          week: e.week,
          event: `${e.promoType}: ${e.description.substring(0, 50)}`,
          category: e.category,
          type: e.promoType,
          mechanic: e.mechanic || e.description,
          stores: e.stores || '',
          baselineUnits: baseline.units,
          modelLift: e.liftPct,
          actualLift: null,
          modelUnits: incrUnits,
          actualUnits: null,
          delta: null,
          overUnder: null,
          keySkus: (e.skus || []).join(', '),
          notes: '',
          confidence: e.confidence,
          status: 'upcoming',
        });
      });

    return list;
  }, [promoCtx.events, baseline.units]);

  const completed = useMemo(() => allEvents.filter(e => e.status === 'completed'), [allEvents]);
  const upcoming = useMemo(() => allEvents.filter(e => e.status === 'upcoming'), [allEvents]);

  /* ── Filtered events for Event Detail view ─────────────────────────── */
  const filteredEvents = useMemo(() => {
    return allEvents.filter(e =>
      (!catFilter || e.category === catFilter) &&
      (!mechFilter || e.type === mechFilter) &&
      (!statusFilter || e.status === statusFilter)
    );
  }, [allEvents, catFilter, mechFilter, statusFilter]);

  /* ── KPIs ──────────────────────────────────────────────────────────── */
  const avgActualLift = useMemo(() => {
    if (!completed.length) return 0;
    return Math.round(completed.reduce((a, e) => a + (e.actualLift ?? 0), 0) / completed.length);
  }, [completed]);

  // Model accuracy: 100 - mean(|delta| / actual × 100)
  const modelAccuracy = useMemo(() => {
    const withActual = completed.filter(e => e.actualLift && e.actualLift > 0 && e.delta !== null);
    if (!withActual.length) return 0;
    const errMean = withActual.reduce((a, e) => a + Math.abs(e.delta!) / (e.actualLift!) * 100, 0) / withActual.length;
    return Math.round(Math.max(0, 100 - errMean));
  }, [completed]);

  const totalIncrCompleted = useMemo(() =>
    completed.reduce((a, e) => a + (e.actualUnits ?? 0), 0), [completed]);
  const totalIncrUpcoming = useMemo(() =>
    upcoming.reduce((a, e) => a + (e.modelUnits ?? 0), 0), [upcoming]);

  /* ── Mechanic aggregation ──────────────────────────────────────────── */
  const mechanicStats = useMemo(() => {
    const byType: Record<string, { lifts: number[]; modelLifts: number[]; incrUnits: number }> = {};
    completed.forEach(e => {
      if (!byType[e.type]) byType[e.type] = { lifts: [], modelLifts: [], incrUnits: 0 };
      if (e.actualLift !== null) byType[e.type].lifts.push(e.actualLift);
      byType[e.type].modelLifts.push(e.modelLift);
      byType[e.type].incrUnits += e.actualUnits ?? 0;
    });
    return Object.entries(byType).map(([type, d]) => {
      const avgActual = d.lifts.length ? Math.round(d.lifts.reduce((a, b) => a + b, 0) / d.lifts.length) : 0;
      const avgModel = Math.round(d.modelLifts.reduce((a, b) => a + b, 0) / d.modelLifts.length);
      const avgDelta = avgActual - avgModel;
      const accuracy = avgActual > 0 ? Math.round(Math.max(0, 100 - Math.abs(avgDelta) / avgActual * 100)) : 0;
      return {
        type,
        count: d.lifts.length,
        avgActual,
        avgModel,
        avgDelta,
        totalIncr: d.incrUnits,
        accuracy,
      };
    }).sort((a, b) => b.avgActual - a.avgActual);
  }, [completed]);

  const bestMechanic = mechanicStats[0];

  /* ── Category × Mechanic heatmap ──────────────────────────────────── */
  const { heatCategories, heatMechanics, heatGrid } = useMemo(() => {
    const cats = [...new Set(completed.map(e => e.category))].sort();
    const mechs = [...new Set(completed.map(e => e.type))].sort();
    // grid[cat][mech] = avg actual lift
    const acc: Record<string, Record<string, number[]>> = {};
    completed.forEach(e => {
      if (e.actualLift === null) return;
      if (!acc[e.category]) acc[e.category] = {};
      if (!acc[e.category][e.type]) acc[e.category][e.type] = [];
      acc[e.category][e.type].push(e.actualLift);
    });
    const grid: Record<string, Record<string, number | null>> = {};
    cats.forEach(c => {
      grid[c] = {};
      mechs.forEach(m => {
        const arr = acc[c]?.[m];
        grid[c][m] = arr?.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      });
    });
    return { heatCategories: cats, heatMechanics: mechs, heatGrid: grid };
  }, [completed]);

  /* ── Insights ──────────────────────────────────────────────────────── */
  const insights = useMemo(() => {
    const items: { icon: string; label: string; detail: string; accent: string }[] = [];

    // Best mechanic
    if (bestMechanic) {
      items.push({
        icon: '🏆',
        label: 'Top Mechanic',
        detail: `${bestMechanic.type} delivers the highest average lift at +${bestMechanic.avgActual}% across ${bestMechanic.count} event${bestMechanic.count !== 1 ? 's' : ''} — ${fmt(bestMechanic.totalIncr)} incremental units measured.`,
        accent: '#00CF92',
      });
    }

    // Model accuracy
    items.push({
      icon: '🎯',
      label: 'Model Accuracy',
      detail: `Overall model accuracy: ${modelAccuracy}%. ${modelAccuracy >= 85 ? 'The lift model is well-calibrated.' : modelAccuracy >= 70 ? 'Accuracy is moderate — consider reviewing lift assumptions.' : 'Significant model error detected — recalibration recommended.'}`,
      accent: modelAccuracy >= 85 ? '#00CF92' : modelAccuracy >= 70 ? '#FFC711' : '#FF5A5A',
    });

    // Category with most negative avg delta (underperforming vs model)
    const catDelta: Record<string, number[]> = {};
    completed.forEach(e => { if (e.delta !== null) { if (!catDelta[e.category]) catDelta[e.category] = []; catDelta[e.category].push(e.delta); } });
    const worstCat = Object.entries(catDelta)
      .map(([c, ds]) => ({ cat: c, avg: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) }))
      .sort((a, b) => a.avg - b.avg)[0];
    if (worstCat && worstCat.avg < -2) {
      items.push({
        icon: '⚠️',
        label: 'Model Over-Forecast Alert',
        detail: `${worstCat.cat} events are consistently under-delivering vs model (avg ${worstCat.avg > 0 ? '+' : ''}${worstCat.avg}pp delta). Consider reducing lift assumptions for this category.`,
        accent: '#FFC711',
      });
    }

    // Best category × mechanic cell
    let bestCell = { cat: '', mech: '', val: 0 };
    heatCategories.forEach(c => heatMechanics.forEach(m => {
      const v = heatGrid[c]?.[m];
      if (v !== null && v !== undefined && v > bestCell.val) bestCell = { cat: c, mech: m, val: v };
    }));
    if (bestCell.val > 0) {
      items.push({
        icon: '🔥',
        label: 'Highest Responsiveness',
        detail: `${bestCell.cat} responds strongest to ${bestCell.mech} with an average +${bestCell.val}% lift — your highest-impact combination.`,
        accent: 'var(--ac)',
      });
    }

    // Active promo count
    if (upcoming.length > 0) {
      const topUpcoming = [...upcoming].sort((a, b) => b.modelLift - a.modelLift)[0];
      items.push({
        icon: '📅',
        label: 'Upcoming Pipeline',
        detail: `${upcoming.length} promo event${upcoming.length !== 1 ? 's' : ''} in the plan — expected ${fmt(totalIncrUpcoming)} incremental units. Next high-impact event: "${topUpcoming.event.substring(0, 40)}" (${topUpcoming.week}) at +${topUpcoming.modelLift}% model lift.`,
        accent: '#818cf8',
      });
    }

    // Total impact summary
    items.push({
      icon: '💰',
      label: 'Cumulative Incremental Impact',
      detail: `${fmt(totalIncrCompleted)} incremental units measured across ${completed.length} completed events. Avg lift per completed event: +${avgActualLift}%.`,
      accent: 'var(--ac)',
    });

    return items;
  }, [bestMechanic, modelAccuracy, completed, heatCategories, heatMechanics, heatGrid, upcoming, totalIncrUpcoming, totalIncrCompleted, avgActualLift]);

  /* ── Filter option arrays ──────────────────────────────────────────── */
  const catOptions = useMemo(() => [...new Set(allEvents.map(e => e.category))].sort(), [allEvents]);
  const mechOptions = useMemo(() => [...new Set(allEvents.map(e => e.type))].sort(), [allEvents]);
  const statusOptions = ['completed', 'upcoming'];

  const metaStr = `${completed.length} completed · ${upcoming.length} upcoming · ${allEvents.length} total events`;

  return (
    <PageShell
      title="Promo + Endcap Lift"
      subtitle="Performance attribution engine — actual vs model lift by mechanic and category"
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      {/* ── KPI Row (always visible) ────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="📈"
          label="Avg Actual Lift"
          style="--cc:var(--ac)"
          value={`+${avgActualLift}%`}
          delta={`${completed.length} measured events`}
          deltaClass="neu"
          sub="Mean observed lift, all mechanics"
        />
        <KpiCard
          icon="🎯"
          label="Model Accuracy"
          style={`--cc:${modelAccuracy >= 85 ? 'var(--gr)' : modelAccuracy >= 70 ? 'var(--yw)' : 'var(--rd)'}`}
          value={`${modelAccuracy}%`}
          delta={modelAccuracy >= 85 ? 'Well calibrated' : modelAccuracy >= 70 ? 'Moderate' : 'Needs recalibration'}
          deltaClass={modelAccuracy >= 85 ? 'up' : 'neu'}
          sub="Lift model predictive accuracy"
        />
        <KpiCard
          icon="📦"
          label="Incremental Units"
          style="--cc:var(--gr)"
          value={fmt(totalIncrCompleted)}
          delta={`+${fmt(totalIncrUpcoming)} expected upcoming`}
          deltaClass="up"
          sub="Above-baseline units, completed"
        />
        <KpiCard
          icon="🏆"
          label="Best Mechanic"
          style="--cc:#00CF92"
          value={bestMechanic?.type ?? '—'}
          delta={bestMechanic ? `+${bestMechanic.avgActual}% avg lift` : ''}
          deltaClass="up"
          sub={bestMechanic ? `${bestMechanic.count} completed events` : 'No data yet'}
        />
      </KpiGrid>

      {/* ── VIEW: Performance Summary ──────────────────────────────── */}
      {view === 'summary' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            {/* Lift by mechanic */}
            <div className="card">
              <div className="card-title">Avg Lift % by Mechanic</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={mechanicStats.map(m => m.type)}
                  datasets={[{
                    label: 'Avg Actual Lift %',
                    data: mechanicStats.map(m => m.avgActual),
                    backgroundColor: 'rgba(0,227,205,.72)',
                  }]}
                  horizontal
                  height={240}
                />
              </div>
            </div>

            {/* Model vs actual by event */}
            <div className="card">
              <div className="card-title">Model vs Actual Lift — Completed Events</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={completed.map(e => e.week)}
                  datasets={[
                    { label: 'Model Lift %', data: completed.map(e => e.modelLift), backgroundColor: 'rgba(148,163,184,.5)' },
                    { label: 'Actual Lift %', data: completed.map(e => e.actualLift ?? 0), backgroundColor: 'rgba(0,227,205,.8)' },
                  ]}
                  height={240}
                />
              </div>
            </div>
          </div>

          {/* Incremental units over time */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Incremental Units Over Time (Completed Events)</div>
            <div style={{ padding: '0 12px 12px' }}>
              <LineChart
                labels={completed.map(e => `${e.week} · ${e.type}`)}
                datasets={[
                  {
                    label: 'Model Units',
                    data: completed.map(e => e.modelUnits),
                    borderColor: '#94a3b8',
                    borderDash: [5, 3],
                  },
                  {
                    label: 'Actual Units',
                    data: completed.map(e => e.actualUnits ?? 0),
                    borderColor: '#00E3CD',
                  },
                ]}
                height={200}
              />
            </div>
          </div>
        </>
      )}

      {/* ── VIEW: Event Detail ─────────────────────────────────────── */}
      {view === 'events' && (
        <>
          <FilterBar meta={metaStr}>
            <SelectFilter id="lift-cat" options={catOptions} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
            <SelectFilter id="lift-mech" options={mechOptions} value={mechFilter} onChange={setMechFilter} allLabel="All Mechanics" />
            <SelectFilter id="lift-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} allLabel="All Statuses" />
          </FilterBar>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 60 }}>Week</th>
                  <th style={{ minWidth: 180 }}>Event</th>
                  <th style={{ minWidth: 100 }}>Category</th>
                  <th style={{ minWidth: 90 }}>Type</th>
                  <th className="tr">Stores</th>
                  <th className="tr">Model Lift</th>
                  <th className="tr">Actual Lift</th>
                  <th className="tr">Delta</th>
                  <th className="tr">Inc. Units</th>
                  <th className="tr">Accuracy</th>
                  <th style={{ minWidth: 120 }}>Key SKUs</th>
                  <th style={{ minWidth: 140 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--tx3)', padding: 24 }}>No events match filters</td></tr>
                )}
                {/* Group header: completed */}
                {filteredEvents.some(e => e.status === 'completed') && (
                  <tr style={{ background: 'var(--s3)' }}>
                    <td colSpan={12} style={{ fontWeight: 700, fontSize: 11, color: 'var(--gr)' }}>
                      COMPLETED ({filteredEvents.filter(e => e.status === 'completed').length})
                    </td>
                  </tr>
                )}
                {filteredEvents.filter(e => e.status === 'completed').map(e => {
                  const acc = e.actualLift && e.actualLift > 0 && e.delta !== null
                    ? Math.round(Math.max(0, 100 - Math.abs(e.delta) / e.actualLift * 100))
                    : null;
                  return (
                    <tr key={e.id} style={{ background: 'rgba(0,227,205,.03)' }}>
                      <td style={{ fontWeight: 600, fontSize: 11 }}>{e.week}</td>
                      <td className="tn" style={{ fontSize: 11 }} title={e.event}>{e.event}</td>
                      <td style={{ fontSize: 10 }}>{e.category}</td>
                      <td>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,227,205,.1)', color: 'var(--ac)', whiteSpace: 'nowrap' }}>{e.type}</span>
                      </td>
                      <td className="tr" style={{ fontSize: 11, color: 'var(--tx3)' }}>{e.stores || '—'}</td>
                      <td className="tr" style={{ color: 'var(--tx3)' }}>{e.modelLift}%</td>
                      <td className="tr" style={{ fontWeight: 700, color: 'var(--gr)' }}>+{e.actualLift}%</td>
                      <td className="tr" style={{ fontWeight: 600, color: (e.delta ?? 0) >= 0 ? 'var(--gr)' : 'var(--rd)' }}>
                        {e.delta !== null ? `${e.delta >= 0 ? '+' : ''}${e.delta}pp` : '—'}
                      </td>
                      <td className="tr" style={{ fontWeight: 600 }}>{fmt(e.actualUnits ?? 0)}</td>
                      <td className="tr" style={{ color: acc !== null ? (acc >= 85 ? 'var(--gr)' : acc >= 70 ? 'var(--yw)' : 'var(--rd)') : 'var(--tx3)' }}>
                        {acc !== null ? `${acc}%` : '—'}
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--ac)' }}>{e.keySkus || '—'}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{e.notes || '—'}</td>
                    </tr>
                  );
                })}
                {/* Group header: upcoming */}
                {filteredEvents.some(e => e.status === 'upcoming') && (
                  <tr style={{ background: 'var(--s3)' }}>
                    <td colSpan={12} style={{ fontWeight: 700, fontSize: 11, color: '#FFC711' }}>
                      UPCOMING ({filteredEvents.filter(e => e.status === 'upcoming').length}) — from Promo Calendar
                    </td>
                  </tr>
                )}
                {filteredEvents.filter(e => e.status === 'upcoming').slice(0, 30).map(e => (
                  <tr key={e.id} style={{ background: 'rgba(245,158,11,.04)', opacity: 0.85 }}>
                    <td style={{ fontWeight: 600, fontSize: 11 }}>{e.week}</td>
                    <td className="tn" style={{ fontSize: 11 }} title={e.event}>{e.event}</td>
                    <td style={{ fontSize: 10 }}>{e.category}</td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,199,17,.1)', color: '#FFC711', whiteSpace: 'nowrap' }}>{e.type}</span>
                    </td>
                    <td className="tr" style={{ fontSize: 11, color: 'var(--tx3)' }}>{e.stores || '—'}</td>
                    <td className="tr" style={{ color: '#FFC711', fontWeight: 600 }}>{e.modelLift}%</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>—</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>—</td>
                    <td className="tr" style={{ color: '#FFC711' }}>{fmt(e.modelUnits)}</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>—</td>
                    <td style={{ fontSize: 10, color: 'var(--ac)' }}>{e.keySkus || '—'}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── VIEW: SKU Attribution ──────────────────────────────────── */}
      {view === 'sku' && (
        <>
          {/* Panel A: Mechanic comparison */}
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Mechanic Performance — Completed Events
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Mechanic</th>
                  <th className="tr">Events</th>
                  <th className="tr">Avg Model Lift</th>
                  <th className="tr">Avg Actual Lift</th>
                  <th className="tr">Avg Delta</th>
                  <th className="tr">Total Inc. Units</th>
                  <th className="tr">Accuracy</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {mechanicStats.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--tx3)', padding: 24 }}>No completed events yet</td></tr>
                )}
                {mechanicStats.map(m => (
                  <tr key={m.type}>
                    <td style={{ fontWeight: 700 }}>{m.type}</td>
                    <td className="tr">{m.count}</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>{m.avgModel}%</td>
                    <td className="tr" style={{ fontWeight: 700, color: 'var(--gr)' }}>+{m.avgActual}%</td>
                    <td className="tr" style={{ fontWeight: 600, color: m.avgDelta >= 0 ? 'var(--gr)' : 'var(--rd)' }}>
                      {m.avgDelta >= 0 ? '+' : ''}{m.avgDelta}pp
                    </td>
                    <td className="tr" style={{ fontWeight: 600 }}>{fmt(m.totalIncr)}</td>
                    <td className="tr" style={{ color: m.accuracy >= 85 ? 'var(--gr)' : m.accuracy >= 70 ? 'var(--yw)' : 'var(--rd)' }}>
                      {m.accuracy}%
                    </td>
                    <td>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: m.avgActual > 40 ? 'rgba(0,207,146,.12)' : m.avgActual > 20 ? 'rgba(99,102,241,.12)' : 'rgba(255,199,17,.12)',
                        color: m.avgActual > 40 ? '#00CF92' : m.avgActual > 20 ? '#818cf8' : '#FFC711',
                      }}>
                        {m.avgActual > 40 ? 'High Impact' : m.avgActual > 20 ? 'Moderate' : 'Low Impact'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          {/* Panel B: Category × Mechanic heatmap */}
          {heatCategories.length > 0 && heatMechanics.length > 0 && (
            <>
              <div style={{ marginTop: 20, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Category × Mechanic Heatmap — Avg Actual Lift %
              </div>
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 130 }}>Category</th>
                      {heatMechanics.map(m => <th key={m} className="tr" style={{ minWidth: 90 }}>{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatCategories.map(c => (
                      <tr key={c}>
                        <td style={{ fontWeight: 600, fontSize: 11 }}>{c}</td>
                        {heatMechanics.map(m => {
                          const v = heatGrid[c]?.[m] ?? null;
                          return (
                            <td key={m} className="tr" style={{ background: heatBg(v), fontWeight: v !== null ? 700 : 400, color: v !== null ? 'var(--tx)' : 'var(--tx3)', transition: 'background .2s' }}>
                              {v !== null ? `+${v}%` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--tx3)' }}>
                Color intensity = lift magnitude. Darker teal = higher lift. Only completed events included.
              </div>
            </>
          )}
        </>
      )}

      {/* ── VIEW: Insights ─────────────────────────────────────────── */}
      {view === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {insights.map((ins, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 18px',
                background: `${ins.accent}08`,
                border: `1px solid ${ins.accent}25`,
                borderLeft: `4px solid ${ins.accent}`,
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 26, flexShrink: 0, lineHeight: 1.4 }}>{ins.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ins.accent, marginBottom: 3 }}>{ins.label}</div>
                <div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.65 }}>{ins.detail}</div>
              </div>
            </div>
          ))}
          {insights.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--tx3)', padding: 40, fontSize: 13 }}>
              Add completed promo events to generate insights.
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
