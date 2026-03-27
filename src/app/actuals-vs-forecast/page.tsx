'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import Chip from '@/components/ui/Chip';
import { DATA_AVF, DATA_ACCURACY } from '@/data/index';
import { fmt, fmtP, fmtDol, sf } from '@/lib/formatters';
import type { AccuracySku } from '@/data/types';

const STATUS_OPTS = [
  { value: '', label: 'All Status' },
  { value: 'miss', label: 'Big Miss (<-25%)' },
  { value: 'beat', label: 'Beat (>+10%)' },
  { value: 'inline', label: 'In-line' },
];

function getAcc(dpci: string): AccuracySku | null {
  return DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null;
}

export default function ActualsVsForecastPage() {
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  /* ── Aggregates ────────────────────────────────────────────────── */
  const totA = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0), []);
  const totF = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0), []);
  const totAS = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.lw_sales), 0), []);
  const pct = totF ? (totA - totF) / totF : 0;
  const misses = useMemo(() => DATA_AVF.filter(s => sf(s.vs_fcast_pct) < -0.25).length, []);
  const beats = useMemo(() => DATA_AVF.filter(s => sf(s.vs_fcast_pct) > 0.10).length, []);

  const categories = useMemo(() => DATA_AVF.map(s => s.category), []);

  /* ── Filtered + sorted SKUs ────────────────────────────────────── */
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return [...DATA_AVF]
      .filter(s => {
        const p = sf(s.vs_fcast_pct);
        return (!cat || s.category === cat) &&
          (!q || s.name.toLowerCase().includes(q)) &&
          (!status ||
            (status === 'miss' ? p < -0.25 :
             status === 'beat' ? p > 0.10 :
             (p >= -0.25 && p <= 0.10)));
      })
      .sort((a, b) => sf(a.vs_fcast_pct) - sf(b.vs_fcast_pct));
  }, [cat, query, status]);

  return (
    <PageShell
      title="Actuals vs Forecast"
      subtitle="LW Omni actuals vs locked demand-plan forecast · Week of Mar 16, 2026"
    >
      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="📦" label="LW Actual Units (Mar 16)" style="--cc:var(--ac)"
          value={fmt(totA)}
          delta={`${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct * 100).toFixed(1)}% vs model`}
          deltaClass="dn"
          sub={`${fmtDol(totAS)} revenue · Omni source`}
        />
        <KpiCard
          icon="🎯" label="vs Locked Plan Fcast (Mar 16)"
          style={`--cc:${pct < 0 ? 'var(--rd)' : 'var(--gr)'}`}
          value={fmtP(pct)}
          delta={`${pct >= 0 ? '↑' : '↓'} ${fmt(Math.abs(totA - totF))} units`}
          deltaClass={pct >= 0 ? 'up' : 'dn'}
          sub={`Actuals: ${fmt(totA)} · Plan fcast: ${fmt(totF)} · Basis: original locked plan, not scenario-adjusted`}
        />
        <KpiCard
          icon="⚠️" label="Big Misses (<-25%)" style="--cc:var(--rd)"
          value={misses} delta="SKUs significantly below model" deltaClass="dn" sub=""
        />
        <KpiCard
          icon="⚡" label="Beats (>+10%)" style="--cc:var(--gr)"
          value={beats} delta="SKUs above model forecast" deltaClass="up" sub=""
        />
      </KpiGrid>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <FilterBar meta={`${skus.length} SKUs · Omni source`}>
        <SelectFilter id="avf-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <select value={status} onChange={e => setStatus(e.target.value)}>
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
              <th style={{ minWidth: 185 }}>SKU</th>
              <th>Category</th>
              <th className="tr">LW Actual</th>
              <th className="tr">LW Revenue</th>
              <th className="tr">UPSPW</th>
              <th className="tr">Stores</th>
              <th className="tr">Locked Plan Fcast</th>
              <th className="tr" title="Actuals vs. pre-locked demand plan forecast for week of Mar 16. NOT scenario-adjusted.">vs Fcast &#8505;</th>
              <th className="tr">vs Fcast %</th>
              <th className="tr">L4W Avg</th>
              <th className="tr">CW to Date</th>
              <th className="tr">MAPE L4W</th>
              <th>Trust</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => {
              const p = sf(s.vs_fcast_pct);
              const pc = p < -0.25 ? 'dn' : p > 0.10 ? 'up' : 'neu';
              const acc = getAcc(s.dpci);
              return (
                <tr key={i}>
                  <td className="tn" title={s.name}>{s.name}</td>
                  <td><Chip className="cb">{s.category}</Chip></td>
                  <td className="tr">{fmt(s.lw_units)}</td>
                  <td className="tr">{fmtDol(s.lw_sales)}</td>
                  <td className="tr">{s.lw_upspw?.toFixed(2) ?? '—'}</td>
                  <td className="tr">{fmt(s.lw_stores)}</td>
                  <td className="tr">{fmt(s.fcast_units)}</td>
                  <td className={`tr ${pc}`}>{p >= 0 ? '↑' : '↓'} {fmt(Math.abs(s.vs_fcast_units))}</td>
                  <td className={`tr ${pc}`}>{p >= 0 ? '↑' : '↓'} {Math.abs(p * 100).toFixed(1)}%</td>
                  <td className="tr" style={{ color: 'var(--tx2)' }}>{fmt(s.l4w_avg_units)}</td>
                  <td className="tr" style={{ color: 'var(--cy)' }}>{fmt(s.cw_units_to_date)}</td>
                  {acc ? (
                    <>
                      <td className="tr" style={{ color: acc.mape_l4w < 12 ? 'var(--gr)' : acc.mape_l4w < 22 ? 'var(--yw)' : 'var(--rd)', fontWeight: 700 }}>
                        {acc.mape_l4w.toFixed(1)}%
                      </td>
                      <td>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: acc.trust_level === 'High' ? 'rgba(0,207,146,.12)' : acc.trust_level === 'Medium' ? 'rgba(255,199,17,.10)' : 'rgba(239,68,68,.10)',
                          color: acc.trust_level === 'High' ? 'var(--gr)' : acc.trust_level === 'Medium' ? 'var(--yw)' : 'var(--rd)',
                        }}>
                          {acc.trust_level === 'High' ? '✅' : acc.trust_level === 'Medium' ? '⚠️' : '🔴'} {acc.trust_level}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="tr">&mdash;</td>
                      <td>&mdash;</td>
                    </>
                  )}
                </tr>
              );
            })}
            {/* Seasonal step-down note */}
            <tr style={{ background: 'rgba(255,199,17,.06)' }}>
              <td colSpan={13} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--yw)' }}>
                <b>{'⚠️'} Seasonal Step-Down:</b> Smoothies H1&rarr;H2 base &minus;19.5% (~41,895&rarr;33,738 units/wk) and YoGos H1&rarr;H2 base &minus;17.6% (~10,227&rarr;8,427 units/wk). Reflects organic deceleration after Jan&ndash;Mar TPC cadence. All forward fcast uses H2 base from Wk3 (Apr 5) onward.
              </td>
            </tr>
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
