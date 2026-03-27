'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_DAILY, DATA_DP, DATA_POFC } from '@/data/index';
import { useOverrides } from '@/hooks/useOverrides';
import { fmt, fmtP, sf, chgCls } from '@/lib/formatters';

type View = 'sku' | 'wbw' | 'cat' | 'mth';
type Model = 'plan' | 'ratio' | 'cov';

const WKS = ['3/22','3/29','4/5','4/12','4/19','4/26','5/3','5/10','5/17','5/24','5/31','6/7','6/14'];

export default function POForecastPage() {
  const [view, setView] = useState<View>('sku');
  const [model, setModel] = useState<Model>('plan');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const { state, upcFor } = useOverrides();
  const upcOvr = state.upcOverrides;
  const hasOvr = Object.keys(upcOvr).length > 0;

  /* ── KPI data ───────────────────────────────────────────────────── */
  const kpiData = useMemo(() => {
    const planT = DATA_POFC.totals.plan;
    let ratioT = 0, covT = 0;
    DATA_POFC.skus.forEach(s => {
      const sc = s.upc / (upcFor(s) ?? s.upc);
      ratioT += Math.round(s.ratio_total_cases * sc);
      covT += Math.round(s.cov_total_cases * sc);
    });
    return { planT, ratioT, covT, gapR: ratioT - planT, gapC: covT - planT };
  }, [upcFor]);

  /* ── SKU view data ──────────────────────────────────────────────── */
  const skuData = useMemo(() => {
    const q = search.toLowerCase();
    return DATA_POFC.skus.filter(s =>
      (!catFilter || s.cat === catFilter) && (!q || s.name.toLowerCase().includes(q))
    );
  }, [catFilter, search]);

  const allCats = useMemo(() => DATA_POFC.skus.map(s => s.cat), []);

  /* ── WbW data ───────────────────────────────────────────────────── */
  const mk = model === 'plan' ? 'plan_by_week' : model === 'ratio' ? 'ratio_by_week' : 'cov_by_week';

  /* ── Category chart data ────────────────────────────────────────── */
  const catChartData = useMemo(() => {
    const cats = [...new Set(DATA_POFC.skus.map(s => s.cat))];
    const pb: Record<string, number> = {};
    const rb: Record<string, number> = {};
    const cb: Record<string, number> = {};
    cats.forEach(c => { pb[c] = 0; rb[c] = 0; cb[c] = 0; });
    DATA_POFC.skus.forEach(s => {
      pb[s.cat] = (pb[s.cat] || 0) + s.plan_total_cases;
      rb[s.cat] = (rb[s.cat] || 0) + s.ratio_total_cases;
      cb[s.cat] = (cb[s.cat] || 0) + s.cov_total_cases;
    });
    return { cats, pb, rb, cb };
  }, []);

  /* ── Monthly tracker data ───────────────────────────────────────── */
  const monthlyData = useMemo(() => {
    const dp = DATA_DP;
    const months = [
      { label: 'March (CW)', short: 'Mar', wkIdxs: [0], color: 'rgba(99,102,241,.7)' },
      { label: 'April', short: 'Apr', wkIdxs: [1,2,3,4,5], color: 'rgba(255,199,17,.7)' },
      { label: 'May', short: 'May', wkIdxs: [6,7,8,9,10], color: 'rgba(0,207,146,.7)' },
      { label: 'June (partial)', short: 'Jun', wkIdxs: [11,12], color: 'rgba(168,85,247,.7)' },
    ];
    months.forEach(m => {
      (m as any).fc_units = m.wkIdxs.reduce((sum, i) => sum + dp.skus.reduce((a, s) => a + sf(s.fcast[i]), 0), 0);
      (m as any).fc_rev = m.wkIdxs.reduce((sum, i) => sum + dp.skus.reduce((a, s) => a + sf(s.fcast[i]) * (s.price || 0), 0), 0);
      (m as any).wkFc = m.wkIdxs.map(i => ({
        wk: dp.fcast_weeks[i],
        units: dp.skus.reduce((a, s) => a + sf(s.fcast[i]), 0),
        rev: dp.skus.reduce((a, s) => a + sf(s.fcast[i]) * (s.price || 0), 0),
      }));
    });
    return months as (typeof months[0] & { fc_units: number; fc_rev: number; wkFc: { wk: string; units: number; rev: number }[] })[];
  }, []);

  return (
    <PageShell
      title="PO Forecast"
      subtitle={`${DATA_POFC.skus.length} SKUs · 13-week forward`}
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonGroup
            options={[
              { value: 'sku', label: 'SKU Summary' },
              { value: 'wbw', label: 'Week-by-Week' },
              { value: 'cat', label: 'By Category' },
              { value: 'mth', label: 'Monthly Tracker' },
            ]}
            active={view}
            onChange={v => setView(v as View)}
          />
        </div>
      }
    >
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── KPIs ────────────────────────────────────────────────────── */}
        <KpiGrid columns={4}>
          <KpiCard icon="&#128230;" label="13-wk Plan Cases" value={fmt(kpiData.planT)} delta="Current committed shipment plan" deltaClass="neu" sub="" />
          <KpiCard icon="&#128202;" label={`O/S Ratio Forecast${hasOvr ? ' ✎' : ''}`} value={fmt(kpiData.ratioT)}
            delta={`${fmtP(kpiData.gapR / kpiData.planT)} vs plan`}
            deltaClass={chgCls(kpiData.gapR / kpiData.planT)} sub="Based on hist ship/sell ratio" />
          <KpiCard icon="&#127919;" label={`Coverage Forecast${hasOvr ? ' ✎' : ''}`} value={fmt(kpiData.covT)}
            delta={`${fmtP(kpiData.gapC / kpiData.planT)} vs plan`}
            deltaClass={chgCls(kpiData.gapC / kpiData.planT)} sub="5-WoS DC target · reorder every 2 weeks" />
          <KpiCard icon="&#128200;" label="Plan Gap (Ratio Model)" value={(kpiData.gapR >= 0 ? '+' : '') + fmt(kpiData.gapR) + ' cs'}
            delta={`${fmtP(kpiData.gapR / kpiData.planT)} vs plan`}
            deltaClass={chgCls(kpiData.gapR / kpiData.planT)} sub="Cases plan may be short vs ratio model" />
        </KpiGrid>

        {/* ── Filters (only show for SKU view) ────────────────────────── */}
        {view === 'sku' && (
          <FilterBar meta={`${skuData.length} SKUs`}>
            <SelectFilter id="pofc-cat" options={allCats} value={catFilter} onChange={setCatFilter} />
            <input
              type="text" placeholder="Search SKUs..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12 }}
            />
          </FilterBar>
        )}

        {/* ── Model toggle for WbW ────────────────────────────────────── */}
        {view === 'wbw' && (
          <ButtonGroup
            options={[
              { value: 'plan', label: 'Plan (Composite)' },
              { value: 'ratio', label: 'O/S Ratio' },
              { value: 'cov', label: 'Coverage' },
            ]}
            active={model}
            onChange={v => setModel(v as Model)}
          />
        )}

        {/* ── SKU Summary View ────────────────────────────────────────── */}
        {view === 'sku' && (
          <div className="cc">
            <DataTable>
              <table className="dt">
                <thead>
                  <tr>
                    <th>SKU</th><th>Cat</th><th className="tr">UPC{hasOvr ? '*' : ''}</th>
                    <th className="tr">Plan Cases</th><th className="tr">Ratio Fcst</th><th className="tr">Delta Plan</th>
                    <th className="tr">Cov Fcst</th><th className="tr">Delta Plan</th><th className="tr">O/S Ratio</th><th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let tP = 0, tR = 0, tC = 0;
                    const rows = skuData.map(s => {
                      const effUpc = upcFor(s) ?? s.upc;
                      const upcScale = s.upc / effUpc;
                      const ratioCs = Math.round(s.ratio_total_cases * upcScale);
                      const covCs = Math.round(s.cov_total_cases * upcScale);
                      const dR = ratioCs - s.plan_total_cases;
                      const pR = s.plan_total_cases > 0 ? dR / s.plan_total_cases : 0;
                      tP += s.plan_total_cases; tR += ratioCs; tC += covCs;
                      const sig = !ratioCs ? '—' : pR >= 0.25 ? '🔴 Under-planned' : pR <= -0.25 ? '🟡 Over-planned' : '✅ On track';
                      const upcOvrd = upcOvr[s.dpci];
                      return (
                        <tr key={s.dpci}>
                          <td><b>{s.name}</b></td>
                          <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.cat}</td>
                          <td className="tr">{upcOvrd ? <><b style={{ color: 'var(--gr)' }}>{effUpc}</b> <span style={{ fontSize: 10, color: 'var(--tx3)' }}>(was {s.upc})</span></> : effUpc}</td>
                          <td className="tr"><b>{fmt(s.plan_total_cases)}</b></td>
                          <td className="tr">{fmt(ratioCs)}</td>
                          <td className={`tr ${chgCls(pR)}`}>{(dR >= 0 ? '+' : '') + fmt(dR)}</td>
                          <td className="tr">{fmt(covCs)}</td>
                          <td className={`tr ${chgCls(s.plan_total_cases > 0 ? (covCs - s.plan_total_cases) / s.plan_total_cases : 0)}`}>
                            {((covCs - s.plan_total_cases) >= 0 ? '+' : '') + fmt(covCs - s.plan_total_cases)}
                          </td>
                          <td className="tr">{s.os_ratio.toFixed(2)}x</td>
                          <td>{sig}</td>
                        </tr>
                      );
                    });
                    const dRT = tR - tP;
                    return (
                      <>
                        {rows}
                        <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                          <td>TOTAL</td><td></td><td></td>
                          <td className="tr">{fmt(tP)}</td><td className="tr">{fmt(tR)}</td>
                          <td className={`tr ${chgCls(dRT / tP)}`}>{(dRT >= 0 ? '+' : '') + fmt(dRT)}</td>
                          <td className="tr">{fmt(tC)}</td>
                          <td className={`tr ${chgCls((tC - tP) / tP)}`}>{((tC - tP) >= 0 ? '+' : '') + fmt(tC - tP)}</td>
                          <td></td><td></td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Week-by-Week View ───────────────────────────────────────── */}
        {view === 'wbw' && (
          <div className="cc">
            <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '0 12px 6px' }}>
              {model === 'plan' ? 'Planned Cases (committed POs)' : model === 'ratio' ? 'O/S Ratio Forecast' : 'Coverage-Based Forecast'}
            </div>
            <DataTable>
              <table className="dt" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>SKU</th><th>Cat</th><th className="tr">UPC</th>
                    {WKS.map((w, i) => <th key={w} className="tr" style={i === 4 ? { color: 'var(--gr)', fontWeight: 700 } : undefined}>{w}</th>)}
                    <th className="tr">13wk Total</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_POFC.skus.map(s => {
                    const effUpc = upcFor(s) ?? s.upc;
                    const upcScale = s.upc / effUpc;
                    const rawVals: number[] = (s as any)[mk] || Array(13).fill(0);
                    const vals = rawVals.map(v => Math.round(v * upcScale));
                    const tot = vals.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={s.dpci}>
                        <td><b>{s.name.substring(0, 28)}</b></td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.cat}</td>
                        <td className="tr">{upcOvr[s.dpci] ? <b style={{ color: 'var(--gr)' }}>{effUpc}</b> : effUpc}</td>
                        {vals.map((v, i) => (
                          <td key={i} className="tr" style={v > 0 ? { fontWeight: 600 } : { color: 'var(--tx3)' }}>
                            {v === 0 ? '—' : fmt(v)}
                          </td>
                        ))}
                        <td className="tr"><b>{fmt(tot)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Category View ───────────────────────────────────────────── */}
        {view === 'cat' && (
          <div className="cc">
            <div className="ct">Cases by Category — Plan vs Model</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={catChartData.cats}
                datasets={[
                  { label: 'Current Plan', data: catChartData.cats.map(c => catChartData.pb[c]), backgroundColor: 'rgba(148,163,184,.6)' },
                  { label: 'O/S Ratio', data: catChartData.cats.map(c => catChartData.rb[c]), backgroundColor: 'rgba(99,102,241,.8)' },
                  { label: 'Coverage', data: catChartData.cats.map(c => catChartData.cb[c]), backgroundColor: 'rgba(0,207,146,.7)' },
                ]}
                height={250}
              />
            </div>
          </div>
        )}

        {/* ── Monthly Tracker ─────────────────────────────────────────── */}
        {view === 'mth' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {monthlyData.map(m => (
                <div key={m.short} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', margin: '6px 0' }}>{fmt(m.fc_units)}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>units locked · ${fmt(Math.round(m.fc_rev / 1000))}K rev</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx3)' }}>{m.wkIdxs.length} weeks</div>
                </div>
              ))}
            </div>
            <div className="cc">
              <div className="ct">Weekly Pace Detail</div>
              <DataTable>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Week</th><th className="tr">Locked Forecast</th><th className="tr">Locked Rev</th><th>Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.flatMap(m => m.wkFc.map(wk => (
                      <tr key={wk.wk}>
                        <td><b>{wk.wk}</b></td>
                        <td className="tr">{fmt(wk.units)}</td>
                        <td className="tr" style={{ color: 'var(--tx3)' }}>${fmt(Math.round(wk.rev / 1000))}K</td>
                        <td style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{'—'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </DataTable>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
