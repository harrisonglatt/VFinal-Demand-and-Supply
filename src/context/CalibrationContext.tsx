'use client';

// ─── CalibrationContext ───────────────────────────────────────────────
// Auto-calibration layer that learns from backtest errors and applies
// forecast corrections. When the model detects systematic bias, it
// auto-adjusts forecasts and flags what changed.
//
// This is the "self-improving" layer:
//   Backtest → Detect Bias → Compute Correction → Apply to Forecast → Flag
//
// Consumers call getCalibrationFactor(dpci, category) to get the
// multiplier that should be applied to the raw forecast.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import backtestJson from '@/data/json/backtest.json';
import accuracyJson from '@/data/json/accuracy.json';

interface CalibrationFactor {
  dpci: string;
  name: string;
  category: string;
  factor: number;           // Multiplier to apply (e.g., 0.92 = reduce by 8%)
  reason: string;           // Human-readable explanation
  source: 'sku_bias' | 'category_bias' | 'promo_bias' | 'none';
  magnitude: 'large' | 'small' | 'none';
  applied: boolean;
}

interface CalibrationContextValue {
  factors: CalibrationFactor[];
  autoCalibrate: boolean;
  setAutoCalibrate: (v: boolean) => void;
  getCalibrationFactor: (dpci: string, category: string) => number;
  adjustmentCount: number;
  totalImpactPct: number;
}

const CalibrationCtx = createContext<CalibrationContextValue | null>(null);

function computeCalibrationFactors(): CalibrationFactor[] {
  const factors: CalibrationFactor[] = [];
  const bt = backtestJson as any;
  const acc = accuracyJson as any;

  // For each SKU, compute a correction factor from bias data
  for (const sku of (bt.skus || [])) {
    const accSku = (acc.skus || []).find((s: any) => s.dpci === sku.dpci);
    if (!accSku) continue;

    const biasBase = sku.bias_base ?? 0;    // Negative = under-forecast, Positive = over-forecast
    const biasPromo = sku.bias_promo ?? 0;
    const mape = accSku.mape_l4w ?? 0;

    // Weighted blend of base and promo bias
    const nBase = sku.n_obs_base ?? 0;
    const nPromo = sku.n_obs_promo ?? 0;
    const totalObs = nBase + nPromo;
    const weightedBias = totalObs > 0 ? (biasBase * nBase + biasPromo * nPromo) / totalObs : 0;

    // Only apply correction if bias is significant (>3%) and we have enough data
    if (Math.abs(weightedBias) < 3 || totalObs < 4) {
      factors.push({
        dpci: sku.dpci, name: accSku.name?.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 30) ?? sku.dpci,
        category: accSku.category ?? '', factor: 1.0,
        reason: 'No significant bias detected', source: 'none', magnitude: 'none', applied: false,
      });
      continue;
    }

    // Correction: if we over-forecast by +8%, reduce by ~6% (conservative — don't fully correct)
    // Apply 75% of the detected bias as correction (avoid over-correction)
    const correctionPct = -weightedBias * 0.75;
    const factor = 1 + correctionPct / 100;

    const magnitude = Math.abs(correctionPct) > 5 ? 'large' : 'small';
    const direction = correctionPct > 0 ? 'increased' : 'reduced';

    factors.push({
      dpci: sku.dpci,
      name: accSku.name?.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 30) ?? sku.dpci,
      category: accSku.category ?? '',
      factor: Math.round(factor * 1000) / 1000,
      reason: `Forecast ${direction} by ${Math.abs(correctionPct).toFixed(1)}% — detected ${weightedBias > 0 ? 'over' : 'under'}-forecasting bias of ${Math.abs(weightedBias).toFixed(1)}% across ${totalObs} observations. Conservative 75% correction applied.`,
      source: 'sku_bias',
      magnitude,
      applied: true,
    });
  }

  return factors;
}

export function CalibrationProvider({ children }: { children: ReactNode }) {
  const [autoCalibrate, setAutoCalibrate] = useState(true);

  const factors = useMemo(() => computeCalibrationFactors(), []);

  const activeFactors = factors.filter(f => f.applied && f.factor !== 1.0);
  const adjustmentCount = activeFactors.length;
  const totalImpactPct = activeFactors.length > 0
    ? Math.round(activeFactors.reduce((a, f) => a + Math.abs(f.factor - 1) * 100, 0) / activeFactors.length * 10) / 10
    : 0;

  const getCalibrationFactor = useMemo(() => {
    const byDpci: Record<string, number> = {};
    const byCat: Record<string, number[]> = {};

    for (const f of factors) {
      if (f.applied && f.factor !== 1.0) {
        byDpci[f.dpci] = f.factor;
        if (!byCat[f.category]) byCat[f.category] = [];
        byCat[f.category].push(f.factor);
      }
    }

    // Category average fallback
    const catAvg: Record<string, number> = {};
    for (const [cat, vals] of Object.entries(byCat)) {
      catAvg[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    return (dpci: string, category: string): number => {
      if (!autoCalibrate) return 1.0;
      // SKU-level first, then category fallback
      if (byDpci[dpci]) return byDpci[dpci];
      if (catAvg[category]) return catAvg[category];
      return 1.0;
    };
  }, [factors, autoCalibrate]);

  const value = useMemo(() => ({
    factors, autoCalibrate, setAutoCalibrate, getCalibrationFactor, adjustmentCount, totalImpactPct,
  }), [factors, autoCalibrate, getCalibrationFactor, adjustmentCount, totalImpactPct]);

  return <CalibrationCtx.Provider value={value}>{children}</CalibrationCtx.Provider>;
}

export function useCalibration(): CalibrationContextValue {
  const ctx = useContext(CalibrationCtx);
  if (!ctx) throw new Error('useCalibration must be used within <CalibrationProvider>');
  return ctx;
}
