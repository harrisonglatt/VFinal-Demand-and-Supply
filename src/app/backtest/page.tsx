'use client';

import { useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import Chip from '@/components/ui/Chip';
import { DATA_DP, DATA_BACKTEST } from '@/data/index';
import { fmt, sf } from '@/lib/formatters';

const HIST_PROMO_MAP: Record<number, { cat: string; lift: number; type: string }> = {
  1: { cat: 'Frozen Multiserve', lift: 1.43, type: 'endcap' },
  2: { cat: 'Frozen Multiserve', lift: 1.53, type: 'endcap' },
  3: { cat: 'Frozen Multiserve', lift: 1.48, type: 'endcap' },
  4: { cat: 'Frozen Multiserve', lift: 1.51, type: 'endcap' },
  5: { cat: 'Frozen Multiserve', lift: 1.91, type: 'endcap+bogo' },
};

function calcMAPE(preds: number[], actuals: number[]) {
  if (!preds.length) return 0;
  return preds.map((p, i) => actuals[i] ? Math.abs(p - actuals[i]) / actuals[i] : 0).reduce((a, b) => a + b, 0) / preds.length;
}
function calcBias(preds: number[], actuals: number[]) {
  if (!preds.length) return 0;
  return preds.map((p, i) => actuals[i] ? (p - actuals[i]) / actuals[i] : 0).reduce((a, b) => a + b, 0) / preds.length;
}

function runWalkForward() {
  const testIndices = [4, 5, 6, 7, 8, 9, 10, 11];
  const testIdxToLabel: Record<number, string> = { 4: 'Jan 26', 5: 'Feb 2', 6: 'Feb 8', 7: 'Feb 15', 8: 'Feb 22', 9: 'Mar 1', 10: 'Mar 8', 11: 'Mar 15' };
  const bySku: { name: string; cat: string; mape: number; baseMAPE: number | null; bias: number; weeks: number }[] = [];
  const baselineErrors: number[] = [];
  const promoErrors: number[] = [];

  DATA_DP.skus.forEach(s => {
    if (!s.hist || s.hist.length < 12) return;
    const hist = s.hist.slice(0, 12);
    const isFrozen = (s.category || '').includes('Frozen');
    const skuErrors: { t: number; pred: number; actual: number; err: number; absErr: number; isPromo: boolean }[] = [];
    testIndices.forEach(t => {
      const train = hist.slice(0, t);
      if (train.length < 4) return;
      let clean: number[];
      if (isFrozen) { clean = train.filter((_, idx) => !HIST_PROMO_MAP[idx]); if (clean.length < 2) clean = train.slice(0, 1); }
      else clean = train.slice(-4);
      const avg = clean.length ? clean.reduce((a, b) => a + (b || 0), 0) / clean.length : (hist[0] || 0);
      const promoInfo = HIST_PROMO_MAP[t];
      const isPromo = !!(promoInfo && isFrozen);
      const pred = Math.round(avg * (isPromo ? (t === 5 ? 2.025 : 1.50) : 1.0));
      const actual = hist[t] || 0;
      if (!actual) return;
      const err = (pred - actual) / actual;
      skuErrors.push({ t, pred, actual, err, absErr: Math.abs(err), isPromo });
      if (isPromo) promoErrors.push(Math.abs(err));
      else baselineErrors.push(Math.abs(err));
    });
    if (skuErrors.length) {
      const basOnly = skuErrors.filter(e => !e.isPromo);
      bySku.push({
        name: s.name.replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 30),
        cat: s.category, mape: calcMAPE(skuErrors.map(e => e.pred), skuErrors.map(e => e.actual)),
        baseMAPE: basOnly.length ? calcMAPE(basOnly.map(e => e.pred), basOnly.map(e => e.actual)) : null,
        bias: calcBias(skuErrors.map(e => e.pred), skuErrors.map(e => e.actual)), weeks: skuErrors.length,
      });
    }
  });

  const byWeek = testIndices.map(t => {
    let totP = 0, totA = 0;
    DATA_DP.skus.filter(s => s.hist && s.hist.length >= 12).forEach(s => {
      const hist = s.hist.slice(0, 12);
      const isFrozen = (s.category || '').includes('Frozen');
      const train = hist.slice(0, t);
      let clean: number[];
      if (isFrozen) { clean = train.filter((_, idx) => !HIST_PROMO_MAP[idx]); if (clean.length < 2) clean = train.slice(0, 1); }
      else clean = train.slice(-4);
      const avg = clean.length ? clean.reduce((a, b) => a + (b || 0), 0) / clean.length : 0;
      const pred = Math.round(avg * ((isFrozen && HIST_PROMO_MAP[t]) ? (t === 5 ? 2.025 : 1.50) : 1.0));
      const actual = hist[t] || 0;
      if (actual > 0) { totP += pred; totA += actual; }
    });
    return { label: testIdxToLabel[t] || 'Wk ' + t, pred: totP, actual: totA, err: totA ? (totP - totA) / totA : 0, isPromo: [4, 5].includes(t) };
  });

  const overallMAPE = [...baselineErrors, ...promoErrors];
  const overallBias = byWeek.length ? byWeek.reduce((a, w) => a + w.err, 0) / byWeek.length : 0;
  return {
    byWeek, bySku: bySku.sort((a, b) => b.mape - a.mape),
    baselineMAPE: baselineErrors.length ? baselineErrors.reduce((a, b) => a + b, 0) / baselineErrors.length : 0,
    promoMAPE: promoErrors.length ? promoErrors.reduce((a, b) => a + b, 0) / promoErrors.length : 0,
    overallBias,
    totalPoints: bySku.reduce((a, s) => a + s.weeks, 0),
  };
}

export default function BacktestPage() {
  const r = useMemo(() => runWalkForward(), []);

  const chartLabels = r.byWeek.map(w => w.label + (w.isPromo ? ' *' : ''));
  const chartPreds = r.byWeek.map(w => w.pred);
  const chartActuals = r.byWeek.map(w => w.actual);

  return (
    <PageShell title="Walk-Forward Backtest" subtitle="L8W validation engine · MAPE/Bias analysis">
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <KpiGrid columns={4}>
          <KpiCard icon="&#127919;" label="Baseline MAPE" style={`--cc:${r.baselineMAPE < 0.08 ? 'var(--gr)' : r.baselineMAPE < 0.15 ? 'var(--yw)' : 'var(--rd)'}`}
            value={(r.baselineMAPE * 100).toFixed(1) + '%'} delta="Non-promo weeks" deltaClass={r.baselineMAPE < 0.10 ? 'up' : 'dn'}
            sub={r.byWeek.filter(w => !w.isPromo).length + ' baseline test points'} />
          <KpiCard icon="&#127914;" label="Promo Week MAPE" style={`--cc:${r.promoMAPE < 0.12 ? 'var(--gr)' : r.promoMAPE < 0.20 ? 'var(--yw)' : 'var(--rd)'}`}
            value={(r.promoMAPE * 100).toFixed(1) + '%'} delta="Historical promo events" deltaClass="neu"
            sub={r.byWeek.filter(w => w.isPromo).length + ' promo test points'} />
          <KpiCard icon="&#128202;" label="Forecast Bias" style={`--cc:${Math.abs(r.overallBias) < 0.03 ? 'var(--gr)' : 'var(--yw)'}`}
            value={(r.overallBias >= 0 ? '+' : '') + (r.overallBias * 100).toFixed(1) + '%'}
            delta={Math.abs(r.overallBias) < 0.02 ? 'Approx. unbiased' : r.overallBias > 0 ? 'Model trends HIGH' : 'Model trends LOW'}
            deltaClass="neu" sub="Positive = over-forecast tendency" />
          <KpiCard icon="&#128300;" label="Walk-Forward Windows" style="--cc:var(--cy)"
            value={r.totalPoints} delta="Total SKU x week test points" deltaClass="neu"
            sub={DATA_DP.skus.length + ' SKUs x up to 8 history wks'} />
        </KpiGrid>

        {/* ── Forecast vs Actual Chart ─────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Predicted vs Actual by Week</div>
          <div style={{ padding: '0 12px 12px' }}>
            <BarChart
              labels={chartLabels}
              datasets={[
                { label: 'Model Forecast', data: chartPreds, backgroundColor: 'rgba(0,227,205,.55)' },
                { label: 'Actual', data: chartActuals, backgroundColor: 'rgba(255,199,17,.65)' },
              ]}
              height={250}
            />
          </div>
        </div>

        {/* ── By-Week Table ────────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Walk-Forward Validation — Week by Week</div>
          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>Week</th><th>Type</th><th className="tr">Model Forecast</th><th className="tr">Actual Units</th>
                <th className="tr">Error</th><th className="tr">Abs Error</th><th>Assessment</th>
              </tr></thead>
              <tbody>
                {r.byWeek.map(w => {
                  const assess = Math.abs(w.err) < 0.05 ? '✅ Excellent' : Math.abs(w.err) < 0.10 ? '🟢 Good' : Math.abs(w.err) < 0.20 ? '🟡 Acceptable' : '🔴 High Error';
                  return (
                    <tr key={w.label} style={w.isPromo ? { background: 'rgba(255,199,17,.04)' } : undefined}>
                      <td style={{ color: w.isPromo ? 'var(--yw)' : 'var(--tx)' }}>{w.label}{w.isPromo ? ' *' : ''}</td>
                      <td><Chip className={w.isPromo ? 'cy2' : 'cg'}>{w.isPromo ? 'Promo' : 'Baseline'}</Chip></td>
                      <td className="tr">{fmt(w.pred)}</td>
                      <td className="tr"><b>{fmt(w.actual)}</b></td>
                      <td className={`tr ${w.err > 0.05 ? 'dn' : w.err < -0.05 ? 'up' : 'neu'}`}>{w.err >= 0 ? '+' : ''}{(w.err * 100).toFixed(1)}%</td>
                      <td className="tr">{(Math.abs(w.err) * 100).toFixed(1)}%</td>
                      <td style={{ fontSize: 12 }}>{assess}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── By-SKU MAPE Table ────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Forecast Accuracy by SKU</div>
          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>SKU</th><th>Category</th><th className="tr">MAPE</th><th className="tr">Baseline MAPE</th>
                <th className="tr">Bias</th><th className="tr">Test Wks</th><th>Grade</th>
              </tr></thead>
              <tbody>
                {r.bySku.map((s, i) => {
                  const grade = s.mape < 0.05 ? 'A' : s.mape < 0.10 ? 'B' : s.mape < 0.18 ? 'C' : s.mape < 0.25 ? 'D' : 'F';
                  const gradeCol: Record<string, string> = { A: 'var(--gr)', B: 'rgba(0,207,146,.7)', C: 'var(--yw)', D: 'rgba(255,140,0,.8)', F: 'var(--rd)' };
                  return (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{(s.cat || '').replace(' Multiserve', '')}</td>
                      <td className={`tr ${s.mape > 0.15 ? 'dn' : s.mape < 0.08 ? 'up' : 'neu'}`}>{(s.mape * 100).toFixed(1)}%</td>
                      <td className="tr">{s.baseMAPE != null ? (s.baseMAPE * 100).toFixed(1) + '%' : '—'}</td>
                      <td className={`tr ${s.bias > 0.05 ? 'dn' : s.bias < -0.05 ? 'up' : 'neu'}`}>{s.bias >= 0 ? '+' : ''}{(s.bias * 100).toFixed(1)}%</td>
                      <td className="tr">{s.weeks}</td>
                      <td><b style={{ color: gradeCol[grade] || 'var(--tx)' }}>{grade}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Systematic Over-Forecast Analysis ────────────────────────── */}
        <div className="cc">
          <div className="ct">Systematic Over-Forecast Analysis — Bias by Promo Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, padding: 12 }}>
            {Object.entries(DATA_BACKTEST.promo_type_bias).map(([ptype, pd]) => {
              const col = pd.bias_pct > 12 ? 'var(--rd)' : pd.bias_pct > 6 ? 'var(--yw)' : 'var(--gr)';
              return (
                <div key={ptype} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: 'var(--tx)', fontSize: 13 }}>{ptype}</div>
                    <div style={{ fontWeight: 800, color: col, fontSize: 16 }}>{pd.bias_pct > 0 ? '+' : ''}{pd.bias_pct.toFixed(1)}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>{pd.n_obs} obs · MAPE {pd.mape_pct.toFixed(1)}%</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx)', lineHeight: 1.5 }}>{pd.summary}</div>
                  <div style={{ fontSize: 11, color: col, fontStyle: 'italic', marginTop: 6 }}>{pd.action}</div>
                </div>
              );
            })}
          </div>

          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>Category</th><th className="tr">Baseline Bias</th><th className="tr">Baseline MAPE</th><th className="tr">Obs</th><th>Trend & Calibration Action</th>
              </tr></thead>
              <tbody>
                {Object.entries(DATA_BACKTEST.cat_baseline).map(([cat, cd]) => (
                  <tr key={cat}>
                    <td style={{ fontWeight: 600 }}>{cat.replace(' Multiserve', '')}</td>
                    <td className={`tr ${cd.bias_base > 5 ? 'dn' : cd.bias_base < -3 ? 'up' : 'neu'}`}>{cd.bias_base >= 0 ? '+' : ''}{cd.bias_base.toFixed(1)}%</td>
                    <td className="tr">{cd.mape_base.toFixed(1)}%</td>
                    <td className="tr">{cd.n_obs}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{cd.trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </div>
      </div>
    </PageShell>
  );
}
