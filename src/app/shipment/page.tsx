'use client';

import { useMemo, useState, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { DATA_SHIP, DATA_DP, DATA_POFC } from '@/data/index';
import { fmt } from '@/lib/formatters';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { usePromo } from '@/context/PromoContext';
import { calcShipmentBehavior, buildShipmentPlan, detectShipmentRisks } from '@/lib/computations/shipment';

const VIEW_OPTS = [
  { value: 'plan', label: '52-Wk Plan' },
  { value: 'coverage', label: 'PO Coverage' },
  { value: 'behavior', label: 'Ship Behavior' },
  { value: 'risks', label: 'Risk Flags' },
];

const dpciToCaseCode: Record<string, string> = {};
for (const [code, meta] of Object.entries(CASE_CODE_MAP)) {
  if (meta.dpci) dpciToCaseCode[meta.dpci] = code;
}

export default function ShipmentPlanPage() {
  const [view, setView] = useState('plan');
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');

  const fcastWeeks = DATA_DP.fcast_weeks;
  const categories = useMemo(() => DATA_DP.skus.map(s => s.category), []);
  const promoCtx = usePromo();

  const behaviors = useMemo(() => calcShipmentBehavior(DATA_SHIP.skus), []);
  const plan = useMemo(() => buildShipmentPlan(DATA_DP.skus, behaviors, fcastWeeks, promoCtx.getLift), [behaviors, fcastWeeks, promoCtx.getLift]);
  const risks = useMemo(() => detectShipmentRisks(plan, fcastWeeks), [plan, fcastWeeks]);

  const total52 = useMemo(() => plan.reduce((a, r) => a + r.total52, 0), [plan]);
  const avgWeekly = Math.round(total52 / 52);
  const next4Total = useMemo(() => plan.reduce((a, r) => a + r.next4Total, 0), [plan]);
  const gapRisks = risks.filter(r => r.type === 'gap').length;
  const spikeRisks = risks.filter(r => r.type === 'spike').length;

  const filteredPlan = useMemo(() => {
    const q = query.toLowerCase();
    return plan.filter(r =>
      (!cat || r.category === cat) &&
      (!q || r.name.toLowerCase().includes(q) || (dpciToCaseCode[r.dpci] || '').toLowerCase().includes(q))
    );
  }, [plan, cat, query]);

  const downloadCSV = useCallback(() => {
    const headers = ['Case Code', 'Product', 'DPCI', 'Category', 'UPC', 'Cadence', '52-Wk Total', ...fcastWeeks];
    const rows = filteredPlan.map(r => [dpciToCaseCode[r.dpci] || '', r.name, r.dpci, r.category, r.upc, r.behavior.cadenceLabel, r.total52, ...r.weeklyPlan]);
    const totRow = ['', 'TOTAL', '', '', '', '', filteredPlan.reduce((a, r) => a + r.total52, 0), ...fcastWeeks.map((_, i) => filteredPlan.reduce((a, r) => a + (r.weeklyPlan[i] || 0), 0))];
    const csv = [headers, totRow, ...rows].map(r => r.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `shipment-plan-52wk-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [filteredPlan, fcastWeeks]);

  return (
    <PageShell
      title="Shipment Plan"
      subtitle="Rolling 52-week forecast → shipment translation · Cases to Target"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={downloadCSV} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 12px', color: 'var(--tx)', fontSize: 12, cursor: 'pointer' }}>{'📥'} CSV</button>
          <ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />
        </div>
      }
    >
      <KpiGrid columns={4}>
        <KpiCard icon="📦" label="52-Wk Shipment Plan" style="--cc:var(--ac)" value={fmt(total52) + ' cs'} delta={`${plan.length} SKUs`} deltaClass="neu" sub="Total planned cases to Target" />
        <KpiCard icon="📊" label="Avg Weekly" style="--cc:var(--gr)" value={fmt(avgWeekly) + ' cs/wk'} delta={`~${fmt(Math.round(avgWeekly * 13))} units/wk`} deltaClass="neu" sub="Across all SKUs" />
        <KpiCard icon="🚚" label="Next 4 Weeks" style="--cc:var(--cy)" value={fmt(next4Total) + ' cs'} delta="Near-term volume" deltaClass="neu" sub={fcastWeeks.length > 3 ? `${fcastWeeks[0]} → ${fcastWeeks[3]}` : ''} />
        <KpiCard icon="⚠️" label="Risk Flags" style={`--cc:${gapRisks + spikeRisks > 5 ? 'var(--rd)' : 'var(--yw)'}`} value={String(gapRisks + spikeRisks)} delta={`${gapRisks} gaps · ${spikeRisks} spikes`} deltaClass={gapRisks > 3 ? 'dn' : 'neu'} sub="Next 13 weeks" />
      </KpiGrid>

      <FilterBar meta={view === 'plan' ? `${filteredPlan.length} SKUs · ${fcastWeeks.length} forecast weeks` : `${behaviors.length} SKUs`}>
        <SelectFilter id="ship-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <input type="text" placeholder="Search SKU or case code..." value={query} onChange={e => setQuery(e.target.value)} style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
      </FilterBar>

      {view === 'plan' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th className="st" style={{ minWidth: 155 }}>Product</th>
                <th style={{ minWidth: 72 }}>Case Code</th>
                <th className="tr">UPC</th>
                <th style={{ fontSize: 10 }}>Cadence</th>
                {fcastWeeks.map(w => <th key={w} style={{ minWidth: 62, background: 'rgba(0,227,205,.07)', fontSize: 10 }}>{w}</th>)}
                <th className="tr" style={{ fontWeight: 800 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                <td className="st" style={{ background: 'var(--s3)' }}>TOTAL ({filteredPlan.length})</td>
                <td /><td /><td />
                {fcastWeeks.map((_, i) => <td key={i} className="tr" style={{ background: 'rgba(0,227,205,.05)' }}>{fmt(filteredPlan.reduce((a, r) => a + (r.weeklyPlan[i] || 0), 0))}</td>)}
                <td className="tr">{fmt(filteredPlan.reduce((a, r) => a + r.total52, 0))}</td>
              </tr>
              {filteredPlan.map(r => {
                const code = dpciToCaseCode[r.dpci] || '';
                return (
                  <tr key={r.dpci}>
                    <td className="st tn" title={r.name}>{r.name}</td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ac)' }}>{code}</td>
                    <td className="tr">{r.upc}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.behavior.cadenceLabel}</td>
                    {fcastWeeks.map((_, i) => {
                      const v = r.weeklyPlan[i] || 0;
                      const fcast = r.weeklyFcastCases[i] || 0;
                      const avg = r.behavior.avgShipmentSize;
                      const isSpike = avg > 0 && v > avg * 1.5;
                      const isGap = fcast > 0 && v === 0;
                      return (
                        <td key={i} className="tr" style={{
                          background: isGap ? 'rgba(239,68,68,.08)' : isSpike ? 'rgba(255,199,17,.08)' : 'rgba(0,227,205,.04)',
                          color: isGap ? 'var(--rd)' : isSpike ? 'var(--yw)' : undefined,
                          fontWeight: isGap || isSpike ? 600 : undefined,
                        }}>
                          {v > 0 ? fmt(v) : isGap ? '—' : ''}
                        </td>
                      );
                    })}
                    <td className="tr" style={{ fontWeight: 600 }}>{fmt(r.total52)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── PO Coverage View ──────────────────────────────────────── */}
      {view === 'coverage' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Product</th>
                <th>Case Code</th>
                <th className="tr">13-Wk PO Cases</th>
                <th className="tr">13-Wk Plan Cases</th>
                <th className="tr">Gap (Cases)</th>
                <th className="tr">Coverage %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SHIP.skus
                .filter(s => {
                  const q = query.toLowerCase();
                  return (!cat || s.category === cat) && (!q || s.description.toLowerCase().includes(q));
                })
                .sort((a, b) => {
                  const covA = a.weeks['13-wk Plan Cases'] ? (a.weeks['13-wk PO Cases'] + (a.weeks['13-wk Fcast Cases'] || 0)) / a.weeks['13-wk Plan Cases'] : 0;
                  const covB = b.weeks['13-wk Plan Cases'] ? (b.weeks['13-wk PO Cases'] + (b.weeks['13-wk Fcast Cases'] || 0)) / b.weeks['13-wk Plan Cases'] : 0;
                  return covA - covB;
                })
                .map((s, i) => {
                  const po = s.weeks['13-wk PO Cases'] || 0;
                  const fc = s.weeks['13-wk Fcast Cases'] || 0;
                  const pl = s.weeks['13-wk Plan Cases'] || 0;
                  const gap = (po + fc) - pl;
                  const covPct = pl > 0 ? Math.round((po + fc) / pl * 100) : 0;
                  const code = dpciToCaseCode[s.dpci] || '';
                  const covColor = covPct >= 100 ? 'var(--gr)' : covPct >= 75 ? 'var(--yw)' : 'var(--rd)';
                  return (
                    <tr key={i} style={{ background: covPct < 75 ? 'rgba(239,68,68,.04)' : undefined }}>
                      <td className="tn" title={s.description}>{s.description.replace('Little Spoon ', '')}</td>
                      <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ac)' }}>{code}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{fmt(po)}{fc > 0 ? <span style={{ color: 'var(--tx3)' }}> +{fmt(fc)} fcast</span> : ''}</td>
                      <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(pl)}</td>
                      <td className="tr" style={{ color: gap >= 0 ? 'var(--gr)' : 'var(--rd)', fontWeight: 600 }}>{gap >= 0 ? '+' : ''}{fmt(gap)}</td>
                      <td className="tr" style={{ color: covColor, fontWeight: 700, fontSize: 13 }}>{covPct}%</td>
                      <td>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${covColor}15`, color: covColor }}>
                          {covPct >= 100 ? '✅ Covered' : covPct >= 75 ? '🟡 Gap' : '🔴 Under'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </DataTable>
      )}

      {view === 'behavior' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Product</th><th>Category</th><th>Cadence</th>
                <th className="tr">Hist Wks</th><th className="tr">Active</th><th className="tr">Total Cases</th>
                <th className="tr">Avg/Wk</th><th className="tr">Avg Ship Size</th><th className="tr">Variability</th>
              </tr>
            </thead>
            <tbody>
              {behaviors.filter(b => (!cat || b.category === cat) && (!query || b.name.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => b.totalHistCases - a.totalHistCases).map((b, i) => (
                <tr key={i}>
                  <td className="tn"><b>{b.name}</b></td>
                  <td style={{ fontSize: 10 }}>{b.category}</td>
                  <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: b.cadenceLabel === 'Weekly' ? 'rgba(0,207,146,.1)' : 'rgba(99,102,241,.1)', color: b.cadenceLabel === 'Weekly' ? 'var(--gr)' : '#818cf8' }}>{b.cadenceLabel}</span></td>
                  <td className="tr">{b.totalWeeks}</td>
                  <td className="tr">{b.weekCount} ({Math.round(b.shipmentCadence * 100)}%)</td>
                  <td className="tr" style={{ fontWeight: 600 }}>{fmt(b.totalHistCases)}</td>
                  <td className="tr">{fmt(b.avgWeeklyCases)}</td>
                  <td className="tr">{fmt(b.avgShipmentSize)}</td>
                  <td className="tr" style={{ color: b.variability > 0.5 ? 'var(--rd)' : b.variability > 0.3 ? 'var(--yw)' : 'var(--gr)', fontWeight: 600 }}>{b.variability.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {view === 'risks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {risks.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--gr)' }}>✅ No significant risks detected</div>
          ) : risks.map((r, i) => {
            const col = r.type === 'gap' ? '#ef4444' : r.type === 'spike' ? '#FFC711' : '#818cf8';
            const icon = r.type === 'gap' ? '🔴' : r.type === 'spike' ? '🟡' : '⚠️';
            const label = r.type === 'gap' ? 'Replenishment Gap' : r.type === 'spike' ? 'Shipment Spike' : 'High Variability';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${col}08`, border: `1px solid ${col}20`, borderRadius: 8 }}>
                <div style={{ fontSize: 18 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}><span style={{ color: col }}>{label}</span>{r.weekLabel && <span style={{ color: 'var(--tx3)', marginLeft: 8 }}>{r.weekLabel}</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}><b>{r.skuName}</b> — {r.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
