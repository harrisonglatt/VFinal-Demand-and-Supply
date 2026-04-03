'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_HIST_PROMO, DATA_OMNI } from '@/data/index';
import { usePromo } from '@/context/PromoContext';
import { fmt, fmtDol } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'summary', label: 'Performance' },
  { value: 'events', label: 'Event Detail' },
  { value: 'mechanic', label: 'By Mechanic' },
  { value: 'insights', label: 'Insights' },
];

/* ── Compute baseline from Omni trailing data ─────────────────────── */
function getBaseline(): { units: number; revenue: number } {
  const wt = DATA_OMNI.weekly_totals;
  if (wt.length < 4) return { units: 15000, revenue: 90000 };
  const t4 = wt.slice(-4);
  return {
    units: Math.round(t4.reduce((a, w) => a + w.units, 0) / 4),
    revenue: Math.round(t4.reduce((a, w) => a + w.sales, 0) / 4),
  };
}

interface LiftEvent {
  id: string;
  week: string;
  event: string;
  category: string;
  type: string;
  mechanic: string;
  baselineUnits: number;
  actualUnits: number;
  incrementalUnits: number;
  liftPct: number;
  modelLiftPct: number;
  deltaPct: number;
  status: 'completed' | 'upcoming';
  confidence: string;
  source: 'historical' | 'promo_calendar';
}

export default function PromoLiftPage() {
  const [view, setView] = useState('summary');
  const promoCtx = usePromo();
  const baseline = getBaseline();

  /* ── Build unified event list ───────────────────────────────────── */
  const events = useMemo(() => {
    const list: LiftEvent[] = [];

    // 1. Historical completed events (from hist-promo.json — ground truth)
    DATA_HIST_PROMO.forEach((e, i) => {
      const baseU = 13751; // Fixed historical baseline
      const actualLiftFactor = (e.actual_lift_x ?? 1) - 1;
      const incrUnits = Math.round(baseU * actualLiftFactor);
      list.push({
        id: `hist-${i}`,
        week: e.date,
        event: e.event,
        category: e.category,
        type: e.type,
        mechanic: e.mechanic,
        baselineUnits: baseU,
        actualUnits: Math.round(baseU * (e.actual_lift_x ?? 1)),
        incrementalUnits: incrUnits,
        liftPct: e.actual_lift_pct,
        modelLiftPct: e.model_lift_pct,
        deltaPct: e.delta_pct,
        status: 'completed',
        confidence: e.confidence_in_actual || 'High',
        source: 'historical',
      });
    });

    // 2. Upcoming events from PromoContext (auto-synced from promo calendar)
    const activePromos = promoCtx.events.filter(e =>
      e.status !== 'rejected' && e.status !== 'blocked' && e.status !== 'info'
    );
    activePromos.forEach(e => {
      const liftPct = e.liftPct;
      const incrUnits = Math.round(baseline.units * liftPct / 100);
      list.push({
        id: e.id,
        week: e.week,
        event: `${e.promoType}: ${e.description.substring(0, 40)}`,
        category: e.category,
        type: e.promoType,
        mechanic: e.description,
        baselineUnits: baseline.units,
        actualUnits: 0, // Not yet measured
        incrementalUnits: incrUnits, // Expected
        liftPct: liftPct,
        modelLiftPct: liftPct,
        deltaPct: 0,
        status: 'upcoming',
        confidence: e.confidence,
        source: 'promo_calendar',
      });
    });

    return list;
  }, [promoCtx.events, baseline]);

  const completed = events.filter(e => e.status === 'completed');
  const upcoming = events.filter(e => e.status === 'upcoming');

  /* ── Mechanic aggregation ───────────────────────────────────────── */
  const mechanicStats = useMemo(() => {
    const byType: Record<string, { lifts: number[]; incrUnits: number; count: number }> = {};
    completed.forEach(e => {
      if (!byType[e.type]) byType[e.type] = { lifts: [], incrUnits: 0, count: 0 };
      byType[e.type].lifts.push(e.liftPct);
      byType[e.type].incrUnits += e.incrementalUnits;
      byType[e.type].count++;
    });
    return Object.entries(byType).map(([type, d]) => ({
      type,
      avgLift: Math.round(d.lifts.reduce((a, b) => a + b, 0) / d.lifts.length),
      medianLift: d.lifts.sort((a, b) => a - b)[Math.floor(d.lifts.length / 2)] ?? 0,
      totalIncr: d.incrUnits,
      count: d.count,
      variability: d.lifts.length > 1 ? Math.round(Math.sqrt(d.lifts.reduce((a, b) => a + (b - d.lifts.reduce((x, y) => x + y, 0) / d.lifts.length) ** 2, 0) / d.lifts.length)) : 0,
    })).sort((a, b) => b.avgLift - a.avgLift);
  }, [completed]);

  /* ── KPIs ───────────────────────────────────────────────────────── */
  const totalIncrCompleted = completed.reduce((a, e) => a + e.incrementalUnits, 0);
  const totalIncrUpcoming = upcoming.reduce((a, e) => a + e.incrementalUnits, 0);
  const avgLiftCompleted = completed.length > 0 ? Math.round(completed.reduce((a, e) => a + e.liftPct, 0) / completed.length) : 0;
  const bestMechanic = mechanicStats[0];
  const modelAccuracy = completed.length > 0 ? Math.round(completed.reduce((a, e) => a + Math.abs(e.deltaPct), 0) / completed.length) : 0;

  /* ── Auto insights ──────────────────────────────────────────────── */
  const insights = useMemo(() => {
    const items: { icon: string; label: string; detail: string; color: string }[] = [];

    if (mechanicStats.length >= 2) {
      const top = mechanicStats[0];
      const bottom = mechanicStats[mechanicStats.length - 1];
      items.push({ icon: '📊', label: 'Mechanic Comparison', detail: `${top.type} drives ${(top.avgLift / (bottom.avgLift || 1)).toFixed(1)}x the lift of ${bottom.type} on average (${top.avgLift}% vs ${bottom.avgLift}%)`, color: 'var(--ac)' });
    }

    const overForecast = completed.filter(e => e.deltaPct < -5);
    if (overForecast.length > 0) {
      items.push({ icon: '⚠️', label: 'Model Over-Forecasting', detail: `${overForecast.length} of ${completed.length} events came in below model forecast. Avg over-forecast: ${Math.round(overForecast.reduce((a, e) => a + Math.abs(e.deltaPct), 0) / overForecast.length)}%. Conservative calibration recommended.`, color: '#FFC711' });
    }

    if (bestMechanic) {
      items.push({ icon: '🏆', label: 'Top Mechanic', detail: `${bestMechanic.type} delivers the highest lift at +${bestMechanic.avgLift}% with ${fmt(bestMechanic.totalIncr)} incremental units across ${bestMechanic.count} events`, color: '#00CF92' });
    }

    const totalIncr = totalIncrCompleted;
    items.push({ icon: '💰', label: 'Total Incremental Impact', detail: `${fmt(totalIncr)} incremental units from ${completed.length} completed events. Expected ${fmt(totalIncrUpcoming)} more from ${upcoming.length} upcoming promos.`, color: 'var(--ac)' });

    if (modelAccuracy > 0) {
      items.push({ icon: '🎯', label: 'Model Accuracy', detail: `Average model error: ±${modelAccuracy} percentage points. ${modelAccuracy <= 5 ? 'Within acceptable range.' : 'Consider recalibrating lift assumptions.'}`, color: modelAccuracy <= 5 ? '#00CF92' : '#FFC711' });
    }

    return items;
  }, [mechanicStats, completed, upcoming, totalIncrCompleted, totalIncrUpcoming, bestMechanic, modelAccuracy]);

  return (
    <PageShell
      title="Promo + Endcap Lift"
      subtitle={`${completed.length} completed · ${upcoming.length} upcoming · Performance attribution engine`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard icon="📈" label="Avg Lift (Completed)" style="--cc:var(--ac)" value={`+${avgLiftCompleted}%`} delta={`${completed.length} measured events`} deltaClass="neu" sub="Actual observed lift" />
        <KpiCard icon="📦" label="Incremental Units" style="--cc:var(--gr)" value={fmt(totalIncrCompleted)} delta={`+${fmt(totalIncrUpcoming)} expected upcoming`} deltaClass="up" sub="Above baseline demand" />
        <KpiCard icon="🏆" label="Best Mechanic" style="--cc:#00CF92" value={bestMechanic ? `${bestMechanic.type}` : '—'} delta={bestMechanic ? `+${bestMechanic.avgLift}% avg lift` : ''} deltaClass="up" sub={bestMechanic ? `${bestMechanic.count} events` : ''} />
        <KpiCard icon="🎯" label="Model Accuracy" style={`--cc:${modelAccuracy <= 5 ? 'var(--gr)' : 'var(--yw)'}`} value={`±${modelAccuracy}pp`} delta={modelAccuracy <= 5 ? 'On target' : 'Needs calibration'} deltaClass={modelAccuracy <= 5 ? 'up' : 'neu'} sub="Avg model error" />
      </KpiGrid>

      {/* ── Performance Summary ────────────────────────────────────── */}
      {view === 'summary' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <div className="card-title">Lift by Mechanic (Completed Events)</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={mechanicStats.map(m => m.type)}
                  datasets={[{ label: 'Avg Lift %', data: mechanicStats.map(m => m.avgLift), backgroundColor: 'rgba(0,227,205,.7)' }]}
                  height={220}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Incremental Units by Mechanic</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={mechanicStats.map(m => m.type)}
                  datasets={[{ label: 'Incremental Units', data: mechanicStats.map(m => m.totalIncr), backgroundColor: 'rgba(99,102,241,.7)' }]}
                  height={220}
                />
              </div>
            </div>
          </div>

          {/* Model accuracy by event */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Model vs Actual (Completed Events)</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={completed.map(e => e.week)}
                datasets={[
                  { label: 'Model Lift %', data: completed.map(e => e.modelLiftPct), backgroundColor: 'rgba(148,163,184,.5)' },
                  { label: 'Actual Lift %', data: completed.map(e => e.liftPct), backgroundColor: 'rgba(0,227,205,.8)' },
                ]}
                height={200}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Event Detail ──────────────────────────────────────────── */}
      {view === 'events' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th style={{ minWidth: 180 }}>Event</th>
                <th>Category</th>
                <th>Type</th>
                <th className="tr">Baseline</th>
                <th className="tr">Actual</th>
                <th className="tr">Lift %</th>
                <th className="tr">Model %</th>
                <th className="tr">Delta</th>
                <th className="tr">Incr. Units</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Completed events first */}
              {completed.length > 0 && (
                <tr style={{ background: 'var(--s3)' }}><td colSpan={11} style={{ fontWeight: 700, fontSize: 11, color: 'var(--gr)' }}>COMPLETED ({completed.length})</td></tr>
              )}
              {completed.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600, fontSize: 11 }}>{e.week}</td>
                  <td className="tn" style={{ fontSize: 11 }}>{e.event}</td>
                  <td style={{ fontSize: 10 }}>{e.category}</td>
                  <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,227,205,.1)', color: 'var(--ac)' }}>{e.type}</span></td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(e.baselineUnits)}</td>
                  <td className="tr" style={{ fontWeight: 600 }}>{fmt(e.actualUnits)}</td>
                  <td className="tr" style={{ fontWeight: 700, color: 'var(--gr)' }}>+{e.liftPct}%</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{e.modelLiftPct}%</td>
                  <td className="tr" style={{ color: e.deltaPct >= 0 ? 'var(--gr)' : 'var(--rd)', fontWeight: 600 }}>{e.deltaPct >= 0 ? '+' : ''}{e.deltaPct}pp</td>
                  <td className="tr" style={{ fontWeight: 600 }}>{fmt(e.incrementalUnits)}</td>
                  <td><span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,207,146,.12)', color: '#00CF92' }}>Completed</span></td>
                </tr>
              ))}
              {/* Upcoming events */}
              {upcoming.length > 0 && (
                <tr style={{ background: 'var(--s3)' }}><td colSpan={11} style={{ fontWeight: 700, fontSize: 11, color: 'var(--yw)' }}>UPCOMING ({upcoming.length}) — from Promo Calendar</td></tr>
              )}
              {upcoming.slice(0, 20).map(e => (
                <tr key={e.id} style={{ opacity: 0.7 }}>
                  <td style={{ fontWeight: 600, fontSize: 11 }}>{e.week}</td>
                  <td className="tn" style={{ fontSize: 11 }}>{e.event}</td>
                  <td style={{ fontSize: 10 }}>{e.category}</td>
                  <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,199,17,.1)', color: '#FFC711' }}>{e.type}</span></td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(e.baselineUnits)}</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>—</td>
                  <td className="tr" style={{ color: '#FFC711' }}>+{e.liftPct}%</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{e.modelLiftPct}%</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>—</td>
                  <td className="tr" style={{ color: '#FFC711' }}>{fmt(e.incrementalUnits)}</td>
                  <td><span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,199,17,.12)', color: '#FFC711' }}>Expected</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── By Mechanic ───────────────────────────────────────────── */}
      {view === 'mechanic' && (
        <DataTable>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 120 }}>Mechanic</th>
                <th className="tr">Events</th>
                <th className="tr">Avg Lift %</th>
                <th className="tr">Median Lift</th>
                <th className="tr">Variability</th>
                <th className="tr">Total Incr. Units</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {mechanicStats.map(m => (
                <tr key={m.type}>
                  <td style={{ fontWeight: 700 }}>{m.type}</td>
                  <td className="tr">{m.count}</td>
                  <td className="tr" style={{ fontWeight: 700, color: 'var(--gr)' }}>+{m.avgLift}%</td>
                  <td className="tr">+{m.medianLift}%</td>
                  <td className="tr" style={{ color: m.variability > 10 ? 'var(--rd)' : m.variability > 5 ? 'var(--yw)' : 'var(--gr)' }}>±{m.variability}pp</td>
                  <td className="tr" style={{ fontWeight: 600 }}>{fmt(m.totalIncr)}</td>
                  <td>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: m.avgLift > 30 ? 'rgba(0,207,146,.12)' : m.avgLift > 15 ? 'rgba(99,102,241,.12)' : 'rgba(255,199,17,.12)', color: m.avgLift > 30 ? '#00CF92' : m.avgLift > 15 ? '#818cf8' : '#FFC711' }}>
                      {m.avgLift > 30 ? 'High Impact' : m.avgLift > 15 ? 'Moderate' : 'Low Impact'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── Insights ──────────────────────────────────────────────── */}
      {view === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: `${ins.color}06`, border: `1px solid ${ins.color}20`, borderRadius: 10 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{ins.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ins.color }}>{ins.label}</div>
                <div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.6 }}>{ins.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
