// ─── Executive Summary Computations ─────────────────────────────────────
// Pure functions extracted from pages/executive.js for reuse in React components.

import type { DPSku, InvSku, AVFSku, ShipSku, OmniData, ScenarioBands, ScenarioKey } from '../../data/types';

// ─── Scenario Multipliers ───────────────────────────────────────────────

export const SCENARIO_MULT: Record<ScenarioKey, number> = {
  bear: 0.80,
  base: 1.00,
  bull: 1.20,
};

// ─── Coefficient of Variation ───────────────────────────────────────────

/**
 * Calculate the coefficient of variation from a historical sales array.
 * Filters out zero/negative values. Returns a floor of 0.18 for sparse data
 * and caps at 0.45 to prevent extreme band widths.
 */
export function calcCV(hist: number[]): number {
  const h = (hist || []).filter((v) => v > 0);
  if (h.length < 3) return 0.18;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const variance = h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length;
  return Math.min(Math.sqrt(variance) / mean, 0.45);
}

// ─── Confidence Bands ───────────────────────────────────────────────────

/**
 * Calculate p10/p50/p90 forecast bands from a base value and CV.
 * Uses z=1.28 for 80% confidence interval (p10 to p90).
 */
export function calcBands(baseVal: number, cv: number): ScenarioBands {
  return {
    p10: Math.round(baseVal * (1 - 1.28 * cv)),
    p50: Math.round(baseVal),
    p90: Math.round(baseVal * (1 + 1.28 * cv)),
  };
}

// ─── Executive KPI Aggregation ──────────────────────────────────────────

export interface ExecCatData {
  name: string;
  base: number;
  bear: number;
  bull: number;
  hist4: number;
  hist: number[];
}

export interface ExecAggregation {
  tot13Base: number;
  tot13Bear: number;
  tot13Bull: number;
  lwTotal: number;
  llwTotal: number;
  wow: number;
  catData: Record<string, ExecCatData>;
}

/**
 * Aggregate 13-week forecast data from DP skus for the executive summary.
 * Accepts optional velocity overrides keyed by DPCI.
 */
export function aggregateExec(
  skus: DPSku[],
  velOverrides: Record<string, number> = {}
): ExecAggregation {
  let tot13Base = 0;
  let tot13Bear = 0;
  let tot13Bull = 0;
  let lwTotal = 0;
  let llwTotal = 0;
  const catData: Record<string, ExecCatData> = {};

  skus.forEach((s) => {
    const vel =
      velOverrides[s.dpci] !== undefined ? velOverrides[s.dpci] : s.lw_upspw || 1;
    const origVel = s.lw_upspw || vel;
    const scale = origVel > 0 ? vel / origVel : 1;
    const f13 = s.fcast.slice(0, 13).reduce((a, b) => a + b, 0);
    const base = Math.round(f13 * scale);
    tot13Base += base;
    tot13Bear += Math.round(base * 0.80);
    tot13Bull += Math.round(base * 1.20);
    lwTotal += s.hist[11] || 0;
    llwTotal += s.hist[10] || 0;

    const cat = s.category || 'Other';
    if (!catData[cat])
      catData[cat] = { base: 0, bear: 0, bull: 0, hist4: 0, hist: [], name: cat };
    catData[cat].base += base;
    catData[cat].bear += Math.round(base * 0.80);
    catData[cat].bull += Math.round(base * 1.20);
    catData[cat].hist4 += s.hist.slice(7, 11).reduce((a, b) => a + b, 0) / 4;
    catData[cat].hist.push(...s.hist);
  });

  const wow = llwTotal > 0 ? (lwTotal - llwTotal) / llwTotal : 0;

  return { tot13Base, tot13Bear, tot13Bull, lwTotal, llwTotal, wow, catData };
}

// ─── Risk SKU Detection ─────────────────────────────────────────────────

export interface RiskSku {
  name: string;
  cat: string;
  dpci: string;
  trend: number;
  cv: number;
  lw: number;
  lw4avg: number;
  type: 'declining' | 'volatile';
}

/**
 * Identify SKUs with declining trends or high volatility from DP data.
 * Returns sorted by trend (most declining first).
 */
export function detectRiskSkus(skus: DPSku[]): RiskSku[] {
  const risks: RiskSku[] = [];

  skus.forEach((s) => {
    const hAll = s.hist.filter((v) => v > 0);
    if (hAll.length < 5) return;

    // hist[-1] may be partial CW data — exclude if it's <50% of prior full week
    const h =
      hAll.length >= 2 && hAll[hAll.length - 1] < hAll[hAll.length - 2] * 0.5
        ? hAll.slice(0, -1)
        : hAll;

    if (h.length < 4) return;

    const lw = h[h.length - 1];
    const lw4 = h[h.length - 5] || h[h.length - 4];
    const trend4 = (lw - (lw4 || lw)) / (lw4 || lw || 1);
    const lw4avg = h.slice(-4).reduce((a, b) => a + b, 0) / 4;
    const cv = calcCV(h);
    const isNew = h.length < 8;

    if (isNew) return; // skip still-ramping SKUs

    if (trend4 < -0.15 || cv > 0.28) {
      risks.push({
        name: (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 35),
        cat: (s.category || '').replace(' Multiserve', ''),
        dpci: s.dpci,
        trend: trend4,
        cv,
        lw,
        lw4avg,
        type: trend4 < -0.15 ? 'declining' : 'volatile',
      });
    }
  });

  risks.sort((a, b) => a.trend - b.trend);
  return risks;
}

// ─── 52-Week Forecast Computations ─────────────────────────────────────

/**
 * Sum 52-week revenue forecast × scenario multiplier.
 */
export function calc52WkRevenue(fcastRev: number[], mult: number): number {
  return Math.round(fcastRev.slice(0, 52).reduce((a, b) => a + b, 0) * mult);
}

/**
 * Sum 52-week unit forecast from all DP SKUs × scenario multiplier.
 */
export function calc52WkUnits(skus: DPSku[], mult: number): number {
  let total = 0;
  for (const s of skus) {
    total += s.fcast.slice(0, 52).reduce((a, b) => a + b, 0);
  }
  return Math.round(total * mult);
}

// ─── OOS Watch ─────────────────────────────────────────────────────────

export interface OOSSku {
  name: string;
  dpci: string;
  oos_pct: number;
  lost_dollar_week: number;
  wos_current: number;
  risk_flag: string;
}

/**
 * Identify SKUs with OOS issues at Target.
 * Returns sorted by lost $/week (worst first).
 */
export function calcOOSWatch(invSkus: InvSku[]): { skus: OOSSku[]; totalLost: number; oosCount: number } {
  const flagged: OOSSku[] = [];
  let totalLost = 0;

  for (const s of invSkus) {
    if (s.oos_pct > 0.03) { // >3% OOS
      flagged.push({
        name: (s.description || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 35),
        dpci: s.dpci,
        oos_pct: s.oos_pct,
        lost_dollar_week: s.lost_dollar_week,
        wos_current: s.wos_current,
        risk_flag: s.risk_flag,
      });
      totalLost += s.lost_dollar_week;
    }
  }

  flagged.sort((a, b) => b.lost_dollar_week - a.lost_dollar_week);
  return { skus: flagged, totalLost, oosCount: flagged.length };
}

// ─── Topline Performance ───────────────────────────────────────────────

export interface ToplinePerf {
  l1wSales: number;
  l1wUnits: number;
  l4wSales: number;
  l4wUnits: number;
  wowSales: number;
  wowUnits: number;
  growingCount: number;
  decliningCount: number;
  totalSkus: number;
  top5: { name: string; lw: number; wow: number }[];
  bottom5: { name: string; lw: number; wow: number }[];
}

export function calcToplinePerf(omniData: OmniData, avfSkus: AVFSku[]): ToplinePerf {
  const wt = omniData.weekly_totals;
  const lw = wt[wt.length - 1] || { units: 0, sales: 0 };
  const llw = wt[wt.length - 2] || { units: 0, sales: 0 };
  const l4w = wt.slice(-4);

  // SKU-level WoW from Omni data
  const weeks = omniData.weeks;
  const lwKey = weeks[weeks.length - 1];
  const llwKey = weeks[weeks.length - 2];
  const skuPerf: { name: string; lw: number; wow: number }[] = [];

  for (const [, sku] of Object.entries(omniData.skus)) {
    const lwU = sku.weeks[lwKey]?.units ?? 0;
    const llwU = sku.weeks[llwKey]?.units ?? 0;
    const wow = llwU > 0 ? (lwU - llwU) / llwU : 0;
    skuPerf.push({ name: sku.name, lw: lwU, wow });
  }

  const growing = skuPerf.filter(s => s.wow > 0.01);
  const declining = skuPerf.filter(s => s.wow < -0.01);
  const sorted = [...skuPerf].sort((a, b) => b.wow - a.wow);

  return {
    l1wSales: lw.sales,
    l1wUnits: lw.units,
    l4wSales: l4w.reduce((a, w) => a + w.sales, 0),
    l4wUnits: l4w.reduce((a, w) => a + w.units, 0),
    wowSales: llw.sales > 0 ? (lw.sales - llw.sales) / llw.sales : 0,
    wowUnits: llw.units > 0 ? (lw.units - llw.units) / llw.units : 0,
    growingCount: growing.length,
    decliningCount: declining.length,
    totalSkus: skuPerf.length,
    top5: sorted.slice(0, 5),
    bottom5: sorted.slice(-5).reverse(),
  };
}

// ─── POS vs Orders Alignment ───────────────────────────────────────────

export interface POSvsOrderRow {
  name: string;
  dpci: string;
  category: string;
  posUnits: number;
  orderedUnits: number;
  delta: number;
  deltaPct: number;
  flag: 'stockout_risk' | 'excess_risk' | 'aligned';
}

export function calcPOSvsOrders(
  avfSkus: AVFSku[], shipSkus: ShipSku[], dpSkus: DPSku[],
): POSvsOrderRow[] {
  const rows: POSvsOrderRow[] = [];

  for (const avf of avfSkus) {
    // L4W POS units
    const posUnits = Math.round(avf.l4w_avg_units * 4);

    // L4W ordered: find in ship by dpci, sum last 4 actual (non-forecast) week columns × upc
    const ship = shipSkus.find(s => s.dpci === avf.dpci);
    const dp = dpSkus.find(s => s.dpci === avf.dpci);
    const upc = ship?.units_per_case ?? dp?.ucase ?? 1;

    let orderedCases = 0;
    if (ship) {
      // Sum the last 4 weeks of actual PO cases (non-forecast weeks)
      const actualWeeks = Object.entries(ship.weeks).filter(
        ([k, v]) => !ship.fcast_weeks[k] && !k.includes('wk') && !k.includes('Gap') && !k.includes('Coverage') && typeof v === 'number',
      );
      const recent4 = actualWeeks.slice(-4);
      orderedCases = recent4.reduce((a, [, v]) => a + (v as number), 0);
    }
    const orderedUnits = orderedCases * upc;

    const delta = orderedUnits - posUnits;
    const deltaPct = posUnits > 0 ? delta / posUnits : 0;

    let flag: POSvsOrderRow['flag'] = 'aligned';
    if (deltaPct < -0.20) flag = 'stockout_risk';
    else if (deltaPct > 0.30) flag = 'excess_risk';

    rows.push({
      name: avf.name.replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 30),
      dpci: avf.dpci,
      category: avf.category,
      posUnits,
      orderedUnits,
      delta,
      deltaPct,
      flag,
    });
  }

  // Sort: stockout risks first, then excess, then aligned
  const flagOrder = { stockout_risk: 0, excess_risk: 1, aligned: 2 };
  rows.sort((a, b) => flagOrder[a.flag] - flagOrder[b.flag] || a.deltaPct - b.deltaPct);
  return rows;
}

// ─── SKU Segmentation (2×2 matrix) ────────────────────────────────────

export interface SkuSegment {
  name: string;
  dpci: string;
  velocity: number;
  ordering: number;
}

export interface SkuSegmentation {
  heroes: SkuSegment[];   // high velocity + high orders
  risk: SkuSegment[];     // high velocity + low orders
  excess: SkuSegment[];   // low velocity + high orders
  tail: SkuSegment[];     // low velocity + low orders
}

export function calcSkuSegmentation(avfSkus: AVFSku[], shipSkus: ShipSku[]): SkuSegmentation {
  // Compute velocity and ordering metrics per SKU
  const metrics: { name: string; dpci: string; velocity: number; ordering: number }[] = [];

  for (const avf of avfSkus) {
    const velocity = avf.lw_upspw;
    const ship = shipSkus.find(s => s.dpci === avf.dpci);
    let recentCases = 0;
    if (ship) {
      const actualWeeks = Object.entries(ship.weeks).filter(
        ([k, v]) => !ship.fcast_weeks[k] && !k.includes('wk') && !k.includes('Gap') && !k.includes('Coverage') && typeof v === 'number',
      );
      recentCases = actualWeeks.slice(-4).reduce((a, [, v]) => a + (v as number), 0);
    }
    metrics.push({
      name: avf.name.replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 30),
      dpci: avf.dpci,
      velocity,
      ordering: recentCases,
    });
  }

  // Find medians for segmentation thresholds
  const velSorted = [...metrics].sort((a, b) => a.velocity - b.velocity);
  const ordSorted = [...metrics].sort((a, b) => a.ordering - b.ordering);
  const medVel = velSorted[Math.floor(velSorted.length / 2)]?.velocity ?? 0;
  const medOrd = ordSorted[Math.floor(ordSorted.length / 2)]?.ordering ?? 0;

  const seg: SkuSegmentation = { heroes: [], risk: [], excess: [], tail: [] };

  for (const m of metrics) {
    const highVel = m.velocity >= medVel;
    const highOrd = m.ordering >= medOrd;
    if (highVel && highOrd) seg.heroes.push(m);
    else if (highVel && !highOrd) seg.risk.push(m);
    else if (!highVel && highOrd) seg.excess.push(m);
    else seg.tail.push(m);
  }

  return seg;
}

// ─── Trend Data for Chart Overlay ──────────────────────────────────────

export function calcTrendData(omniData: OmniData, shipSkus: ShipSku[]) {
  // POS trend: weekly totals from Omni
  const posWeeks = omniData.weekly_totals.map(w => ({
    label: w.week.replace(/,?\s*\d{4}/, '').trim(),
    units: w.units,
    sales: w.sales,
  }));

  // Orders trend: sum ship cases × blended UPC per week
  const weekLabels = omniData.weeks;
  const orderWeeks = weekLabels.map(wk => {
    // Map omni week label to ship week label format
    const d = new Date(wk);
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const yr = String(d.getFullYear()).slice(2);
    const shipKey = `${mo}/${day} '${yr}`;

    let totalUnits = 0;
    for (const s of shipSkus) {
      const cases = s.weeks[shipKey];
      if (typeof cases === 'number' && !s.fcast_weeks[shipKey]) {
        totalUnits += cases * (s.units_per_case || 1);
      }
    }
    return { label: wk.replace(/,?\s*\d{4}/, '').trim(), units: totalUnits };
  });

  return { posWeeks, orderWeeks };
}
