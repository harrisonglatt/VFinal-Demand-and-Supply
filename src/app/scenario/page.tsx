'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import { DATA_DP, DATA_PROMO, DATA_OMNI, FCAST_REV_52WK, PROMO_WKS } from '@/data/index';
import { useOverrides } from '@/hooks/useOverrides';
import { fmt, fmtDol, sf } from '@/lib/formatters';
import { calcCV } from '@/lib/computations/executive';

type Scenario = 'bear' | 'base' | 'bull';
const SC_MULT: Record<Scenario, number> = { bear: 0.80, base: 1.00, bull: 1.20 };
const SC_COL: Record<Scenario, string> = { bear: '#ef4444', base: '#00E3CD', bull: '#00CF92' };

export default function ScenarioPage() {
  const [scenario, setScenario] = useState<Scenario>('base');
  const { velFor } = useOverrides();
  const m = SC_MULT[scenario];

  /* ── Core computations ──────────────────────────────────────────── */
  const labels = DATA_DP.fcast_weeks;
  const baseU = useMemo(() => labels.map((_, i) => DATA_DP.skus.reduce((a, s) => a + sf(s.fcast[i]), 0)), [labels]);
  const bearU = useMemo(() => baseU.map(v => Math.round(v * 0.80)), [baseU]);
  const bullU = useMemo(() => baseU.map(v => Math.round(v * 1.20)), [baseU]);
  const curU = useMemo(() => baseU.map(v => Math.round(v * m)), [baseU, m]);

  const bearR = useMemo(() => FCAST_REV_52WK.map(v => v * 0.80), []);
  const baseR = FCAST_REV_52WK;
  const bullR = useMemo(() => FCAST_REV_52WK.map(v => v * 1.20), []);
  const curR = useMemo(() => FCAST_REV_52WK.map(v => v * m), [m]);

  const totRB = bearR.reduce((a, b) => a + b, 0);
  const totR = baseR.reduce((a, b) => a + b, 0);
  const totRBull = bullR.reduce((a, b) => a + b, 0);
  const totRC = curR.reduce((a, b) => a + b, 0);
  const totUB = bearU.reduce((a, b) => a + b, 0);
  const totU = baseU.reduce((a, b) => a + b, 0);
  const totUBull = bullU.reduce((a, b) => a + b, 0);
  const totUC = curU.reduce((a, b) => a + b, 0);
  const peakR = Math.max(...curR);
  const peakWk = labels[curR.indexOf(peakR)];
  const diff = totRC - totR;
  const diffPct = (m - 1) * 100;

  /* ── Revenue chart datasets ─────────────────────────────────────── */
  const n = Math.min(6, DATA_OMNI.weekly_totals.length);
  const revLabels = [...DATA_OMNI.weeks.slice(-n), ...labels];
  const revActuals = [...DATA_OMNI.weekly_totals.slice(-n).map((w: { sales: number }) => w.sales), ...Array(52).fill(null)];
  const pad = n - 1;
  const lastActual = DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1].sales;
  const bR = [...Array(pad).fill(null), lastActual, ...bearR];
  const bsR = [...Array(pad).fill(null), lastActual, ...baseR];
  const buR = [...Array(pad).fill(null), lastActual, ...bullR];

  /* ── SKU breakdown ──────────────────────────────────────────────── */
  const skuBreakdown = useMemo(() => {
    const catAgg: Record<string, { bear: number; base: number; bull: number }> = {};
    const rows = DATA_DP.skus.map(s => {
      const vel = velFor(s) || s.lw_upspw || 1;
      const origVel = s.lw_upspw || vel;
      const scale = origVel > 0 ? vel / origVel : 1;
      const f13 = s.fcast.slice(0, 13).reduce((a: number, b: number) => a + b, 0);
      const base = Math.round(f13 * scale);
      const bear = Math.round(base * 0.80);
      const bull = Math.round(base * 1.20);
      const cv = calcCV(s.hist);
      const cat = (s.category || 'Other').replace(' Multiserve', '');
      if (!catAgg[cat]) catAgg[cat] = { bear: 0, base: 0, bull: 0 };
      catAgg[cat].bear += bear;
      catAgg[cat].base += base;
      catAgg[cat].bull += bull;
      return { name: (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 36), cat, bear, base, bull, range: bull - bear, cv };
    });
    const totB = Object.values(catAgg).reduce((a, v) => a + v.bear, 0);
    const totBa = Object.values(catAgg).reduce((a, v) => a + v.base, 0);
    const totBu = Object.values(catAgg).reduce((a, v) => a + v.bull, 0);
    return { rows, catAgg, totB, totBa, totBu };
  }, [velFor]);

  return (
    <PageShell
      title="Scenario Analysis"
      subtitle={`Bear/Base/Bull · ${labels[0]} – ${labels[51]}`}
      extra={
        <ButtonGroup
          options={[
            { value: 'bear', label: 'Bear x0.80' },
            { value: 'base', label: 'Base x1.00' },
            { value: 'bull', label: 'Bull x1.20' },
          ]}
          active={scenario}
          onChange={v => setScenario(v as Scenario)}
        />
      }
    >
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── KPIs ────────────────────────────────────────────────────── */}
        <KpiGrid columns={4}>
          <KpiCard icon="&#128176;" label="52-Wk Revenue" style={`--cc:${SC_COL[scenario]}`}
            value={fmtDol(totRC)}
            delta={(diffPct >= 0 ? '↑ ' : '↓ ') + fmtDol(Math.abs(diff)) + ' vs base'}
            deltaClass={diffPct >= 0 ? 'up' : 'dn'}
            sub={`Bear ${fmtDol(totRB)} · Bull ${fmtDol(totRBull)}`}
          />
          <KpiCard icon="&#128230;" label="52-Wk Units" style={`--cc:${SC_COL[scenario]}`}
            value={fmt(totUC)}
            delta={`Avg ${fmt(Math.round(totUC / 52))}/wk`}
            deltaClass={scenario === 'bear' ? 'dn' : scenario === 'bull' ? 'up' : 'neu'}
            sub={`Bear ${fmt(totUB)} · Bull ${fmt(totUBull)}`}
          />
          <KpiCard icon="&#127942;" label="Peak Week Revenue" style="--cc:var(--yw)"
            value={fmtDol(peakR)} delta={peakWk || ''} deltaClass="neu"
            sub={`${fmtDol(Math.round(totRC / 52))} avg weekly`}
          />
          <KpiCard icon="&#128200;" label="Fcast vs Omni Run Rate" style="--cc:var(--cy)"
            value={((totRC / 52 - DATA_OMNI.lw_summary.sales) / DATA_OMNI.lw_summary.sales * 100).toFixed(1) + '%'}
            delta={`${fmtDol(Math.round(totRC / 52))} avg vs ${fmtDol(DATA_OMNI.lw_summary.sales)} LW`}
            deltaClass={totRC / 52 > DATA_OMNI.lw_summary.sales ? 'up' : 'dn'}
            sub="52-wk forward avg vs last actual"
          />
        </KpiGrid>

        {/* ── 26-Week Revenue Chart ───────────────────────────────────── */}
        <div className="cc">
          <div className="ct">52-Week Revenue Forecast — Bear / Base / Bull</div>
          <div style={{ padding: '0 12px 12px' }}>
            <LineChart
              labels={revLabels}
              datasets={[
                { label: 'Actuals', data: revActuals as number[], borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.07)', fill: true },
                { label: 'Bear', data: bR as number[], borderColor: '#ef4444', borderDash: [4, 3] },
                { label: 'Base', data: bsR as number[], borderColor: '#00CF92' },
                { label: 'Bull', data: buR as number[], borderColor: '#DC7BFF', borderDash: [4, 3] },
              ]}
              height={250}
            />
          </div>
        </div>

        {/* ── Weekly Units Band Chart ─────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Weekly Units — Confidence Bands</div>
          <div style={{ padding: '0 12px 12px' }}>
            <LineChart
              labels={labels}
              datasets={[
                { label: 'Bull +20%', data: bullU, borderColor: 'rgba(167,139,250,.5)', backgroundColor: 'rgba(167,139,250,.08)', fill: true, borderDash: [3, 3] },
                { label: 'Base', data: baseU, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.1)' },
                { label: 'Bear -20%', data: bearU, borderColor: 'rgba(239,68,68,.5)', borderDash: [3, 3] },
              ]}
              height={200}
            />
          </div>
        </div>

        {/* ── Weekly Comparison Table ─────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Week-by-Week Comparison</div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="tr">Bear Rev</th><th className="tr">Base Rev</th><th className="tr">Bull Rev</th>
                  <th className="tr">Bear Units</th><th className="tr">Base Units</th><th className="tr">Bull Units</th>
                  <th>Promos</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((w, i) => {
                  const isP = PROMO_WKS.has(i + 1);
                  const evs = DATA_PROMO.filter(p => p.wk === i + 1).map(p => (p.event || '').substring(0, 28)).join(', ');
                  return (
                    <tr key={w} style={isP ? { background: 'rgba(245,158,11,.05)' } : undefined}>
                      <td style={{ fontWeight: isP ? 700 : 400, color: isP ? 'var(--yw)' : 'var(--tx)' }}>{w}</td>
                      <td className="tr dn">{fmtDol(bearR[i])}</td>
                      <td className="tr" style={{ color: 'var(--ac2)' }}>{fmtDol(baseR[i])}</td>
                      <td className="tr up">{fmtDol(bullR[i])}</td>
                      <td className="tr dn">{fmt(bearU[i])}</td>
                      <td className="tr" style={{ color: 'var(--ac2)' }}>{fmt(baseU[i])}</td>
                      <td className="tr up">{fmt(bullU[i])}</td>
                      <td style={{ fontSize: 11, color: 'var(--yw)' }}>{evs || '—'}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--s3)', fontWeight: 700, borderTop: '2px solid var(--bd)' }}>
                  <td>TOTAL 52WK</td>
                  <td className="tr dn">{fmtDol(totRB)}</td>
                  <td className="tr" style={{ color: 'var(--ac2)' }}>{fmtDol(totR)}</td>
                  <td className="tr up">{fmtDol(totRBull)}</td>
                  <td className="tr dn">{fmt(totUB)}</td>
                  <td className="tr" style={{ color: 'var(--ac2)' }}>{fmt(totU)}</td>
                  <td className="tr up">{fmt(totUBull)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── SKU Breakdown ───────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">SKU-Level Breakdown — 13-Week Units (Bear · Base · Bull)</div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 180 }}>SKU</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th className="tr" style={{ color: '#ef4444' }}>Bear x0.80</th>
                  <th className="tr" style={{ color: 'var(--ac2)' }}>Base x1.00</th>
                  <th className="tr" style={{ color: 'var(--gr)' }}>Bull x1.20</th>
                  <th className="tr">Range</th>
                  <th className="tr" style={{ color: 'var(--tx3)' }}>Volatility</th>
                </tr>
              </thead>
              <tbody>
                {skuBreakdown.rows.map((r, i) => {
                  const volCol = r.cv > 0.30 ? '#FF8766' : r.cv > 0.18 ? '#FFC711' : '#00F9B8';
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{r.cat}</td>
                      <td className="tr" style={{ color: '#ef4444' }}>{fmt(r.bear)}</td>
                      <td className="tr" style={{ color: 'var(--ac2)' }}>{fmt(r.base)}</td>
                      <td className="tr" style={{ color: 'var(--gr)' }}>{fmt(r.bull)}</td>
                      <td className="tr">{fmt(r.range)}</td>
                      <td className="tr" style={{ color: volCol }}>{(r.cv * 100).toFixed(0)}%</td>
                    </tr>
                  );
                })}
                <tr><td colSpan={7} style={{ padding: 0, height: 4 }}></td></tr>
                {Object.entries(skuBreakdown.catAgg).map(([cat, v]) => (
                  <tr key={cat} style={{ background: 'var(--s2)', fontWeight: 600 }}>
                    <td colSpan={2} style={{ fontSize: 12 }}>{cat} Subtotal</td>
                    <td className="tr" style={{ color: '#ef4444' }}>{fmt(v.bear)}</td>
                    <td className="tr" style={{ color: 'var(--ac2)' }}>{fmt(v.base)}</td>
                    <td className="tr" style={{ color: 'var(--gr)' }}>{fmt(v.bull)}</td>
                    <td className="tr">{fmt(v.bull - v.bear)}</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>{'—'}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--s3)', fontWeight: 800, borderTop: '2px solid var(--bd)' }}>
                  <td colSpan={2} style={{ fontSize: 13 }}>GRAND TOTAL (13 Weeks)</td>
                  <td className="tr" style={{ fontSize: 14, color: '#ef4444' }}>{fmt(skuBreakdown.totB)}</td>
                  <td className="tr" style={{ fontSize: 14, color: 'var(--ac2)' }}>{fmt(skuBreakdown.totBa)}</td>
                  <td className="tr" style={{ fontSize: 14, color: 'var(--gr)' }}>{fmt(skuBreakdown.totBu)}</td>
                  <td className="tr" style={{ fontSize: 14 }}>{fmt(skuBreakdown.totBu - skuBreakdown.totB)}</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{'—'}</td>
                </tr>
              </tbody>
            </table>
          </DataTable>
          <div style={{ margin: '10px 12px', fontSize: 11, color: 'var(--tx3)', lineHeight: 1.8 }}>
            <b>Methodology:</b> Bear/Base/Bull = base velocity x &#123;0.80, 1.00, 1.20&#125; · Base uses current UPSPW overrides from Assumptions page · Volatility = CV from 13-week Omni history · CV &gt;30% = high risk (red) · 18-30% = moderate (yellow) · &lt;18% = stable (green)
          </div>
        </div>
      </div>
    </PageShell>
  );
}
