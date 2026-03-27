'use client';

import { useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP, DATA_ENDCAP_HISTORY, DATA_ACCURACY, DATA_STOPSHIP, DATA_BACKTEST, FCAST_REV_52WK } from '@/data/index';
import { fmt, fmtDol, sf } from '@/lib/formatters';

/* ── Helpers (local) ──────────────────────────────────────────────── */
function getAcc(dpci: string) { return DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null; }
function getSS(dpci: string) { return DATA_STOPSHIP.skus.find(s => s.dpci === dpci) || null; }

const HIST_PROMO_MAP: Record<number, boolean> = { 1: true, 2: true, 3: true, 4: true, 5: true };

function calcMAPE_arr(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function runWalkForwardBaseline() {
  const testIndices = [4, 5, 6, 7, 8, 9, 10, 11];
  const baselineErrors: number[] = [];
  const promoErrors: number[] = [];
  const byCat: Record<string, { errors: number[] }> = {};

  DATA_DP.skus.forEach(s => {
    if (!s.hist || s.hist.length < 12) return;
    const hist = s.hist.slice(0, 12);
    const isFrozen = (s.category || '').includes('Frozen');
    testIndices.forEach(t => {
      const trainData = hist.slice(0, t);
      if (trainData.length < 4) return;
      let cleanTrain: number[];
      if (isFrozen) {
        cleanTrain = trainData.filter((_, idx) => !HIST_PROMO_MAP[idx]);
        if (cleanTrain.length < 2) cleanTrain = trainData.slice(0, 1);
      } else {
        cleanTrain = trainData.slice(-4);
      }
      const baselineAvg = cleanTrain.length ? cleanTrain.reduce((a, b) => a + (b || 0), 0) / cleanTrain.length : (hist[0] || 0);
      const promoInfo = HIST_PROMO_MAP[t];
      const isPromo = !!(promoInfo && isFrozen);
      const modelLift = isPromo ? (t === 5 ? 2.025 : 1.50) : 1.0;
      const pred = Math.round(baselineAvg * modelLift);
      const actual = hist[t] || 0;
      if (!actual) return;
      const absErr = Math.abs(pred - actual) / actual;
      if (isPromo) promoErrors.push(absErr);
      else baselineErrors.push(absErr);
      if (!byCat[s.category]) byCat[s.category] = { errors: [] };
      byCat[s.category].errors.push(absErr);
    });
  });

  const byWeekAgg = testIndices.map(t => {
    let totPred = 0, totActual = 0;
    DATA_DP.skus.filter(s => s.hist && s.hist.length >= 12).forEach(s => {
      const hist = s.hist.slice(0, 12);
      const isFrozen = (s.category || '').includes('Frozen');
      const trainData = hist.slice(0, t);
      let cleanTrain: number[];
      if (isFrozen) { cleanTrain = trainData.filter((_, idx) => !HIST_PROMO_MAP[idx]); if (cleanTrain.length < 2) cleanTrain = trainData.slice(0, 1); }
      else cleanTrain = trainData.slice(-4);
      const baselineAvg = cleanTrain.length ? cleanTrain.reduce((a, b) => a + (b || 0), 0) / cleanTrain.length : 0;
      const promoInfo = HIST_PROMO_MAP[t];
      const modelLift = (isFrozen && promoInfo) ? (t === 5 ? 2.025 : 1.50) : 1.0;
      const pred = Math.round(baselineAvg * modelLift);
      const actual = hist[t] || 0;
      if (actual > 0) { totPred += pred; totActual += actual; }
    });
    return { pred: totPred, actual: totActual, err: totActual ? (totPred - totActual) / totActual : 0 };
  });

  const overallBias = byWeekAgg.length ? byWeekAgg.reduce((a, w) => a + w.err, 0) / byWeekAgg.length : 0;
  return {
    baselineMAPE: calcMAPE_arr(baselineErrors),
    promoMAPE: calcMAPE_arr(promoErrors),
    overallBias,
    baselineErrors,
    byCat,
  };
}

function getConservativeAdj(dpci: string) {
  const acc = getAcc(dpci);
  const bt = DATA_BACKTEST.skus.find(s => s.dpci === dpci);
  const ss = getSS(dpci);
  if (!acc) return { bias_adj_pct: 0, conserv_tilt_pct: -5.0, exposure_adj_pct: 0, total_adj_pct: -5.0, reason: 'Default conservative tilt', is_new_sku: true };
  const isNew = ['analog_smoothies_1ct', 'analog_new_format', 'analog_baby_puffs_curve'].includes(acc.data_quality);
  const bias = acc.bias_l4w || 0;
  const vol = acc.volatility || 0.15;
  const trust = acc.trust_score || 50;
  const nObsBase = bt ? bt.n_obs_base : 0;
  const biasBase = bt ? bt.bias_base : bias;
  let bias_adj_pct = 0;
  if (!isNew && biasBase > 2) {
    const cw = nObsBase >= 8 ? 0.70 : nObsBase >= 4 ? 0.55 : 0.40;
    bias_adj_pct = -Math.min(biasBase * cw, 18);
  }
  const tiltBase = bt ? bt.conservative_tilt : (3 + vol * 18);
  const trustPenalty = trust < 45 ? 1.2 : trust < 60 ? 1.0 : 0.85;
  const conserv_tilt_pct = -(Math.min(Math.max(tiltBase * trustPenalty, 3.0), 8.5));
  let exposure_adj_pct = 0;
  if (ss && ss.risk_level !== 'LOW') {
    const w = ss.stop_ship_wk || 99;
    const isUrgent = w <= 8;
    const isLowConf = acc.trust_level === 'Low';
    const isHighInv = ss.dc_on_hand > 20000;
    if (isHighInv && isLowConf && isUrgent) exposure_adj_pct = -4.5;
    else if (isHighInv && isUrgent) exposure_adj_pct = -2.5;
    else if (isLowConf && isUrgent) exposure_adj_pct = -3.0;
    else if (isHighInv || isLowConf) exposure_adj_pct = -1.5;
  }
  const total_adj_pct = Math.round((bias_adj_pct + conserv_tilt_pct + exposure_adj_pct) * 10) / 10;
  const reasons: string[] = [];
  if (bt?.reason) reasons.push(bt.reason);
  if (biasBase > 5 && !isNew) reasons.push('Promo lift historically overstated +' + biasBase.toFixed(1) + '%');
  if (trust < 50) reasons.push('Low confidence (trust ' + trust + '/100)');
  if (isNew) reasons.push('Analog estimate');
  return { bias_adj_pct: Math.round(bias_adj_pct * 10) / 10, conserv_tilt_pct: Math.round(conserv_tilt_pct * 10) / 10, exposure_adj_pct: Math.round(exposure_adj_pct * 10) / 10, total_adj_pct, reason: reasons.slice(0, 3).join('; ') || 'Standard calibration', is_new_sku: isNew };
}

export default function ModelLearningPage() {
  const r = useMemo(() => runWalkForwardBaseline(), []);

  /* ── Lift calibration ───────────────────────────────────────────── */
  const endcapCal = useMemo(() => (DATA_ENDCAP_HISTORY || []).filter((e: any) => e.actual_lift), []);
  const frozenEndcapActuals = endcapCal.filter((e: any) => e.type !== 'Stacked');
  const frozenStackedActual = endcapCal.filter((e: any) => e.type === 'Stacked');
  const modelEndcap = 1.50;
  const modelStacked = 2.025;
  const avgActualEndcap = frozenEndcapActuals.length ? frozenEndcapActuals.reduce((a: number, e: any) => a + e.actual_lift, 0) / frozenEndcapActuals.length : modelEndcap;
  const avgActualStacked = frozenStackedActual.length ? frozenStackedActual.reduce((a: number, e: any) => a + e.actual_lift, 0) / frozenStackedActual.length : modelStacked;
  const endcapCalFactor = avgActualEndcap / modelEndcap;
  const stackedCalFactor = avgActualStacked / modelStacked;

  /* ── Velocity calibration ───────────────────────────────────────── */
  const cleanWkIndices = [6, 7, 8, 9, 10, 11];
  const skuVelCal = useMemo(() => DATA_DP.skus.map(s => {
    const cleanHist = cleanWkIndices.map(i => sf(s.hist && s.hist[i])).filter(v => v > 0);
    if (!cleanHist.length) return null;
    const histAvg = cleanHist.reduce((a, b) => a + b, 0) / cleanHist.length;
    const fcastBase = sf(s.fcast[0]);
    const velErr = fcastBase ? ((fcastBase - histAvg) / histAvg) : 0;
    return { name: s.name.replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 28), cat: s.category, histAvg, fcastBase, velErr };
  }).filter(Boolean).sort((a: any, b: any) => Math.abs(b.velErr) - Math.abs(a.velErr)) as { name: string; cat: string; histAvg: number; fcastBase: number; velErr: number }[], []);

  const overFcast = skuVelCal.filter(s => s.velErr > 0.05);
  const underFcast = skuVelCal.filter(s => s.velErr < -0.05);

  /* ── Confidence bands ───────────────────────────────────────────── */
  const baselineMAPE = r.baselineMAPE || 0.08;
  const zscore = 1.65;
  const bearFactor = Math.max(0.70, 1 - zscore * baselineMAPE);
  const bullFactor = Math.min(1.30, 1 + zscore * baselineMAPE);
  const liveU = DATA_DP.skus.reduce((a, s) => a + s.fcast.reduce((b: number, v: number) => b + (v || 0), 0), 0);
  const liveR = FCAST_REV_52WK.reduce((a, b) => a + b, 0);

  /* ── Per-SKU calibration table ──────────────────────────────────── */
  const calRows = useMemo(() => {
    let rawTotal = 0, calTotal = 0;
    const rows = DATA_ACCURACY.skus.map(accSku => {
      const dpSku = DATA_DP.skus.find(s => s.dpci === accSku.dpci);
      if (!dpSku) return null;
      const raw = dpSku.fcast[0] || 0;
      if (!raw && !accSku.data_quality.startsWith('analog')) return null;
      const adj = getConservativeAdj(accSku.dpci);
      const cal = Math.round(raw * Math.max(0.70, 1 + adj.total_adj_pct / 100));
      rawTotal += raw; calTotal += cal;
      return { name: accSku.name, cat: accSku.category, dpci: accSku.dpci, raw, adj, cal, isNew: adj.is_new_sku };
    }).filter(Boolean) as { name: string; cat: string; dpci: string; raw: number; adj: ReturnType<typeof getConservativeAdj>; cal: number; isNew: boolean }[];
    return { rows, rawTotal, calTotal };
  }, []);

  return (
    <PageShell title="Model Learning & Calibration" subtitle="Lift calibration · Velocity check · Conservative forecast adjustments">
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <KpiGrid columns={4}>
          <KpiCard icon="&#129482;" label="Frozen Endcap Calibration" style="--cc:var(--cy)"
            value={(endcapCalFactor * 100).toFixed(0) + '%'}
            delta={`Actual/Model = ${avgActualEndcap.toFixed(2)}x / ${modelEndcap.toFixed(2)}x`}
            deltaClass={endcapCalFactor > 0.95 ? 'up' : endcapCalFactor > 0.85 ? 'neu' : 'dn'}
            sub={endcapCalFactor < 1 ? 'Model slightly over-forecasts endcap' : 'Model accurate'} />
          <KpiCard icon="&#127959;" label="Stacked BOGO Calibration" style="--cc:var(--yw)"
            value={(stackedCalFactor * 100).toFixed(0) + '%'}
            delta={`Actual/Model = ${avgActualStacked.toFixed(2)}x / ${modelStacked.toFixed(2)}x`}
            deltaClass={stackedCalFactor > 0.95 ? 'up' : 'neu'}
            sub={stackedCalFactor < 1 ? 'Model slightly over-forecasts BOGO stack' : 'Model accurate'} />
          <KpiCard icon="&#128201;" label="Velocity Calibration" style={`--cc:${overFcast.length + underFcast.length < 3 ? 'var(--gr)' : 'var(--yw)'}`}
            value={(overFcast.length + underFcast.length) + ' SKUs off'}
            delta={overFcast.length + ' over · ' + underFcast.length + ' under'}
            deltaClass={overFcast.length + underFcast.length < 3 ? 'up' : 'neu'}
            sub=">5% delta vs recent clean actuals" />
          <KpiCard icon="&#128207;" label="Confidence Range" style="--cc:var(--pu)"
            value={(bearFactor * 100).toFixed(0) + '-' + (bullFactor * 100).toFixed(0) + '%'}
            delta="Of base forecast (90th pct error bound)" deltaClass="neu"
            sub={`Derived from ${r.baselineErrors.length}-point baseline MAPE`} />
        </KpiGrid>

        {/* ── Lift Calibration ─────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Lift Assumption Calibration — Frozen Co-space Events</div>
          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>Event Type</th><th className="tr">Model Lift</th><th className="tr">Avg Actual</th><th className="tr">Cal Factor</th><th className="tr">Calibrated</th><th>Recommendation</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td><b>Frozen Endcap (co-space only)</b></td>
                  <td className="tr"><b>{modelEndcap.toFixed(2)}x</b></td>
                  <td className="tr" style={{ color: 'var(--ac)' }}>{avgActualEndcap.toFixed(2)}x</td>
                  <td className="tr"><b>{(endcapCalFactor * 100).toFixed(0)}%</b></td>
                  <td className="tr"><b style={{ color: 'var(--yw)' }}>{(modelEndcap * endcapCalFactor).toFixed(2)}x</b></td>
                  <td>{Math.abs(endcapCalFactor - 1) < 0.05 ? '✅ Within tolerance' : '⚠️ Adjust endcap lift'}</td>
                </tr>
                <tr>
                  <td><b>Frozen BOGO + Co-space (stacked)</b></td>
                  <td className="tr"><b>{modelStacked.toFixed(2)}x</b></td>
                  <td className="tr" style={{ color: 'var(--ac)' }}>{avgActualStacked.toFixed(2)}x</td>
                  <td className="tr"><b>{(stackedCalFactor * 100).toFixed(0)}%</b></td>
                  <td className="tr"><b style={{ color: 'var(--yw)' }}>{(modelStacked * stackedCalFactor).toFixed(2)}x</b></td>
                  <td>{Math.abs(stackedCalFactor - 1) < 0.06 ? '✅ Within tolerance' : '⚠️ Adjust stacked lift'}</td>
                </tr>
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Velocity Calibration ─────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Velocity Calibration — Forecast Base vs Recent Clean Actuals</div>
          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>SKU</th><th>Category</th><th className="tr">Hist Avg (clean)</th><th className="tr">Fcast Baseline</th><th className="tr">Delta %</th><th>Status</th>
              </tr></thead>
              <tbody>
                {skuVelCal.map((s, i) => {
                  const dp = (s.velErr * 100).toFixed(1) + '%';
                  const status = Math.abs(s.velErr) < 0.05 ? '✅ Calibrated' : s.velErr > 0.15 ? '🔴 Significantly over' : s.velErr > 0.05 ? '🟡 Slightly over' : s.velErr < -0.15 ? '🔴 Significantly under' : '🟡 Slightly under';
                  return (
                    <tr key={i} style={Math.abs(s.velErr) > 0.05 ? { background: 'rgba(255,199,17,.03)' } : undefined}>
                      <td>{s.name}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.cat}</td>
                      <td className="tr">{fmt(Math.round(s.histAvg))}</td>
                      <td className="tr">{fmt(Math.round(s.fcastBase))}</td>
                      <td className={`tr ${s.velErr > 0.05 ? 'dn' : s.velErr < -0.05 ? 'up' : 'neu'}`}>{s.velErr >= 0 ? '+' : ''}{dp}</td>
                      <td style={{ fontSize: 12 }}>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Confidence Bands ─────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Data-Driven Confidence Bands</div>
          <DataTable>
            <table className="dt">
              <thead><tr><th>Band</th><th className="tr">Multiplier</th><th className="tr">52-Wk Units</th><th className="tr">52-Wk Revenue</th><th>Basis</th></tr></thead>
              <tbody>
                {[
                  { label: 'Bear (P10)', factor: bearFactor, col: 'var(--rd)', basis: 'Base x (1 - 1.65 x MAPE)' },
                  { label: 'Base', factor: 1.00, col: 'var(--ac)', basis: 'Current demand plan' },
                  { label: 'Bull (P90)', factor: bullFactor, col: 'var(--pu)', basis: 'Base x (1 + 1.65 x MAPE)' },
                ].map(b => (
                  <tr key={b.label}>
                    <td><b style={{ color: b.col }}>{b.label}</b></td>
                    <td className="tr"><b>{(b.factor * 100).toFixed(0)}%</b></td>
                    <td className="tr" style={{ color: b.col }}>{fmt(Math.round(liveU * b.factor))}</td>
                    <td className="tr" style={{ color: b.col }}>{fmtDol(liveR * b.factor)}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{b.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Per-SKU Conservative Calibration Table ───────────────────── */}
        <div className="cc">
          <div className="ct">Conservative Forecast Calibration — Per-SKU Adjustments</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '0 12px 12px' }}>
            Every forward forecast is automatically calibrated. <b>Bias Adj</b> = correction for known over-forecast tendency.
            <b> Conserv Tilt</b> = volatility + trust penalty. <b>Exposure Adj</b> = extra conservatism for stop-ship SKUs.
          </div>
          <DataTable>
            <table className="dt">
              <thead><tr>
                <th>SKU</th><th>Category</th><th className="tr">Wk 1 Raw</th>
                <th className="tr">Bias Adj%</th><th className="tr">Tilt%</th><th className="tr">Exp Adj%</th>
                <th className="tr">Total Adj%</th><th className="tr">Calibrated</th><th>Reason</th>
              </tr></thead>
              <tbody>
                {calRows.rows.map(r => (
                  <tr key={r.dpci} style={Math.abs(r.adj.total_adj_pct) > 10 ? { background: 'rgba(239,68,68,.03)' } : undefined}>
                    <td style={{ fontSize: 11.5 }}>{r.name.substring(0, 26)}{r.isNew ? <span style={{ color: 'var(--tx3)', fontSize: 9 }}> (analog)</span> : ''}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.cat.replace(' Multiserve', '')}</td>
                    <td className="tr">{r.raw ? fmt(r.raw) : '—'}</td>
                    <td className="tr">{r.adj.bias_adj_pct !== 0 ? r.adj.bias_adj_pct.toFixed(1) + '%' : '—'}</td>
                    <td className="tr neu">{r.adj.conserv_tilt_pct.toFixed(1)}%</td>
                    <td className="tr">{r.adj.exposure_adj_pct !== 0 ? r.adj.exposure_adj_pct.toFixed(1) + '%' : '—'}</td>
                    <td className="tr" style={{ fontWeight: 700 }}>{(r.adj.total_adj_pct > 0 ? '+' : '') + r.adj.total_adj_pct.toFixed(1)}%</td>
                    <td className="tr" style={{ color: 'var(--ac)' }}>{r.raw ? fmt(r.cal) : '—'}</td>
                    <td style={{ fontSize: 10.5, color: 'var(--tx3)', maxWidth: 200 }}>{r.adj.reason}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--bd)', background: 'var(--s2)' }}>
                  <td colSpan={2} style={{ fontWeight: 800 }}>Wk 1 Portfolio Total</td>
                  <td className="tr" style={{ fontWeight: 700 }}>{fmt(calRows.rawTotal)}</td>
                  <td className="tr" colSpan={4} style={{ color: 'var(--tx3)', fontSize: 11.5 }}>
                    Portfolio-wide: {calRows.rawTotal ? ((calRows.calTotal - calRows.rawTotal) / calRows.rawTotal * 100).toFixed(1) : 0}%
                  </td>
                  <td className="tr" style={{ fontWeight: 800, color: 'var(--ac)' }}>{fmt(calRows.calTotal)}</td>
                  <td style={{ fontSize: 11, color: 'var(--tx3)' }}>Net {fmt(calRows.calTotal - calRows.rawTotal)} units</td>
                </tr>
              </tbody>
            </table>
          </DataTable>
          <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '10px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>✅ <b>No future data used</b> — all adjustments from L8W backtest</span>
            <span>✅ <b>Systematic adjustments</b> — not manual</span>
            <span>✅ <b>Conservative direction</b> — never inflates above raw</span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
