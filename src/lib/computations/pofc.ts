// ─── PO Forecast Computations ───────────────────────────────────────────
// Pure functions extracted from pages/po-forecast.js for reuse in React components.

import type { POFCSku, POFCData } from '../../data/types';
import { sf } from '../formatters';

// ─── UPC Override Helper ────────────────────────────────────────────────

/**
 * Get the effective UPC for a POFC SKU, applying any override.
 * Returns the override value if present, otherwise the SKU's own upc.
 */
export function effectiveUpc(
  sku: POFCSku,
  upcOverrides: Record<string, number>
): number {
  return upcOverrides[sku.dpci] ?? sku.upc;
}

/**
 * Compute the UPC scaling factor for a SKU.
 * When UPC is overridden to a different value, cases must be rescaled.
 */
export function upcScale(
  sku: POFCSku,
  upcOverrides: Record<string, number>
): number {
  const effUpc = effectiveUpc(sku, upcOverrides);
  return effUpc > 0 ? sku.upc / effUpc : 1;
}

// ─── KPI Aggregation ────────────────────────────────────────────────────

export interface POFCKPIs {
  planTotal: number;
  ratioTotal: number;
  covTotal: number;
  gapRatio: number;
  gapCov: number;
}

/**
 * Compute POFC KPI totals, applying UPC overrides to ratio and coverage models.
 */
export function computePOFCKPIs(
  data: POFCData,
  upcOverrides: Record<string, number> = {}
): POFCKPIs {
  const planTotal = data.totals.plan;
  let ratioTotal = 0;
  let covTotal = 0;

  data.skus.forEach((s) => {
    const sc = upcScale(s, upcOverrides);
    ratioTotal += Math.round(s.ratio_total_cases * sc);
    covTotal += Math.round(s.cov_total_cases * sc);
  });

  return {
    planTotal,
    ratioTotal,
    covTotal,
    gapRatio: ratioTotal - planTotal,
    gapCov: covTotal - planTotal,
  };
}

// ─── SKU-Level Table Data ───────────────────────────────────────────────

export interface POFCSkuRow {
  dpci: string;
  name: string;
  cat: string;
  effectiveUpc: number;
  originalUpc: number;
  upcOverridden: boolean;
  planCases: number;
  ratioCases: number;
  covCases: number;
  deltaRatio: number;
  deltaCov: number;
  pctRatio: number;
  pctCov: number;
  osRatio: number;
  signal: string;
}

/**
 * Compute SKU-level POFC table rows with plan gaps and signals.
 */
export function computePOFCSkuRows(
  skus: POFCSku[],
  upcOverrides: Record<string, number> = {},
  catFilter?: string,
  searchQuery?: string
): POFCSkuRow[] {
  return skus
    .filter((s) => {
      if (catFilter && s.cat !== catFilter) return false;
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    })
    .map((s) => {
      const effUpc = effectiveUpc(s, upcOverrides);
      const sc = upcScale(s, upcOverrides);
      const ratioCases = Math.round(s.ratio_total_cases * sc);
      const covCases = Math.round(s.cov_total_cases * sc);
      const deltaRatio = ratioCases - s.plan_total_cases;
      const deltaCov = covCases - s.plan_total_cases;
      const pctRatio =
        s.plan_total_cases > 0 ? deltaRatio / s.plan_total_cases : 0;
      const pctCov =
        s.plan_total_cases > 0 ? deltaCov / s.plan_total_cases : 0;

      let signal: string;
      if (!ratioCases) {
        signal = '\u2014';
      } else if (pctRatio >= 0.25) {
        signal = 'Under-planned';
      } else if (pctRatio <= -0.25) {
        signal = 'Over-planned';
      } else {
        signal = 'On track';
      }

      return {
        dpci: s.dpci,
        name: s.name,
        cat: s.cat,
        effectiveUpc: effUpc,
        originalUpc: s.upc,
        upcOverridden: upcOverrides[s.dpci] !== undefined,
        planCases: s.plan_total_cases,
        ratioCases,
        covCases,
        deltaRatio,
        deltaCov,
        pctRatio,
        pctCov,
        osRatio: s.os_ratio,
        signal,
      };
    });
}

// ─── Week-by-Week Model Data ────────────────────────────────────────────

export type POFCModel = 'plan' | 'ratio' | 'cov';

/**
 * Get the week-by-week data key for the selected POFC model.
 */
export function modelWeekKey(model: POFCModel): keyof POFCSku {
  switch (model) {
    case 'plan':
      return 'plan_by_week';
    case 'ratio':
      return 'ratio_by_week';
    case 'cov':
      return 'cov_by_week';
  }
}

export interface POFCWeekByWeekRow {
  dpci: string;
  name: string;
  cat: string;
  effectiveUpc: number;
  upcOverridden: boolean;
  /** 13 weekly case values for the selected model */
  weekValues: number[];
  /** For plan model: ratio projections for open weeks */
  ratioValues: number[];
  /** For plan model: coverage projections for open weeks */
  covValues: number[];
  total: number;
}

/**
 * Compute week-by-week POFC data for the selected model.
 */
export function computeWeekByWeek(
  skus: POFCSku[],
  model: POFCModel,
  upcOverrides: Record<string, number> = {}
): POFCWeekByWeekRow[] {
  const mk = modelWeekKey(model);

  return skus.map((s) => {
    const effUpc = effectiveUpc(s, upcOverrides);
    const sc = upcScale(s, upcOverrides);
    const rawVals = (s[mk] as number[]) || Array(13).fill(0);
    const weekValues = rawVals.map((v) => Math.round(v * sc));
    const total = weekValues.reduce((a, b) => a + b, 0);

    return {
      dpci: s.dpci,
      name: s.name,
      cat: s.cat,
      effectiveUpc: effUpc,
      upcOverridden: upcOverrides[s.dpci] !== undefined,
      weekValues,
      ratioValues:
        model === 'plan'
          ? s.ratio_by_week.map((v) => Math.round(v * sc))
          : [],
      covValues:
        model === 'plan'
          ? s.cov_by_week.map((v) => Math.round(v * sc))
          : [],
      total,
    };
  });
}

// ─── Weekly Totals ──────────────────────────────────────────────────────

export interface POFCWeeklyTotals {
  /** 13 weekly totals for the selected model */
  totals: number[];
  /** For plan model: ratio totals per week */
  ratioTotals: number[];
  /** For plan model: coverage totals per week */
  covTotals: number[];
  grandTotal: number;
}

/**
 * Aggregate weekly totals across all SKUs for the selected model.
 */
export function computeWeeklyTotals(
  skus: POFCSku[],
  model: POFCModel,
  upcOverrides: Record<string, number> = {}
): POFCWeeklyTotals {
  const mk = modelWeekKey(model);
  const totals = Array(13).fill(0) as number[];
  const ratioTotals = Array(13).fill(0) as number[];
  const covTotals = Array(13).fill(0) as number[];

  skus.forEach((s) => {
    const sc = upcScale(s, upcOverrides);
    const vals = (s[mk] as number[]) || [];
    vals.forEach((v, i) => {
      totals[i] += Math.round(v * sc);
    });
    if (model === 'plan') {
      s.ratio_by_week.forEach((v, i) => {
        ratioTotals[i] += Math.round(v * sc);
      });
      s.cov_by_week.forEach((v, i) => {
        covTotals[i] += Math.round(v * sc);
      });
    }
  });

  return {
    totals,
    ratioTotals,
    covTotals,
    grandTotal: totals.reduce((a, b) => a + b, 0),
  };
}

// ─── Monthly Pace Computation ───────────────────────────────────────────

export interface MonthBucket {
  label: string;
  short: string;
  wkIdxs: number[];
  color: string;
  fcUnits: number;
  fcRev: number;
}

/**
 * Compute monthly forecast buckets from DP data.
 * The month definitions match the 13-week forward calendar structure.
 */
export function computeMonthlyBuckets(
  skus: { fcast: number[]; price?: number }[],
  fcastWeeks: string[]
): MonthBucket[] {
  const months: MonthBucket[] = [
    { label: 'March (CW)', short: 'Mar', wkIdxs: [0], color: 'rgba(99,102,241,.7)', fcUnits: 0, fcRev: 0 },
    { label: 'April', short: 'Apr', wkIdxs: [1, 2, 3, 4, 5], color: 'rgba(255,199,17,.7)', fcUnits: 0, fcRev: 0 },
    { label: 'May', short: 'May', wkIdxs: [6, 7, 8, 9, 10], color: 'rgba(0,207,146,.7)', fcUnits: 0, fcRev: 0 },
    { label: 'June (partial)', short: 'Jun', wkIdxs: [11, 12], color: 'rgba(168,85,247,.7)', fcUnits: 0, fcRev: 0 },
  ];

  months.forEach((m) => {
    m.fcUnits = m.wkIdxs.reduce(
      (sum, i) => sum + skus.reduce((a, s) => a + sf(s.fcast[i]), 0),
      0
    );
    m.fcRev = m.wkIdxs.reduce(
      (sum, i) =>
        sum + skus.reduce((a, s) => a + sf(s.fcast[i]) * (s.price || 0), 0),
      0
    );
  });

  return months;
}
