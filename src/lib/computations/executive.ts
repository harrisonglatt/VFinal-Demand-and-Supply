// ─── Executive Summary Computations ─────────────────────────────────────
// Pure functions extracted from pages/executive.js for reuse in React components.

import type { DPSku, ScenarioBands, ScenarioKey } from '../../data/types';

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
