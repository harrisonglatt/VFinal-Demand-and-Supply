'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import DoughnutChart from '@/components/charts/DoughnutChart';
import { DATA_DAILY, DATA_OMNI } from '@/data/index';
import { fmt, fmtP, sf, chgCls } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'wow', label: 'WoW' },
  { value: 'trend', label: '14-Day Trend' },
  { value: 'wtd', label: 'WTD Product' },
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

  /* ── T4W averages from Omni ──────────────────────────────────── */
  const omniWt = DATA_OMNI.weekly_totals;
  const t4w = omniWt.slice(-4);
  const t4wAvgUnits = Math.round(t4w.reduce((a, w) => a + w.units, 0) / (t4w.length || 1));
  const t4wAvgSales = Math.round(t4w.reduce((a, w) => a + w.sales, 0) / (t4w.length || 1));
  const t4wDailyAvgU = Math.round(t4wAvgUnits / 7);
  const t4wDailyAvgS = Math.round(t4wAvgSales / 7);
  const cwPaceVsT4w_u = t4wDailyAvgU > 0 ? d.cw_daily_avg_u / t4wDailyAvgU - 1 : 0;
  const cwPaceVsT4w_s = t4wDailyAvgS > 0 ? d.cw_daily_avg_s / t4wDailyAvgS - 1 : 0;

  const categories = useMemo(() => (d as any).skus?.map((s: any) => s.cat) || [], [d]);

  const kpis = [
    { l: `CW Units (${d.days_in}d)`, v: fmt(d.cw_units), sub: `LW pace: ${fmt(d.lw_daily_avg_u)}/day`, chg: wow_u, t4w: `T4W avg: ${fmt(t4wAvgUnits)}/wk · ${fmt(t4wDailyAvgU)}/day` },
    { l: `CW Revenue (${d.days_in}d)`, v: `$${fmt(Math.round(d.cw_sales))}`, sub: `LW pace: $${fmt(Math.round(d.lw_daily_avg_s))}/day`, chg: wow_s, t4w: `T4W avg: $${fmt(t4wAvgSales)}/wk` },
    { l: 'Daily Avg Units', v: fmt(d.cw_daily_avg_u), sub: `LW: ${fmt(d.lw_daily_avg_u)}/day`, chg: pace_u, t4w: `vs T4W: ${fmtP(cwPaceVsT4w_u)}` },
    { l: 'Daily Avg Revenue', v: `$${fmt(Math.round(d.cw_daily_avg_s))}`, sub: `LW: $${fmt(Math.round(d.lw_daily_avg_s))}/day`, chg: pace_s, t4w: `vs T4W: ${fmtP(cwPaceVsT4w_s)}` },
  ];

  return (
    <PageShell
      title="Daily Performance"
      subtitle={`Live tracker · ${d.as_of} · ${d.days_in} days into CW · Omni POS`}
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
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{k.t4w}</div>
          </div>
        ))}
      </div>

      {/* ── Filters (for SKU & WTD views) ──────────────────────── */}
      {(view === 'sku' || view === 'wtd') && (
        <FilterBar>
          <SelectFilter id="dp2-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
          <input
            type="text" placeholder="Search SKU..."
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
          />
        </FilterBar>
      )}

      {view === 'wow' && <WoWView />}
      {view === 'trend' && <TrendView />}
      {view === 'wtd' && <WTDProductView cat={cat} query={query} />}
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
        <BarChart labels={labels} datasets={[{ label: 'Units/Day', data: udata, backgroundColor: bgs }]} />
      </div>
      <div className="card">
        <div className="card-title">Revenue/Day (14-Day)</div>
        <BarChart labels={labels} datasets={[{ label: 'Revenue/Day', data: sdata, backgroundColor: bgs }]} />
      </div>
    </div>
  );
}

/* ── WTD Product View (NEW) ───────────────────────────────────────── */
function WTDProductView({ cat, query }: { cat: string; query: string }) {
  const d = DATA_DAILY;
  const omniWeeks = DATA_OMNI.weeks;
  const lwKey = omniWeeks[omniWeeks.length - 1];
  const omniSkus = DATA_OMNI.skus;

  // Normalize name: strip LS codes, "Smoothie", "4pk", "Single" etc for matching
  const norm = (n: string) => n.toLowerCase()
    .replace(/\s+ls-[a-z0-9]+/gi, '')        // strip " LS-DR06" suffixes
    .replace(/\s+(smoothie|4pk|single)\b/gi, '') // strip "Smoothie", "4pk", "Single"
    .replace(/[–—]/g, ' ')                    // normalize dashes
    .replace(/\+/g, ' ')                      // normalize +
    .replace(/\s+/g, ' ').trim();

  // Build normalized omni lookup (multiple keys per SKU for better matching)
  type OmniRow = { lwUnits: number; lwSales: number; t4wAvgUnits: number; t4wAvgSales: number };
  const omniLookup: Record<string, OmniRow> = {};
  for (const [, sku] of Object.entries(omniSkus)) {
    const lwData = sku.weeks[lwKey];
    const last4Keys = omniWeeks.slice(-4);
    let t4uSum = 0, t4sSum = 0, t4count = 0;
    for (const wk of last4Keys) {
      const wData = sku.weeks[wk];
      if (wData) { t4uSum += wData.units; t4sSum += wData.sales; t4count++; }
    }
    const row: OmniRow = {
      lwUnits: lwData?.units ?? 0,
      lwSales: lwData?.sales ?? 0,
      t4wAvgUnits: t4count > 0 ? Math.round(t4uSum / t4count) : 0,
      t4wAvgSales: t4count > 0 ? Math.round(t4sSum / t4count) : 0,
    };
    // Index by both raw and normalized name
    omniLookup[sku.name.toLowerCase()] = row;
    omniLookup[norm(sku.name)] = row;
  }

  // Match daily SKU to omni by normalized name
  const findOmni = (dailyName: string): OmniRow => {
    const exact = omniLookup[dailyName.toLowerCase()];
    if (exact) return exact;
    const normalized = norm(dailyName);
    const normMatch = omniLookup[normalized];
    if (normMatch) return normMatch;
    // Fallback: find best substring match
    for (const [key, val] of Object.entries(omniLookup)) {
      if (key.includes(normalized) || normalized.includes(key)) return val;
    }
    return { lwUnits: 0, lwSales: 0, t4wAvgUnits: 0, t4wAvgSales: 0 };
  };

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const skus = ((d as any).skus || []) as any[];
    return skus
      .filter((s: any) => (!cat || s.cat === cat) && (!q || s.name.toLowerCase().includes(q)))
      .map((s: any) => {
        const omni = findOmni(s.name);
        const vsLwUnits = omni.lwUnits > 0 ? s.cw_units / (omni.lwUnits * d.days_in / 7) - 1 : 0;
        const vsLwSales = omni.lwSales > 0 ? s.cw_sales / (omni.lwSales * d.days_in / 7) - 1 : 0;
        const vsT4wUnits = omni.t4wAvgUnits > 0 ? s.cw_units / (omni.t4wAvgUnits * d.days_in / 7) - 1 : 0;
        const vsT4wSales = omni.t4wAvgSales > 0 ? s.cw_sales / (omni.t4wAvgSales * d.days_in / 7) - 1 : 0;
        return { ...s, omni, vsLwUnits, vsLwSales, vsT4wUnits, vsT4wSales };
      })
      .sort((a: any, b: any) => b.cw_sales - a.cw_sales);
  }, [d, cat, query, findOmni]);

  let totCwU = 0, totCwS = 0, totLwU = 0, totLwS = 0, totT4wU = 0, totT4wS = 0;
  rows.forEach((r: any) => {
    totCwU += r.cw_units; totCwS += r.cw_sales;
    totLwU += r.omni.lwUnits; totLwS += r.omni.lwSales;
    totT4wU += r.omni.t4wAvgUnits; totT4wS += r.omni.t4wAvgSales;
  });

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8, marginBottom: 4 }}>
        {rows.length} SKUs · WTD through {d.as_of} ({d.days_in} days) · LW & T4W from Omni
      </div>
      <DataTable>
        <table className="dt">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Product</th>
              <th>Category</th>
              <th className="tr">WTD Units</th>
              <th className="tr">WTD Rev</th>
              <th className="tr">LW Full Wk</th>
              <th className="tr">LW Rev</th>
              <th className="tr">vs LW Pace</th>
              <th className="tr">T4W Avg/Wk</th>
              <th className="tr">T4W Avg Rev</th>
              <th className="tr">vs T4W Pace</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s: any, i: number) => (
              <tr key={i}>
                <td className="tn"><b>{s.name}</b></td>
                <td style={{ fontSize: 10 }}>{s.cat}</td>
                <td className="tr"><b>{fmt(s.cw_units)}</b></td>
                <td className="tr"><b>${fmt(Math.round(s.cw_sales))}</b></td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(s.omni.lwUnits)}</td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>${fmt(Math.round(s.omni.lwSales))}</td>
                <td className={`tr ${chgCls(s.vsLwSales)}`}>
                  {s.vsLwSales >= 0.15 ? '🚀' : s.vsLwSales <= -0.15 ? '⚠️' : ''} {fmtP(s.vsLwSales)}
                </td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(s.omni.t4wAvgUnits)}</td>
                <td className="tr" style={{ color: 'var(--tx3)' }}>${fmt(Math.round(s.omni.t4wAvgSales))}</td>
                <td className={`tr ${chgCls(s.vsT4wSales)}`}>
                  {s.vsT4wSales >= 0.15 ? '🚀' : s.vsT4wSales <= -0.15 ? '⚠️' : ''} {fmtP(s.vsT4wSales)}
                </td>
              </tr>
            ))}
            <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
              <td>TOTAL ({rows.length})</td><td />
              <td className="tr">{fmt(totCwU)}</td>
              <td className="tr">${fmt(Math.round(totCwS))}</td>
              <td className="tr">{fmt(totLwU)}</td>
              <td className="tr">${fmt(Math.round(totLwS))}</td>
              <td />
              <td className="tr">{fmt(totT4wU)}</td>
              <td className="tr">${fmt(Math.round(totT4wS))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </DataTable>
    </>
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
        {skus.length} SKUs · Through {d.as_of}
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
