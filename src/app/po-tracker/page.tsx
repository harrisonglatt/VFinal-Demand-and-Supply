'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import Chip from '@/components/ui/Chip';
import BarChart from '@/components/charts/BarChart';
import { fmt } from '@/lib/formatters';
import { getCasePrice } from '@/lib/owlery/transform';
import type { OwleryPOData, OwleryPOSkuRollup, OwleryPOLine } from '@/data/types';

type View = 'schedule' | 'sku' | 'po' | 'timeline' | 'dc';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  // Pre-shipment group — amber
  open: { bg: 'rgba(255,167,38,.15)', color: '#FFA726', label: 'Open' },
  planned: { bg: 'rgba(255,167,38,.15)', color: '#FFA726', label: 'Planned' },
  quoted: { bg: 'rgba(255,167,38,.15)', color: '#FFA726', label: 'Quoted' },
  tendered: { bg: 'rgba(255,167,38,.15)', color: '#FFA726', label: 'Tendered' },
  // In transit — indigo
  inProgress: { bg: 'rgba(99,102,241,.15)', color: '#818cf8', label: 'In Transit' },
  // Completed — muted
  closed: { bg: 'rgba(0,207,146,.08)', color: 'rgba(0,207,146,.45)', label: 'Delivered' },
  cancelled: { bg: 'rgba(239,68,68,.08)', color: 'rgba(239,68,68,.45)', label: 'Cancelled' },
};

const PRE_SHIP_STATUSES = new Set(['open', 'planned', 'quoted', 'tendered']);

function timeAgo(date: Date): string {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function POTrackerPage() {
  const [data, setData] = useState<OwleryPOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [view, setView] = useState<View>('schedule');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [, setTick] = useState(0); // force re-render for timeAgo

  // ── Fetch helper ─────────────────────────────────────────────────
  const fetchData = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);
    setRefreshError('');

    try {
      const r = await fetch('/api/owlery/pos');
      if (!r.ok) throw new Error(`${r.status}`);
      const d: OwleryPOData = await r.json();
      setData(d);
      setLastRefresh(new Date());
      if (isInitial) setError('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      if (isInitial) setError(msg);
      else setRefreshError(`Refresh failed: ${msg}`);
    } finally {
      if (isInitial) setLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => { fetchData(true); }, [fetchData]);

  // ── Auto-refresh polling ─────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  // ── Tick for "last updated" display ──────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived data ─────────────────────────────────────────────────
  const categories = useMemo(() =>
    data ? [...new Set(data.lines.map(l => l.category))] : [],
    [data],
  );

  const statuses = useMemo(() =>
    data ? [...new Set(data.lines.map(l => l.status))] : [],
    [data],
  );

  const filteredRollup = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.sku_rollup.filter(s =>
      (!catFilter || s.category === catFilter) &&
      (!q || s.product_name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q)),
    );
  }, [data, catFilter, search]);

  const filteredLines = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.lines.filter(l =>
      (!catFilter || l.category === catFilter) &&
      (!statusFilter || l.status === statusFilter) &&
      (!q || l.product_name.toLowerCase().includes(q) || l.po_number.toLowerCase().includes(q)),
    );
  }, [data, catFilter, statusFilter, search]);

  // ── Delivery schedule: SKU rows × date columns (cases) ──────────
  const scheduleData = useMemo(() => {
    if (!data) return { dates: [] as string[], skus: [] as { sku: string; name: string; cat: string; dpci: string; upc: number; byDate: Record<string, { cases: number; po: string; status: string }> }[] };
    // Show all orders except cancelled
    const active = data.lines.filter(l => l.status !== 'cancelled');
    // Collect unique dates
    const dateSet = new Set(active.map(l => l.delivery_date));
    const dates = [...dateSet].sort();
    // Build SKU rows
    const skuMap = new Map<string, { sku: string; name: string; cat: string; dpci: string; upc: number; byDate: Record<string, { cases: number; po: string; status: string }> }>();
    for (const l of active) {
      let row = skuMap.get(l.sku);
      if (!row) {
        row = { sku: l.sku, name: l.product_name, cat: l.category, dpci: l.dpci, upc: l.units_per_case, byDate: {} };
        skuMap.set(l.sku, row);
      }
      const existing = row.byDate[l.delivery_date];
      if (existing) {
        existing.cases += l.cases;
        // Keep the "most active" status when merging (inProgress > pre-ship > closed)
        if (l.status === 'inProgress' || (PRE_SHIP_STATUSES.has(l.status) && existing.status === 'closed')) {
          existing.status = l.status;
        }
        existing.po += ', ' + l.po_number;
      } else {
        row.byDate[l.delivery_date] = { cases: l.cases, po: l.po_number, status: l.status };
      }
    }
    const skus = [...skuMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { dates, skus };
  }, [data]);

  // ── Timeline: group by delivery date ─────────────────────────────
  const timelineData = useMemo(() => {
    if (!data) return { dates: [] as string[], casesByDate: {} as Record<string, number> };
    const casesByDate: Record<string, number> = {};
    for (const l of data.lines) {
      if (l.status === 'cancelled') continue;
      casesByDate[l.delivery_date] = (casesByDate[l.delivery_date] || 0) + l.cases;
    }
    const dates = Object.keys(casesByDate).sort();
    return { dates, casesByDate };
  }, [data]);

  // ── DC breakdown ─────────────────────────────────────────────────
  const dcData = useMemo(() => {
    if (!data) return { dcs: [] as string[], casesByDC: {} as Record<string, number>, posByDC: {} as Record<string, Set<string>> };
    const casesByDC: Record<string, number> = {};
    const posByDC: Record<string, Set<string>> = {};
    for (const l of data.lines) {
      if (l.status === 'cancelled') continue;
      casesByDC[l.destination_dc] = (casesByDC[l.destination_dc] || 0) + l.cases;
      if (!posByDC[l.destination_dc]) posByDC[l.destination_dc] = new Set();
      posByDC[l.destination_dc].add(l.po_number);
    }
    const dcs = Object.keys(casesByDC).sort((a, b) => casesByDC[b] - casesByDC[a]);
    return { dcs, casesByDC, posByDC };
  }, [data]);

  // ── Loading / Error states ───────────────────────────────────────
  if (loading) {
    return (
      <PageShell title="PO Tracker" subtitle="Loading from Owlery TMS...">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🦉</div>
          Fetching PO data from Owlery...
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="PO Tracker" subtitle="Owlery TMS Integration">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--rd)' }}>
          Failed to load PO data: {error || 'Unknown error'}
        </div>
      </PageShell>
    );
  }

  const s = data.summary;

  return (
    <PageShell
      title="PO Tracker"
      subtitle={`${s.total_pos} POs · ${data.sku_rollup.length} SKUs · via ${data.source}`}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* ── Auto-refresh controls ─────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx3)' }}>
            {isRefreshing && (
              <span style={{ display: 'inline-block', animation: 'owlspin 1s linear infinite', fontSize: 14 }}>🦉</span>
            )}
            {lastRefresh && <span>Updated {timeAgo(lastRefresh)}</span>}
            <button
              type="button"
              onClick={() => fetchData(false)}
              disabled={isRefreshing}
              style={{
                background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6,
                padding: '4px 8px', color: 'var(--tx)', fontSize: 11, cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setAutoRefresh(v => !v)}
              style={{
                background: autoRefresh ? 'rgba(0,207,146,.15)' : 'var(--s2)',
                border: `1px solid ${autoRefresh ? 'rgba(0,207,146,.4)' : 'var(--bd)'}`,
                borderRadius: 6, padding: '4px 8px',
                color: autoRefresh ? '#00CF92' : 'var(--tx3)', fontSize: 11, cursor: 'pointer',
              }}
            >
              {autoRefresh ? 'Auto 5m' : 'Paused'}
            </button>
          </div>
          <ButtonGroup
            options={[
              { value: 'schedule', label: 'Schedule' },
              { value: 'sku', label: 'By SKU' },
              { value: 'po', label: 'By PO' },
              { value: 'timeline', label: 'Timeline' },
              { value: 'dc', label: 'By DC' },
            ]}
            active={view}
            onChange={v => setView(v as View)}
          />
        </div>
      }
    >
      {/* ── Spin animation ────────────────────────────────────────── */}
      <style>{`@keyframes owlspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Refresh error banner ─────────────────────────────────── */}
        {refreshError && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#ef4444' }}>
            {refreshError} — showing last successful data
          </div>
        )}

        {/* ── KPIs ──────────────────────────────────────────────────── */}
        <KpiGrid columns={4}>
          <KpiCard
            icon="📋" label="Open POs"
            style="--cc:var(--ac)"
            value={String(s.open_pos)}
            delta={`${fmt(s.total_cases - s.delivered)} cases pending`}
            deltaClass="neu" sub={`${s.total_pos} total POs · ${fmt(s.total_cases)} total cases`}
          />
          <KpiCard
            icon="📦" label="Pre-Shipment"
            style="--cc:#FFA726"
            value={fmt(s.pre_shipment) + ' cs'}
            delta={`${s.pre_shipment_loads} load${s.pre_shipment_loads !== 1 ? 's' : ''} · Open / Planned / Quoted / Tendered`}
            deltaClass="neu" sub="Awaiting pickup or carrier assignment"
          />
          <KpiCard
            icon="🚚" label="In Transit"
            style="--cc:#818cf8"
            value={fmt(s.in_transit) + ' cs'}
            delta={`${s.in_transit_loads} load${s.in_transit_loads !== 1 ? 's' : ''} actively shipping`}
            deltaClass="neu" sub={`${fmt(s.upcoming_7d)} cs due in 7 days · ${fmt(s.upcoming_14d)} in 14`}
          />
          <KpiCard
            icon="💰" label="Shipped Revenue"
            style="--cc:var(--gr)"
            value={`$${fmt(Math.round(data.lines.reduce((a, l) => a + l.cases * getCasePrice(l.sku), 0)))}`}
            delta={`${fmt(s.total_cases)} total cases · ${s.total_pos} POs`}
            deltaClass="neu" sub="Based on case cost × cases ordered"
          />
        </KpiGrid>

        {/* ── Filters ───────────────────────────────────────────────── */}
        <FilterBar meta={view === 'sku' ? `${filteredRollup.length} SKUs` : `${filteredLines.length} lines`}>
          <SelectFilter id="po-cat" options={categories} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
          {view === 'po' && (
            <SelectFilter id="po-status" options={statuses} value={statusFilter} onChange={setStatusFilter} allLabel="All Statuses" />
          )}
          <input
            type="text" placeholder="Search SKU or PO..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12 }}
          />
        </FilterBar>

        {/* ── Delivery Schedule View ────────────────────────────────── */}
        {view === 'schedule' && (
          <DataTable>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 200, position: 'sticky', left: 0, background: 'var(--s1)', zIndex: 2 }}>Product</th>
                    <th>Cat</th>
                    <th>DPCI</th>
                    <th className="tr">U/Cs</th>
                    {scheduleData.dates.map(d => {
                      const day = new Date(d + 'T12:00:00');
                      const dow = day.toLocaleDateString('en-US', { weekday: 'short' });
                      return (
                        <th key={d} className="tr" style={{ minWidth: 70, fontSize: 10, lineHeight: 1.3, textAlign: 'center' }}>
                          <div>{dow}</div>
                          <div style={{ fontWeight: 800 }}>{d.slice(5)}</div>
                        </th>
                      );
                    })}
                    <th className="tr" style={{ fontWeight: 800 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleData.skus.map(row => {
                    const rowTotal = Object.values(row.byDate).reduce((a, c) => a + c.cases, 0);
                    return (
                      <tr key={row.sku}>
                        <td style={{ position: 'sticky', left: 0, background: 'var(--s1)', zIndex: 1 }} className="tn" title={row.name}>
                          <b>{row.name}</b>
                          <div style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'monospace' }}>{row.sku}</div>
                        </td>
                        <td><Chip className="cb">{row.cat}</Chip></td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'monospace' }}>{row.dpci}</td>
                        <td className="tr">{row.upc}</td>
                        {scheduleData.dates.map(d => {
                          const cell = row.byDate[d];
                          if (!cell) return <td key={d} className="tr" style={{ color: 'var(--tx3)', fontSize: 11 }}>—</td>;
                          const sc = STATUS_COLORS[cell.status] ?? STATUS_COLORS.open;
                          const isDelivered = cell.status === 'closed';
                          return (
                            <td key={d} className="tr" title={`${cell.po}: ${cell.cases} cs (${sc.label})`} style={{ fontSize: 12, fontWeight: 600, opacity: isDelivered ? 0.4 : 1 }}>
                              <div style={{ background: sc.bg, color: sc.color, borderRadius: 4, padding: '2px 6px', textAlign: 'center' }}>
                                {fmt(cell.cases)}
                              </div>
                            </td>
                          );
                        })}
                        <td className="tr" style={{ fontWeight: 700, fontSize: 12 }}>{fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--s3)', zIndex: 1 }}>
                      TOTAL ({scheduleData.skus.length} SKUs)
                    </td>
                    <td></td><td></td><td></td>
                    {scheduleData.dates.map(d => {
                      const dayTotal = scheduleData.skus.reduce((a, row) => a + (row.byDate[d]?.cases ?? 0), 0);
                      return (
                        <td key={d} className="tr" style={{ fontSize: 12 }}>
                          {dayTotal > 0 ? fmt(dayTotal) : '—'}
                        </td>
                      );
                    })}
                    <td className="tr" style={{ fontSize: 12 }}>
                      {fmt(scheduleData.skus.reduce((a, row) => a + Object.values(row.byDate).reduce((s, c) => s + c.cases, 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DataTable>
        )}

        {/* ── SKU Rollup View ───────────────────────────────────────── */}
        {view === 'sku' && (
          <DataTable>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Product</th>
                    <th>Cat</th>
                    <th>DPCI</th>
                    <th className="tr">POs</th>
                    <th className="tr">Cases</th>
                    <th className="tr">Units</th>
                    <th className="tr">U/Cs</th>
                    <th className="tr">Delivered</th>
                    <th style={{ minWidth: 100 }}>Next Delivery</th>
                    <th style={{ minWidth: 220 }}>Delivery Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRollup.map((r: OwleryPOSkuRollup) => (
                    <tr key={r.sku}>
                      <td className="tn" title={r.product_name}>
                        <b>{r.product_name.replace('Little Spoon ', '')}</b>
                      </td>
                      <td><Chip className="cb">{r.category}</Chip></td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'monospace' }}>{r.dpci}</td>
                      <td className="tr">{r.po_count}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{fmt(r.total_cases)}</td>
                      <td className="tr">{fmt(r.total_units)}</td>
                      <td className="tr">{r.units_per_case}</td>
                      <td className="tr">
                        <span style={{ color: r.pct_delivered >= 100 ? 'var(--gr)' : r.pct_delivered > 0 ? 'var(--yw)' : 'var(--tx3)' }}>
                          {r.pct_delivered}%
                        </span>
                      </td>
                      <td>
                        {r.next_delivery ? (
                          <span style={{ fontSize: 11, color: 'var(--ac)' }}>{r.next_delivery}</span>
                        ) : (
                          <span style={{ color: 'var(--tx3)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.deliveries.map((d, i) => {
                            const sc = STATUS_COLORS[d.status] ?? STATUS_COLORS.open;
                            return (
                              <span
                                key={i}
                                title={`${d.po_number}: ${d.cases} cs on ${d.date}`}
                                style={{
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: sc.bg,
                                  color: sc.color,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {d.date.slice(5)} · {d.cases}cs
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* ── Totals row ──────────────────────────────────── */}
                  <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                    <td>TOTAL ({filteredRollup.length} SKUs)</td>
                    <td></td><td></td>
                    <td className="tr">{s.total_pos}</td>
                    <td className="tr">{fmt(filteredRollup.reduce((a, r) => a + r.total_cases, 0))}</td>
                    <td className="tr">{fmt(filteredRollup.reduce((a, r) => a + r.total_units, 0))}</td>
                    <td></td><td></td><td></td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DataTable>
        )}

        {/* ── PO Line Detail View ───────────────────────────────────── */}
        {view === 'po' && (
          <DataTable>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th style={{ minWidth: 180 }}>Product</th>
                    <th>Cat</th>
                    <th className="tr">Cases</th>
                    <th className="tr">Units</th>
                    <th>Ship Date</th>
                    <th>Delivery Date</th>
                    <th>Status</th>
                    <th>Carrier</th>
                    <th>Destination DC</th>
                    <th>Load #</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines
                    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
                    .map((l: OwleryPOLine, i: number) => {
                      const sc = STATUS_COLORS[l.status] ?? STATUS_COLORS.open;
                      const isPast = l.delivery_date < data.as_of && l.status !== 'closed';
                      return (
                        <tr key={`${l.po_number}-${l.sku}-${i}`}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ac)' }}>{l.po_number}</td>
                          <td className="tn" title={l.product_name}>{l.product_name.replace('Little Spoon ', '')}</td>
                          <td><Chip className="cb">{l.category}</Chip></td>
                          <td className="tr" style={{ fontWeight: 600 }}>{fmt(l.cases)}</td>
                          <td className="tr">{fmt(l.total_units)}</td>
                          <td style={{ fontSize: 11 }}>{l.ship_date}</td>
                          <td style={{ fontSize: 11, color: isPast ? 'var(--rd)' : '' }}>{l.delivery_date}</td>
                          <td>
                            <span style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: sc.bg,
                              color: sc.color,
                            }}>
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--tx2)' }}>{l.carrier}</td>
                          <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{l.destination_dc}</td>
                          <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--tx3)' }}>{l.load_number}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </DataTable>
        )}

        {/* ── Timeline View ─────────────────────────────────────────── */}
        {view === 'timeline' && (
          <>
            <div className="cc">
              <div className="ct">Cases by Delivery Date</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={timelineData.dates.map(d => d.slice(5))}
                  datasets={[{
                    label: 'Cases',
                    data: timelineData.dates.map(d => timelineData.casesByDate[d]),
                    backgroundColor: 'rgba(0,227,205,.6)',
                  }]}
                  height={280}
                />
              </div>
            </div>

            {/* Delivery detail table */}
            <DataTable>
              <table>
                <thead>
                  <tr>
                    <th>Delivery Date</th>
                    <th className="tr">Total Cases</th>
                    <th>POs</th>
                    <th>SKUs</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineData.dates.map(date => {
                    const dayLines = data.lines.filter(l => l.delivery_date === date && l.status !== 'cancelled');
                    const cases = dayLines.reduce((a, l) => a + l.cases, 0);
                    const pos = [...new Set(dayLines.map(l => l.po_number))];
                    const skus = [...new Set(dayLines.map(l => l.sku))];
                    const allDelivered = dayLines.every(l => l.status === 'closed');
                    const anyInTransit = dayLines.some(l => l.status === 'inProgress');
                    const statusLabel = allDelivered ? 'Delivered' : anyInTransit ? 'In Transit' : 'Scheduled';
                    const statusColor = allDelivered ? 'var(--gr)' : anyInTransit ? '#818cf8' : 'var(--yw)';
                    return (
                      <tr key={date}>
                        <td style={{ fontWeight: 600 }}>{date}</td>
                        <td className="tr" style={{ fontWeight: 600 }}>{fmt(cases)}</td>
                        <td style={{ fontSize: 11 }}>{pos.join(', ')}</td>
                        <td style={{ fontSize: 11, color: 'var(--tx2)' }}>{skus.length} SKUs</td>
                        <td style={{ color: statusColor, fontSize: 11 }}>{statusLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </>
        )}

        {/* ── DC Breakdown View ─────────────────────────────────────── */}
        {view === 'dc' && (
          <>
            <div className="cc">
              <div className="ct">Cases by Destination DC</div>
              <div style={{ padding: '0 12px 12px' }}>
                <BarChart
                  labels={dcData.dcs.map(dc => dc.replace('Target DC ', ''))}
                  datasets={[{
                    label: 'Cases',
                    data: dcData.dcs.map(dc => dcData.casesByDC[dc]),
                    backgroundColor: 'rgba(0,227,205,.6)',
                  }]}
                  horizontal
                  height={Math.max(180, dcData.dcs.length * 60)}
                />
              </div>
            </div>

            <DataTable>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 250 }}>Destination DC</th>
                    <th className="tr">Total Cases</th>
                    <th className="tr">POs</th>
                    <th>PO Numbers</th>
                  </tr>
                </thead>
                <tbody>
                  {dcData.dcs.map(dc => (
                    <tr key={dc}>
                      <td style={{ fontWeight: 500 }}>{dc}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{fmt(dcData.casesByDC[dc])}</td>
                      <td className="tr">{dcData.posByDC[dc]?.size ?? 0}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ac)' }}>
                        {[...(dcData.posByDC[dc] ?? [])].join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          </>
        )}

        {/* ── Legend ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
          {Object.entries(STATUS_COLORS).map(([key, sc]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: sc.bg, border: `1px solid ${sc.color}`, display: 'inline-block' }} />
              {sc.label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10 }}>
            Source: {data.source} · Updated: {data.as_of}
          </span>
        </div>
      </div>
    </PageShell>
  );
}
