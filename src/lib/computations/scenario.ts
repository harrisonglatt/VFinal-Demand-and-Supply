// ─── Scenario Analysis Computations ─────────────────────────────────────
// Pure functions extracted from pages/scenario.js for reuse in React components.

import type { DPSku, ScenarioKey, FcastRev52Wk } from '../../data/types';
import { calcCV } from './executive';
import { sf } from '../formatters';

// ─── Constants ──────────────────────────────────────────────────────────

export const SC_MULT: Record<ScenarioKey, number> = {
  bear: 0.80,
  base: 1.00,
  bull: 1.20,
};

export const SC_COL: Record<ScenarioKey, string> = {
  bear: '#ef4444',
  base: '#00E3CD',
  bull: '#00CF92',
};

// ─── 52-Week Scenario Projection ────────────────────────────────────────

export interface ScenarioProjection {
  /** Weekly unit arrays (52 values each) */
  bearU: number[];
  baseU: number[];
  bullU: number[];
  curU: number[];

  /** Weekly revenue arrays (52 values each) */
  bearR: number[];
  baseR: number[];
  bullR: number[];
  curR: number[];

  /** Totals */
  totRBear: number;
  totR: number;
  totRBull: number;
  totRC: number;
  totUBear: number;
  totU: number;
  totUBull: number;
  totUC: number;

  /** Peak week */
  peakR: number;
  peakWk: string;
}

/**
 * Compute 52-week scenario projections for units and revenue.
 */
export function computeScenarioProjection(
  skus: DPSku[],
  fcastWeeks: string[],
  fcastRev52wk: FcastRev52Wk,
  scenario: ScenarioKey
): ScenarioProjection {
  const m = SC_MULT[scenario];

  const baseU = fcastWeeks.map((_, i) =>
    skus.reduce((a, s) => a + sf(s.fcast[i]), 0)
  );
  const bearU = baseU.map((v) => Math.round(v * 0.80));
  const bullU = baseU.map((v) => Math.round(v * 1.20));
  const curU = baseU.map((v) => Math.round(v * m));

  const bearR = fcastRev52wk.map((v) => v * 0.80);
  const baseR = [...fcastRev52wk];
  const bullR = fcastRev52wk.map((v) => v * 1.20);
  const curR = fcastRev52wk.map((v) => v * m);

  const totRBear = bearR.reduce((a, b) => a + b, 0);
  const totR = baseR.reduce((a, b) => a + b, 0);
  const totRBull = bullR.reduce((a, b) => a + b, 0);
  const totRC = curR.reduce((a, b) => a + b, 0);

  const totUBear = bearU.reduce((a, b) => a + b, 0);
  const totU = baseU.reduce((a, b) => a + b, 0);
  const totUBull = bullU.reduce((a, b) => a + b, 0);
  const totUC = curU.reduce((a, b) => a + b, 0);

  const peakR = Math.max(...curR);
  const peakWk = fcastWeeks[curR.indexOf(peakR)] || '';

  return {
    bearU, baseU, bullU, curU,
    bearR, baseR, bullR, curR,
    totRBear, totR, totRBull, totRC,
    totUBear, totU, totUBull, totUC,
    peakR, peakWk,
  };
}

// ─── SKU-Level Scenario Breakdown ───────────────────────────────────────

export interface ScenarioSkuRow {
  name: string;
  category: string;
  dpci: string;
  bear: number;
  base: number;
  bull: number;
  range: number;
  cv: number;
}

export interface ScenarioCatAgg {
  bear: number;
  base: number;
  bull: number;
}

export interface ScenarioSkuBreakdown {
  rows: ScenarioSkuRow[];
  catAgg: Record<string, ScenarioCatAgg>;
  totBear: number;
  totBase: number;
  totBull: number;
}

/**
 * Compute SKU-level 13-week scenario breakdown with category aggregates.
 * Accepts optional velocity overrides and uses the velocity-for helper.
 */
export function computeSkuBreakdown(
  skus: DPSku[],
  velFor: (dpci: string) => number
): ScenarioSkuBreakdown {
  const rows: ScenarioSkuRow[] = [];
  const catAgg: Record<string, ScenarioCatAgg> = {};

  skus.forEach((s) => {
    const vel = velFor(s.dpci) || s.lw_upspw || 1;
    const origVel = s.lw_upspw || vel;
    const scale = origVel > 0 ? vel / origVel : 1;
    const f13 = s.fcast.slice(0, 13).reduce((a, b) => a + b, 0);
    const base = Math.round(f13 * scale);
    const bear = Math.round(base * 0.80);
    const bull = Math.round(base * 1.20);
    const cv = calcCV(s.hist);
    const cat = (s.category || 'Other').replace(' Multiserve', '');

    if (!catAgg[cat]) catAgg[cat] = { bear: 0, base: 0, bull: 0 };
    catAgg[cat].bear += bear;
    catAgg[cat].base += base;
    catAgg[cat].bull += bull;

    rows.push({
      name: (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 36),
      category: cat,
      dpci: s.dpci,
      bear,
      base,
      bull,
      range: bull - bear,
      cv,
    });
  });

  const totBear = Object.values(catAgg).reduce((a, v) => a + v.bear, 0);
  const totBase = Object.values(catAgg).reduce((a, v) => a + v.base, 0);
  const totBull = Object.values(catAgg).reduce((a, v) => a + v.bull, 0);

  return { rows, catAgg, totBear, totBase, totBull };
}

// Re-export calcCV for scenario page use
export { calcCV };
