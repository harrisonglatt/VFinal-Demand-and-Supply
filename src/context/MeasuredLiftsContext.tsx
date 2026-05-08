'use client';

// ─── MeasuredLiftsContext ──────────────────────────────────────────────
// Bridge between Promo Intel iframe (/promo-tracker) and PromoContext.
//
// Flow:
//   1. User clicks "Sync to Demand Plan" on /promo-tracker
//   2. Host page postMessages 'ls:promo-intel:request-sync' to iframe
//   3. Iframe replies with computed type × dp-category lifts
//   4. This context receives the response, validates, and persists to localStorage
//   5. PromoContext.computeLift consults getMeasuredLift() before LIFT_MATRIX
//   6. Demand Plan, Shipments, Supply Planning automatically pick up new lifts
//
// Opt-in by design: forecast numbers don't shift until the user explicitly syncs.

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
  type ReactNode,
} from 'react';

// ─── Types ──────────────────────────────────────────────────────────────

export interface MeasuredLift {
  type: string;          // 'TPC' | 'Co-space' | 'DWA' | 'Circle' | 'BOGO' | 'Circle + Co-space'
  category: string;      // PromoContext DP category (e.g. 'Smoothies', 'Frozen Multiserve')
  liftPct: number;       // measured lift, integer percent
  n: number;             // sample count (sku-week observations)
  incSales: number;      // total incremental dollars in sample
  baseSales: number;     // total baseline dollars in sample
}

export interface MeasuredLiftsState {
  /** keyed by `${type}|${category}` */
  lifts: Record<string, MeasuredLift>;
  syncedAt: string | null;       // ISO
  weekRange: string | null;       // "2025-07-14 to 2026-04-13"
  weeksCovered: number;
  sampleCount: number;            // total rows aggregated
  categoryCount: number;          // measured combos
  source: string;                 // 'tracker' | etc.
}

const STORAGE_KEY = 'ls.measuredLifts.v1';

const initialState: MeasuredLiftsState = {
  lifts: {},
  syncedAt: null,
  weekRange: null,
  weeksCovered: 0,
  sampleCount: 0,
  categoryCount: 0,
  source: '',
};

// ─── Context ────────────────────────────────────────────────────────────

interface Ctx {
  state: MeasuredLiftsState;
  /** Returns a measured lift% for a (type, dpCategory) pair, or null if not measured. */
  getMeasuredLift: (type: string, dpCategory: string) => MeasuredLift | null;
  /** Replace state with a new sync payload from the iframe. */
  setFromBridge: (payload: BridgePayload) => void;
  /** Drop all measured lifts — demand plan reverts to LIFT_MATRIX. */
  clear: () => void;
  /** True if at least one measured lift has been synced. */
  hasMeasured: boolean;
}

interface BridgePayload {
  measuredLifts: Record<string, MeasuredLift>;
  sampleCount: number;
  categoryCount: number;
  weeksCovered: number;
  weekRange: string | null;
  syncedAt: string;
  error?: string;
}

const MeasuredCtx = createContext<Ctx | null>(null);

export function MeasuredLiftsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeasuredLiftsState>(initialState);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MeasuredLiftsState;
        if (parsed && typeof parsed === 'object' && parsed.lifts) {
          setState(parsed);
        }
      }
    } catch {
      // ignore corrupt state
    }
  }, []);

  // Persist on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  const setFromBridge = useCallback((payload: BridgePayload) => {
    if (payload.error || !payload.measuredLifts) return;
    setState({
      lifts: payload.measuredLifts,
      syncedAt: payload.syncedAt,
      weekRange: payload.weekRange,
      weeksCovered: payload.weeksCovered ?? 0,
      sampleCount: payload.sampleCount ?? 0,
      categoryCount: payload.categoryCount ?? Object.keys(payload.measuredLifts).length,
      source: 'tracker',
    });
  }, []);

  const clear = useCallback(() => setState(initialState), []);

  const getMeasuredLift = useCallback(
    (type: string, dpCategory: string): MeasuredLift | null => {
      return state.lifts[`${type}|${dpCategory}`] ?? null;
    },
    [state.lifts]
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      getMeasuredLift,
      setFromBridge,
      clear,
      hasMeasured: Object.keys(state.lifts).length > 0,
    }),
    [state, getMeasuredLift, setFromBridge, clear]
  );

  return <MeasuredCtx.Provider value={value}>{children}</MeasuredCtx.Provider>;
}

export function useMeasuredLifts(): Ctx {
  const c = useContext(MeasuredCtx);
  if (!c) throw new Error('useMeasuredLifts must be used inside <MeasuredLiftsProvider>');
  return c;
}

// ─── Standalone read helper (for use outside React tree) ───────────────
// PromoContext is wrapped INSIDE MeasuredLiftsProvider so it can use the hook.
// This helper reads the same localStorage key so server-rendered code or
// non-React consumers can still query measured lifts.
export function readMeasuredLiftsFromStorage(): MeasuredLiftsState {
  if (typeof window === 'undefined') return initialState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as MeasuredLiftsState;
    if (parsed && typeof parsed === 'object' && parsed.lifts) return parsed;
  } catch {
    // ignore
  }
  return initialState;
}
