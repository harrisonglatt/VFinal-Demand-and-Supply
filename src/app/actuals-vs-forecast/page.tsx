'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import Chip from '@/components/ui/Chip';
import { DATA_AVF, DATA_ACCURACY, DATA_OMNI } from '@/data/index';
import { fmt, fmtP, fmtDol, sf } from '@/lib/formatters';
import type { AccuracySku } from '@/data/types';

const MAPE_GOAL = 10; // Target: sub-10% MAPE

const STATUS_OPTS = [
  { value: '', label: 'All Status' },
  { value: 'at_goal', label: 'At Goal (<10% MAPE)' },
  { value: 'miss', label: 'Big Miss (<-25%)' },
  { value: 'beat', label: 'Beat (>+10%)' },
  { value: 'inline', label: 'In-line' },
];

function getAcc(dpci: string): AccuracySku | null {
  return DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null;
}

function mapeColor(mape: number): string {
  if (mape < 10) return 'var(--gr)';
  if (mape < 15) return 'var(--yw)';
  return 'var(--rd)';
}

export default function SellThroughVsForecastPage() {
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  /* ── Omni sell-through ──────────────────────────────────────────── */
  const omniWt = DATA_OMNI.weekly_totals;
  const omniLw = omniWt[omniWt.length - 1] || { units: 0, sales: 0 };
  const omniLlw = omniWt[omniWt.length - 2] || { units: 0, sales: 0 };
  const wowUnits = omniLlw.units > 0 ? (omniLw.units - omniLlw.units) / omniLlw.units : 0;

  /* ── AVF Aggregates ─────────────────────────────────────────────── */
  const totA = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0), []);
  const totF = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0), []);
  const totAS = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.lw_sales), 0), []);

  /* ── MAPE metrics ───────────────────────────────────────────────── */
  const portfolioMAPE = DATA_ACCURACY.model_mape_l4w;
  const portfolioBias = DATA_ACCURACY.model_bias_l4w;
  const catMape = DATA_ACCURACY.cat_mape;
  const catBias = DATA_ACCURACY.cat_bias;

  const skusAtGoal = useMemo(() =>
    DATA_ACCURACY.skus.filter(s => s.mape_l4w < MAPE_GOAL).length, []);
  const totalAccSkus = DATA_ACCURACY.skus.length;

  const worstSku = useMemo(() => {
    const sorted = [...DATA_ACCURACY.skus].sort((a, b) => Math.abs(b.lw_err_pct) - Math.abs(a.lw_err_pct));
    return sorted[0] || null;
  }, []);

  const categories = useMemo(() => DATA_AVF.map(s => s.category), []);

  /* ── Filtered + sorted SKUs ─────────────────────────────────────── */
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return [...DATA_AVF]
      .filter(s => {
        const p = sf(s.vs_fcast_pct);
        const acc = getAcc(s.dpci);
        return (!cat || s.category === cat) &&
          (!q || s.name.toLowerCase().includes(q)) &&
          (!status ||
            (status === 'at_goal' ? (acc && acc.mape_l4w < MAPE_GOAL) :
             status === 'miss' ? p < -0.25 :
             status === 'beat' ? p > 0.10 :
             (p >= -0.25 && p <= 0.10)));
      })
      .sort((a, b) => {
        const accA = getAcc(a.dpci);
        const accB = getAcc(b.dpci);
        return (accA?.mape_l4w ?? 100) - (accB?.mape_l4w ?? 100); // Sort by MAPE ascending
      });
  }, [cat, query, status]);

  return (
    <PageShell
      title="Sell-Through vs Forecast"
      subtitle={`Omni sell-through accuracy · ${DATA_ACCURACY.as_of} · Goal: MAPE <${MAPE_GOAL}%`}
    >
      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="🎯" label="Portfolio MAPE (L4W)"
          style={`--cc:${mapeColor(portfolioMAPE)}`}
          value={`${portfolioMAPE.toFixed(1)}%`}
          delta={`Bias: ${portfolioBias > 0 ? '+' : ''}${portfolioBias.toFixed(1)}% · Target: <${MAPE_GOAL}%`}
          deltaClass={portfolioMAPE < MAPE_GOAL ? 'up' : portfolioMAPE < 15 ? 'neu' : 'dn'}
          sub={`${(portfolioMAPE / MAPE_GOAL * 100).toFixed(0)}% of goal threshold`}
        />
        <KpiCard
          icon="🛒" label="LW Sell-Through"
          style="--cc:var(--ac)"
          value={`${fmt(omniLw.units)} units`}
          delta={`${wowUnits >= 0 ? '+' : ''}${(wowUnits * 100).toFixed(1)}% WoW`}
          deltaClass={wowUnits > 0.02 ? 'up' : wowUnits < -0.05 ? 'dn' : 'neu'}
          sub={`${fmtDol(omniLw.sales)} · vs ${fmt(totF)} forecast`}
        />
        <KpiCard
          icon="✅" label={`SKUs at Goal (<${MAPE_GOAL}%)`}
          style="--cc:var(--gr)"
          value={String(skusAtGoal)}
          delta={`${totalAccSkus - skusAtGoal} SKUs above ${MAPE_GOAL}% MAPE`}
          deltaClass={skusAtGoal > totalAccSkus / 2 ? 'up' : 'dn'}
          sub={`${skusAtGoal} of ${totalAccSkus} total · ${Math.round(skusAtGoal / totalAccSkus * 100)}% at goal`}
        />
        <KpiCard
          icon="🚨" label="Biggest LW Miss"
          style="--cc:var(--rd)"
          value={worstSku ? `${Math.abs(worstSku.lw_err_pct).toFixed(1)}%` : '—'}
          delta={worstSku ? worstSku.name.substring(0, 25) : ''}
          deltaClass="dn"
          sub={worstSku ? `${fmt(worstSku.lw_actual)} actual vs ${fmt(worstSku.lw_fcast)} fcast` : ''}
        />
      </KpiGrid>

      {/* ── MAPE Goal Progress ─────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">MAPE Goal Progress — Target: Sub-{MAPE_GOAL}%</div>

        {/* Portfolio-level progress bar */}
        <div style={{ padding: '8px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: mapeColor(portfolioMAPE) }}>{portfolioMAPE.toFixed(1)}%</div>
            <div style={{ flex: 1 }}>
              <div style={{ background: 'var(--s3)', borderRadius: 8, height: 20, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(portfolioMAPE / 30 * 100, 100)}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${mapeColor(portfolioMAPE)}40, ${mapeColor(portfolioMAPE)}80)`,
                  borderRadius: 8,
                  transition: 'width 0.5s',
                }} />
                {/* Goal marker */}
                <div style={{
                  position: 'absolute', left: `${MAPE_GOAL / 30 * 100}%`, top: 0, bottom: 0,
                  width: 2, background: 'var(--gr)', zIndex: 1,
                }} />
                <div style={{
                  position: 'absolute', left: `${MAPE_GOAL / 30 * 100}%`, top: -18,
                  fontSize: 9, color: 'var(--gr)', fontWeight: 700, transform: 'translateX(-50%)',
                }}>{MAPE_GOAL}% GOAL</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                <span>0%</span><span>30%+</span>
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {Object.entries(catMape).map(([cat, mape]) => {
              const bias = catBias[cat] ?? 0;
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 100, fontSize: 11, fontWeight: 600 }}>{cat}</div>
                  <div style={{ flex: 1, background: 'var(--s3)', borderRadius: 4, height: 14, position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(mape / 30 * 100, 100)}%`, height: '100%',
                      background: `${mapeColor(mape)}60`, borderRadius: 4,
                    }} />
                  </div>
                  <div style={{ minWidth: 50, fontSize: 11, fontWeight: 700, color: mapeColor(mape), textAlign: 'right' }}>
                    {mape.toFixed(1)}%
                  </div>
                  <div style={{ minWidth: 50, fontSize: 10, color: 'var(--tx3)', textAlign: 'right' }}>
                    {bias > 0 ? '+' : ''}{bias.toFixed(1)}% bias
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <FilterBar meta={`${skus.length} SKUs · Sorted by MAPE (best first)`}>
        <SelectFilter id="avf-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '4px 8px', color: 'var(--tx)', fontSize: 12 }}>
          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="text" placeholder="Search SKU..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
      </FilterBar>

      {/* ── Table ────────────────────────────────────────────────── */}
      <DataTable>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>SKU</th>
              <th>Category</th>
              <th className="tr">Sell-Through</th>
              <th className="tr">Revenue</th>
              <th className="tr">Forecast</th>
              <th className="tr">vs Fcast %</th>
              <th className="tr">MAPE L4W</th>
              <th className="tr">vs Goal</th>
              <th className="tr">Bias L4W</th>
              <th className="tr">Trust</th>
              <th className="tr">L4W Avg</th>
              <th className="tr">UPSPW</th>
              <th className="tr">Stores</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => {
              const p = sf(s.vs_fcast_pct);
              const pc = p < -0.25 ? 'dn' : p > 0.10 ? 'up' : 'neu';
              const acc = getAcc(s.dpci);
              const mape = acc?.mape_l4w ?? null;
              const atGoal = mape !== null && mape < MAPE_GOAL;
              const vsGoal = mape !== null ? mape - MAPE_GOAL : null;
              return (
                <tr key={i} style={{ background: atGoal ? 'rgba(0,207,146,.04)' : undefined }}>
                  <td className="tn" title={s.name}>
                    {atGoal && <span style={{ marginRight: 4 }}>✅</span>}
                    {s.name}
                  </td>
                  <td><Chip className="cb">{s.category}</Chip></td>
                  <td className="tr"><b>{fmt(s.lw_units)}</b></td>
                  <td className="tr">{fmtDol(s.lw_sales)}</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(s.fcast_units)}</td>
                  <td className={`tr ${pc}`} style={{ fontWeight: 600 }}>
                    {p >= 0 ? '+' : ''}{(p * 100).toFixed(1)}%
                  </td>
                  {mape !== null ? (
                    <>
                      <td className="tr" style={{ color: mapeColor(mape), fontWeight: 700 }}>
                        {mape.toFixed(1)}%
                      </td>
                      <td className="tr" style={{ color: vsGoal !== null && vsGoal <= 0 ? 'var(--gr)' : 'var(--rd)', fontWeight: 600 }}>
                        {vsGoal !== null ? `${vsGoal > 0 ? '+' : ''}${vsGoal.toFixed(1)}` : '—'}
                      </td>
                      <td className="tr" style={{ color: acc!.bias_l4w > 5 ? 'var(--rd)' : acc!.bias_l4w < -5 ? 'var(--yw)' : 'var(--tx2)' }}>
                        {acc!.bias_l4w > 0 ? '+' : ''}{acc!.bias_l4w.toFixed(1)}%
                      </td>
                      <td>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: acc!.trust_level === 'High' ? 'rgba(0,207,146,.12)' : acc!.trust_level === 'Medium' ? 'rgba(255,199,17,.10)' : 'rgba(239,68,68,.10)',
                          color: acc!.trust_level === 'High' ? 'var(--gr)' : acc!.trust_level === 'Medium' ? 'var(--yw)' : 'var(--rd)',
                        }}>
                          {acc!.trust_score}
                        </span>
                      </td>
                    </>
                  ) : (
                    <><td className="tr">—</td><td className="tr">—</td><td className="tr">—</td><td>—</td></>
                  )}
                  <td className="tr" style={{ color: 'var(--tx2)' }}>{fmt(s.l4w_avg_units)}</td>
                  <td className="tr">{s.lw_upspw?.toFixed(2) ?? '—'}</td>
                  <td className="tr">{fmt(s.lw_stores)}</td>
                </tr>
              );
            })}
            {/* Seasonal step-down note */}
            <tr style={{ background: 'rgba(255,199,17,.06)' }}>
              <td colSpan={13} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--yw)' }}>
                <b>{'⚠️'} Seasonal Step-Down:</b> Smoothies H1&rarr;H2 base &minus;19.5% and YoGos H1&rarr;H2 base &minus;17.6%. Reflects organic deceleration after Jan&ndash;Mar TPC cadence. Forward fcast uses H2 base from Wk3 onward.
              </td>
            </tr>
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
