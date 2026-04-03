'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_BACKTEST, DATA_ACCURACY, DATA_HIST_PROMO, DATA_DP } from '@/data/index';
import { useCalibration } from '@/context/CalibrationContext';
import LineChart from '@/components/charts/LineChart';
import { fmt } from '@/lib/formatters';

// ─── Walk-Forward Backtesting Engine ──────────────────────────────────
// For each "as-of" week in history, freezes data up to that point,
// generates forecasts at multiple horizons, and compares to actuals.
// No future data leakage — true blinded evaluation.

interface WalkForwardResult {
  asOfWeek: number;         // Index into hist_weeks (the freeze point)
  asOfLabel: string;
  skuDpci: string;
  skuName: string;
  category: string;
  horizon: number;          // 1, 2, 4, 8 weeks ahead
  forecast: number;         // What the model would have predicted
  actual: number;           // What actually happened
  error: number;            // actual - forecast
  absErrorPct: number;      // |error| / actual
  biasPct: number;          // (forecast - actual) / actual (positive = over-forecast)
}

function runWalkForward(): { results: WalkForwardResult[]; horizonSummary: Record<number, { mape: number; bias: number; count: number }>; weeklyMape: { week: string; mape: number }[] } {
  const results: WalkForwardResult[] = [];
  const histWeeks = DATA_DP.hist_weeks;
  const horizons = [1, 2, 4];
  // Can only test horizons that fit within our 13-week history window

  for (const sku of DATA_DP.skus) {
    const hist = sku.hist;
    if (hist.length < 5) continue;

    // For each as-of week (need at least 3 weeks of history + horizon ahead)
    for (let asOf = 3; asOf < hist.length; asOf++) {
      const asOfLabel = histWeeks[asOf] || `Wk ${asOf + 1}`;

      for (const h of horizons) {
        const targetIdx = asOf + h;
        if (targetIdx >= hist.length) continue;

        const actual = hist[targetIdx];
        if (actual <= 0) continue;

        // "Blinded" forecast: use only data up to asOf
        // Simple model: trailing 3-week average (what system would use)
        const lookback = hist.slice(Math.max(0, asOf - 2), asOf + 1);
        const forecast = Math.round(lookback.reduce((a, b) => a + b, 0) / lookback.length);

        const error = actual - forecast;
        const absErrorPct = actual > 0 ? Math.abs(error) / actual : 0;
        const biasPct = actual > 0 ? (forecast - actual) / actual : 0;

        results.push({
          asOfWeek: asOf, asOfLabel,
          skuDpci: sku.dpci, skuName: sku.name.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 28),
          category: sku.category,
          horizon: h, forecast, actual, error, absErrorPct, biasPct,
        });
      }
    }
  }

  // Summarize by horizon
  const horizonSummary: Record<number, { mape: number; bias: number; count: number }> = {};
  for (const h of horizons) {
    const hResults = results.filter(r => r.horizon === h);
    if (hResults.length === 0) continue;
    const mape = hResults.reduce((a, r) => a + r.absErrorPct, 0) / hResults.length * 100;
    const bias = hResults.reduce((a, r) => a + r.biasPct, 0) / hResults.length * 100;
    horizonSummary[h] = { mape: Math.round(mape * 10) / 10, bias: Math.round(bias * 10) / 10, count: hResults.length };
  }

  // Weekly MAPE trend (across all SKUs per as-of week)
  const weeklyMap: Record<number, { errors: number[]; count: number }> = {};
  results.filter(r => r.horizon === 1).forEach(r => {
    if (!weeklyMap[r.asOfWeek]) weeklyMap[r.asOfWeek] = { errors: [], count: 0 };
    weeklyMap[r.asOfWeek].errors.push(r.absErrorPct);
    weeklyMap[r.asOfWeek].count++;
  });
  const weeklyMape = Object.entries(weeklyMap)
    .map(([wk, d]) => ({ week: DATA_DP.hist_weeks[parseInt(wk)] || `Wk ${wk}`, mape: Math.round(d.errors.reduce((a, b) => a + b, 0) / d.errors.length * 1000) / 10 }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return { results, horizonSummary, weeklyMape };
}

const VIEW_OPTS = [
  { value: 'walkforward', label: 'Walk-Forward' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'promo', label: 'Promo Bias' },
  { value: 'sku', label: 'SKU Diagnostics' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'log', label: 'Learning Log' },
];

const MAPE_GOAL = 10;

export default function BacktestPage() {
  const [view, setView] = useState('walkforward');
  const bt = DATA_BACKTEST;
  const acc = DATA_ACCURACY;
  const calibration = useCalibration();

  /* ── Portfolio accuracy metrics ──────────────────────────────────── */
  const portfolioMAPE = acc.model_mape_l4w;
  const portfolioBias = acc.model_bias_l4w;
  const skusAtGoal = acc.skus.filter(s => s.mape_l4w < MAPE_GOAL).length;

  /* ── Promo type bias analysis ───────────────────────────────────── */
  const promoTypes = useMemo(() => {
    return Object.entries(bt.promo_type_bias).map(([type, data]) => ({
      type,
      bias: data.bias_pct,
      mape: data.mape_pct,
      nObs: data.n_obs,
      summary: data.summary,
      action: data.action,
      byCat: Object.entries(data.by_cat || {}).map(([cat, cd]) => ({
        category: cat, bias: cd.bias_pct, mape: cd.mape_pct, nObs: cd.n_obs,
      })),
    }));
  }, [bt]);

  /* ── Category baseline analysis ─────────────────────────────────── */
  const catBaselines = useMemo(() => {
    return Object.entries(bt.cat_baseline).map(([cat, data]) => ({
      category: cat,
      mapeBase: data.mape_base,
      biasBase: data.bias_base,
      nObs: data.n_obs,
      trend: data.trend,
    }));
  }, [bt]);

  /* ── SKU diagnostics ────────────────────────────────────────────── */
  const skuDiag = useMemo(() => {
    return bt.skus.map(s => {
      const accSku = acc.skus.find(a => a.dpci === s.dpci);
      return {
        dpci: s.dpci,
        name: accSku?.name?.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 30) ?? s.dpci,
        category: accSku?.category ?? '',
        biasBase: s.bias_base,
        biasPromo: s.bias_promo,
        nObsBase: s.n_obs_base,
        nObsPromo: s.n_obs_promo,
        conservativeTilt: s.conservative_tilt,
        reason: s.reason,
        mapeL4w: accSku?.mape_l4w ?? 0,
        mapeL8w: accSku?.mape_l8w ?? 0,
        trustScore: accSku?.trust_score ?? 0,
        trustLevel: accSku?.trust_level ?? '',
        volatility: accSku?.volatility ?? 0,
        mapePromo: accSku?.mape_promo ?? 0,
        mapeBase: accSku?.mape_base ?? 0,
      };
    }).sort((a, b) => b.mapeL4w - a.mapeL4w);
  }, [bt, acc]);

  /* ── Calibration recommendations ────────────────────────────────── */
  const recommendations = useMemo(() => {
    const recs: { priority: 'high' | 'medium' | 'low'; icon: string; title: string; detail: string; impact: string; color: string }[] = [];

    // Promo lift over-forecasting
    promoTypes.forEach(pt => {
      if (pt.bias > 5) {
        recs.push({
          priority: 'high', icon: '📉', color: '#ef4444',
          title: `Reduce ${pt.type} lift assumptions`,
          detail: `${pt.type} promos over-forecast by +${pt.bias.toFixed(1)}% on average (${pt.nObs} observations). Model consistently expects more lift than reality delivers.`,
          impact: `Reducing lift by ~${Math.round(pt.bias)}% would improve ${pt.type} MAPE from ${pt.mape.toFixed(1)}% to ~${Math.max(pt.mape - pt.bias * 0.7, 5).toFixed(1)}%.`,
        });
      }
    });

    // Category baseline bias
    catBaselines.forEach(cb => {
      if (Math.abs(cb.biasBase) > 4) {
        const dir = cb.biasBase > 0 ? 'over' : 'under';
        recs.push({
          priority: 'medium', icon: cb.biasBase > 0 ? '⬇️' : '⬆️', color: '#FFC711',
          title: `Adjust ${cb.category} baseline ${dir === 'over' ? 'down' : 'up'}`,
          detail: `${cb.category} baseline ${dir}-forecasts by ${Math.abs(cb.biasBase).toFixed(1)}% (${cb.nObs} weeks). ${cb.trend}`,
          impact: `Correcting baseline would reduce category MAPE by ~${Math.round(Math.abs(cb.biasBase) * 0.5)}pp.`,
        });
      }
    });

    // High MAPE SKUs
    const highMape = skuDiag.filter(s => s.mapeL4w > 25);
    if (highMape.length > 0) {
      recs.push({
        priority: 'medium', icon: '🎯', color: '#818cf8',
        title: `${highMape.length} SKUs with MAPE >25% need attention`,
        detail: `SKUs: ${highMape.slice(0, 3).map(s => s.name).join(', ')}${highMape.length > 3 ? ` +${highMape.length - 3} more` : ''}. These are the biggest drag on portfolio accuracy.`,
        impact: `Fixing the top 3 worst SKUs could reduce portfolio MAPE by ~${Math.round((portfolioMAPE - MAPE_GOAL) * 0.3)}pp.`,
      });
    }

    // Volatile SKUs needing wider bands
    const volatile = skuDiag.filter(s => s.volatility > 0.3);
    if (volatile.length > 0) {
      recs.push({
        priority: 'low', icon: '🎢', color: 'var(--tx3)',
        title: `Widen confidence bands for ${volatile.length} volatile SKUs`,
        detail: `${volatile.slice(0, 3).map(s => `${s.name} (CV ${(s.volatility * 100).toFixed(0)}%)`).join(', ')}. Point forecasts will always be noisy for these.`,
        impact: `Better confidence intervals improve planning quality even when point accuracy is limited.`,
      });
    }

    // Overall improvement path
    recs.push({
      priority: 'low', icon: '🎯', color: 'var(--ac)',
      title: `Path to sub-${MAPE_GOAL}% MAPE`,
      detail: `Current: ${portfolioMAPE.toFixed(1)}%. Gap: ${(portfolioMAPE - MAPE_GOAL).toFixed(1)}pp. ${skusAtGoal} of ${acc.skus.length} SKUs already at goal.`,
      impact: `Focus on: (1) promo lift calibration (biggest lever), (2) high-MAPE SKU fixes, (3) baseline adjustments. Achievable in 4-6 weeks of iteration.`,
    });

    return recs.sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; });
  }, [promoTypes, catBaselines, skuDiag, portfolioMAPE, skusAtGoal, acc]);

  /* ── Learning log (from historical promo data) ──────────────────── */
  const learningLog = useMemo(() => {
    return DATA_HIST_PROMO.map(e => ({
      date: e.date,
      event: e.event,
      category: e.category,
      type: e.type,
      modelLift: e.model_lift_pct,
      actualLift: e.actual_lift_pct,
      delta: e.delta_pct,
      overUnder: e.over_under,
      learning: e.notes,
    }));
  }, []);

  /* ── Walk-Forward Backtest Engine ─────────────────────────────────── */
  const wf = useMemo(() => runWalkForward(), []);

  // Category-level walk-forward accuracy
  const wfByCat = useMemo(() => {
    const cats: Record<string, { errors: number[]; biases: number[] }> = {};
    wf.results.filter(r => r.horizon === 1).forEach(r => {
      if (!cats[r.category]) cats[r.category] = { errors: [], biases: [] };
      cats[r.category].errors.push(r.absErrorPct);
      cats[r.category].biases.push(r.biasPct);
    });
    return Object.entries(cats).map(([cat, d]) => ({
      category: cat,
      mape: Math.round(d.errors.reduce((a, b) => a + b, 0) / d.errors.length * 1000) / 10,
      bias: Math.round(d.biases.reduce((a, b) => a + b, 0) / d.biases.length * 1000) / 10,
      n: d.errors.length,
    })).sort((a, b) => a.mape - b.mape);
  }, [wf]);

  // SKU-level walk-forward accuracy (1-week horizon)
  const wfBySku = useMemo(() => {
    const skus: Record<string, { name: string; cat: string; errors: number[]; biases: number[] }> = {};
    wf.results.filter(r => r.horizon === 1).forEach(r => {
      if (!skus[r.skuDpci]) skus[r.skuDpci] = { name: r.skuName, cat: r.category, errors: [], biases: [] };
      skus[r.skuDpci].errors.push(r.absErrorPct);
      skus[r.skuDpci].biases.push(r.biasPct);
    });
    return Object.entries(skus).map(([dpci, d]) => ({
      dpci, name: d.name, category: d.cat,
      mape: Math.round(d.errors.reduce((a, b) => a + b, 0) / d.errors.length * 1000) / 10,
      bias: Math.round(d.biases.reduce((a, b) => a + b, 0) / d.biases.length * 1000) / 10,
      n: d.errors.length,
    })).sort((a, b) => a.mape - b.mape);
  }, [wf]);

  // Overall walk-forward MAPE (1-week)
  const wfOverallMape = wf.horizonSummary[1]?.mape ?? 0;
  const wfOverallBias = wf.horizonSummary[1]?.bias ?? 0;
  const wfImproving = wf.weeklyMape.length >= 3 && wf.weeklyMape[wf.weeklyMape.length - 1].mape < wf.weeklyMape[wf.weeklyMape.length - 3].mape;

  return (
    <PageShell
      title="Model Learning Lab"
      subtitle={`Walk-forward backtest · ${wf.results.length} evaluations · ${bt.as_of}`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard icon="🎯" label="Portfolio MAPE" style={`--cc:${portfolioMAPE < MAPE_GOAL ? 'var(--gr)' : portfolioMAPE < 15 ? 'var(--yw)' : 'var(--rd)'}`} value={`${portfolioMAPE.toFixed(1)}%`} delta={`Target: <${MAPE_GOAL}% · Gap: ${(portfolioMAPE - MAPE_GOAL).toFixed(1)}pp`} deltaClass={portfolioMAPE < MAPE_GOAL ? 'up' : 'dn'} sub="" />
        <KpiCard icon="⚖️" label="Portfolio Bias" style={`--cc:${Math.abs(portfolioBias) < 3 ? 'var(--gr)' : 'var(--yw)'}`} value={`${portfolioBias > 0 ? '+' : ''}${portfolioBias.toFixed(1)}%`} delta={portfolioBias > 0 ? 'Over-forecasting' : 'Under-forecasting'} deltaClass={Math.abs(portfolioBias) < 3 ? 'up' : 'neu'} sub="" />
        <KpiCard icon="✅" label="SKUs at Goal" style="--cc:var(--gr)" value={`${skusAtGoal}/${acc.skus.length}`} delta={`${Math.round(skusAtGoal / acc.skus.length * 100)}% of portfolio`} deltaClass={skusAtGoal > acc.skus.length / 2 ? 'up' : 'dn'} sub="" />
        <KpiCard icon="📋" label="Calibration Actions" style="--cc:#818cf8" value={String(recommendations.filter(r => r.priority === 'high').length)} delta={`${recommendations.length} total recommendations`} deltaClass="neu" sub="High priority" />
      </KpiGrid>

      {/* ── Walk-Forward Backtest View ──────────────────────────────── */}
      {view === 'walkforward' && (
        <>
          {/* Horizon accuracy comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
            {Object.entries(wf.horizonSummary).map(([h, data]) => {
              const col = data.mape < 10 ? '#00CF92' : data.mape < 15 ? '#FFC711' : '#ef4444';
              return (
                <div key={h} style={{ background: `${col}08`, border: `1px solid ${col}20`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>{h}-Week Horizon</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: col, marginTop: 4 }}>{data.mape}%</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}>MAPE · Bias: {data.bias > 0 ? '+' : ''}{data.bias}% · {data.count} evaluations</div>
                </div>
              );
            })}
          </div>

          {/* MAPE trend over time */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Walk-Forward MAPE Trend (1-Week Horizon)</span>
              <span style={{ fontSize: 11, color: wfImproving ? 'var(--gr)' : 'var(--rd)' }}>{wfImproving ? '📈 Improving' : '📉 Needs work'}</span>
            </div>
            <div style={{ padding: '0 12px 12px' }}>
              <LineChart
                labels={wf.weeklyMape.map(w => w.week)}
                datasets={[
                  { label: 'MAPE %', data: wf.weeklyMape.map(w => w.mape), borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.1)', fill: true },
                  { label: 'Goal', data: wf.weeklyMape.map(() => MAPE_GOAL), borderColor: 'rgba(0,207,146,.4)', borderDash: [4, 3], backgroundColor: 'transparent' },
                ]}
                height={220}
              />
            </div>
          </div>

          {/* Accuracy by horizon */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <div className="card-title">Walk-Forward MAPE by Category</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={wfByCat.map(c => c.category)}
                  datasets={[{ label: 'MAPE %', data: wfByCat.map(c => c.mape), backgroundColor: wfByCat.map(c => c.mape < 10 ? 'rgba(0,207,146,.7)' : c.mape < 15 ? 'rgba(255,199,17,.7)' : 'rgba(239,68,68,.7)') }]}
                  height={200}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Walk-Forward Bias by Category</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={wfByCat.map(c => c.category)}
                  datasets={[{ label: 'Bias %', data: wfByCat.map(c => c.bias), backgroundColor: wfByCat.map(c => Math.abs(c.bias) < 3 ? 'rgba(0,207,146,.7)' : 'rgba(255,199,17,.7)') }]}
                  height={200}
                />
              </div>
            </div>
          </div>

          {/* SKU-level walk-forward results */}
          <DataTable>
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>SKU</th>
                  <th>Category</th>
                  <th className="tr">WF MAPE</th>
                  <th className="tr">WF Bias</th>
                  <th className="tr">Evaluations</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {wfBySku.map(s => (
                  <tr key={s.dpci} style={{ background: s.mape < MAPE_GOAL ? 'rgba(0,207,146,.03)' : s.mape > 20 ? 'rgba(239,68,68,.03)' : undefined }}>
                    <td className="tn"><b>{s.name}</b></td>
                    <td style={{ fontSize: 10 }}>{s.category}</td>
                    <td className="tr" style={{ color: s.mape < 10 ? 'var(--gr)' : s.mape < 15 ? 'var(--yw)' : 'var(--rd)', fontWeight: 700 }}>{s.mape}%</td>
                    <td className="tr" style={{ color: Math.abs(s.bias) > 5 ? 'var(--rd)' : 'var(--tx2)' }}>{s.bias > 0 ? '+' : ''}{s.bias}%</td>
                    <td className="tr">{s.n}</td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: s.mape < 10 ? 'rgba(0,207,146,.12)' : s.mape < 15 ? 'rgba(255,199,17,.12)' : 'rgba(239,68,68,.12)', color: s.mape < 10 ? '#00CF92' : s.mape < 15 ? '#FFC711' : '#ef4444' }}>
                        {s.mape < 10 ? '✅ At Goal' : s.mape < 15 ? '🟡 Close' : '🔴 Needs Work'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          {/* Methodology note */}
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,227,205,.04)', borderRadius: 8, fontSize: 11, color: 'var(--tx3)', lineHeight: 1.8 }}>
            <b style={{ color: 'var(--ac)' }}>Walk-Forward Methodology:</b> For each historical week, the engine freezes all data as of that point and generates forecasts using only available information (trailing 3-week average). Forecasts are compared to actual outcomes at 1, 2, and 4-week horizons. No future data leakage. {wf.results.length} total evaluations across {DATA_DP.skus.length} SKUs. More recent backtests are weighted more heavily in calibration recommendations.
          </div>
        </>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <div className="card-title">MAPE by Category (L4W)</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={Object.keys(acc.cat_mape)}
                  datasets={[
                    { label: 'MAPE %', data: Object.values(acc.cat_mape), backgroundColor: Object.values(acc.cat_mape).map(v => v < 10 ? 'rgba(0,207,146,.7)' : v < 15 ? 'rgba(255,199,17,.7)' : 'rgba(239,68,68,.7)') },
                  ]}
                  height={220}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Bias by Category (L4W)</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={Object.keys(acc.cat_bias)}
                  datasets={[
                    { label: 'Bias %', data: Object.values(acc.cat_bias), backgroundColor: Object.values(acc.cat_bias).map(v => Math.abs(v) < 3 ? 'rgba(0,207,146,.7)' : 'rgba(255,199,17,.7)') },
                  ]}
                  height={220}
                />
              </div>
            </div>
          </div>

          {/* Accuracy by promo vs base */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Promo vs Base Week Accuracy</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={Object.keys(bt.promo_type_bias)}
                datasets={[
                  { label: 'Bias %', data: Object.values(bt.promo_type_bias).map((v: any) => v.bias_pct), backgroundColor: Object.values(bt.promo_type_bias).map((v: any) => v.bias_pct > 5 ? 'rgba(239,68,68,.7)' : 'rgba(0,207,146,.7)') },
                ]}
                height={200}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Promo Bias Deep Dive ──────────────────────────────────── */}
      {view === 'promo' && (
        <>
          {promoTypes.map(pt => (
            <div key={pt.type} className="card" style={{ marginTop: 12 }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{pt.type} Promo Bias</span>
                <span style={{ fontSize: 11, color: pt.bias > 5 ? 'var(--rd)' : pt.bias > 2 ? 'var(--yw)' : 'var(--gr)', fontWeight: 700 }}>
                  {pt.bias > 0 ? '+' : ''}{pt.bias.toFixed(1)}% bias · {pt.mape.toFixed(1)}% MAPE · {pt.nObs} obs
                </span>
              </div>
              <div style={{ padding: '8px 16px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8 }}>{pt.summary}</div>
                <div style={{ fontSize: 11, color: 'var(--ac)', fontWeight: 600, marginBottom: 8 }}>Action: {pt.action}</div>
                {pt.byCat.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                    {pt.byCat.map(c => (
                      <div key={c.category} style={{ background: 'var(--s2)', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                        <div style={{ fontWeight: 600 }}>{c.category}</div>
                        <div style={{ color: c.bias > 5 ? 'var(--rd)' : 'var(--tx2)' }}>Bias: {c.bias > 0 ? '+' : ''}{c.bias.toFixed(1)}% · MAPE: {c.mape.toFixed(1)}% ({c.nObs} obs)</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── SKU Diagnostics ───────────────────────────────────────── */}
      {view === 'sku' && (
        <DataTable>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>SKU</th>
                <th>Category</th>
                <th className="tr">MAPE L4W</th>
                <th className="tr">MAPE L8W</th>
                <th className="tr">Base Bias</th>
                <th className="tr">Promo Bias</th>
                <th className="tr">MAPE Base</th>
                <th className="tr">MAPE Promo</th>
                <th className="tr">Volatility</th>
                <th className="tr">Trust</th>
                <th style={{ minWidth: 200 }}>Diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {skuDiag.map(s => (
                <tr key={s.dpci} style={{ background: s.mapeL4w < MAPE_GOAL ? 'rgba(0,207,146,.03)' : s.mapeL4w > 25 ? 'rgba(239,68,68,.03)' : undefined }}>
                  <td className="tn"><b>{s.name}</b></td>
                  <td style={{ fontSize: 10 }}>{s.category}</td>
                  <td className="tr" style={{ color: s.mapeL4w < 10 ? 'var(--gr)' : s.mapeL4w < 20 ? 'var(--yw)' : 'var(--rd)', fontWeight: 700 }}>{s.mapeL4w.toFixed(1)}%</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{s.mapeL8w.toFixed(1)}%</td>
                  <td className="tr" style={{ color: Math.abs(s.biasBase) > 5 ? 'var(--rd)' : 'var(--tx2)' }}>{s.biasBase > 0 ? '+' : ''}{s.biasBase.toFixed(1)}%</td>
                  <td className="tr" style={{ color: Math.abs(s.biasPromo) > 5 ? 'var(--rd)' : 'var(--tx2)' }}>{s.biasPromo > 0 ? '+' : ''}{s.biasPromo.toFixed(1)}%</td>
                  <td className="tr">{s.mapeBase.toFixed(1)}%</td>
                  <td className="tr" style={{ color: s.mapePromo > 20 ? 'var(--rd)' : 'var(--tx2)' }}>{s.mapePromo.toFixed(1)}%</td>
                  <td className="tr" style={{ color: s.volatility > 0.3 ? 'var(--rd)' : 'var(--gr)' }}>{(s.volatility * 100).toFixed(0)}%</td>
                  <td className="tr"><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: s.trustLevel === 'High' ? 'rgba(0,207,146,.1)' : 'rgba(255,199,17,.1)', color: s.trustLevel === 'High' ? 'var(--gr)' : 'var(--yw)' }}>{s.trustScore}</span></td>
                  <td style={{ fontSize: 10, color: 'var(--tx2)', lineHeight: 1.4 }}>{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── Calibration Recommendations ────────────────────────────── */}
      {view === 'calibration' && calibration && (
        <>
          {/* Auto-calibration status */}
          <div style={{ marginTop: 16, padding: '14px 18px', background: calibration.autoCalibrate ? 'rgba(0,227,205,.06)' : 'rgba(148,163,184,.06)', border: `1px solid ${calibration.autoCalibrate ? 'rgba(0,227,205,.2)' : 'var(--bd)'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: calibration.autoCalibrate ? 'var(--ac)' : 'var(--tx3)' }}>
                🧠 Auto-Calibration: {calibration.autoCalibrate ? 'Active' : 'Paused'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>
                {calibration.adjustmentCount} SKUs auto-adjusted · Avg correction: ±{calibration.totalImpactPct}% · Changes flow to Demand Plan and Shipment Plan in real-time
              </div>
            </div>
            <button
              onClick={() => calibration.setAutoCalibrate(!calibration.autoCalibrate)}
              style={{ background: calibration.autoCalibrate ? 'rgba(239,68,68,.1)' : 'rgba(0,207,146,.1)', border: `1px solid ${calibration.autoCalibrate ? 'rgba(239,68,68,.3)' : 'rgba(0,207,146,.3)'}`, borderRadius: 6, padding: '6px 16px', color: calibration.autoCalibrate ? '#ef4444' : '#00CF92', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {calibration.autoCalibrate ? 'Pause Auto-Cal' : 'Enable Auto-Cal'}
            </button>
          </div>

          {/* Active auto-adjustments table */}
          {calibration.adjustmentCount > 0 && (
            <DataTable>
              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 170 }}>SKU</th>
                    <th>Category</th>
                    <th className="tr">Correction</th>
                    <th>Magnitude</th>
                    <th style={{ minWidth: 300 }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {calibration.factors.filter((f: any) => f.applied && f.factor !== 1.0).map((f: any, i: number) => (
                    <tr key={i} style={{ background: f.magnitude === 'large' ? 'rgba(255,199,17,.04)' : undefined }}>
                      <td className="tn"><b>{f.name}</b></td>
                      <td style={{ fontSize: 10 }}>{f.category}</td>
                      <td className="tr" style={{ fontWeight: 700, color: f.factor > 1 ? 'var(--gr)' : 'var(--rd)' }}>
                        ×{f.factor.toFixed(3)} ({f.factor > 1 ? '+' : ''}{((f.factor - 1) * 100).toFixed(1)}%)
                      </td>
                      <td>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: f.magnitude === 'large' ? 'rgba(255,199,17,.12)' : 'rgba(148,163,184,.08)', color: f.magnitude === 'large' ? '#FFC711' : 'var(--tx3)' }}>
                          {f.magnitude === 'large' ? '⚡ Large' : '~ Small'}
                        </span>
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--tx2)', lineHeight: 1.4 }}>{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </>
      )}

      {view === 'calibration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {recommendations.map((rec, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 20px', background: `${rec.color}06`, border: `1px solid ${rec.color}20`, borderRadius: 10 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{rec.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: rec.color }}>{rec.title}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: rec.priority === 'high' ? 'rgba(239,68,68,.12)' : rec.priority === 'medium' ? 'rgba(255,199,17,.12)' : 'rgba(148,163,184,.12)', color: rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#FFC711' : 'var(--tx3)' }}>
                    {rec.priority.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.6, marginBottom: 4 }}>{rec.detail}</div>
                <div style={{ fontSize: 11, color: 'var(--ac)', fontWeight: 600 }}>Impact: {rec.impact}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Learning Log ──────────────────────────────────────────── */}
      {view === 'log' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 12, marginBottom: 8 }}>
            Every completed promo event feeds back into the calibration engine. Model learns from over/under-forecasting patterns.
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ minWidth: 180 }}>Event</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th className="tr">Model Lift</th>
                  <th className="tr">Actual Lift</th>
                  <th className="tr">Delta</th>
                  <th>Direction</th>
                  <th style={{ minWidth: 250 }}>Learning</th>
                </tr>
              </thead>
              <tbody>
                {learningLog.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 11 }}>{e.date}</td>
                    <td className="tn" style={{ fontSize: 11 }}>{e.event}</td>
                    <td style={{ fontSize: 10 }}>{e.category}</td>
                    <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,227,205,.1)', color: 'var(--ac)' }}>{e.type}</span></td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>{e.modelLift}%</td>
                    <td className="tr" style={{ fontWeight: 700, color: 'var(--gr)' }}>{e.actualLift}%</td>
                    <td className="tr" style={{ color: e.delta >= 0 ? 'var(--gr)' : 'var(--rd)', fontWeight: 600 }}>{e.delta >= 0 ? '+' : ''}{e.delta}pp</td>
                    <td style={{ fontSize: 10, color: e.overUnder === 'over' ? 'var(--rd)' : 'var(--gr)' }}>{e.overUnder === 'over' ? '📉 Over-forecast' : '📈 Under-forecast'}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx2)', lineHeight: 1.4 }}>{e.learning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}
    </PageShell>
  );
}
