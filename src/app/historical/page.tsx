'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { DATA_HIST } from '@/data/index';
import { fmt, sf } from '@/lib/formatters';

/* ── View toggle options ─────────────────────────────────────────────── */

const VIEW_OPTS = [
  { value: 'units', label: 'Units' },
  { value: 'heat', label: 'Heatmap' },
];

/* ── Page Component ──────────────────────────────────────────────────── */

export default function HistoricalPage() {
  const [view, setView] = useState('units');
  const [pl, setPl] = useState('');
  const [query, setQuery] = useState('');

  /* Filtered SKUs */
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return DATA_HIST.skus.filter(
      (s) => (!pl || s.product_line === pl) && (!q || s.product.toLowerCase().includes(q)),
    );
  }, [pl, query]);

  /* Last 13 weeks */
  const wks = useMemo(() => DATA_HIST.weeks.slice(-13), []);

  /* Max value for heatmap scaling */
  const maxV = useMemo(() => {
    if (view !== 'heat') return 1;
    let mx = 1;
    skus.forEach((s) =>
      wks.forEach((w) => {
        const v = sf(s.weeks[w]);
        if (v > mx) mx = v;
      }),
    );
    return mx;
  }, [view, skus, wks]);

  /* Heatmap color helper */
  const heatCol = (v: number): string => {
    if (!v) return 'transparent';
    const p = v / maxV;
    return `rgba(${Math.round(59 + 180 * p)},${Math.round(130 - 62 * p)},${Math.round(246 - 178 * p)},${0.25 + p * 0.55})`;
  };

  return (
    <PageShell
      title="Historical Sell-Through"
      subtitle="35-week weekly unit sales by SKU"
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <FilterBar meta={`${skus.length} SKUs`}>
        <SelectFilter
          id="hi-pl"
          options={DATA_HIST.skus.map((s) => s.product_line)}
          value={pl}
          onChange={setPl}
          allLabel="All Lines"
        />
        <input
          id="hi-q"
          type="text"
          placeholder="Search product…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ fontSize: 12 }}
        />
      </FilterBar>

      <DataTable>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 155 }}>Product</th>
              <th>Line</th>
              {wks.map((w) => (
                <th key={w} className="tr" style={{ fontSize: 10 }}>
                  {w}
                </th>
              ))}
              <th className="tr">Total</th>
              <th className="tr">Trend</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s) => {
              const vals = wks.map((w) => sf(s.weeks[w]));
              const tot = vals.reduce((a, b) => a + b, 0);
              const l4 = vals.slice(-4).reduce((a, b) => a + b, 0) / 4 || 1;
              const f4 = vals.slice(0, 4).reduce((a, b) => a + b, 0) / 4 || 1;
              const tr = (l4 - f4) / f4;

              return (
                <tr key={s.dpci || s.product}>
                  <td className="tn">{s.product}</td>
                  <td>
                    <span className="ch cgr">{s.product_line || '—'}</span>
                  </td>
                  {vals.map((v, i) => (
                    <td
                      key={i}
                      className="tr"
                      style={view === 'heat' ? { background: heatCol(v) } : undefined}
                    >
                      {v ? fmt(v) : '—'}
                    </td>
                  ))}
                  <td className="tr" style={{ fontWeight: 600 }}>
                    {fmt(tot)}
                  </td>
                  <td className={`tr ${tr > 0.05 ? 'up' : tr < -0.05 ? 'dn' : 'neu'}`}>
                    {tr >= 0 ? '↑' : '↓'}
                    {Math.abs(tr * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
