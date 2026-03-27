'use client';

import { useMemo, useCallback } from 'react';
import { useOverridesContext, type OverridesState, type OverridesAction } from '@/context/OverridesContext';

interface UseOverridesReturn {
  state: OverridesState;
  dispatch: React.Dispatch<OverridesAction>;

  /** Return override velocity or the SKU's original lw_upspw */
  velFor: (sku: { dpci: string; lw_upspw?: number }) => number | undefined;

  /** Return override UPC or the SKU's original upc */
  upcFor: (sku: { dpci: string; upc?: number }) => number | undefined;

  /** Return override lift for a category + promo type, or null if none set */
  liftFor: (cat: string, type: string) => number | null;

  /** Total number of active overrides across all three stores */
  overrideCount: number;

  // ─── Helper dispatchers ─────────────────────────────────────────────────
  setVel: (dpci: string, value: number) => void;
  clearVel: (dpci: string) => void;
  setLift: (key: string, value: number) => void;
  clearLift: (key: string) => void;
  setUpc: (dpci: string, value: number) => void;
  clearUpc: (dpci: string) => void;
  resetAll: () => void;
}

export function useOverrides(): UseOverridesReturn {
  const { state, dispatch } = useOverridesContext();

  // ─── Accessor functions (mirror state.js logic) ───────────────────────
  const velFor = useCallback(
    (sku: { dpci: string; lw_upspw?: number }): number | undefined => {
      const override = state.velOverrides[sku.dpci];
      return override !== undefined ? override : sku.lw_upspw;
    },
    [state.velOverrides],
  );

  const upcFor = useCallback(
    (sku: { dpci: string; upc?: number }): number | undefined => {
      return state.upcOverrides[sku.dpci] || sku.upc;
    },
    [state.upcOverrides],
  );

  const liftFor = useCallback(
    (cat: string, type: string): number | null => {
      const k = `${cat}|${type}`;
      const v = state.liftOverrides[k];
      return v !== undefined ? v : null;
    },
    [state.liftOverrides],
  );

  // ─── Derived count ────────────────────────────────────────────────────
  const overrideCount = useMemo(
    () =>
      Object.keys(state.velOverrides).length +
      Object.keys(state.liftOverrides).length +
      Object.keys(state.upcOverrides).length,
    [state.velOverrides, state.liftOverrides, state.upcOverrides],
  );

  // ─── Helper dispatchers ───────────────────────────────────────────────
  const setVel = useCallback(
    (dpci: string, value: number) => dispatch({ type: 'SET_VEL', payload: { dpci, value } }),
    [dispatch],
  );

  const clearVel = useCallback(
    (dpci: string) => dispatch({ type: 'CLEAR_VEL', payload: { dpci } }),
    [dispatch],
  );

  const setLift = useCallback(
    (key: string, value: number) => dispatch({ type: 'SET_LIFT', payload: { key, value } }),
    [dispatch],
  );

  const clearLift = useCallback(
    (key: string) => dispatch({ type: 'CLEAR_LIFT', payload: { key } }),
    [dispatch],
  );

  const setUpc = useCallback(
    (dpci: string, value: number) => dispatch({ type: 'SET_UPC', payload: { dpci, value } }),
    [dispatch],
  );

  const clearUpc = useCallback(
    (dpci: string) => dispatch({ type: 'CLEAR_UPC', payload: { dpci } }),
    [dispatch],
  );

  const resetAll = useCallback(
    () => dispatch({ type: 'RESET_ALL' }),
    [dispatch],
  );

  return {
    state,
    dispatch,
    velFor,
    upcFor,
    liftFor,
    overrideCount,
    setVel,
    clearVel,
    setLift,
    clearLift,
    setUpc,
    clearUpc,
    resetAll,
  };
}
