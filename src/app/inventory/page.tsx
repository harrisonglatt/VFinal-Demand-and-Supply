'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { DATA_INV, DATA_TARGET_DC, DATA_DP, DATA_AVF } from '@/data/index';
import { fmt, fmtDol, sf } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'target', label: 'Target DC' },
  { value: 'ls', label: 'LS Warehouse' },
];

/* ── WOC Thresholds ───────────────────────────────────────────────── */
const WOC_CRITICAL = 4;
const WOC_HEALTHY_LOW = 4;
const WOC_HEALTHY_HIGH = 8;
const WOC_HEAVY = 12;

function wocStatus(woc: number): { label: string; icon: string; color: string; bg: string } {
  if (woc < 2) return { label: 'OOS Risk', icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,.08)' };
  if (woc < WOC_CRITICAL) return { label: 'Critical', icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,.06)' };
  if (woc <= WOC_HEALTHY_HIGH) return { label: 'Healthy', icon: '✅', color: '#00CF92', bg: 'rgba(0,207,146,.04)' };
  if (woc <= WOC_HEAVY) return { label: 'Adequate', icon: '🟡', color: '#FFC711', bg: '' };
  return { label: 'Heavy', icon: '🟠', color: '#FFA726', bg: 'rgba(255,167,38,.04)' };
}

/* ── WOC row type ─────────────────────────────────────────────────── */
interface WOCRow {
  name: string;
  dpci: string;
  category: string;
  onHand: number;
  onOrder: number;
  available: number;
  fcastWkAvg: number;
  t4wAvg: number;
  wocFcast: number;
  wocT4w: number;
  velocity: number;
  stores: number;
}

export default function InventoryPage() {
  const [view, setView] = useState('target');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ── Build Target WOC data ──────────────────────────────────────── */
  const targetWOC = useMemo(() => {
    const rows: WOCRow[] = [];

    for (const dc of DATA_TARGET_DC.skus) {
      // Match to DP for forecast
      const dp = DATA_DP.skus.find(s => s.dpci === dc.dpci);
      // Match to AVF for T4W
      const avf = DATA_AVF.find(s => s.dpci === dc.dpci);

      const onHand = dc.oh_units;
      const onOrder = dc.on_order;
      const available = onHand + onOrder;

      // Avg next 8 week forecast demand
      const fcastWkAvg = dp ? Math.round(dp.fcast.slice(0, 8).reduce((a, b) => a + b, 0) / 8) : 0;
      // T4W avg weekly sell-through
      const t4wAvg = avf ? Math.round(avf.l4w_avg_units) : 0;

      const wocFcast = fcastWkAvg > 0 ? available / fcastWkAvg : 99;
      const wocT4w = t4wAvg > 0 ? available / t4wAvg : 99;

      rows.push({
        name: dc.name,
        dpci: dc.dpci,
        category: dp?.category || '',
        onHand,
        onOrder,
        available,
        fcastWkAvg,
        t4wAvg,
        wocFcast: Math.round(wocFcast * 10) / 10,
        wocT4w: Math.round(wocT4w * 10) / 10,
        velocity: dc.velocity,
        stores: dc.stores,
      });
    }

    return rows;
  }, []);

  /* ── KPI aggregates ─────────────────────────────────────────────── */
  const kpiData = useMemo(() => {
    const oosRisk = targetWOC.filter(r => r.wocFcast < 2);
    const critical = targetWOC.filter(r => r.wocFcast >= 2 && r.wocFcast < WOC_CRITICAL);
    const heavy = targetWOC.filter(r => r.wocFcast > WOC_HEAVY);
    const avgWoc = targetWOC.length > 0
      ? targetWOC.reduce((a, r) => a + r.wocFcast, 0) / targetWOC.length
      : 0;
    const excessUnits = heavy.reduce((a, r) => a + Math.max(0, r.available - r.fcastWkAvg * WOC_HEAVY), 0);
    return { oosRisk, critical, heavy, avgWoc, excessUnits };
  }, [targetWOC]);

  /* ── Filtered rows ──────────────────────────────────────────────── */
  const filteredTarget = useMemo(() => {
    const q = query.toLowerCase();
    return targetWOC
      .filter(r => {
        const s = wocStatus(r.wocFcast);
        return (!q || r.name.toLowerCase().includes(q) || r.dpci.includes(q)) &&
          (!statusFilter ||
            (statusFilter === 'critical' ? r.wocFcast < WOC_CRITICAL :
             statusFilter === 'healthy' ? (r.wocFcast >= WOC_HEALTHY_LOW && r.wocFcast <= WOC_HEALTHY_HIGH) :
             statusFilter === 'heavy' ? r.wocFcast > WOC_HEAVY : true));
      })
      .sort((a, b) => a.wocFcast - b.wocFcast);
  }, [targetWOC, query, statusFilter]);

  /* ── LS Warehouse (existing data, stubbed for future API) ───────── */
  const lsSkus = useMemo(() => {
    const q = query.toLowerCase();
    return [...DATA_INV.skus]
      .filter(s => !q || s.description.toLowerCase().includes(q))
      .sort((a, b) => sf(a.wos_current) - sf(b.wos_current));
  }, [query]);

  return (
    <PageShell
      title="Inventory Intel"
      subtitle={`WOC analysis · Target on-hand from Omni · ${DATA_TARGET_DC.as_of}`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard
          icon="📊" label="Target Avg WOC" style={`--cc:${kpiData.avgWoc < WOC_CRITICAL ? 'var(--rd)' : kpiData.avgWoc <= WOC_HEALTHY_HIGH ? 'var(--gr)' : 'var(--yw)'}`}
          value={`${kpiData.avgWoc.toFixed(1)} wks`}
          delta={`${targetWOC.length} SKUs · vs forecast demand`}
          deltaClass={kpiData.avgWoc >= WOC_HEALTHY_LOW && kpiData.avgWoc <= WOC_HEALTHY_HIGH ? 'up' : 'neu'}
          sub={`Healthy range: ${WOC_HEALTHY_LOW}–${WOC_HEALTHY_HIGH} weeks`}
        />
        <KpiCard
          icon="🔴" label="OOS / Critical (<4 WOC)" style="--cc:var(--rd)"
          value={String(kpiData.oosRisk.length + kpiData.critical.length)}
          delta={`${kpiData.oosRisk.length} OOS risk (<2 wks) · ${kpiData.critical.length} critical`}
          deltaClass="dn"
          sub="Immediate replenishment needed"
        />
        <KpiCard
          icon="🟠" label="Heavy Inventory (>12 WOC)" style="--cc:#FFA726"
          value={String(kpiData.heavy.length)}
          delta={`${fmt(Math.round(kpiData.excessUnits))} excess units`}
          deltaClass="neu"
          sub="Consider promo or reallocation"
        />
        <KpiCard
          icon="🏭" label="LS Warehouse" style="--cc:var(--tx3)"
          value="Pending"
          delta="API connection needed"
          deltaClass="neu"
          sub={`${DATA_INV.skus.length} SKUs from static data`}
        />
      </KpiGrid>

      <FilterBar meta={view === 'target' ? `${filteredTarget.length} SKUs · Sorted by WOC (most critical first)` : `${lsSkus.length} SKUs`}>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '4px 8px', color: 'var(--tx)', fontSize: 12 }}
        >
          <option value="">All Status</option>
          <option value="critical">Critical (&lt;4 WOC)</option>
          <option value="healthy">Healthy (4–8 WOC)</option>
          <option value="heavy">Heavy (&gt;12 WOC)</option>
        </select>
        <input
          type="text" placeholder="Search SKU..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
      </FilterBar>

      {/* ── Target DC WOC Table ──────────────────────────────────── */}
      {view === 'target' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Product</th>
                <th>Category</th>
                <th className="tr">On Hand</th>
                <th className="tr">On Order</th>
                <th className="tr">Available</th>
                <th className="tr">Fcast/Wk</th>
                <th className="tr">T4W Avg/Wk</th>
                <th className="tr">WOC (Fcast)</th>
                <th className="tr">WOC (T4W)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTarget.map((r, i) => {
                const st = wocStatus(r.wocFcast);
                return (
                  <tr key={i} style={{ background: st.bg }}>
                    <td className="tn" title={r.name}><b>{r.name}</b></td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.category}</td>
                    <td className="tr">{fmt(r.onHand)}</td>
                    <td className="tr" style={{ color: 'var(--cy)' }}>{fmt(r.onOrder)}</td>
                    <td className="tr" style={{ fontWeight: 600 }}>{fmt(r.available)}</td>
                    <td className="tr" style={{ color: 'var(--tx2)' }}>{fmt(r.fcastWkAvg)}</td>
                    <td className="tr" style={{ color: 'var(--tx2)' }}>{fmt(r.t4wAvg)}</td>
                    <td className="tr" style={{ fontWeight: 700, color: st.color, fontSize: 13 }}>
                      {r.wocFcast.toFixed(1)}
                    </td>
                    <td className="tr" style={{ color: wocStatus(r.wocT4w).color }}>
                      {r.wocT4w.toFixed(1)}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${st.color}15`, color: st.color }}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── LS Warehouse View (stubbed) ──────────────────────────── */}
      {view === 'ls' && (
        <>
          <div style={{ background: 'rgba(255,199,17,.08)', border: '1px solid rgba(255,199,17,.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 12, color: 'var(--yw)' }}>
            {'⚠️'} <b>LS Warehouse data is from static import.</b> Live warehouse API connection pending — data shown is sample.
          </div>
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
                {lsSkus.map((s, i) => {
                  const op = sf(s.oos_pct) * 100;
                  const oc = op > 20 ? 'dn' : op > 10 ? 'neu' : 'up';
                  const wt = sf(s.wos_current) - sf(s.wos_4w_ago);
                  const wocSt = wocStatus(sf(s.wos_current));
                  return (
                    <tr key={i} style={{ background: wocSt.bg }}>
                      <td className="tn" title={s.description}>{s.description.replace('Little Spoon ', '')}</td>
                      <td className="tr">{fmt(s.stores_tracked)}</td>
                      <td className="tr">{s.l4w_upspw?.toFixed(2) ?? '—'}</td>
                      <td className={`tr ${oc}`}>{op.toFixed(1)}%</td>
                      <td className="tr" style={{ fontWeight: 700, color: wocSt.color }}>{sf(s.wos_current).toFixed(1)}</td>
                      <td className={`tr ${wt >= 0 ? 'up' : 'dn'}`}>{wt >= 0 ? '+' : ''}{wt.toFixed(1)}</td>
                      <td className="tr">{fmt(s.eoh_units)}</td>
                      <td className="tr">{fmt(s.on_order_units)}</td>
                      <td className={`tr ${s.lost_dollar_week > 0 ? 'dn' : ''}`}>{s.lost_dollar_week ? fmtDol(s.lost_dollar_week) : '—'}</td>
                      <td>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${wocSt.color}15`, color: wocSt.color }}>
                          {wocSt.icon} {wocSt.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </>
      )}
    </PageShell>
  );
}
