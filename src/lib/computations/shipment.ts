// ─── Shipment Plan Computations ──────────────────────────────────────
// Translates demand forecast → rolling 52-week shipment plan (cases),
// grounded in historical ordering behavior from ship.json.

import type { ShipSku, DPSku } from '@/data/types';

// ─── Historical Shipment Behavior ──────────────────────────────────

export interface ShipmentBehavior {
  dpci: string;
  name: string;
  category: string;
  upc: number;
  totalHistCases: number;
  weekCount: number;         // weeks with any shipment
  totalWeeks: number;        // total historical weeks
  avgWeeklyCases: number;    // mean of all weeks (including zeros)
  avgShipmentSize: number;   // mean of NON-ZERO weeks
  shipmentCadence: number;   // % of weeks with activity (0-1)
  variability: number;       // CV of weekly shipments
  cadenceLabel: string;      // "Weekly" | "Bi-Weekly" | "Monthly" | "Irregular"
}

export function calcShipmentBehavior(shipSkus: ShipSku[]): ShipmentBehavior[] {
  const results: ShipmentBehavior[] = [];

  for (const s of shipSkus) {
    // Extract actual (non-forecast) weekly cases
    const weeklyCases: number[] = [];
    for (const [key, val] of Object.entries(s.weeks)) {
      if (!s.fcast_weeks[key] && !key.includes('wk') && !key.includes('Gap') && !key.includes('Coverage') && typeof val === 'number') {
        weeklyCases.push(val);
      }
    }

    if (weeklyCases.length === 0) continue;

    const nonZero = weeklyCases.filter(v => v > 0);
    const totalHist = weeklyCases.reduce((a, b) => a + b, 0);
    const avgAll = totalHist / weeklyCases.length;
    const avgNonZero = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    const cadence = nonZero.length / weeklyCases.length;

    // CV (coefficient of variation)
    let cv = 0;
    if (nonZero.length >= 2 && avgNonZero > 0) {
      const variance = nonZero.reduce((a, b) => a + (b - avgNonZero) ** 2, 0) / nonZero.length;
      cv = Math.sqrt(variance) / avgNonZero;
    }

    // Cadence label
    let cadenceLabel = 'Weekly';
    if (cadence < 0.35) cadenceLabel = 'Monthly';
    else if (cadence < 0.65) cadenceLabel = 'Bi-Weekly';
    else if (cadence < 0.85) cadenceLabel = 'Irregular';

    results.push({
      dpci: s.dpci,
      name: s.description.replace('Little Spoon ', '').replace(/,\s+[\d.]+\s+oz.*/i, ''),
      category: s.category,
      upc: s.units_per_case,
      totalHistCases: totalHist,
      weekCount: nonZero.length,
      totalWeeks: weeklyCases.length,
      avgWeeklyCases: Math.round(avgAll),
      avgShipmentSize: Math.round(avgNonZero),
      shipmentCadence: Math.round(cadence * 100) / 100,
      variability: Math.round(cv * 100) / 100,
      cadenceLabel,
    });
  }

  return results;
}

// ─── 52-Week Shipment Plan ─────────────────────────────────────────

export interface ShipmentPlanRow {
  dpci: string;
  name: string;
  category: string;
  upc: number;
  behavior: ShipmentBehavior;
  weeklyPlan: number[];        // 52 weeks of planned shipment cases
  weeklyFcastCases: number[];  // 52 weeks of forecast demand in cases
  total52: number;
  avgWeekly: number;
  next4Total: number;
  riskWeeks: number;           // count of weeks with shipment < 80% of forecast
}

export function buildShipmentPlan(
  dpSkus: DPSku[],
  behaviors: ShipmentBehavior[],
  fcastWeeks: string[],
  getLift?: (weekIdx: number, category: string) => number,
): ShipmentPlanRow[] {
  const rows: ShipmentPlanRow[] = [];

  for (const dp of dpSkus) {
    const beh = behaviors.find(b => b.dpci === dp.dpci);
    if (!beh) continue;

    // Prefer ship.json units_per_case (beh.upc) over dp.json ucase (often placeholder 12)
    const upc = beh.upc || dp.ucase || 1;
    const weeklyPlan: number[] = [];
    const weeklyFcastCases: number[] = [];

    for (let w = 0; w < 52; w++) {
      const fcastUnits = dp.fcast[w] ?? 0;
      const lift = getLift ? getLift(w, dp.category) : 0;
      const fcastCases = Math.ceil(fcastUnits * (1 + lift / 100) / upc);
      weeklyFcastCases.push(fcastCases);

      // Apply historical cadence pattern
      let planned = fcastCases;

      if (beh.cadenceLabel === 'Bi-Weekly') {
        // Consolidate into every-other-week shipments
        if (w % 2 === 0) {
          const nextWeekFcast = w + 1 < 52 ? Math.ceil((dp.fcast[w + 1] ?? 0) / upc) : 0;
          planned = fcastCases + nextWeekFcast;
        } else {
          planned = 0;
        }
      } else if (beh.cadenceLabel === 'Monthly') {
        // Consolidate into monthly shipments (every 4 weeks)
        if (w % 4 === 0) {
          let monthTotal = 0;
          for (let i = 0; i < 4 && w + i < 52; i++) {
            monthTotal += Math.ceil((dp.fcast[w + i] ?? 0) / upc);
          }
          planned = monthTotal;
        } else {
          planned = 0;
        }
      }

      weeklyPlan.push(planned);
    }

    const total52 = weeklyPlan.reduce((a, b) => a + b, 0);
    const avgWeekly = Math.round(total52 / 52);
    const next4Total = weeklyPlan.slice(0, 4).reduce((a, b) => a + b, 0);

    // Count risk weeks: planned shipment < 80% of forecast demand
    let riskWeeks = 0;
    for (let w = 0; w < 52; w++) {
      if (weeklyFcastCases[w] > 0 && weeklyPlan[w] < weeklyFcastCases[w] * 0.8) {
        riskWeeks++;
      }
    }

    rows.push({
      dpci: dp.dpci,
      name: beh.name,
      category: dp.category,
      upc,
      behavior: beh,
      weeklyPlan,
      weeklyFcastCases,
      total52,
      avgWeekly,
      next4Total,
      riskWeeks,
    });
  }

  // Sort by total cases descending
  rows.sort((a, b) => b.total52 - a.total52);
  return rows;
}

// ─── Risk Detection ────────────────────────────────────────────────

export interface ShipmentRisk {
  type: 'spike' | 'gap' | 'volatile';
  week: number;
  weekLabel: string;
  skuName: string;
  detail: string;
}

export function detectShipmentRisks(
  plan: ShipmentPlanRow[],
  fcastWeeks: string[],
): ShipmentRisk[] {
  const risks: ShipmentRisk[] = [];

  for (const row of plan) {
    // Volatile SKU
    if (row.behavior.variability > 0.5) {
      risks.push({
        type: 'volatile',
        week: -1,
        weekLabel: '',
        skuName: row.name,
        detail: `High variability (CV: ${row.behavior.variability.toFixed(2)}) — shipment patterns are lumpy. Consider smoothing.`,
      });
    }

    // Week-level risks
    for (let w = 0; w < Math.min(13, fcastWeeks.length); w++) {
      const planned = row.weeklyPlan[w];
      const fcast = row.weeklyFcastCases[w];
      const avg = row.behavior.avgShipmentSize;

      // Spike: planned > 1.5x historical average
      if (planned > avg * 1.5 && avg > 0) {
        risks.push({
          type: 'spike',
          week: w,
          weekLabel: fcastWeeks[w] || `Wk ${w + 1}`,
          skuName: row.name,
          detail: `${planned} cases planned vs ${avg} avg — ${((planned / avg - 1) * 100).toFixed(0)}% above normal.`,
        });
      }

      // Gap: forecast demand but no planned shipment
      if (fcast > 0 && planned === 0) {
        risks.push({
          type: 'gap',
          week: w,
          weekLabel: fcastWeeks[w] || `Wk ${w + 1}`,
          skuName: row.name,
          detail: `No shipment planned but ${fcast} cases forecasted — replenishment gap.`,
        });
      }
    }
  }

  // Sort: gaps first, then spikes, then volatile
  const order = { gap: 0, spike: 1, volatile: 2 };
  risks.sort((a, b) => order[a.type] - order[b.type]);
  return risks.slice(0, 20); // Top 20 risks
}
