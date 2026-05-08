'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import FilterBar from '@/components/ui/FilterBar';
import SelectFilter from '@/components/ui/SelectFilter';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP } from '@/data/index';
import { usePromo } from '@/context/PromoContext';
import { useCalibration } from '@/context/CalibrationContext';
import { usePlannedPOs } from '@/context/PlannedPOsContext';
import SkuPlanner from '@/components/supply/SkuPlanner';
import { SC_MULT, SC_COL } from '@/lib/computations/scenario';
import { buildSupplySkus, buildLots, buildManufacturers } from '@/lib/supply/mock-data';
import {
  runWeeklySimulation,
  computeReorderRecommendation,
  detectRisks,
  computeFinanceSummary,
  computeWOC,
  buildManufacturerPlans,
} from '@/lib/supply/engine';
import type { ManufacturerPlan } from '@/lib/supply/engine';
import { fmt, fmtDol, sf } from '@/lib/formatters';
import { buildPOFromRecommendations, downloadPO, generatePONumber } from '@/lib/supply/po-generator';
import type { PurchaseOrder } from '@/lib/supply/po-generator';
import type { ScenarioKey } from '@/data/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_OPTS = [
  { value: 'tower',     label: 'Control Tower' },
  { value: 'states',    label: 'Inventory States' },
  { value: 'sim',       label: 'WOC Simulation' },
  { value: 'planner',   label: 'SKU Planner' },
  { value: 'po',        label: 'PO Recommendations' },
  { value: 'po-create', label: 'PO Creator' },
  { value: 'risk',      label: 'Risk Center' },
  { value: 'finance',   label: 'Finance' },
  { value: 'mfr',       label: 'CM Plans' },
];

const HORIZON_OPTS = [
  { value: '4wk',  label: 'Next 4 Wks' },
  { value: '8wk',  label: 'Next 8 Wks' },
  { value: '12wk', label: 'Next 12 Wks' },
  { value: '26wk', label: 'Next 26 Wks' },
];

const PLAN_VIEW_OPTS = [
  { value: 'internal', label: 'Internal Plan' },
  { value: 'external', label: 'CM-Facing' },
];

const SC_OPTS = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

const SEV_COLOR: Record<string, string> = {
  critical: '#FF5A5A',
  high:     '#FFA040',
  medium:   '#FFC711',
  low:      '#94a3b8',
  none:     '#44608a',
};

const SEV_BG: Record<string, string> = {
  critical: 'rgba(255,90,90,.12)',
  high:     'rgba(255,160,64,.12)',
  medium:   'rgba(255,199,17,.12)',
  low:      'rgba(148,163,184,.08)',
  none:     'transparent',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SevBadge({ s }: { s: string }) {
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
      background: SEV_BG[s] || 'transparent', color: SEV_COLOR[s] || 'var(--tx3)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{s}</span>
  );
}

function WocBadge({ woc, min, target }: { woc: number; min: number; target: number }) {
  const col = woc <= 0 ? '#FF5A5A' : woc < min ? '#FF5A5A' : woc < target ? '#FFC711' : woc > target * 1.8 ? '#818cf8' : '#00CF92';
  return (
    <span style={{ fontWeight: 700, color: col }}>{woc.toFixed(1)}</span>
  );
}

/** Convert engine "Apr 12" date strings to ISO. Falls back to today + 6 weeks if unparseable. */
function engineDateToIso(short: string): string {
  if (!short) return new Date(Date.now() + 6 * 7 * 86400000).toISOString().slice(0, 10);
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(short)) return short;
  const m = short.match(/^([A-Z][a-z]{2})\s+(\d+)$/);
  if (m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mi = months.indexOf(m[1]);
    const day = parseInt(m[2], 10);
    const today = new Date('2026-04-06');
    let year = today.getFullYear();
    if (mi < today.getMonth()) year += 1;
    const d = new Date(year, mi, day);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(short);
  return isNaN(d.getTime())
    ? new Date(Date.now() + 6 * 7 * 86400000).toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupplyPlanningPage() {
  const [view, setView]       = useState('tower');
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [catFilter, setCatFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [riskTypeFilter, setRiskTypeFilter] = useState('');
  const [selectedDpci, setSelectedDpci] = useState('');
  // CM Plans view state
  const [horizon, setHorizon]     = useState('12wk');
  const [mfrFilter, setMfrFilter] = useState('');
  const [planView, setPlanView]   = useState('internal');
  // PO Creator state
  const [poMfr, setPoMfr]                 = useState('');
  const [poSelected, setPoSelected]       = useState<Set<string>>(new Set());
  const [poNumber, setPoNumber]           = useState(() => generatePONumber());
  const [poDate, setPoDate]               = useState(() => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }));
  const [poShipTo, setPoShipTo]           = useState('');
  const [poShipDate, setPoShipDate]       = useState('');
  const [poGenerated, setPoGenerated]     = useState<PurchaseOrder | null>(null);
  const [poSendStatus, setPoSendStatus]   = useState<'idle' | 'confirm' | 'sent'>('idle');
  const [poSignature, setPoSignature]     = useState<string | null>(null);
  const [poSignedDate, setPoSignedDate]   = useState<string | null>(null);
  const [sigMode, setSigMode]             = useState<'draw' | 'type'>('draw');
  const [poTypedName, setPoTypedName]     = useState('');
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigDrawingRef = useRef(false);
  const [sigFontLoaded, setSigFontLoaded] = useState(false);

  // Load cursive script font for typed signatures
  useEffect(() => {
    if (document.querySelector('link[data-sig-font]')) { setSigFontLoaded(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap';
    link.dataset.sigFont = '1';
    document.head.appendChild(link);
    document.fonts.ready.then(() => setSigFontLoaded(true));
  }, []);

  const promoCtx    = usePromo();
  const calibration = useCalibration();
  const plannedPOs  = usePlannedPOs();

  // ── Static data (computed once) ──────────────────────────────────────────
  const supplySkus = useMemo(() => buildSupplySkus(), []);
  const allLots    = useMemo(() => buildLots(supplySkus), [supplySkus]);

  const weekLabels = useMemo(() =>
    DATA_DP.fcast_weeks.length >= 52
      ? DATA_DP.fcast_weeks.slice(0, 52)
      : Array.from({ length: 52 }, (_, i) => {
          const d = new Date('2026-04-06');
          d.setDate(d.getDate() + i * 7);
          return `${d.getMonth() + 1}/${d.getDate()} '${String(d.getFullYear()).slice(2)}`;
        }),
  []);

  // ── Per-SKU calibrated forecast (used by sims + SkuPlanner) ──────────────
  const fcastByDpci = useMemo(() => {
    const map: Record<string, number[]> = {};
    supplySkus.forEach(sku => {
      const dpSku = DATA_DP.skus.find(s => s.dpci === sku.dpci);
      if (!dpSku) return;
      const calFactor = calibration.getCalibrationFactor(sku.dpci, sku.category);
      map[sku.dpci] = dpSku.fcast.map(v => Math.round(sf(v) * calFactor));
    });
    return map;
  }, [supplySkus, calibration]);

  // ── Per-SKU planned PO inbound series (length 52, units per week) ────────
  const plannedSeriesByDpci = useMemo(() => {
    const map: Record<string, number[]> = {};
    supplySkus.forEach(sku => {
      map[sku.dpci] = plannedPOs.inboundSeries(sku.dpci, 52);
    });
    return map;
  }, [supplySkus, plannedPOs]);

  // ── Per-SKU simulations (recomputed on scenario/promo/planned-PO change) ─
  const simBySku = useMemo(() => {
    const map = new Map<string, ReturnType<typeof runWeeklySimulation>>();
    supplySkus.forEach(sku => {
      const baseFcast = fcastByDpci[sku.dpci];
      if (!baseFcast) return;
      const lots = allLots[sku.dpci] || [];
      const planned = plannedSeriesByDpci[sku.dpci];
      map.set(sku.dpci, runWeeklySimulation(
        sku, baseFcast, lots, scenario, weekLabels, promoCtx.getLift, planned,
      ));
    });
    return map;
  }, [supplySkus, allLots, weekLabels, scenario, fcastByDpci, plannedSeriesByDpci, promoCtx.getLift]);

  // ── Recommendations (depend on scenario + planned POs) ───────────────────
  const recommendations = useMemo(() =>
    supplySkus.flatMap(sku => {
      const baseFcast = fcastByDpci[sku.dpci];
      if (!baseFcast) return [];
      const sim = simBySku.get(sku.dpci) || [];
      // Sum planned PO units landing inside the lead-time window so the engine
      // doesn't double-recommend on top of pending POs.
      const leadWeeks = sku.productionLeadTimeWeeks + sku.transitLeadTimeWeeks + sku.receiptLagWeeks;
      const planned = plannedSeriesByDpci[sku.dpci] || [];
      const plannedInLead = planned.slice(0, leadWeeks).reduce((a, b) => a + b, 0);
      return [computeReorderRecommendation(sku, sim, baseFcast, scenario, weekLabels, 1, plannedInLead)];
    }).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
  [supplySkus, simBySku, scenario, weekLabels, fcastByDpci, plannedSeriesByDpci]);

  // ── All risks ─────────────────────────────────────────────────────────────
  const allRisks = useMemo(() =>
    supplySkus.flatMap(sku => {
      const sim = simBySku.get(sku.dpci) || [];
      const lots = allLots[sku.dpci] || [];
      const rec = recommendations.find(r => r.dpci === sku.dpci);
      if (!rec) return [];
      return detectRisks(sku, sim, lots, rec);
    }).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
  [supplySkus, simBySku, allLots, recommendations]);

  // ── Finance summary ───────────────────────────────────────────────────────
  const finance = useMemo(() =>
    computeFinanceSummary(supplySkus, recommendations),
  [supplySkus, recommendations]);

  // ── Manufacturer plans ────────────────────────────────────────────────────
  const manufacturers = useMemo(() => buildManufacturers(), []);
  const mfrPlans = useMemo(() =>
    buildManufacturerPlans(manufacturers, supplySkus, recommendations),
  [manufacturers, supplySkus, recommendations]);

  // ── Aggregate KPIs ───────────────────────────────────────────────────────
  const totalATS = supplySkus.reduce((a, s) => a + s.availableToSellUnits, 0);
  const totalOnHand = supplySkus.reduce((a, s) => a + s.onHandUnits, 0);

  const avgWOC = useMemo(() => {
    const vals = supplySkus.map(s => {
      const dpSku = DATA_DP.skus.find(d => d.dpci === s.dpci);
      const demand = dpSku ? dpSku.fcast.slice(0, 8).reduce((a, b) => a + sf(b), 0) / 8 * SC_MULT[scenario] : 1;
      return computeWOC(s.availableToSellUnits + s.inTransitUnits, demand);
    }).filter(v => v < 99);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [supplySkus, scenario]);

  const skusBelowMin = recommendations.filter(r => r.currentWOC < supplySkus.find(s => s.dpci === r.dpci)!.minWOC).length;
  const skusCritical = recommendations.filter(r => r.severity === 'critical').length;

  // ── Category / SKU filter options ────────────────────────────────────────
  const catOptions   = useMemo(() => [...new Set(supplySkus.map(s => s.category))].sort(), [supplySkus]);
  const skuOptions   = useMemo(() => supplySkus.map(s => s.dpci), [supplySkus]);
  const riskTypes    = useMemo(() => [...new Set(allRisks.map(r => r.riskType))].sort(), [allRisks]);
  const sevOptions   = ['critical', 'high', 'medium', 'low'];

  // ── Filtered views ────────────────────────────────────────────────────────
  const filteredRecs = useMemo(() =>
    recommendations.filter(r =>
      r.severity !== 'none' &&
      (!catFilter || r.category === catFilter) &&
      (!sevFilter || r.severity === sevFilter)
    ), [recommendations, catFilter, sevFilter]);

  const filteredRisks = useMemo(() =>
    allRisks.filter(r =>
      (!catFilter || r.category === catFilter) &&
      (!sevFilter || r.severity === sevFilter) &&
      (!riskTypeFilter || r.riskType === riskTypeFilter)
    ), [allRisks, catFilter, sevFilter, riskTypeFilter]);

  const filteredStates = useMemo(() =>
    supplySkus.filter(s =>
      (!catFilter || s.category === catFilter)
    ), [supplySkus, catFilter]);

  // ── WOC sim selected SKU ─────────────────────────────────────────────────
  const simSku = useMemo(() =>
    supplySkus.find(s => s.dpci === (selectedDpci || supplySkus[0]?.dpci)),
  [supplySkus, selectedDpci]);

  const simRows = useMemo(() =>
    simSku ? simBySku.get(simSku.dpci) || [] : [],
  [simSku, simBySku]);

  // ── Insight cards for Control Tower ──────────────────────────────────────
  const insights = useMemo(() => {
    const items: { icon: string; label: string; detail: string; accent: string }[] = [];

    // Critical SKUs
    const crit = recommendations.filter(r => r.severity === 'critical');
    if (crit.length > 0) {
      items.push({
        icon: '🚨',
        label: `${crit.length} SKU${crit.length > 1 ? 's' : ''} Need Immediate Action`,
        detail: crit.slice(0, 3).map(r => `${r.name} (${r.currentWOC.toFixed(1)} WOC, order ${r.recommendedCases} cases by ${r.orderDate})`).join(' · '),
        accent: '#FF5A5A',
      });
    }

    // Lot expiry / stop-ship
    const lotRisks = allRisks.filter(r => r.riskType === 'Stop-Ship Exposure' || r.riskType === 'Lot Expiry Risk');
    if (lotRisks.length > 0) {
      const atRiskValue = lotRisks.reduce((a, r) => a + r.inventoryValueAtRisk, 0);
      items.push({
        icon: '⏰',
        label: `${lotRisks.length} Lot${lotRisks.length > 1 ? 's' : ''} with Expiry / Stop-Ship Exposure`,
        detail: `${fmtDol(atRiskValue)} inventory value at risk. ${lotRisks[0].name}: lot ${lotRisks[0].lotCode || '—'} expires ${lotRisks[0].impactDate}.`,
        accent: '#FF5A5A',
      });
    }

    // Excess inventory
    const excess = allRisks.filter(r => r.riskType === 'Excess / Overstock');
    if (excess.length > 0) {
      const excessValue = excess.reduce((a, r) => a + r.inventoryValueAtRisk, 0);
      items.push({
        icon: '📦',
        label: `${excess.length} SKU${excess.length > 1 ? 's' : ''} Carrying Excess Inventory`,
        detail: `${fmtDol(excessValue)} tied up above target WOC. Pause replenishment and review velocity.`,
        accent: '#818cf8',
      });
    }

    // Upcoming promo support
    const activePromos = promoCtx.events.filter(e =>
      e.status !== 'rejected' && e.status !== 'blocked' && e.weekIdx <= 8
    );
    if (activePromos.length > 0) {
      const highImpact = activePromos.filter(e => e.liftPct >= 30);
      items.push({
        icon: '🗓',
        label: `${activePromos.length} Active Promo Events in Next 8 Weeks`,
        detail: `${highImpact.length} high-impact (≥30% lift). Verify pre-build inventory is sufficient to support demand spikes.`,
        accent: '#FFC711',
      });
    }

    // WOC health
    items.push({
      icon: avgWOC >= 4 ? '✅' : '⚠️',
      label: `Portfolio Avg WOC: ${avgWOC.toFixed(1)} Weeks`,
      detail: avgWOC >= 6
        ? `Overall coverage is healthy. ${skusBelowMin} SKUs below minimum thresholds require attention.`
        : `Coverage is below target. ${skusBelowMin} SKUs below minimum, ${skusCritical} critical.`,
      accent: avgWOC >= 6 ? '#00CF92' : '#FFC711',
    });

    // Revenue at risk
    if (finance.stockoutRevenueRisk > 0) {
      items.push({
        icon: '💰',
        label: `${fmtDol(finance.stockoutRevenueRisk)} Stockout Revenue at Risk`,
        detail: `Based on ${scenario} scenario demand and current ATS position. Addressing ${skusCritical} critical SKUs would recover most of this risk.`,
        accent: '#FFA040',
      });
    }

    return items;
  }, [recommendations, allRisks, promoCtx.events, avgWOC, skusBelowMin, skusCritical, finance, scenario]);

  // ─────────────────────────────────────────────────────────────────────────

  const topRisks = allRisks.slice(0, 6);

  return (
    <PageShell
      title="Supply Planning"
      subtitle="Live control tower — inventory states, WOC simulation, PO recommendations, and risk registry"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ButtonGroup options={SC_OPTS} active={scenario} onChange={v => setScenario(v as ScenarioKey)} />
          <ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />
        </div>
      }
    >

      {/* ── KPI Row (always visible) ──────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="✅"
          label="Available to Sell"
          style={`--cc:${totalATS > 0 ? 'var(--ac)' : 'var(--rd)'}`}
          value={fmt(totalATS)}
          delta={`${fmt(totalOnHand)} total on-hand`}
          deltaClass="neu"
          sub="Units confirmed sellable today"
        />
        <KpiCard
          icon="📅"
          label="Avg Portfolio WOC"
          style={`--cc:${avgWOC >= 6 ? 'var(--gr)' : avgWOC >= 3 ? 'var(--yw)' : 'var(--rd)'}`}
          value={`${avgWOC.toFixed(1)} wks`}
          delta={`${scenario} scenario`}
          deltaClass={avgWOC >= 6 ? 'up' : 'dn'}
          sub="Forward-looking, weighted by demand"
        />
        <KpiCard
          icon="⚠️"
          label="SKUs Below Min WOC"
          style={`--cc:${skusBelowMin === 0 ? 'var(--gr)' : 'var(--rd)'}`}
          value={skusBelowMin}
          delta={`${skusCritical} critical`}
          deltaClass={skusBelowMin === 0 ? 'up' : 'dn'}
          sub="Require immediate replenishment"
        />
        <KpiCard
          icon="💰"
          label="Revenue at Risk"
          style={`--cc:${finance.stockoutRevenueRisk > 0 ? 'var(--rd)' : 'var(--gr)'}`}
          value={`${fmtDol(finance.stockoutRevenueRisk)}`}
          delta={`${fmtDol(finance.atRiskValue)} inv. value`}
          deltaClass={finance.stockoutRevenueRisk > 0 ? 'dn' : 'up'}
          sub="Projected stockout exposure"
        />
      </KpiGrid>

      {/* ── VIEW: Control Tower ───────────────────────────────────────── */}
      {view === 'tower' && (
        <>
          {/* Insights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 16px',
                background: `${ins.accent}06`,
                border: `1px solid ${ins.accent}22`,
                borderLeft: `4px solid ${ins.accent}`,
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.4 }}>{ins.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ins.accent, marginBottom: 2 }}>{ins.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx)', lineHeight: 1.65 }}>{ins.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Top risks preview */}
          {topRisks.length > 0 && (
            <>
              <div style={{ marginTop: 20, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Top Risks This Week
              </div>
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th className="tr">Impact Date</th>
                      <th className="tr">Units</th>
                      <th className="tr">Rev at Risk</th>
                      <th>Action</th>
                      <th>Sev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRisks.map(r => (
                      <tr key={r.id} style={{ background: r.severity === 'critical' ? 'rgba(255,90,90,.04)' : r.severity === 'high' ? 'rgba(255,160,64,.03)' : undefined }}>
                        <td style={{ fontSize: 11, color: SEV_COLOR[r.severity] || 'var(--tx)', fontWeight: 600 }}>{r.riskType}</td>
                        <td style={{ fontSize: 10 }} className="tn">{r.name}</td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.category}</td>
                        <td className="tr" style={{ fontSize: 11 }}>{r.impactDate}</td>
                        <td className="tr" style={{ fontSize: 11 }}>{fmt(r.unitsAffected)}</td>
                        <td className="tr" style={{ fontSize: 11, color: r.revenueAtRisk > 0 ? 'var(--rd)' : 'var(--tx3)' }}>
                          {r.revenueAtRisk > 0 ? fmtDol(r.revenueAtRisk) : '—'}
                        </td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)', maxWidth: 240 }} className="tn">{r.recommendedAction}</td>
                        <td><SevBadge s={r.severity} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            </>
          )}
        </>
      )}

      {/* ── VIEW: Inventory States ────────────────────────────────────── */}
      {view === 'states' && (
        <>
          <FilterBar meta={`${filteredStates.length} SKUs · ${scenario} scenario`}>
            <SelectFilter id="sp-cat" options={catOptions} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
          </FilterBar>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>SKU</th>
                  <th>Category</th>
                  <th style={{ minWidth: 72 }}>Case Code</th>
                  <th className="tr">On Hand</th>
                  <th className="tr" style={{ color: 'var(--ac)' }}>ATS</th>
                  <th className="tr">Allocated</th>
                  <th className="tr">In Transit</th>
                  <th className="tr" style={{ color: 'var(--yw)' }}>At Risk</th>
                  <th className="tr" style={{ color: 'var(--rd)' }}>Expiring</th>
                  <th className="tr" style={{ color: 'var(--rd)' }}>Stop-Ship</th>
                  <th className="tr">WOC</th>
                  <th>Lead Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStates.map(s => {
                  const rec = recommendations.find(r => r.dpci === s.dpci);
                  const woc = rec?.currentWOC ?? 0;
                  const isCrit = woc < s.minWOC;
                  const isWarn = woc < s.targetWOC;
                  const isExcess = woc > s.targetWOC * 1.8;
                  return (
                    <tr key={s.dpci} style={{
                      background: isCrit ? 'rgba(255,90,90,.04)' : isWarn ? 'rgba(255,199,17,.03)' : isExcess ? 'rgba(129,140,248,.03)' : undefined,
                    }}>
                      <td className="tn" style={{ fontSize: 11 }}>{s.name}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.category}</td>
                      <td style={{ fontSize: 10, color: 'var(--ac)' }}>{s.caseCode || '—'}</td>
                      <td className="tr" style={{ fontSize: 11 }}>{fmt(s.onHandUnits)}</td>
                      <td className="tr" style={{ fontWeight: 700, fontSize: 11, color: s.availableToSellUnits > 0 ? 'var(--ac)' : 'var(--rd)' }}>{fmt(s.availableToSellUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: 'var(--tx3)' }}>{fmt(s.allocatedUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: s.inTransitUnits > 0 ? '#818cf8' : 'var(--tx3)' }}>{fmt(s.inTransitUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: s.atRiskUnits > 0 ? 'var(--yw)' : 'var(--tx3)' }}>{fmt(s.atRiskUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: s.expiringSoonUnits > 0 ? 'var(--rd)' : 'var(--tx3)' }}>{fmt(s.expiringSoonUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: s.stopShipRestrictedUnits > 0 ? 'var(--rd)' : 'var(--tx3)' }}>{fmt(s.stopShipRestrictedUnits)}</td>
                      <td className="tr"><WocBadge woc={woc} min={s.minWOC} target={s.targetWOC} /></td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.totalLeadTimeWeeks}wk</td>
                      <td>
                        <SevBadge s={isCrit ? 'critical' : isWarn ? 'medium' : isExcess ? 'low' : 'none'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>

          {/* Lot detail */}
          <div style={{ marginTop: 20, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Lot Registry
          </div>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th>Lot Code</th>
                  <th style={{ minWidth: 150 }}>SKU</th>
                  <th className="tr">Units</th>
                  <th className="tr">Cases</th>
                  <th>State</th>
                  <th>Manufacture</th>
                  <th>Expiry</th>
                  <th>Stop-Ship</th>
                  <th className="tr">Inv. Value</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filteredStates.flatMap(s => (allLots[s.dpci] || []).map(l => (
                  <tr key={l.lotCode} style={{ background: l.riskStatus === 'stopShipRisk' ? 'rgba(255,90,90,.05)' : l.riskStatus === 'expiringSoon' ? 'rgba(255,199,17,.04)' : undefined }}>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ac)' }}>{l.lotCode}</td>
                    <td className="tn" style={{ fontSize: 10 }}>{s.name}</td>
                    <td className="tr" style={{ fontSize: 11 }}>{fmt(l.units)}</td>
                    <td className="tr" style={{ fontSize: 11 }}>{fmt(l.cases)}</td>
                    <td>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3,
                        background: l.currentState === 'onHand' ? 'rgba(0,227,205,.1)' : 'rgba(129,140,248,.1)',
                        color: l.currentState === 'onHand' ? 'var(--ac)' : '#818cf8' }}>
                        {l.currentState === 'onHand' ? 'On Hand' : l.currentState === 'inTransit' ? 'In Transit' : 'On Order'}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{l.manufactureDate}</td>
                    <td style={{ fontSize: 10 }}>{l.expirationDate}</td>
                    <td style={{ fontSize: 10, color: l.riskStatus !== 'healthy' ? 'var(--rd)' : 'var(--tx3)' }}>{l.stopShipDate}</td>
                    <td className="tr" style={{ fontSize: 11 }}>${fmtDol(l.inventoryValue)}</td>
                    <td><SevBadge s={l.riskStatus === 'stopShipRisk' ? 'critical' : l.riskStatus === 'expiringSoon' ? 'high' : 'none'} /></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── VIEW: WOC Simulation ──────────────────────────────────────── */}
      {view === 'sim' && (
        <>
          <FilterBar meta={simSku ? `${simSku.name} · ${scenario} · ${simSku.shelfLifeWeeks}wk shelf life` : ''}>
            <select
              value={selectedDpci || supplySkus[0]?.dpci || ''}
              onChange={e => setSelectedDpci(e.target.value)}
              className="sel"
              style={{ minWidth: 240 }}
            >
              {supplySkus.map(s => (
                <option key={s.dpci} value={s.dpci}>{s.name} ({s.caseCode || s.dpci})</option>
              ))}
            </select>
          </FilterBar>

          {simSku && simRows.length > 0 && (
            <>
              {/* WOC chart */}
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-title">52-Week WOC Projection — {simSku.name}</div>
                <div style={{ padding: '0 12px 12px' }}>
                  <LineChart
                    labels={simRows.map(r => r.weekLabel)}
                    datasets={[
                      {
                        label: 'Projected WOC',
                        data: simRows.map(r => r.woc),
                        borderColor: SC_COL[scenario],
                      },
                      {
                        label: `Target WOC (${simSku.targetWOC})`,
                        data: simRows.map(() => simSku.targetWOC),
                        borderColor: '#FFC711',
                        borderDash: [5, 4],
                      },
                      {
                        label: `Min WOC (${simSku.minWOC})`,
                        data: simRows.map(() => simSku.minWOC),
                        borderColor: '#FF5A5A',
                        borderDash: [3, 3],
                      },
                    ]}
                    height={220}
                  />
                </div>
              </div>

              {/* Inventory chart */}
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-title">Inventory vs Demand (Units)</div>
                <div style={{ padding: '0 12px 12px' }}>
                  <BarChart
                    labels={simRows.slice(0, 26).map(r => r.weekLabel)}
                    datasets={[
                      { label: 'Ending Inventory', data: simRows.slice(0, 26).map(r => r.endingUnits), backgroundColor: 'rgba(0,227,205,.55)' },
                      { label: 'Demand', data: simRows.slice(0, 26).map(r => r.demandUnits), backgroundColor: 'rgba(148,163,184,.4)' },
                    ]}
                    height={180}
                  />
                </div>
              </div>

              {/* Sim table (first 13 weeks) */}
              <div style={{ marginTop: 16 }}>
                <DataTable>
                  <table>
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th className="tr">Begin Inv.</th>
                        <th className="tr">Inbound</th>
                        <th className="tr">Demand</th>
                        <th className="tr">End Inv.</th>
                        <th className="tr">WOC</th>
                        <th className="tr">ATS</th>
                        <th className="tr">Expiring</th>
                        <th className="tr">Stop-Ship</th>
                        <th className="tr">Promo Lift</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simRows.slice(0, 26).map(r => (
                        <tr key={r.weekIdx} style={{
                          background: r.isStockout ? 'rgba(255,90,90,.07)' : r.isExcess ? 'rgba(129,140,248,.04)' : r.promoLift > 0 ? 'rgba(255,199,17,.03)' : undefined,
                        }}>
                          <td style={{ fontWeight: 600, fontSize: 11 }}>{r.weekLabel}</td>
                          <td className="tr" style={{ fontSize: 11 }}>{fmt(r.beginningUnits)}</td>
                          <td className="tr" style={{ fontSize: 11, color: r.inboundUnits > 0 ? '#818cf8' : 'var(--tx3)' }}>{r.inboundUnits > 0 ? `+${fmt(r.inboundUnits)}` : '—'}</td>
                          <td className="tr" style={{ fontSize: 11 }}>{fmt(r.demandUnits)}</td>
                          <td className="tr" style={{ fontWeight: 600, fontSize: 11, color: r.isStockout ? 'var(--rd)' : 'var(--tx)' }}>{fmt(r.endingUnits)}</td>
                          <td className="tr"><WocBadge woc={r.woc} min={simSku.minWOC} target={simSku.targetWOC} /></td>
                          <td className="tr" style={{ fontSize: 11, color: r.ats > 0 ? 'var(--ac)' : 'var(--rd)', fontWeight: 600 }}>{fmt(r.ats)}</td>
                          <td className="tr" style={{ fontSize: 11, color: r.expiringSoonUnits > 0 ? 'var(--yw)' : 'var(--tx3)' }}>{r.expiringSoonUnits > 0 ? fmt(r.expiringSoonUnits) : '—'}</td>
                          <td className="tr" style={{ fontSize: 11, color: r.stopShipRestrictedUnits > 0 ? 'var(--rd)' : 'var(--tx3)' }}>{r.stopShipRestrictedUnits > 0 ? fmt(r.stopShipRestrictedUnits) : '—'}</td>
                          <td className="tr" style={{ fontSize: 11, color: r.promoLift > 0 ? '#FFC711' : 'var(--tx3)' }}>{r.promoLift > 0 ? `+${r.promoLift}%` : '—'}</td>
                          <td>
                            {r.isStockout ? <SevBadge s="critical" /> : r.isExcess ? <SevBadge s="low" /> : r.promoLift > 0 ? <span style={{ fontSize: 9, color: '#FFC711' }}>Promo</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              </div>
            </>
          )}
        </>
      )}

      {/* ── VIEW: SKU Planner (per-SKU what-if PO planning) ──────────── */}
      {view === 'planner' && (
        <SkuPlanner
          skus={supplySkus}
          lotsByDpci={allLots}
          fcastByDpci={fcastByDpci}
          scenario={scenario}
          weekLabels={weekLabels}
          getPromoLift={promoCtx.getLift}
        />
      )}

      {/* ── VIEW: PO Recommendations ──────────────────────────────────── */}
      {view === 'po' && (
        <>
          <FilterBar meta={`${filteredRecs.length} of ${recommendations.filter(r => r.severity !== 'none').length} active recommendations · ${scenario} scenario`}>
            <SelectFilter id="po-cat" options={catOptions} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
            <SelectFilter id="po-sev" options={sevOptions} value={sevFilter} onChange={setSevFilter} allLabel="All Severities" />
          </FilterBar>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>SKU</th>
                  <th>Category</th>
                  <th className="tr">ATS</th>
                  <th className="tr">In Transit</th>
                  <th className="tr" style={{ color: 'var(--rd)' }}>At Risk</th>
                  <th className="tr">Curr WOC</th>
                  <th className="tr">Target WOC</th>
                  <th className="tr">Lead Time</th>
                  <th className="tr" style={{ color: 'var(--ac)' }}>Rec Cases</th>
                  <th>Order By</th>
                  <th>Ship Date</th>
                  <th>Arrival</th>
                  <th className="tr">Post WOC</th>
                  <th style={{ minWidth: 160 }}>Rationale</th>
                  <th>Sev</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecs.length === 0 && (
                  <tr><td colSpan={15} style={{ textAlign: 'center', color: 'var(--tx3)', padding: 24 }}>No active recommendations match filters</td></tr>
                )}
                {filteredRecs.map(r => {
                  const sku = supplySkus.find(s => s.dpci === r.dpci);
                  return (
                    <tr key={r.dpci} style={{ background: r.severity === 'critical' ? 'rgba(255,90,90,.04)' : r.severity === 'high' ? 'rgba(255,160,64,.03)' : undefined }}>
                      <td className="tn" style={{ fontSize: 11 }}>{r.name}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.category}</td>
                      <td className="tr" style={{ fontWeight: 700, fontSize: 11, color: r.atsUnits > 0 ? 'var(--ac)' : 'var(--rd)' }}>{fmt(r.atsUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: '#818cf8' }}>{fmt(r.inTransitUnits)}</td>
                      <td className="tr" style={{ fontSize: 11, color: r.atRiskUnits > 0 ? 'var(--yw)' : 'var(--tx3)' }}>{fmt(r.atRiskUnits)}</td>
                      <td className="tr"><WocBadge woc={r.currentWOC} min={sku?.minWOC || 3} target={r.targetWOC} /></td>
                      <td className="tr" style={{ fontSize: 11, color: 'var(--tx3)' }}>{r.targetWOC}</td>
                      <td className="tr" style={{ fontSize: 11, color: 'var(--tx3)' }}>{sku?.totalLeadTimeWeeks || '—'}wk</td>
                      <td className="tr" style={{ fontWeight: 700, fontSize: 11, color: r.recommendedCases > 0 ? 'var(--ac)' : 'var(--tx3)' }}>{r.recommendedCases > 0 ? fmt(r.recommendedCases) : '—'}</td>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>{r.orderDate}</td>
                      <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{r.shipDate}</td>
                      <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{r.arrivalDate}</td>
                      <td className="tr" style={{ fontSize: 11, color: r.postDeliveryWOC >= r.targetWOC ? 'var(--gr)' : 'var(--yw)' }}>{r.postDeliveryWOC}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }} className="tn">{r.rationale}</td>
                      <td><SevBadge s={r.severity} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── VIEW: Risk Center ─────────────────────────────────────────── */}
      {view === 'risk' && (
        <>
          {/* Risk type summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
            {(['Imminent Stockout', 'Stop-Ship Exposure', 'Lot Expiry Risk', 'Excess / Overstock'] as const).map(type => {
              const count = allRisks.filter(r => r.riskType === type).length;
              const totalRev = allRisks.filter(r => r.riskType === type).reduce((a, r) => a + r.revenueAtRisk, 0);
              const icon = type.includes('Stockout') ? '🚨' : type.includes('Stop') ? '🛑' : type.includes('Expiry') ? '⏰' : '📦';
              const col = type.includes('Stockout') ? '#FF5A5A' : type.includes('Stop') ? '#FF5A5A' : type.includes('Expiry') ? '#FFA040' : '#818cf8';
              return (
                <div key={type} className="card" style={{ border: `1px solid ${col}20`, padding: '12px 14px' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: col }}>{count} SKU{count !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>{type}</div>
                  {totalRev > 0 && <div style={{ fontSize: 10, color: 'var(--rd)' }}>${fmtDol(totalRev)} at risk</div>}
                </div>
              );
            })}
          </div>

          <FilterBar meta={`${filteredRisks.length} risks · ${fmtDol(filteredRisks.reduce((a, r) => a + r.revenueAtRisk, 0))} total revenue at risk`}>
            <SelectFilter id="risk-cat" options={catOptions} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
            <SelectFilter id="risk-type" options={riskTypes} value={riskTypeFilter} onChange={setRiskTypeFilter} allLabel="All Risk Types" />
            <SelectFilter id="risk-sev" options={sevOptions} value={sevFilter} onChange={setSevFilter} allLabel="All Severities" />
          </FilterBar>

          <DataTable>
            <table>
              <thead>
                <tr>
                  <th>Risk Type</th>
                  <th style={{ minWidth: 140 }}>SKU</th>
                  <th>Category</th>
                  <th>Impact Date</th>
                  <th className="tr">Units</th>
                  <th className="tr">Cases</th>
                  <th>Lot Code</th>
                  <th className="tr" style={{ color: 'var(--rd)' }}>Rev at Risk</th>
                  <th className="tr" style={{ color: 'var(--yw)' }}>Inv Value</th>
                  <th style={{ minWidth: 200 }}>Recommended Action</th>
                  <th>Sev</th>
                </tr>
              </thead>
              <tbody>
                {filteredRisks.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--tx3)', padding: 24 }}>No risks match filters</td></tr>
                )}
                {filteredRisks.map(r => (
                  <tr key={r.id} style={{ background: r.severity === 'critical' ? 'rgba(255,90,90,.04)' : r.severity === 'high' ? 'rgba(255,160,64,.03)' : undefined }}>
                    <td style={{ fontSize: 11, color: SEV_COLOR[r.severity], fontWeight: 600 }}>{r.riskType}</td>
                    <td className="tn" style={{ fontSize: 11 }}>{r.name}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{r.category}</td>
                    <td style={{ fontSize: 11, fontWeight: 600 }}>{r.impactDate}</td>
                    <td className="tr" style={{ fontSize: 11 }}>{fmt(r.unitsAffected)}</td>
                    <td className="tr" style={{ fontSize: 11 }}>{fmt(r.casesAffected)}</td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--tx3)' }}>{r.lotCode || '—'}</td>
                    <td className="tr" style={{ fontSize: 11, color: r.revenueAtRisk > 0 ? 'var(--rd)' : 'var(--tx3)', fontWeight: r.revenueAtRisk > 0 ? 700 : 400 }}>
                      {r.revenueAtRisk > 0 ? fmtDol(r.revenueAtRisk) : '—'}
                    </td>
                    <td className="tr" style={{ fontSize: 11, color: r.inventoryValueAtRisk > 0 ? 'var(--yw)' : 'var(--tx3)' }}>
                      {r.inventoryValueAtRisk > 0 ? fmtDol(r.inventoryValueAtRisk) : '—'}
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }} className="tn">{r.recommendedAction}</td>
                    <td><SevBadge s={r.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── VIEW: Finance ─────────────────────────────────────────────── */}
      {view === 'finance' && (
        <>
          {/* Inventory value by state */}
          <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Inventory Value by State
          </div>
          <KpiGrid columns={4}>
            <KpiCard icon="✅" label="ATS Value" style="--cc:var(--ac)"
              value={fmtDol(finance.availableToSellValue)}
              delta="Confirmed sellable inventory" deltaClass="up" sub="At wholesale unit price" />
            <KpiCard icon="🚢" label="In Transit Value" style="--cc:#818cf8"
              value={fmtDol(finance.inTransitValue)}
              delta="Inbound, not yet received" deltaClass="neu" sub="Expected within lead time" />
            <KpiCard icon="⚠️" label="At-Risk Value" style="--cc:var(--yw)"
              value={fmtDol(finance.atRiskValue)}
              delta="At-risk + expiring soon" deltaClass="dn" sub="May not be sellable" />
            <KpiCard icon="📦" label="Total On-Hand Value" style="--cc:var(--tx)"
              value={fmtDol(finance.onHandValue)}
              delta={`+${fmtDol(finance.inTransitValue)} inbound`} deltaClass="neu" sub="All on-hand at wholesale" />
          </KpiGrid>

          {/* Exposure */}
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Risk & Exposure
          </div>
          <KpiGrid columns={4}>
            <KpiCard icon="🚨" label="Stockout Rev Risk" style="--cc:var(--rd)"
              value={fmtDol(finance.stockoutRevenueRisk)}
              delta="At consumer retail (MSRP)" deltaClass="dn" sub="50% exposure factor applied" />
            <KpiCard icon="📦" label="Excess Inv Value" style="--cc:#818cf8"
              value={fmtDol(finance.excessInventoryValue)}
              delta="Above 1.5× target WOC" deltaClass="dn" sub="Working capital at risk" />
            <KpiCard icon="⏰" label="Expiring Inv Value" style="--cc:var(--rd)"
              value={fmtDol(finance.expiringSoonValue)}
              delta="Nearing stop-ship dates" deltaClass="dn" sub="Potential writeoff exposure" />
            <KpiCard icon="💼" label="Working Capital Exposure" style="--cc:var(--yw)"
              value={fmtDol(finance.workingCapitalExposure)}
              delta="Excess + at-risk + expiring" deltaClass="dn" sub="Total tied-up capital" />
          </KpiGrid>

          {/* PO Spend projection */}
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Projected PO Spend Obligations
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: '30-Day', val: finance.projectedPOSpend30d, icon: '📅', note: 'Critical + high severity' },
              { label: '60-Day', val: finance.projectedPOSpend60d, icon: '📆', note: 'Adds medium severity' },
              { label: '90-Day', val: finance.projectedPOSpend90d, icon: '🗓', note: 'Extrapolated +15%' },
            ].map(p => (
              <div key={p.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{p.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ac)' }}>{fmtDol(p.val)}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{p.label} Supply Obligation</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{p.note}</div>
              </div>
            ))}
          </div>

          {/* Scenario comparison */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Scenario Sensitivity — Stockout Revenue Risk
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { sc: 'Bear', val: finance.bearStockoutRisk, col: '#ef4444', note: 'Demand over-performs supply → higher exposure' },
              { sc: 'Base', val: finance.baseStockoutRisk, col: '#00E3CD', note: 'Current scenario projection' },
              { sc: 'Bull', val: finance.bullStockoutRisk, col: '#00CF92', note: 'Strong sell-through provides buffer' },
            ].map(p => (
              <div key={p.sc} className="card" style={{ padding: '14px 16px', border: `1px solid ${p.col}25` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: p.col, marginBottom: 4 }}>{p.sc} Scenario</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: p.col }}>{fmtDol(p.val)}</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>{p.note}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── VIEW: CM Plans ──────────────────────────────────────────────── */}
      {view === 'mfr' && (() => {
        // Helper: pick horizon bucket
        const getLines = (plan: ManufacturerPlan) =>
          horizon === '4wk'  ? plan.lines4wk  :
          horizon === '8wk'  ? plan.lines8wk  :
          horizon === '26wk' ? plan.lines26wk :
          plan.lines12wk;

        // CSV/TSV export for a CM's external supply plan
        const exportTSV = (plan: ManufacturerPlan) => {
          const lines = getLines(plan);
          const sku4line = (r: ManufacturerPlan['lines'][0]) =>
            supplySkus.find(s => s.dpci === r.dpci);
          const header = ['SKU Code','Product','Category','Req Cases','Req Units','Batch Size','Prod Start','Prod Complete','Ship By','Est. Arrival','Available','Priority','Notes'];
          const rows = lines.map(r => {
            const s = sku4line(r);
            return [r.caseCode || r.dpci, r.name, r.category, r.recommendedCases, r.recommendedUnits, s?.batchSizeCases ?? '', r.prodStartDate, r.prodCompleteDate, r.shipDate, r.arrivalDate, r.availableDate, r.severity, r.rationale];
          });
          const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
          const blob = new Blob([tsv], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${plan.cm.shortName}_supply_plan_${new Date().toISOString().slice(0,10)}.tsv`;
          a.click();
          URL.revokeObjectURL(url);
        };

        const filteredPlans = mfrFilter ? mfrPlans.filter(p => p.cm.id === mfrFilter) : mfrPlans;
        const totalMfrLines = filteredPlans.reduce((a, p) => a + getLines(p).length, 0);
        const totalMfrValue = filteredPlans.reduce((a, p) => a + getLines(p).reduce((b, r) => b + r.poValue, 0), 0);
        const totalLatePlans = filteredPlans.filter(p => p.lateLines > 0).length;

        return (
          <>
            {/* Live data callout */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,227,205,.07)', border: '1px solid rgba(0,227,205,.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 11, color: 'var(--tx)' }}>
              <span style={{ fontSize: 14 }}>📡</span>
              <span>This plan updates automatically as the <strong>demand plan, scenario, promo calendar, and inventory position</strong> change. Switching scenario above re-runs all recommendations.</span>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <ButtonGroup options={HORIZON_OPTS} active={horizon} onChange={setHorizon} />
              <ButtonGroup options={PLAN_VIEW_OPTS} active={planView} onChange={setPlanView} />
              <SelectFilter id="mfr-filter" options={mfrPlans.map(p => p.cm.name)} value={mfrFilter ? mfrPlans.find(p => p.cm.id === mfrFilter)?.cm.name || '' : ''} onChange={v => setMfrFilter(mfrPlans.find(p => p.cm.name === v)?.cm.id || '')} allLabel="All Manufacturers" />
            </div>

            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { icon: '🏭', label: 'Manufacturers', value: filteredPlans.length.toString() },
                { icon: '📋', label: `PO Lines (${horizon})`, value: totalMfrLines.toString() },
                { icon: '⚠️', label: 'CMs w/ Late POs', value: totalLatePlans.toString(), warn: totalLatePlans > 0 },
                { icon: '💰', label: `Commitment (${horizon})`, value: fmtDol(totalMfrValue) },
              ].map(k => (
                <div key={k.label} className="card" style={{ padding: '12px 14px', borderColor: k.warn ? 'rgba(255,90,90,.3)' : undefined }}>
                  <div style={{ fontSize: 16 }}>{k.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.warn ? '#FF5A5A' : 'var(--ac)', marginTop: 2 }}>{k.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Per-CM sections */}
            {filteredPlans.map(plan => {
              const lines = getLines(plan);
              if (lines.length === 0 && planView === 'internal') {
                return (
                  <div key={plan.cm.id} style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', color: 'var(--tx3)', fontSize: 12 }}>
                    <strong style={{ color: 'var(--tx)' }}>{plan.cm.name}</strong> — {plan.cm.location} · No action items in {horizon} horizon. Portfolio is healthy for this manufacturer.
                  </div>
                );
              }

              return (
                <div key={plan.cm.id} style={{ marginBottom: 28 }}>
                  {/* CM header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.09)' }}>
                    <div style={{ fontSize: 28 }}>🏭</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{plan.cm.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{plan.cm.location}</span>
                        <span style={{ fontSize: 10, color: 'var(--tx3)', background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 6 }}>{plan.cm.categories.join(' · ')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>📦 {plan.skus.length} SKUs</span>
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>·</span>
                        <span style={{ fontSize: 11, color: lines.length > 0 ? 'var(--ac)' : 'var(--tx3)' }}>{lines.length} action line{lines.length !== 1 ? 's' : ''} in {horizon}</span>
                        {plan.lateLines > 0 && <>
                          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>·</span>
                          <span style={{ fontSize: 11, color: '#FF5A5A', fontWeight: 700 }}>⚠️ {plan.lateLines} LATE PO{plan.lateLines !== 1 ? 's' : ''}</span>
                        </>}
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>·</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)' }}>{fmtDol(lines.reduce((a, r) => a + r.poValue, 0))} commitment</span>
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>·</span>
                        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>PO approval: {plan.cm.poApprovalLeadTimeWeeks}wk</span>
                      </div>
                    </div>
                  </div>

                  {/* Capacity notes */}
                  {plan.cm.capacityNotes && (
                    <div style={{ fontSize: 11, color: 'var(--tx3)', background: 'rgba(255,199,17,.06)', border: '1px solid rgba(255,199,17,.15)', borderRadius: 6, padding: '7px 12px', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, color: '#FFC711', marginRight: 6 }}>ℹ️ Capacity notes:</span>{plan.cm.capacityNotes}
                    </div>
                  )}

                  {/* INTERNAL ACTION PLAN */}
                  {planView === 'internal' && lines.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Internal Action Plan — Little Spoon × Target
                      </div>
                      <DataTable>
                        <table>
                          <thead>
                            <tr>
                              <th style={{ minWidth: 140 }}>SKU</th>
                              <th>Category</th>
                              <th className="tr">Rec Cases</th>
                              <th className="tr">Current WOC</th>
                              <th className="tr">PO Issue By</th>
                              <th className="tr">PO Status</th>
                              <th className="tr">Prod Start</th>
                              <th className="tr">Prod Complete</th>
                              <th className="tr">Ship By</th>
                              <th className="tr">Arrival</th>
                              <th className="tr">Available</th>
                              <th className="tr">PO Value</th>
                              <th>Sev</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map(rec => {
                              const isOverdue = rec.isLate;
                              const daysOut = rec.daysUntilLatestPO;
                              const urgentSoon = !isOverdue && daysOut <= 14;
                              return (
                                <tr key={rec.dpci} style={{ background: SEV_BG[rec.severity] }}>
                                  <td style={{ maxWidth: 160 }}>{rec.name}</td>
                                  <td>{rec.category}</td>
                                  <td className="tr" style={{ fontWeight: 700 }}>{fmt(rec.recommendedCases)}</td>
                                  <td className="tr"><WocBadge woc={rec.currentWOC} min={supplySkus.find(s => s.dpci === rec.dpci)?.minWOC ?? 2} target={rec.targetWOC} /></td>
                                  <td className="tr" style={{ color: isOverdue ? '#FF5A5A' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                                    {isOverdue && <span style={{ marginRight: 4 }}>⚠️</span>}{rec.orderDate}
                                  </td>
                                  <td className="tr">
                                    {isOverdue
                                      ? <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,90,90,.18)', color: '#FF5A5A', textTransform: 'uppercase' }}>LATE {Math.abs(daysOut)}d</span>
                                      : urgentSoon
                                      ? <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,199,17,.15)', color: '#FFC711', textTransform: 'uppercase' }}>{daysOut}d left</span>
                                      : <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(0,207,146,.1)', color: '#00CF92', textTransform: 'uppercase' }}>{daysOut}d</span>
                                    }
                                  </td>
                                  <td className="tr" style={{ color: 'var(--tx3)' }}>{rec.prodStartDate}</td>
                                  <td className="tr" style={{ color: 'var(--tx3)' }}>{rec.prodCompleteDate}</td>
                                  <td className="tr" style={{ color: 'var(--tx3)' }}>{rec.shipDate}</td>
                                  <td className="tr" style={{ color: 'var(--ac)' }}>{rec.arrivalDate}</td>
                                  <td className="tr" style={{ fontWeight: 700 }}>{rec.availableDate}</td>
                                  <td className="tr" style={{ fontWeight: 700 }}>{fmtDol(rec.poValue)}</td>
                                  <td><SevBadge s={rec.severity} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </DataTable>

                      {/* Service risk summary row */}
                      {lines.filter(r => r.isLate || r.severity === 'critical').length > 0 && (
                        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,90,90,.07)', border: '1px solid rgba(255,90,90,.18)', fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: '#FF5A5A' }}>Service risk summary: </span>
                          {lines.filter(r => r.isLate || r.severity === 'critical').map(r => (
                            <span key={r.dpci} style={{ color: 'var(--tx)', marginRight: 12 }}>
                              {r.name}: {r.serviceRiskIfMissed}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Monthly commitment breakdown */}
                      {plan.commitmentByMonth.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 12, marginBottom: 6 }}>
                            Production Commitment by Month
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {plan.commitmentByMonth.map(m => (
                              <div key={m.month} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(0,207,146,.07)', border: '1px solid rgba(0,207,146,.15)', minWidth: 90, textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 2 }}>{m.month}</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ac)' }}>{fmt(m.cases)}</div>
                                <div style={{ fontSize: 10, color: 'var(--tx3)' }}>cases</div>
                                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{fmtDol(m.value)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* EXTERNAL CM-FACING SUPPLY PLAN */}
                  {planView === 'external' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Production Schedule — Little Spoon × Target ({horizon} horizon)
                        </div>
                        <button
                          onClick={() => exportTSV(plan)}
                          style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,227,205,.3)', background: 'rgba(0,227,205,.08)', color: 'var(--ac)', cursor: 'pointer' }}
                        >
                          ↓ Export TSV
                        </button>
                      </div>

                      {lines.length === 0 ? (
                        <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,207,146,.06)', fontSize: 12, color: 'var(--tx3)' }}>
                          No production orders required for {plan.cm.name} in the {horizon} horizon. No action needed.
                        </div>
                      ) : (
                        <>
                          <DataTable>
                            <table>
                              <thead>
                                <tr>
                                  <th>SKU Code</th>
                                  <th style={{ minWidth: 150 }}>Product</th>
                                  <th>Category</th>
                                  <th className="tr">Req. Cases</th>
                                  <th className="tr">Req. Units</th>
                                  <th className="tr">Batch Size</th>
                                  <th>Prod Start</th>
                                  <th>Prod Complete</th>
                                  <th>Ship By</th>
                                  <th>Est. Arrival</th>
                                  <th>Available</th>
                                  <th>Priority</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map(rec => {
                                  const sku = supplySkus.find(s => s.dpci === rec.dpci);
                                  return (
                                    <tr key={rec.dpci}>
                                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{rec.caseCode || rec.dpci}</td>
                                      <td>{rec.name}</td>
                                      <td>{rec.category}</td>
                                      <td className="tr" style={{ fontWeight: 700 }}>{fmt(rec.recommendedCases)}</td>
                                      <td className="tr">{fmt(rec.recommendedUnits)}</td>
                                      <td className="tr" style={{ color: 'var(--tx3)' }}>{sku ? fmt(sku.batchSizeCases) : '—'}</td>
                                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{rec.prodStartDate}</td>
                                      <td>{rec.prodCompleteDate}</td>
                                      <td>{rec.shipDate}</td>
                                      <td>{rec.arrivalDate}</td>
                                      <td style={{ fontWeight: 700 }}>{rec.availableDate}</td>
                                      <td><SevBadge s={rec.severity} /></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </DataTable>

                          {/* External plan footer */}
                          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', fontSize: 11, color: 'var(--tx3)', lineHeight: 1.7 }}>
                            <strong style={{ color: 'var(--tx)' }}>Confirmation required:</strong> Please confirm receipt of this production schedule within 48 hours and flag any capacity constraints, material shortages, or scheduling conflicts.
                            POs will be issued upon your confirmation. All quantities are preliminary until a PO is formally issued by Little Spoon.
                            This schedule is generated from our live demand plan and updates as forecasts change — we will notify you of material revisions.
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        );
      })()}

      {/* ═══════════════ PO CREATOR ═══════════════════════════════════ */}
      {view === 'po-create' && (() => {
        // Recs grouped by selected manufacturer — match by the SKU's co-packer field
        // (the CM `categories` array holds co-packer keywords like "IFI", "Frankies").
        const activeCm = manufacturers.find(m => m.id === poMfr) || manufacturers[0];
        const cmRecs = recommendations.filter(r => {
          if (!activeCm) return false;
          if (r.severity === 'none' || r.recommendedCases <= 0) return false;
          const sku = supplySkus.find(s => s.dpci === r.dpci);
          const coPacker = (sku?.coPacker || '').toLowerCase();
          if (coPacker && activeCm.categories.some(c => coPacker.includes(c.toLowerCase()))) return true;
          // Fallback for SKUs without a coPacker — match on product category
          const catLower = r.category.toLowerCase();
          return !coPacker && activeCm.categories.some(c => catLower.includes(c.toLowerCase()));
        });

        const toggleLine = (dpci: string) => {
          setPoSelected(prev => {
            const next = new Set(prev);
            if (next.has(dpci)) next.delete(dpci); else next.add(dpci);
            return next;
          });
          setPoGenerated(null);
          setPoSendStatus('idle');
        };

        const toggleAll = () => {
          if (poSelected.size === cmRecs.length) {
            setPoSelected(new Set());
          } else {
            setPoSelected(new Set(cmRecs.map(r => r.dpci)));
          }
          setPoGenerated(null);
          setPoSendStatus('idle');
        };

        const selectedRecs = cmRecs.filter(r => poSelected.has(r.dpci));
        const poTotal = selectedRecs.reduce((a, r) => {
          const sku = supplySkus.find(s => s.dpci === r.dpci);
          return a + r.recommendedUnits * (sku?.unitPrice ?? 0);
        }, 0);
        const poCases = selectedRecs.reduce((a, r) => a + r.recommendedCases, 0);

        const handleGeneratePO = () => {
          if (selectedRecs.length === 0) return;
          const po = buildPOFromRecommendations(selectedRecs, supplySkus, activeCm, {
            poNumber,
            date: poDate,
            shipTo: poShipTo || `FOB ${activeCm.location}`,
            shipDate: poShipDate || undefined,
          });
          // Attach signature if signed
          if (poSignature) {
            po.signatureDataUrl = poSignature;
            po.signedDate = poSignedDate || undefined;
          }
          setPoGenerated(po);
          setPoSendStatus('idle');

          // Persist each line as a PlannedPO so the supply simulation reflects this PO
          // immediately. We strip any prior entries with this PO number so re-generating
          // doesn't double-stage.
          plannedPOs.dispatch({ type: 'REMOVE_BY_PO', payload: { poNumber: po.poNumber } });
          const today = new Date().toISOString().slice(0, 10);
          const entries = selectedRecs.map(rec => {
            const sku = supplySkus.find(s => s.dpci === rec.dpci);
            const arrivalIso = engineDateToIso(rec.arrivalDate);
            return {
              poNumber: po.poNumber,
              dpci: rec.dpci,
              cases: rec.recommendedCases,
              units: rec.recommendedUnits,
              supplier: activeCm.name,
              placedDate: today,
              arrivalDate: arrivalIso,
              source: 'generated' as const,
              status: 'staged' as const,
              note: `${activeCm.shortName} · ${rec.severity}`,
            };
          });
          plannedPOs.dispatch({ type: 'ADD_MANY', payload: entries });
        };

        const handleDownload = () => {
          if (poGenerated) downloadPO(poGenerated);
        };

        // Auto-select critical/high on CM change
        const handleCmChange = (id: string) => {
          setPoMfr(id);
          setPoGenerated(null);
          setPoSendStatus('idle');
          const cm = manufacturers.find(m => m.id === id);
          if (cm) {
            const recs = recommendations.filter(r => {
              if (r.severity !== 'critical' && r.severity !== 'high') return false;
              if (r.recommendedCases <= 0) return false;
              const sku = supplySkus.find(s => s.dpci === r.dpci);
              const coPacker = (sku?.coPacker || '').toLowerCase();
              if (coPacker && cm.categories.some(c => coPacker.includes(c.toLowerCase()))) return true;
              const catLower = r.category.toLowerCase();
              return !coPacker && cm.categories.some(c => catLower.includes(c.toLowerCase()));
            });
            setPoSelected(new Set(recs.map(r => r.dpci)));
            setPoShipTo(`FOB ${cm.location}`);
          }
        };

        return (
          <>
            <FilterBar>
              <select
                value={poMfr || activeCm?.id || ''}
                onChange={e => handleCmChange(e.target.value)}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)',
                  background: 'var(--bg2)', color: 'var(--tx)', fontSize: 12, fontFamily: 'inherit',
                }}
              >
                {manufacturers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </FilterBar>

            {/* PO Details Form */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'PO Number', value: poNumber, onChange: (v: string) => setPoNumber(v) },
                { label: 'PO Date', value: poDate, onChange: (v: string) => setPoDate(v) },
                { label: 'Ship To', value: poShipTo || `FOB ${activeCm?.location || ''}`, onChange: (v: string) => setPoShipTo(v) },
                { label: 'Ship Date', value: poShipDate, onChange: (v: string) => setPoShipDate(v), placeholder: 'Auto from recs' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    placeholder={f.placeholder || ''}
                    onChange={e => f.onChange(e.target.value)}
                    style={{
                      display: 'block', width: '100%', marginTop: 4, padding: '7px 10px',
                      background: 'var(--bg2)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6,
                      color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Vendor contact info strip */}
            {activeCm && (
              <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 6, background: 'rgba(0,227,205,.06)', border: '1px solid rgba(0,227,205,.15)', fontSize: 12, display: 'flex', gap: 24, alignItems: 'center' }}>
                <span><strong style={{ color: 'var(--ac)' }}>Vendor:</strong> {activeCm.name}</span>
                <span><strong style={{ color: 'var(--ac)' }}>Contact:</strong> {activeCm.contactName}</span>
                <span><strong style={{ color: 'var(--ac)' }}>Email:</strong> {activeCm.contactEmail}</span>
                {activeCm.contactPhone && <span><strong style={{ color: 'var(--ac)' }}>Phone:</strong> {activeCm.contactPhone}</span>}
              </div>
            )}

            {/* Summary strip */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
                <strong style={{ color: 'var(--tx)' }}>{poSelected.size}</strong> of {cmRecs.length} lines selected
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
                Total cases: <strong style={{ color: 'var(--tx)' }}>{fmt(poCases)}</strong>
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
                PO value: <strong style={{ color: 'var(--ac)' }}>{fmtDol(Math.round(poTotal))}</strong>
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  onClick={handleGeneratePO}
                  disabled={selectedRecs.length === 0}
                  style={{
                    padding: '8px 20px', borderRadius: 6, border: 'none', cursor: selectedRecs.length > 0 ? 'pointer' : 'not-allowed',
                    background: selectedRecs.length > 0 ? '#00E3CD' : 'rgba(255,255,255,.08)',
                    color: selectedRecs.length > 0 ? '#0f172a' : 'var(--tx3)',
                    fontWeight: 700, fontSize: 13,
                  }}
                >
                  Generate PO
                </button>
                {poGenerated && (
                  <>
                    <button
                      onClick={handleDownload}
                      style={{
                        padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(0,227,205,.3)', cursor: 'pointer',
                        background: 'transparent', color: '#00E3CD', fontWeight: 700, fontSize: 13,
                      }}
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={() => setPoSendStatus('confirm')}
                      style={{
                        padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(0,207,146,.3)', cursor: 'pointer',
                        background: poSendStatus === 'sent' ? 'rgba(0,207,146,.15)' : 'transparent',
                        color: poSendStatus === 'sent' ? '#00CF92' : '#00CF92', fontWeight: 700, fontSize: 13,
                      }}
                    >
                      {poSendStatus === 'sent' ? 'Sent!' : poSendStatus === 'confirm' ? 'Confirm Send?' : `Send to ${activeCm.contactName}`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* WOC Impact Preview — shown only when lines are selected, before Generate */}
            {selectedRecs.length > 0 && (() => {
              // For each selected rec, compute "would post-PO WOC clear target?" indicators
              let movedToHealthy = 0;
              let stillBelowMin = 0;
              let alreadyHealthy = 0;
              for (const rec of selectedRecs) {
                const sku = supplySkus.find(s => s.dpci === rec.dpci);
                if (!sku) continue;
                const wasBelowMin = rec.currentWOC < sku.minWOC;
                const isHealthyAfter = rec.postDeliveryWOC >= sku.targetWOC;
                if (isHealthyAfter && wasBelowMin) movedToHealthy += 1;
                else if (!isHealthyAfter && rec.postDeliveryWOC < sku.minWOC) stillBelowMin += 1;
                else if (!wasBelowMin) alreadyHealthy += 1;
              }
              return (
                <div style={{
                  marginBottom: 12, padding: '12px 16px', borderRadius: 10,
                  background: 'var(--ac-soft)', border: '1px solid rgba(0,181,162,.25)',
                  display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontSize: 12.5,
                }}>
                  <strong style={{ color: 'var(--tx)' }}>WOC impact preview</strong>
                  {movedToHealthy > 0 && (
                    <span><strong style={{ color: '#067A56' }}>{movedToHealthy}</strong> SKUs move from below-min → healthy</span>
                  )}
                  {alreadyHealthy > 0 && (
                    <span><strong>{alreadyHealthy}</strong> SKUs build buffer above target</span>
                  )}
                  {stillBelowMin > 0 && (
                    <span style={{ color: '#A33E1F' }}><strong>{stillBelowMin}</strong> SKUs remain below min — increase quantity</span>
                  )}
                  <span style={{ marginLeft: 'auto', color: 'var(--tx2)' }}>
                    Hit <strong>Generate PO</strong> to stage these for the simulation.
                  </span>
                </div>
              );
            })()}

            {/* Send confirmation banner */}
            {poSendStatus === 'confirm' && poGenerated && activeCm && (
              <div style={{
                marginBottom: 12, padding: '12px 16px', borderRadius: 8,
                background: 'rgba(0,207,146,.08)', border: '1px solid rgba(0,207,146,.25)',
                display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
              }}>
                <span style={{ color: 'var(--tx)' }}>
                  Send <strong>{poGenerated.poNumber}</strong> ({fmtDol(Math.round(poGenerated.total))}) to <strong>{activeCm.contactName}</strong> at <strong style={{ color: '#00CF92' }}>{activeCm.contactEmail}</strong>?
                </span>
                <button
                  onClick={() => setPoSendStatus('sent')}
                  style={{
                    marginLeft: 'auto', padding: '6px 16px', borderRadius: 6, border: 'none',
                    background: '#00CF92', color: '#0f172a', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Confirm & Send via Outlook
                </button>
                <button
                  onClick={() => setPoSendStatus('idle')}
                  style={{
                    padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
                    background: 'transparent', color: 'var(--tx3)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Line items selection table */}
            <DataTable>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={poSelected.size === cmRecs.length && cmRecs.length > 0}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>SKU</th>
                    <th style={{ minWidth: 140 }}>Product</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th className="tr">Cases</th>
                    <th className="tr">Units</th>
                    <th className="tr">Unit Price</th>
                    <th className="tr">Line Total</th>
                    <th>Ship Date</th>
                    <th>Arrival</th>
                    <th className="tr">Current WOC</th>
                    <th className="tr">Post-PO WOC</th>
                  </tr>
                </thead>
                <tbody>
                  {cmRecs.length === 0 ? (
                    <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--tx3)', padding: 24 }}>No actionable PO recommendations for this manufacturer.</td></tr>
                  ) : cmRecs.map(rec => {
                    const sku = supplySkus.find(s => s.dpci === rec.dpci);
                    const isChecked = poSelected.has(rec.dpci);
                    const lineTotal = rec.recommendedUnits * (sku?.unitPrice ?? 0);
                    return (
                      <tr
                        key={rec.dpci}
                        onClick={() => toggleLine(rec.dpci)}
                        style={{
                          cursor: 'pointer',
                          background: isChecked ? 'rgba(0,227,205,.06)' : undefined,
                        }}
                      >
                        <td><input type="checkbox" checked={isChecked} onChange={() => toggleLine(rec.dpci)} style={{ cursor: 'pointer' }} /></td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{rec.caseCode || rec.dpci}</td>
                        <td>{rec.name}</td>
                        <td>{rec.category}</td>
                        <td><SevBadge s={rec.severity} /></td>
                        <td className="tr" style={{ fontWeight: 700 }}>{fmt(rec.recommendedCases)}</td>
                        <td className="tr">{fmt(rec.recommendedUnits)}</td>
                        <td className="tr">${sku?.unitPrice.toFixed(2) ?? '—'}</td>
                        <td className="tr" style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmtDol(Math.round(lineTotal))}</td>
                        <td>{rec.shipDate}</td>
                        <td>{rec.arrivalDate}</td>
                        <td className="tr">
                          <WocBadge woc={rec.currentWOC} min={sku?.minWOC ?? 2} target={sku?.targetWOC ?? 6} />
                        </td>
                        <td className="tr">
                          <WocBadge woc={rec.postDeliveryWOC} min={sku?.minWOC ?? 2} target={sku?.targetWOC ?? 6} />
                          <span style={{ marginLeft: 4, fontSize: 10, color: rec.postDeliveryWOC > rec.currentWOC ? '#067A56' : 'var(--tx2)' }}>
                            ({rec.postDeliveryWOC > rec.currentWOC ? '+' : ''}{(rec.postDeliveryWOC - rec.currentWOC).toFixed(1)})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>

            {/* Signature Pad */}
            {(() => {
              const applySignature = (dataUrl: string) => {
                const now = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                setPoSignature(dataUrl);
                setPoSignedDate(now);
                if (poGenerated) {
                  setPoGenerated({ ...poGenerated, signatureDataUrl: dataUrl, signedDate: now });
                }
              };

              const clearSig = () => {
                const c = sigCanvasRef.current;
                if (c) { const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); }
                setPoSignature(null);
                setPoSignedDate(null);
                setPoTypedName('');
                if (poGenerated) {
                  setPoGenerated({ ...poGenerated, signatureDataUrl: undefined, signedDate: undefined });
                }
              };

              const renderTypedSignature = (name: string) => {
                const offscreen = document.createElement('canvas');
                offscreen.width = 600;
                offscreen.height = 100;
                const ctx = offscreen.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, 600, 100);
                ctx.font = '700 46px "Dancing Script", cursive';
                ctx.fillStyle = '#1e293b';
                ctx.textBaseline = 'middle';
                ctx.fillText(name, 16, 54);
                const dataUrl = offscreen.toDataURL('image/png');
                applySignature(dataUrl);
              };

              return (
                <div style={{ marginTop: 20, padding: 16, borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
                        Sign Purchase Order
                      </h3>
                      {/* Draw / Type toggle */}
                      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)' }}>
                        {(['draw', 'type'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => { setSigMode(m); clearSig(); }}
                            style={{
                              padding: '4px 14px', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              background: sigMode === m ? '#00E3CD' : 'transparent',
                              color: sigMode === m ? '#0f172a' : 'var(--tx3)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {poSignature && (
                        <span style={{ fontSize: 11, color: '#00CF92', fontWeight: 600 }}>
                          Signed {poSignedDate}
                        </span>
                      )}
                      <button
                        onClick={clearSig}
                        style={{
                          padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
                          background: 'transparent', color: 'var(--tx3)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {sigMode === 'draw' ? (
                    <>
                      <canvas
                        ref={(el) => {
                          sigCanvasRef.current = el;
                          if (el && !el.dataset.init) {
                            el.dataset.init = '1';
                            const ctx = el.getContext('2d');
                            if (ctx) {
                              ctx.strokeStyle = '#1e293b';
                              ctx.lineWidth = 2;
                              ctx.lineCap = 'round';
                              ctx.lineJoin = 'round';
                            }
                          }
                        }}
                        width={600}
                        height={100}
                        style={{
                          width: '100%', maxWidth: 600, height: 100, borderRadius: 6,
                          background: '#ffffff', cursor: 'crosshair', display: 'block',
                          border: poSignature ? '2px solid #00CF92' : '2px dashed rgba(255,255,255,.2)',
                        }}
                        onMouseDown={(e) => {
                          sigDrawingRef.current = true;
                          const c = e.currentTarget;
                          const ctx = c.getContext('2d');
                          if (!ctx) return;
                          const rect = c.getBoundingClientRect();
                          const sx = c.width / rect.width;
                          const sy = c.height / rect.height;
                          ctx.beginPath();
                          ctx.moveTo((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                        }}
                        onMouseMove={(e) => {
                          if (!sigDrawingRef.current) return;
                          const c = e.currentTarget;
                          const ctx = c.getContext('2d');
                          if (!ctx) return;
                          const rect = c.getBoundingClientRect();
                          const sx = c.width / rect.width;
                          const sy = c.height / rect.height;
                          ctx.lineTo((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                          ctx.stroke();
                        }}
                        onMouseUp={() => {
                          sigDrawingRef.current = false;
                          const c = sigCanvasRef.current;
                          if (c) applySignature(c.toDataURL('image/png'));
                        }}
                        onMouseLeave={() => { sigDrawingRef.current = false; }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          sigDrawingRef.current = true;
                          const c = e.currentTarget;
                          const ctx = c.getContext('2d');
                          if (!ctx) return;
                          const rect = c.getBoundingClientRect();
                          const sx = c.width / rect.width;
                          const sy = c.height / rect.height;
                          const t = e.touches[0];
                          ctx.beginPath();
                          ctx.moveTo((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy);
                        }}
                        onTouchMove={(e) => {
                          e.preventDefault();
                          if (!sigDrawingRef.current) return;
                          const c = e.currentTarget;
                          const ctx = c.getContext('2d');
                          if (!ctx) return;
                          const rect = c.getBoundingClientRect();
                          const sx = c.width / rect.width;
                          const sy = c.height / rect.height;
                          const t = e.touches[0];
                          ctx.lineTo((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy);
                          ctx.stroke();
                        }}
                        onTouchEnd={() => {
                          sigDrawingRef.current = false;
                          const c = sigCanvasRef.current;
                          if (c) applySignature(c.toDataURL('image/png'));
                        }}
                      />
                      <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, marginBottom: 0 }}>
                        Draw your signature above.
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={poTypedName}
                        placeholder="Type your full name"
                        onChange={(e) => {
                          setPoTypedName(e.target.value);
                          if (e.target.value.trim()) {
                            renderTypedSignature(e.target.value.trim());
                          } else {
                            clearSig();
                          }
                        }}
                        style={{
                          display: 'block', width: '100%', maxWidth: 600, padding: '10px 14px',
                          background: '#ffffff', border: poSignature ? '2px solid #00CF92' : '2px dashed rgba(255,255,255,.2)',
                          borderRadius: 6, fontSize: 15, fontFamily: 'inherit', color: '#1e293b',
                        }}
                      />
                      {/* Live typed signature preview */}
                      {poTypedName.trim() && (
                        <div style={{
                          marginTop: 8, padding: '12px 16px', background: '#ffffff', borderRadius: 6,
                          maxWidth: 600, minHeight: 50, display: 'flex', alignItems: 'center',
                        }}>
                          <span style={{
                            fontFamily: '"Dancing Script", cursive', fontWeight: 700,
                            fontSize: 36, color: '#1e293b', userSelect: 'none',
                          }}>
                            {poTypedName}
                          </span>
                        </div>
                      )}
                      <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, marginBottom: 0 }}>
                        Type your name and it will render as a signature.
                      </p>
                    </>
                  )}
                </div>
              );
            })()}

            {/* PO Preview */}
            {poGenerated && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', marginBottom: 12 }}>PO Preview</h3>
                <div style={{
                  background: '#ffffff', color: '#1e293b', borderRadius: 10, padding: 32,
                  fontFamily: 'Helvetica, Arial, sans-serif', maxWidth: 700, lineHeight: 1.5,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, textDecoration: 'underline' }}>Little Spoon, Inc.</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>31 Bond Street, 4th Floor</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>NY</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>888.878.7807</div>
                    </div>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: '#00E3CD', fontStyle: 'italic' }}>little spoon</div>
                  </div>

                  <h2 style={{ color: '#00E3CD', fontSize: 22, fontWeight: 700, margin: '16px 0 4px' }}>Purchase Order</h2>
                  <div style={{ height: 2, background: '#00E3CD', marginBottom: 16 }} />

                  {/* Metadata */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 11, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Vendor</div>
                      <div>{poGenerated.vendor.name}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Ship To</div>
                      <div>{poGenerated.shipTo}</div>
                      <div>SHIP DATE {poGenerated.shipDate}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div><strong>P.O. NO.</strong> {poGenerated.poNumber}</div>
                      <div><strong>DATE</strong> {poGenerated.date}</div>
                    </div>
                  </div>

                  {/* Line items table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 20 }}>
                    <thead>
                      <tr style={{ background: '#00E3CD', color: '#fff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>ITEM</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>QTY</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>RATE</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poGenerated.lineItems.map((li, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                          <td style={{ padding: '8px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{li.itemDescription}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{li.qty.toLocaleString()}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{li.rate.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{li.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 12, marginBottom: 12 }}>
                    <div><strong>SUBTOTAL</strong></div>
                    <div style={{ fontWeight: 700 }}>{poGenerated.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 14, fontWeight: 700 }}>
                    <div>TOTAL</div>
                    <div>USD {poGenerated.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>

                  {/* Signature lines */}
                  <div style={{ marginTop: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 20 }}>
                      <span style={{ fontSize: 11, flexShrink: 0 }}>Approved By</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {poGenerated.signatureDataUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={poGenerated.signatureDataUrl}
                            alt="Signature"
                            style={{ height: 36, position: 'absolute', bottom: 2, left: 0 }}
                          />
                        )}
                        <div style={{ borderBottom: '1px solid #e2e8f0', width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, flexShrink: 0 }}>Date</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {poGenerated.signedDate && (
                          <span style={{ position: 'absolute', bottom: 2, left: 0, fontSize: 11 }}>{poGenerated.signedDate}</span>
                        )}
                        <div style={{ borderBottom: '1px solid #e2e8f0', width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

    </PageShell>
  );
}
