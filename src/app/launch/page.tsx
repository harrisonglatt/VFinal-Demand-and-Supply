'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP, DATA_OMNI } from '@/data/index';
import { fmt, fmtP } from '@/lib/formatters';
import { useNewSkus } from '@/context/NewSkuContext';
import type { ScenarioKey } from '@/data/types';
import launchJson from '@/data/json/launch.json';

const SCENARIO_OPTS = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

const VIEW_OPTS = [
  { value: 'summary', label: 'Summary' },
  { value: 'ramp', label: 'Ramp Curves' },
  { value: 'weekly', label: 'Weekly Detail' },
];

// 12-week ramp model (% of full velocity)
const RAMP_PCT = [0.15, 0.30, 0.45, 0.60, 0.70, 0.80, 0.85, 0.90, 0.93, 0.96, 0.98, 1.00];

interface LaunchSku {
  dpci: string;
  name: string;
  stores: number;
  bear: number;
  base: number;
  bull: number;
}

interface LaunchWeek {
  week: number;
  forecast: number;
  actual: number;
  variance: number;
  variancePct: number;
  cumForecast: number;
  cumActual: number;
  cumVariancePct: number;
}

interface LaunchSkuAnalysis {
  sku: LaunchSku;
  shortName: string;
  weeksSinceLaunch: number;
  weeks: LaunchWeek[];
  totalForecast: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  trend: 'improving' | 'declining' | 'stable';
  flag: 'above_plan' | 'on_plan' | 'below_plan' | 'breakout' | 'at_risk';
  flagLabel: string;
  flagColor: string;
}

function classifyPerformance(totalVariancePct: number, trend: string): { flag: string; label: string; color: string } {
  if (totalVariancePct > 0.20) return { flag: 'breakout', label: 'Breakout SKU', color: '#00CF92' };
  if (totalVariancePct > 0.05) return { flag: 'above_plan', label: 'Above Plan', color: '#00CF92' };
  if (totalVariancePct > -0.10) return { flag: 'on_plan', label: 'On Plan', color: 'var(--ac)' };
  if (totalVariancePct > -0.25) return { flag: 'below_plan', label: 'Below Plan', color: '#FFC711' };
  return { flag: 'at_risk', label: 'Early Risk', color: '#ef4444' };
}

export default function LaunchRampPage() {
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [view, setView] = useState('summary');
  const { newSkus } = useNewSkus();

  // Combine launch.json SKUs with any new SKUs added via Add SKU module
  const launchSkus = useMemo(() => {
    const fromJson = launchJson.skus as LaunchSku[];
    const fromNew: LaunchSku[] = newSkus.map(s => ({
      dpci: s.dpci,
      name: s.name,
      stores: s.stores,
      bear: s.baseUpspw * 0.8,
      base: s.baseUpspw,
      bull: s.baseUpspw * 1.2,
    }));
    return [...fromJson, ...fromNew];
  }, [newSkus]);
  const omniWeeks = DATA_OMNI.weeks;

  /* ── Build launch analysis per SKU ──────────────────────────────── */
  const analyses = useMemo(() => {
    return launchSkus.map(sku => {
      const vel = scenario === 'bear' ? sku.bear : scenario === 'bull' ? sku.bull : sku.base;
      const dp = DATA_DP.skus.find(s => s.dpci === sku.dpci);

      // Find Omni data for this SKU (match by DPCI)
      let omniSku = null;
      for (const [, s] of Object.entries(DATA_OMNI.skus)) {
        if (s.dpci === sku.dpci) { omniSku = s; break; }
      }

      // Determine weeks since launch from hist data (count non-zero weeks at end)
      const hist = dp?.hist || [];
      let weeksSinceLaunch = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i] > 0) weeksSinceLaunch++;
        else break;
      }
      weeksSinceLaunch = Math.min(weeksSinceLaunch, 12);

      // Build weekly ramp data
      const weeks: LaunchWeek[] = [];
      let cumForecast = 0;
      let cumActual = 0;

      for (let w = 0; w < 12; w++) {
        const rampPct = RAMP_PCT[w];
        const forecast = Math.round(vel * sku.stores * rampPct);

        // Get actual from Omni (most recent weeks correspond to launch weeks)
        let actual = 0;
        if (w < weeksSinceLaunch && omniSku) {
          const wkKey = omniWeeks[omniWeeks.length - weeksSinceLaunch + w];
          actual = omniSku.weeks[wkKey]?.units ?? 0;
        }
        // Also try from DP hist (non-zero entries at end)
        if (actual === 0 && dp && w < weeksSinceLaunch) {
          const histIdx = hist.length - weeksSinceLaunch + w;
          if (histIdx >= 0 && histIdx < hist.length) actual = hist[histIdx];
        }

        cumForecast += forecast;
        cumActual += actual;
        const variance = actual - forecast;
        const variancePct = forecast > 0 ? variance / forecast : 0;

        weeks.push({
          week: w + 1,
          forecast,
          actual: w < weeksSinceLaunch ? actual : 0,
          variance: w < weeksSinceLaunch ? variance : 0,
          variancePct: w < weeksSinceLaunch ? variancePct : 0,
          cumForecast,
          cumActual: w < weeksSinceLaunch ? cumActual : 0,
          cumVariancePct: cumForecast > 0 && w < weeksSinceLaunch ? (cumActual - cumForecast) / cumForecast : 0,
        });
      }

      const totalForecast = weeks.filter(w => w.week <= weeksSinceLaunch).reduce((a, w) => a + w.forecast, 0);
      const totalActual = weeks.filter(w => w.week <= weeksSinceLaunch).reduce((a, w) => a + w.actual, 0);
      const totalVariance = totalActual - totalForecast;
      const totalVariancePct = totalForecast > 0 ? totalVariance / totalForecast : 0;

      // Trend: compare last week variance to overall
      const recentWeeks = weeks.filter(w => w.week <= weeksSinceLaunch).slice(-2);
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (recentWeeks.length >= 2) {
        const recent = recentWeeks[1].variancePct;
        const prior = recentWeeks[0].variancePct;
        if (recent > prior + 0.05) trend = 'improving';
        else if (recent < prior - 0.05) trend = 'declining';
      }

      const perf = classifyPerformance(totalVariancePct, trend);

      return {
        sku,
        shortName: sku.name.replace(/,\s+[\d.]+\s+oz.*/, '').replace('Little Spoon ', ''),
        weeksSinceLaunch,
        weeks,
        totalForecast,
        totalActual,
        totalVariance,
        totalVariancePct,
        trend,
        flag: perf.flag,
        flagLabel: perf.label,
        flagColor: perf.color,
      } as LaunchSkuAnalysis;
    });
  }, [launchSkus, scenario, omniWeeks]);

  /* ── Portfolio KPIs ─────────────────────────────────────────────── */
  const abovePlan = analyses.filter(a => a.totalVariancePct > 0.05).length;
  const belowPlan = analyses.filter(a => a.totalVariancePct < -0.10).length;
  const avgVariance = analyses.length > 0 ? analyses.reduce((a, s) => a + s.totalVariancePct, 0) / analyses.length : 0;
  const totalFcastAll = analyses.reduce((a, s) => a + s.totalForecast, 0);
  const totalActualAll = analyses.reduce((a, s) => a + s.totalActual, 0);

  return (
    <PageShell
      title="Launch Ramp Tracker"
      subtitle={`${analyses.length} SKUs · Week 1–12 post-launch · Early performance detection`}
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />
          <ButtonGroup options={SCENARIO_OPTS} active={scenario} onChange={v => setScenario(v as ScenarioKey)} />
        </div>
      }
    >
      <KpiGrid columns={4}>
        <KpiCard
          icon="🚀" label="Launch Portfolio" style="--cc:var(--ac)"
          value={`${analyses.length} SKUs`}
          delta={`${analyses[0]?.weeksSinceLaunch ?? 0} weeks since launch`}
          deltaClass="neu" sub={`Launch: ${launchJson.launch_date}`}
        />
        <KpiCard
          icon="📊" label="Avg Ramp vs Plan" style={`--cc:${avgVariance >= 0 ? 'var(--gr)' : 'var(--rd)'}`}
          value={`${avgVariance >= 0 ? '+' : ''}${(avgVariance * 100).toFixed(1)}%`}
          delta={`${fmt(totalActualAll)} actual vs ${fmt(totalFcastAll)} forecast`}
          deltaClass={avgVariance >= 0 ? 'up' : 'dn'} sub="Cumulative to date"
        />
        <KpiCard
          icon="✅" label="Above Plan" style="--cc:var(--gr)"
          value={String(abovePlan)}
          delta={`${analyses.length - abovePlan - belowPlan} on plan`}
          deltaClass="up" sub={`${Math.round(abovePlan / analyses.length * 100)}% of launches`}
        />
        <KpiCard
          icon="⚠️" label="Below Plan / At Risk" style={`--cc:${belowPlan > 0 ? 'var(--rd)' : 'var(--gr)'}`}
          value={String(belowPlan)}
          delta={belowPlan > 0 ? 'Needs attention' : 'All launches healthy'}
          deltaClass={belowPlan > 0 ? 'dn' : 'up'} sub=""
        />
      </KpiGrid>

      {/* ── Summary View ──────────────────────────────────────────── */}
      {view === 'summary' && (
        <>
          {/* SKU Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
            {analyses.map(a => (
              <div key={a.sku.dpci} style={{ background: `${a.flagColor}08`, border: `1px solid ${a.flagColor}25`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.shortName}</div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${a.flagColor}15`, color: a.flagColor, fontWeight: 700 }}>
                    {a.flagLabel}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div>
                    <div style={{ color: 'var(--tx3)', fontSize: 9 }}>ACTUAL</div>
                    <div style={{ fontWeight: 700 }}>{fmt(a.totalActual)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--tx3)', fontSize: 9 }}>FORECAST</div>
                    <div style={{ fontWeight: 700 }}>{fmt(a.totalForecast)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--tx3)', fontSize: 9 }}>VARIANCE</div>
                    <div style={{ fontWeight: 700, color: a.flagColor }}>
                      {a.totalVariancePct >= 0 ? '+' : ''}{(a.totalVariancePct * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>
                  Week {a.weeksSinceLaunch} of 12 · {a.sku.stores} stores · Trend: {a.trend === 'improving' ? '📈 Improving' : a.trend === 'declining' ? '📉 Declining' : '➡️ Stable'}
                </div>
              </div>
            ))}
          </div>

          {/* SKU Summary Table */}
          <DataTable>
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>SKU</th>
                  <th className="tr">Wk Since Launch</th>
                  <th className="tr">Cum Forecast</th>
                  <th className="tr">Cum Actual</th>
                  <th className="tr">Variance</th>
                  <th className="tr">Variance %</th>
                  <th>Trend</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map(a => (
                  <tr key={a.sku.dpci}>
                    <td className="tn"><b>{a.shortName}</b></td>
                    <td className="tr">{a.weeksSinceLaunch}</td>
                    <td className="tr">{fmt(a.totalForecast)}</td>
                    <td className="tr" style={{ fontWeight: 600 }}>{fmt(a.totalActual)}</td>
                    <td className="tr" style={{ color: a.flagColor, fontWeight: 600 }}>{a.totalVariance >= 0 ? '+' : ''}{fmt(a.totalVariance)}</td>
                    <td className="tr" style={{ color: a.flagColor, fontWeight: 700 }}>{a.totalVariancePct >= 0 ? '+' : ''}{(a.totalVariancePct * 100).toFixed(1)}%</td>
                    <td style={{ fontSize: 11 }}>{a.trend === 'improving' ? '📈' : a.trend === 'declining' ? '📉' : '➡️'} {a.trend}</td>
                    <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${a.flagColor}15`, color: a.flagColor }}>{a.flagLabel}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── Ramp Curves View ───────────────────────────────────────── */}
      {view === 'ramp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          {analyses.map(a => (
            <div className="card" key={a.sku.dpci}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{a.shortName}</span>
                <span style={{ fontSize: 10, color: a.flagColor, fontWeight: 700 }}>{a.flagLabel}</span>
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <LineChart
                  labels={a.weeks.map(w => `Wk ${w.week}`)}
                  datasets={[
                    { label: 'Forecast', data: a.weeks.map(w => w.forecast), borderColor: 'rgba(148,163,184,0.6)', borderDash: [5, 3], backgroundColor: 'transparent' },
                    { label: 'Actual', data: a.weeks.map(w => w.week <= a.weeksSinceLaunch ? w.actual : null), borderColor: a.flagColor, backgroundColor: `${a.flagColor}15`, fill: true },
                  ]}
                  height={200}
                />
              </div>
              <div style={{ padding: '0 12px 8px', fontSize: 10, color: 'var(--tx3)' }}>
                Cum: {fmt(a.totalActual)} actual vs {fmt(a.totalForecast)} forecast ({a.totalVariancePct >= 0 ? '+' : ''}{(a.totalVariancePct * 100).toFixed(1)}%)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Weekly Detail View ─────────────────────────────────────── */}
      {view === 'weekly' && analyses.map(a => (
        <div key={a.sku.dpci} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {a.shortName}
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${a.flagColor}15`, color: a.flagColor }}>{a.flagLabel}</span>
          </div>
          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={a.weeks.filter(w => w.week <= a.weeksSinceLaunch).map(w => `Wk ${w.week}`)}
                datasets={[
                  { label: 'Forecast', data: a.weeks.filter(w => w.week <= a.weeksSinceLaunch).map(w => w.forecast), backgroundColor: 'rgba(148,163,184,0.4)' },
                  { label: 'Actual', data: a.weeks.filter(w => w.week <= a.weeksSinceLaunch).map(w => w.actual), backgroundColor: `${a.flagColor}cc` },
                ]}
                height={160}
              />
            </div>
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="tr">Forecast</th>
                  <th className="tr">Actual</th>
                  <th className="tr">Variance</th>
                  <th className="tr">Var %</th>
                  <th className="tr">Cum Fcast</th>
                  <th className="tr">Cum Actual</th>
                  <th className="tr">Cum Var %</th>
                </tr>
              </thead>
              <tbody>
                {a.weeks.filter(w => w.week <= Math.max(a.weeksSinceLaunch, 4)).map(w => {
                  const isFuture = w.week > a.weeksSinceLaunch;
                  const varColor = w.variancePct > 0.05 ? 'var(--gr)' : w.variancePct < -0.10 ? 'var(--rd)' : 'var(--tx2)';
                  return (
                    <tr key={w.week} style={{ opacity: isFuture ? 0.4 : 1 }}>
                      <td style={{ fontWeight: 600 }}>Wk {w.week}</td>
                      <td className="tr">{fmt(w.forecast)}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{isFuture ? '—' : fmt(w.actual)}</td>
                      <td className="tr" style={{ color: isFuture ? 'var(--tx3)' : varColor, fontWeight: 600 }}>
                        {isFuture ? '—' : `${w.variance >= 0 ? '+' : ''}${fmt(w.variance)}`}
                      </td>
                      <td className="tr" style={{ color: isFuture ? 'var(--tx3)' : varColor }}>
                        {isFuture ? '—' : `${w.variancePct >= 0 ? '+' : ''}${(w.variancePct * 100).toFixed(1)}%`}
                      </td>
                      <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(w.cumForecast)}</td>
                      <td className="tr">{isFuture ? '—' : fmt(w.cumActual)}</td>
                      <td className="tr" style={{ color: isFuture ? 'var(--tx3)' : varColor }}>
                        {isFuture ? '—' : `${w.cumVariancePct >= 0 ? '+' : ''}${(w.cumVariancePct * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>
      ))}
    </PageShell>
  );
}
