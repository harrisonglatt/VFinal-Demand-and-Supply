'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { RiskChip } from '@/components/ui/Chip';
import { DATA_INV, DATA_TARGET_DC } from '@/data/index';
import { fmt, fmtDol, sf } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'ls', label: 'LS Warehouse' },
  { value: 'dc', label: 'Target DC' },
];

const RISK_OPTS = [
  { value: '', label: 'All Risk' },
  { value: 'OOS', label: 'OOS Alert' },
  { value: 'Watch', label: 'Supply Watch' },
];

const SORT_OPTS = [
  { value: 'lost', label: 'Sort: Lost$/Wk' },
  { value: 'oos', label: 'Sort: OOS%' },
  { value: 'wos', label: 'Sort: WOS' },
];

export default function InventoryPage() {
  const [view, setView] = useState('ls');
  const [riskFilter, setRiskFilter] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('lost');

  /* ── KPI aggregates ────────────────────────────────────────────── */
  const s = DATA_INV.summary;
  const dcLow = useMemo(() => DATA_TARGET_DC.skus.filter(s => s.wos_dc < 6).length, []);
  const dcWatch = useMemo(() => DATA_TARGET_DC.skus.filter(s => s.wos_dc >= 6 && s.wos_dc < 10).length, []);
  const dcAvgWos = useMemo(
    () => (DATA_TARGET_DC.skus.reduce((a, s) => a + s.wos_dc, 0) / DATA_TARGET_DC.skus.length).toFixed(1),
    [],
  );

  return (
    <PageShell
      title="Inventory Health"
      subtitle="LS warehouse + Target DC on-hand · Omni source"
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard
          icon="🔴" label="LS OOS Alerts" style="--cc:var(--rd)"
          value={s.oos_alerts} delta="LS WH: SKUs with store OOS" deltaClass="dn"
          sub={`${fmtDol(s.lost_per_week)}/wk lost`}
        />
        <KpiCard
          icon="🟡" label="LS Supply Watch" style="--cc:var(--yw)"
          value={s.supply_watch} delta="SKUs <4 WOS in LS WH" deltaClass="neu"
          sub={`${fmtDol(s.annualized_loss)} annualized`}
        />
        <KpiCard
          icon="🏪" label="Target DC Low Stock" style="--cc:var(--rd)"
          value={dcLow} delta="SKUs <6 WOS at Target DCs" deltaClass="dn"
          sub={`${dcWatch} SKUs on watch (6–10 WOS)`}
        />
        <KpiCard
          icon="📊" label="Target DC Avg WOS" style="--cc:var(--gr)"
          value={`${dcAvgWos} wks`}
          delta={`Across ${DATA_TARGET_DC.skus.length} SKUs (WOS = DC EOH ÷ L4W weekly sell-thru)`}
          deltaClass="up"
          sub={`Source: Omni · ${DATA_TARGET_DC.as_of} · High avg driven by well-stocked core SKUs`}
        />
      </KpiGrid>

      <FilterBar>
        {view === 'ls' && (
          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
            {RISK_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <input
          type="text" placeholder="Search SKU..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FilterBar>

      {view === 'ls' ? (
        <LSView riskFilter={riskFilter} query={query} sortBy={sortBy} />
      ) : (
        <DCView query={query} sortBy={sortBy} />
      )}
    </PageShell>
  );
}

/* ── LS Warehouse View ─────────────────────────────────────────────── */
function LSView({ riskFilter, query, sortBy }: { riskFilter: string; query: string; sortBy: string }) {
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return [...DATA_INV.skus]
      .filter(s => {
        const f = s.risk_flag || '';
        return (!riskFilter || (riskFilter === 'OOS' ? f.includes('OOS') : f.includes('Watch'))) &&
          (!q || s.description.toLowerCase().includes(q));
      })
      .sort((a, b) =>
        sortBy === 'oos' ? sf(b.oos_pct) - sf(a.oos_pct) :
        sortBy === 'wos' ? sf(a.wos_current) - sf(b.wos_current) :
        sf(b.lost_dollar_week) - sf(a.lost_dollar_week)
      );
  }, [riskFilter, query, sortBy]);

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>{skus.length} SKUs</div>
      <DataTable>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 175 }}>SKU</th>
              <th className="tr">Stores</th>
              <th className="tr">L4W UPSPW</th>
              <th className="tr">OOS%</th>
              <th className="tr">WOS Now</th>
              <th className="tr">WOS &Delta;4W</th>
              <th className="tr">EOH Units</th>
              <th className="tr">On Order</th>
              <th className="tr">Lost$/Wk</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => {
              const op = sf(s.oos_pct) * 100;
              const oc = op > 20 ? 'dn' : op > 10 ? 'neu' : 'up';
              const wt = sf(s.wos_current) - sf(s.wos_4w_ago);
              return (
                <tr key={i}>
                  <td className="tn" title={s.description}>{s.description.replace('Little Spoon ', '')}</td>
                  <td className="tr">{fmt(s.stores_tracked)}</td>
                  <td className="tr">{s.l4w_upspw?.toFixed(2) ?? '—'}</td>
                  <td className={`tr ${oc}`}>{(op).toFixed(1)}%</td>
                  <td className="tr">{sf(s.wos_current).toFixed(1)}</td>
                  <td className={`tr ${wt >= 0 ? 'up' : 'dn'}`}>{wt >= 0 ? '+' : ''}{wt.toFixed(1)}</td>
                  <td className="tr">{fmt(s.eoh_units)}</td>
                  <td className="tr">{fmt(s.on_order_units)}</td>
                  <td className={`tr ${s.lost_dollar_week > 0 ? 'dn' : ''}`}>{s.lost_dollar_week ? fmtDol(s.lost_dollar_week) : '—'}</td>
                  <td><RiskChip flag={s.risk_flag} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </>
  );
}

/* ── Target DC View ────────────────────────────────────────────────── */
function DCView({ query, sortBy }: { query: string; sortBy: string }) {
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return [...DATA_TARGET_DC.skus]
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.dpci.includes(q))
      .sort((a, b) => sortBy === 'wos' ? a.wos_dc - b.wos_dc : b.oh_units - a.oh_units);
  }, [query, sortBy]);

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>{skus.length} SKUs &middot; Target DC &middot; Omni {DATA_TARGET_DC.as_of}</div>
      <DataTable>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>SKU</th>
              <th>DPCI</th>
              <th className="tr">DC On-Hand</th>
              <th className="tr">On Order</th>
              <th className="tr">WOS (DC)</th>
              <th className="tr">UPSPW</th>
              <th className="tr">Stores</th>
              <th>DC Status</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => {
              const rk = s.dc_risk || '';
              const wc = s.wos_dc < 6 ? 'dn' : s.wos_dc < 10 ? 'neu' : 'up';
              return (
                <tr key={i}>
                  <td className="tn" title={s.name}>{s.name}</td>
                  <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{s.dpci}</td>
                  <td className="tr">{fmt(s.oh_units)}</td>
                  <td className="tr" style={{ color: 'var(--cy)' }}>{fmt(s.on_order)}</td>
                  <td className={`tr ${wc}`}>{s.wos_dc.toFixed(1)} wks</td>
                  <td className="tr">{s.velocity.toFixed(2)}</td>
                  <td className="tr">{fmt(s.stores)}</td>
                  <td>
                    {rk.includes('🔴') ? <span className="ch cr">{'🔴'} Low</span> :
                     rk.includes('🟡') ? <span className="ch cy2">{'🟡'} Watch</span> :
                     <span className="ch cg">{'✅'} OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </>
  );
}
