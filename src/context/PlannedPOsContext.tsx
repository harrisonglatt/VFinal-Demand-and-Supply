'use client';

import {
  createContext, useContext, useReducer, useEffect,
  type ReactNode, type Dispatch,
} from 'react';

// ─── A user-staged or generated PO ─────────────────────────────────────
// Each entry represents one SKU line on one PO. A multi-SKU PO produces
// multiple entries with the same `poNumber`.

export type PlannedPOSource = 'manual' | 'recommendation' | 'generated';
export type PlannedPOStatus = 'draft' | 'staged' | 'placed' | 'received';

export interface PlannedPO {
  /** Stable id (auto-generated). */
  id: string;
  /** Optional grouping — multi-line POs share this. */
  poNumber?: string;
  /** SKU dpci this PO line targets. */
  dpci: string;
  /** Number of cases (authoritative). */
  cases: number;
  /** Pre-computed units for charting (cases × unitsPerCase). */
  units: number;
  /** Co-manufacturer / supplier. */
  supplier?: string;
  /** When the PO was placed (ISO date). */
  placedDate?: string;
  /** When inventory is expected to arrive at LS DC (ISO date). */
  arrivalDate: string;
  /** How this PO was created. */
  source: PlannedPOSource;
  /** Workflow status. */
  status: PlannedPOStatus;
  /** Optional human-readable note. */
  note?: string;
  /** Created timestamp for sorting. */
  createdAt: number;
}

// ─── State shape ────────────────────────────────────────────────────────
export interface PlannedPOsState {
  pos: PlannedPO[];
}

// ─── Actions ────────────────────────────────────────────────────────────
type PlannedPOAction =
  | { type: 'ADD'; payload: Omit<PlannedPO, 'id' | 'createdAt'> & { id?: string } }
  | { type: 'ADD_MANY'; payload: Array<Omit<PlannedPO, 'id' | 'createdAt'> & { id?: string }> }
  | { type: 'UPDATE'; payload: { id: string; patch: Partial<PlannedPO> } }
  | { type: 'REMOVE'; payload: { id: string } }
  | { type: 'REMOVE_BY_PO'; payload: { poNumber: string } }
  | { type: 'CLEAR_ALL' }
  | { type: 'HYDRATE'; payload: PlannedPOsState };

const STORAGE_KEY = 'ls.plannedPOs.v1';

const initialState: PlannedPOsState = { pos: [] };

function makeId(): string {
  return `po_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function reducer(state: PlannedPOsState, action: PlannedPOAction): PlannedPOsState {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'ADD': {
      const next: PlannedPO = {
        ...action.payload,
        id: action.payload.id ?? makeId(),
        createdAt: Date.now(),
      };
      return { pos: [...state.pos, next] };
    }
    case 'ADD_MANY': {
      const created = action.payload.map((p) => ({
        ...p,
        id: p.id ?? makeId(),
        createdAt: Date.now(),
      }));
      return { pos: [...state.pos, ...created] };
    }
    case 'UPDATE': {
      return {
        pos: state.pos.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.patch } : p,
        ),
      };
    }
    case 'REMOVE':
      return { pos: state.pos.filter((p) => p.id !== action.payload.id) };
    case 'REMOVE_BY_PO':
      return { pos: state.pos.filter((p) => p.poNumber !== action.payload.poNumber) };
    case 'CLEAR_ALL':
      return { pos: [] };
    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────────
interface PlannedPOsCtx {
  state: PlannedPOsState;
  dispatch: Dispatch<PlannedPOAction>;
  /** Returns POs for one SKU, sorted by arrival date ascending. */
  forSku: (dpci: string) => PlannedPO[];
  /** Returns POs landing in a given week index (0..51), where week 0 starts on `today`. */
  inboundForWeek: (dpci: string, weekIdx: number, todayIso?: string) => number;
  /** Aggregate inbound units per week for one SKU, length 52. */
  inboundSeries: (dpci: string, weeks: number, todayIso?: string) => number[];
}

const Ctx = createContext<PlannedPOsCtx | null>(null);

// ─── Helpers ────────────────────────────────────────────────────────────
const MS_PER_WEEK = 7 * 86400 * 1000;

/** Returns the 0-indexed week offset between `from` and `to`. Week boundaries snap to whole weeks. */
function weekOffset(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.floor((b - a) / MS_PER_WEEK);
}

// ─── Provider ───────────────────────────────────────────────────────────
export function PlannedPOsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PlannedPOsState;
        if (parsed && Array.isArray(parsed.pos)) {
          dispatch({ type: 'HYDRATE', payload: parsed });
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

  const ctx: PlannedPOsCtx = {
    state,
    dispatch,
    forSku: (dpci) =>
      state.pos
        .filter((p) => p.dpci === dpci)
        .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate)),
    inboundForWeek: (dpci, weekIdx, todayIso = '2026-04-06') => {
      let total = 0;
      for (const p of state.pos) {
        if (p.dpci !== dpci) continue;
        if (weekOffset(todayIso, p.arrivalDate) === weekIdx) {
          total += p.units;
        }
      }
      return total;
    },
    inboundSeries: (dpci, weeks, todayIso = '2026-04-06') => {
      const out = new Array<number>(weeks).fill(0);
      for (const p of state.pos) {
        if (p.dpci !== dpci) continue;
        const w = weekOffset(todayIso, p.arrivalDate);
        if (w >= 0 && w < weeks) out[w] += p.units;
      }
      return out;
    },
  };

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────────────────
export function usePlannedPOs(): PlannedPOsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlannedPOs must be used inside PlannedPOsProvider');
  return c;
}
