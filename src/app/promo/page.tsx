'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import { DATA_PROMO, DATA_HIST_PROMO } from '@/data/index';
import { fmt } from '@/lib/formatters';

/* ── Constants ───────────────────────────────────────────────────────── */

const VIEW_OPTS = [
  { value: 'forward', label: 'Forward' },
  { value: 'historical', label: 'Historical' },
];

const TYPE_OPTS = ['TPC', 'Endcap', 'Digital', 'Clearance', 'TPR', 'Co-space', 'Circle + Co-space', 'DWA'];
const STATUS_OPTS = ['Confirmed', 'Tentative', 'Proposed', 'Submitted'];

const TYPE_CHIP: Record<string, string> = {
  TPC: 'cb',
  Endcap: 'cp',
  Digital: 'cy2',
  Clearance: 'cr',
  TPR: 'cy2',
};

const TYPE_COLORS: Record<string, string> = {
  TPC: 'rgba(0,227,205,.7)',
  'Co-space': 'rgba(220,123,255,.7)',
  'Circle + Co-space': 'rgba(255,199,17,.7)',
  DWA: 'rgba(239,68,68,.7)',
};

/* ── Page Component ──────────────────────────────────────────────────── */

export default function PromoPage() {
  const [view, setView] = useState('forward');
  const [cat, setCat] = useState('');
  const [tp, setTp] = useState('');
  const [st, setSt] = useState('');

  /* ── Forward view: filtered events ──────────────────── */
  const events = useMemo(() => {
    return DATA_PROMO.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!tp || (p.type || '').includes(tp)) &&
        (!st || (p.status || '').includes(st)),
    );
  }, [cat, tp, st]);

  /* ── Historical view: KPI calculations ─────────────── */
  const hist = useMemo(() => {
    const total = DATA_HIST_PROMO.length;
    const overFcast = DATA_HIST_PROMO.filter((p) => p.over_under === 'over').length;
    const underFcast = DATA_HIST_PROMO.filter((p) => p.over_under === 'under').length;
    const avgModelLift = DATA_HIST_PROMO.reduce((a, p) => a + p.model_lift_pct, 0) / total;
    const avgActualLift = DATA_HIST_PROMO.reduce((a, p) => a + p.actual_lift_pct, 0) / total;
    const avgBias = avgModelLift - avgActualLift;
    const totalModelUnits = DATA_HIST_PROMO.reduce((a, p) => a + p.model_units, 0);
    const totalActualUnits = DATA_HIST_PROMO.reduce((a, p) => a + p.actual_units, 0);
    const portfolioBias = ((totalActualUnits - totalModelUnits) / totalModelUnits * 100).toFixed(1);

    /* By-type breakdown */
    const byType = ['TPC', 'Co-space', 'Circle + Co-space', 'DWA']
      .map((t) => {
        const evs = DATA_HIST_PROMO.filter((p) => p.type === t || p.type.includes(t.split(' ')[0]));
        if (!evs.length) return null;
        const avgOver = evs.reduce((a, p) => a + (p.model_lift_pct - p.actual_lift_pct), 0) / evs.length;
        const col =
          Math.abs(avgOver) < 5 ? 'var(--gr)' : Math.abs(avgOver) < 12 ? 'var(--yw)' : 'var(--rd)';
        return { type: t, count: evs.length, avgOver, col };
      })
      .filter(Boolean) as { type: string; count: number; avgOver: number; col: string }[];

    return { total, overFcast, underFcast, avgModelLift, avgActualLift, avgBias, totalModelUnits, totalActualUnits, portfolioBias, byType };
  }, []);

  return (
    <PageShell
      title="Promo Calendar"
      subtitle="Forward promo events & historical performance"
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      {/* ── Filters (forward view) ─────────────────────────── */}
      {view === 'forward' && (
        <FilterBar meta={`${events.length} events`}>
          <SelectFilter
            id="pr-cat"
            options={DATA_PROMO.map((p) => p.category)}
            value={cat}
            onChange={setCat}
            allLabel="All Categories"
          />
          <SelectFilter
            id="pr-tp"
            options={TYPE_OPTS}
            value={tp}
            onChange={setTp}
            allLabel="All Types"
          />
          <SelectFilter
            id="pr-st"
            options={STATUS_OPTS}
            value={st}
            onChange={setSt}
            allLabel="All Status"
          />
        </FilterBar>
      )}

      {/* ── Forward View: event cards ──────────────────────── */}
      {view === 'forward' && (
        <div className="pl">
          {events.map((p, i) => {
            const lv = parseInt((p.lift_pct || '0').replace('%', '')) || 0;
            const isConf = p.status.toLowerCase().includes('confirm') || p.status.includes('✓');

            return (
              <div className="pc" key={`${p.wk}-${i}`}>
                <div className="pw">
                  <strong>W{p.wk}</strong>
                  {p.date}
                </div>
                <div className="pi">
                  <div className="pe">{p.event}</div>
                  <div className="pd">
                    {p.mechanic ? p.mechanic + ' · ' : ''}Stores: {p.stores || 'All'} ·{' '}
                    <span
                      className={
                        p.confidence === 'High' ? 'up' : p.confidence === 'Medium' ? 'neu' : 'dn'
                      }
                    >
                      {p.confidence || '—'}
                    </span>
                  </div>
                </div>
                <div className="pr">
                  <span className={`ch ${TYPE_CHIP[p.type] || 'cgr'}`}>{p.type || '—'}</span>
                  <span className={`ch ${isConf ? 'cg' : 'cy2'}`}>
                    {isConf ? '✓ Confirmed' : '⏳ Tentative'}
                  </span>
                  <div className="plift">
                    {lv > 0 ? '+' : ''}
                    {lv}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Historical View ────────────────────────────────── */}
      {view === 'historical' && (
        <>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>
              {'📖'} Historical Promo Performance — Dec 28 2025 – Mar 15 2026
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
              {hist.total} completed events · Actual lift vs model assumption · Positive
              delta% = model over-forecasted (common pattern)
            </div>
          </div>

          {/* KPI Row */}
          <KpiGrid columns={4}>
            <KpiCard
              icon="📊"
              label="Events Reviewed"
              style="--cc:var(--cy)"
              value={hist.total}
              delta={`${hist.overFcast} over-forecast · ${hist.underFcast} under-forecast`}
              deltaClass="neu"
              sub="Completed promo weeks with actuals"
            />
            <KpiCard
              icon="🎯"
              label="Avg Model Lift"
              style="--cc:var(--yw)"
              value={`+${hist.avgModelLift.toFixed(0)}%`}
              delta="Portfolio avg across all promo types"
              deltaClass="dn"
              sub="What model assumed across events"
            />
            <KpiCard
              icon="📉"
              label="Avg Actual Lift"
              style="--cc:var(--ac)"
              value={`+${hist.avgActualLift.toFixed(0)}%`}
              delta="Systematically below model assumption"
              deltaClass="up"
              sub="What actually happened"
            />
            <KpiCard
              icon="⚠️"
              label="Portfolio Overcast"
              style="--cc:var(--rd)"
              value={`${hist.portfolioBias}%`}
              delta={`Model over-predicted by this much across all events`}
              deltaClass="dn"
              sub={`Total model vs actual units (${fmt(hist.totalModelUnits)} modeled / ${fmt(hist.totalActualUnits)} actual)`}
            />
          </KpiGrid>

          {/* Key Insight */}
          <div className="cc" style={{ marginBottom: 20 }}>
            <div className="ct">⚠️ Key Insight: Promo Lift Is Systematically Over-Modeled</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                fontSize: 12.5,
                padding: '4px 0',
              }}
            >
              <div style={{ color: 'var(--tx3)', lineHeight: 1.8 }}>
                Across {hist.total} historical events, the model{' '}
                <b style={{ color: 'var(--rd)' }}>
                  over-forecasted lift by an average of {hist.avgBias.toFixed(0)} percentage points
                </b>{' '}
                ({hist.avgModelLift.toFixed(0)}% modeled vs {hist.avgActualLift.toFixed(0)}%
                actual).
                <br />
                <br />
                Frozen endcap events were the most accurate (within ±5%). TPC and DWA events
                showed the most over-forecasting. The conservative calibration engine automatically
                adjusts forward forecasts using these patterns.
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--tx)', marginBottom: 8 }}>
                  By Promo Type:
                </div>
                {hist.byType.map((t) => (
                  <div
                    key={t.type}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: '1px solid var(--bd)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--tx)' }}>
                      {t.type} ({t.count} events)
                    </span>
                    <span style={{ color: t.col, fontWeight: 700 }}>
                      {t.avgOver > 0
                        ? `Over +${t.avgOver.toFixed(0)}pp`
                        : `Under ${Math.abs(t.avgOver).toFixed(0)}pp`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Historical Event Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {DATA_HIST_PROMO.map((p, i) => {
              const delta = p.actual_lift_pct - p.model_lift_pct;
              const deltaAbs = Math.abs(delta);
              const isOver = delta < 0;
              const accuracy =
                deltaAbs < 3
                  ? '✅ Very Accurate'
                  : deltaAbs < 8
                    ? '🟡 Minor Miss'
                    : deltaAbs < 15
                      ? '🟠 Meaningful Miss'
                      : '🔴 Significant Miss';
              const accCol =
                deltaAbs < 3
                  ? 'var(--gr)'
                  : deltaAbs < 8
                    ? 'var(--yw)'
                    : deltaAbs < 15
                      ? 'rgba(255,140,0,.9)'
                      : 'var(--rd)';
              const typeCol = TYPE_COLORS[p.type] || 'rgba(123,151,200,.6)';
              const barModel = Math.min(p.model_lift_pct, 120);
              const barActual = Math.min(p.actual_lift_pct, 120);
              const confidenceNote =
                p.confidence_in_actual === 'High'
                  ? ''
                  : ' (derived — medium confidence)';

              return (
                <div
                  key={i}
                  style={{
                    background: 'var(--s2)',
                    border: '1px solid var(--bd)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    borderLeft: `3px solid ${accCol}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Left: event info */}
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div
                          style={{
                            background: 'var(--s1)',
                            border: '1px solid var(--bd)',
                            borderRadius: 5,
                            padding: '2px 8px',
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: 'var(--tx3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.date}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            padding: '2px 8px',
                            borderRadius: 5,
                            background: typeCol + '22',
                            color: typeCol,
                            border: `1px solid ${typeCol}44`,
                            fontWeight: 700,
                          }}
                        >
                          {p.type}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{p.category}</div>
                      </div>
                      <div
                        style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--tx)', marginBottom: 2 }}
                      >
                        {p.event}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>
                        {p.mechanic}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                        <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>SKUs: </span>
                        {p.key_skus}
                      </div>
                    </div>

                    {/* Middle: bars */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div
                        style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)', marginBottom: 8 }}
                      >
                        Model vs Actual Lift
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {/* Model bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, fontSize: 11, color: 'var(--tx3)' }}>Model</div>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              background: 'var(--s1)',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${barModel}%`,
                                height: '100%',
                                background: 'rgba(123,151,200,.5)',
                                borderRadius: 4,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              width: 50,
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--tx3)',
                              textAlign: 'right',
                            }}
                          >
                            +{p.model_lift_pct}%
                          </div>
                        </div>
                        {/* Actual bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, fontSize: 11, color: 'var(--ac)' }}>
                            Actual
                            {confidenceNote && (
                              <span style={{ color: 'var(--tx3)', fontSize: 9.5, marginLeft: 4 }}>
                                {confidenceNote}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              background: 'var(--s1)',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${barActual}%`,
                                height: '100%',
                                background: isOver ? 'var(--rd)' : 'var(--gr)',
                                borderRadius: 4,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              width: 50,
                              fontSize: 12,
                              fontWeight: 800,
                              color: isOver ? 'var(--rd)' : 'var(--gr)',
                              textAlign: 'right',
                            }}
                          >
                            +{p.actual_lift_pct}%
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: 11.5 }}>
                          <span style={{ color: 'var(--tx3)' }}>Units: </span>
                          <span style={{ textDecoration: 'line-through', color: 'var(--tx3)' }}>
                            {fmt(p.model_units)}
                          </span>
                          <span style={{ color: 'var(--tx)', fontWeight: 700, marginLeft: 6 }}>
                            {fmt(p.actual_units)} actual
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: isOver ? 'var(--rd)' : 'var(--gr)',
                          }}
                        >
                          {isOver ? 'Over ' : 'Under '}+{Math.abs(p.delta_pct).toFixed(1)}pp
                        </div>
                      </div>
                    </div>

                    {/* Right: accuracy badge */}
                    <div style={{ minWidth: 140, textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: accCol, marginBottom: 4 }}>
                        {accuracy}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                        {p.confidence_in_actual} confidence
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--bd)',
                      fontSize: 11.5,
                      color: 'var(--tx3)',
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>{'📝'} Notes:</span>
                    {p.notes}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Methodology Note */}
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--tx3)',
            }}
          >
            <b style={{ color: 'var(--tx)' }}>Methodology note:</b> Frozen Co-space actuals (Jan
            5–Feb 2) sourced from DATA_ENDCAP_HISTORY with high confidence. TPC and DWA
            actuals (Feb 9–Mar 15) are derived from walk-forward hist[6..11] clean-week
            baseline vs promo week actuals — medium confidence. All actuals feed the
            Conservative Calibration Engine to reduce forward overforecasting.
          </div>
        </>
      )}
    </PageShell>
  );
}
