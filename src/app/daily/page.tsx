'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import DoughnutChart from '@/components/charts/DoughnutChart';
import { DATA_DAILY } from '@/data/index';
import { fmt, fmtP, sf, chgCls } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'wow', label: 'WoW' },
  { value: 'trend', label: '14-Day Trend' },
  { value: 'product', label: 'By Product' },
  { value: 'sku', label: 'SKU Table' },
];

export default function DailyPage() {
  const [view, setView] = useState('wow');
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');

  const d = DATA_DAILY;
  const pace_u = d.cw_daily_avg_u / d.lw_daily_avg_u - 1;
  const pace_s = d.cw_daily_avg_s / d.lw_daily_avg_s - 1;
  const lw_2day_u = d.lw_daily_avg_u * d.days_in;
  const lw_2day_s = d.lw_daily_avg_s * d.days_in;
  const wow_u = (d.cw_units - lw_2day_u) / lw_2day_u;
  const wow_s = (d.cw_sales - lw_2day_s) / lw_2day_s;

  const categories = useMemo(() => (d as any).skus?.map((s: any) => s.cat) || [], [d]);

  const kpis = [
    { l: `CW Units (${d.days_in}d)`, v: fmt(d.cw_units), sub: `LW pace: ${fmt(d.lw_daily_avg_u)}/day`, chg: wow_u },
    { l: `CW Revenue (${d.days_in}d)`, v: `$${fmt(Math.round(d.cw_sales))}`, sub: `LW pace: $${fmt(Math.round(d.lw_daily_avg_s))}/day`, chg: wow_s },
    { l: 'Daily Avg Units', v: fmt(d.cw_daily_avg_u), sub: `LW: ${fmt(d.lw_daily_avg_u)}/day`, chg: pace_u },
    { l: 'Daily Avg Revenue', v: `$${fmt(Math.round(d.cw_daily_avg_s))}`, sub: `LW: $${fmt(Math.round(d.lw_daily_avg_s))}/day`, chg: pace_s },
  ];

  return (
    <PageShell
      title="Daily Performance"
      subtitle={`Live tracker · ${d.as_of} · ${d.days_in} days into CW`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      {/* ── Mini KPIs ────────────────────────────────────────────── */}
      <div className="kpis k4">
        {kpis.map((k, i) => (
          <div key={i} className="kc">
            <div className="kl">{k.l}</div>
            <div className="kv">{k.v}</div>
            <div className="ks">{k.sub}</div>
            {k.chg != null && <div className={`kd ${chgCls(k.chg)}`}>{fmtP(k.chg)} vs LW same days</div>}
          </div>
        ))}
      </div>

      {/* ── Filters (only for SKU view) ──────────────────────────── */}
      {view === 'sku' && (
        <FilterBar>
          <SelectFilter id="dp2-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
          <input
            type="text" placeholder="Search SKU..."
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
          />
        </FilterBar>
      )}

      {/* ── WoW View ─────────────────────────────────────────────── */}
      {view === 'wow' && <WoWView />}
      {view === 'trend' && <TrendView />}
      {view === 'product' && <ProductView />}
      {view === 'sku' && <SKUView cat={cat} query={query} />}
    </PageShell>
  );
}

/* ── WoW View ──────────────────────────────────────────────────────── */
function WoWView() {
  const d = DATA_DAILY;
  const cw = d.dow_compare;
  const labels = cw.map(r => r.dow);

  let twU = 0, twS = 0, tlwU = 0, tlwS = 0;
  cw.forEach(r => { twU += r.cw_units; twS += r.cw_sales; tlwU += r.lw_units; tlwS += r.lw_sales; });

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Units by Day-of-Week</div>
          <BarChart
            labels={labels}
            datasets={[
              { label: `LW ${d.lw_label}`, data: cw.map(r => r.lw_units), backgroundColor: 'rgba(148,163,184,0.55)' },
              { label: `CW ${d.cw_label}`, data: cw.map(r => r.cw_units), backgroundColor: 'rgba(99,102,241,0.85)' },
            ]}
          />
        </div>
        <div className="card">
          <div className="card-title">Revenue by Day-of-Week</div>
          <BarChart
            labels={labels}
            datasets={[
              { label: `LW ${d.lw_label}`, data: cw.map(r => Math.round(r.lw_sales)), backgroundColor: 'rgba(148,163,184,0.55)' },
              { label: `CW ${d.cw_label}`, data: cw.map(r => Math.round(r.cw_sales)), backgroundColor: 'rgba(0,207,146,0.85)' },
            ]}
          />
        </div>
      </div>
      <DataTable>
        <table className="dt">
          <thead>
            <tr>
              <th>Day</th><th>LW Date</th><th className="tr">LW Units</th><th className="tr">LW Revenue</th>
              <th>CW Date</th><th className="tr">CW Units</th><th className="tr">CW Revenue</th>
              <th className="tr">Units WoW</th><th className="tr">Rev WoW</th>
            </tr>
          </thead>
          <tbody>
            {cw.map((r, i) => {
              const du = (r.cw_units - r.lw_units) / r.lw_units;
              const ds = (r.cw_sales - r.lw_sales) / r.lw_sales;
              return (
                <tr key={i}>
                  <td><b>{r.dow}</b></td>
                  <td style={{ color: 'var(--tx3)' }}>{r.lw_date}</td>
                  <td className="tr">{fmt(r.lw_units)}</td>
                  <td className="tr">${fmt(Math.round(r.lw_sales))}</td>
                  <td style={{ color: 'var(--ac2)' }}>{r.cw_date}</td>
                  <td className="tr"><b>{fmt(r.cw_units)}</b></td>
                  <td className="tr"><b>${fmt(Math.round(r.cw_sales))}</b></td>
                  <td className={`tr ${chgCls(du)}`}><b>{fmtP(du)}</b></td>
                  <td className={`tr ${chgCls(ds)}`}><b>{fmtP(ds)}</b></td>
                </tr>
              );
            })}
            <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
              <td colSpan={2}>CW Total ({d.days_in}d)</td>
              <td className="tr">{fmt(tlwU)}</td><td className="tr">${fmt(Math.round(tlwS))}</td>
              <td />
              <td className="tr">{fmt(twU)}</td><td className="tr">${fmt(Math.round(twS))}</td>
              <td className={`tr ${chgCls((twU - tlwU) / tlwU)}`}>{fmtP((twU - tlwU) / tlwU)}</td>
              <td className={`tr ${chgCls((twS - tlwS) / tlwS)}`}>{fmtP((twS - tlwS) / tlwS)}</td>
            </tr>
          </tbody>
        </table>
      </DataTable>
    </>
  );
}

/* ── Trend View ────────────────────────────────────────────────────── */
function TrendView() {
  const d = DATA_DAILY;
  const all = d.daily_totals;
  const labels = all.map(r => `${r.date} (${r.dow})`);
  const udata = all.map(r => r.units);
  const sdata = all.map(r => Math.round(r.sales));
  const bgs = all.map(r => r.wk === 'CW' ? 'rgba(99,102,241,0.9)' : r.wk === 'LW' ? 'rgba(0,207,146,0.75)' : 'rgba(148,163,184,0.5)');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
      <div className="card">
        <div className="card-title">Units/Day (14-Day)</div>
        <BarChart labels={labels} datasets={[{ label: 'Units/Day', data: udata, backgroundColor: bgs[0] }]} />
      </div>
      <div className="card">
        <div className="card-title">Revenue/Day (14-Day)</div>
        <BarChart labels={labels} datasets={[{ label: 'Revenue/Day', data: sdata, backgroundColor: bgs[0] }]} />
      </div>
    </div>
  );
}

/* ── Product View ──────────────────────────────────────────────────── */
function ProductView() {
  const d = DATA_DAILY;
  const cats = d.cat_summary;
  const catLabels = cats.map(c => c.cat);
  const catColors = ['rgba(99,102,241,0.85)', 'rgba(0,207,146,0.85)', 'rgba(255,199,17,0.85)', 'rgba(239,68,68,0.85)', 'rgba(168,85,247,0.85)'];
  const prods = useMemo(() => [...(d as any).skus].sort((a: any, b: any) => b.cw_sales - a.cw_sales), [d]);

  let totalCwU = 0, totalCwS = 0, totalLwU = 0, totalLwS = 0;
  prods.forEach((s: any) => {
    totalCwU += s.cw_units; totalCwS += s.cw_sales;
    totalLwU += sf(s.lw_3day_units); totalLwS += sf(s.lw_3day_sales);
  });

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-title">CW Revenue by Category</div>
          <DoughnutChart
            labels={catLabels}
            data={cats.map(c => Math.round(c.cw_sales))}
            colors={catColors}
          />
        </div>
        <div className="card">
          <div className="card-title">Units by Category: LW vs CW</div>
          <BarChart
            labels={catLabels}
            datasets={[
              { label: `LW same ${d.days_in}d`, data: cats.map(c => sf(c.lw_3day_units)), backgroundColor: 'rgba(148,163,184,0.45)' },
              { label: `CW ${d.days_in}d`, data: cats.map(c => c.cw_units), backgroundColor: catColors[0] },
            ]}
          />
        </div>
      </div>
      <DataTable>
        <table className="dt">
          <thead>
            <tr>
              <th>Product</th><th>Category</th>
              <th className="tr">CW Units ({d.days_in}d)</th><th className="tr">CW Revenue</th>
              <th className="tr">LW Same {d.days_in}D</th><th className="tr">LW Rev Same {d.days_in}D</th>
              <th className="tr">Units WoW</th><th className="tr">Rev WoW</th>
            </tr>
          </thead>
          <tbody>
            {prods.map((s: any, i: number) => (
              <tr key={i}>
                <td><b>{s.name}</b></td>
                <td><span className={`cat-badge cat-${s.cat.replace(/[\/ ]/g, '-').toLowerCase()}`}>{s.cat}</span></td>
                <td className="tr">{fmt(s.cw_units)}</td>
                <td className="tr"><b>${fmt(Math.round(s.cw_sales))}</b></td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(sf(s.lw_3day_units))}</td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>${fmt(Math.round(sf(s.lw_3day_sales)))}</td>
                <td className={`tr ${chgCls(s.wow_units_pct)}`}>
                  {s.wow_units_pct >= 0.15 ? '🚀' : s.wow_units_pct <= -0.15 ? '⚠️' : ''} {fmtP(s.wow_units_pct)}
                </td>
                <td className={`tr ${chgCls(s.wow_sales_pct)}`}>
                  {s.wow_sales_pct >= 0.15 ? '🚀' : s.wow_sales_pct <= -0.15 ? '⚠️' : ''} {fmtP(s.wow_sales_pct)}
                </td>
              </tr>
            ))}
            <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
              <td>TOTAL</td><td />
              <td className="tr">{fmt(totalCwU)}</td><td className="tr">${fmt(Math.round(totalCwS))}</td>
              <td className="tr">{fmt(totalLwU)}</td><td className="tr">${fmt(Math.round(totalLwS))}</td>
              <td className={`tr ${chgCls((totalCwU - totalLwU) / totalLwU)}`}>{fmtP((totalCwU - totalLwU) / totalLwU)}</td>
              <td className={`tr ${chgCls((totalCwS - totalLwS) / totalLwS)}`}>{fmtP((totalCwS - totalLwS) / totalLwS)}</td>
            </tr>
          </tbody>
        </table>
      </DataTable>
    </>
  );
}

/* ── SKU View ──────────────────────────────────────────────────────── */
function SKUView({ cat, query }: { cat: string; query: string }) {
  const d = DATA_DAILY;
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return ((d as any).skus || []).filter((s: any) =>
      (!cat || s.cat === cat) && (!q || s.name.toLowerCase().includes(q))
    );
  }, [cat, query, d]);

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8, marginBottom: 4 }}>
        {skus.length} SKUs &middot; Through {d.as_of}
      </div>
      <DataTable>
        <table className="dt">
          <thead>
            <tr>
              <th>SKU</th><th>Category</th>
              <th className="tr">CW Units ({d.days_in}d)</th><th className="tr">CW Revenue</th>
              <th className="tr">LW Same Days</th><th className="tr">LW Rev Same Days</th>
              <th className="tr">Units WoW</th><th className="tr">Rev WoW</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s: any, i: number) => (
              <tr key={i}>
                <td><b>{s.name}</b></td>
                <td><span className={`cat-badge cat-${s.cat.replace(/[\/ ]/g, '-').toLowerCase()}`}>{s.cat}</span></td>
                <td className="tr">{fmt(s.cw_units)}</td>
                <td className="tr"><b>${fmt(Math.round(s.cw_sales))}</b></td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(sf(s.lw_3day_units))}</td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>${fmt(Math.round(sf(s.lw_3day_sales)))}</td>
                <td className={`tr ${chgCls(s.wow_units_pct)}`}>
                  {s.wow_units_pct >= 0.20 ? '🚀' : s.wow_units_pct <= -0.20 ? '⚠️' : ''} {fmtP(s.wow_units_pct)}
                </td>
                <td className={`tr ${chgCls(s.wow_sales_pct)}`}>
                  {s.wow_sales_pct >= 0.20 ? '🚀' : s.wow_sales_pct <= -0.20 ? '⚠️' : ''} {fmtP(s.wow_sales_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </>
  );
}
