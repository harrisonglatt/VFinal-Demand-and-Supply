'use client';

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

// ─── State shape ────────────────────────────────────────────────────────────
export interface OverridesState {
  velOverrides: Record<string, number>;
  liftOverrides: Record<string, number>;
  upcOverrides: Record<string, number>;
}

// ─── Action types ───────────────────────────────────────────────────────────
type OverridesAction =
  | { type: 'SET_VEL';   payload: { dpci: string; value: number } }
  | { type: 'CLEAR_VEL'; payload: { dpci: string } }
  | { type: 'SET_LIFT';   payload: { key: string; value: number } }
  | { type: 'CLEAR_LIFT'; payload: { key: string } }
  | { type: 'SET_UPC';    payload: { dpci: string; value: number } }
  | { type: 'CLEAR_UPC';  payload: { dpci: string } }
  | { type: 'RESET_ALL' };

// ─── Initial state ──────────────────────────────────────────────────────────
const initialState: OverridesState = {
  velOverrides: {},
  liftOverrides: {},
  upcOverrides: {},
};

// ─── Reducer ────────────────────────────────────────────────────────────────
function overridesReducer(state: OverridesState, action: OverridesAction): OverridesState {
  switch (action.type) {
    case 'SET_VEL': {
      return {
        ...state,
        velOverrides: { ...state.velOverrides, [action.payload.dpci]: action.payload.value },
      };
    }
    case 'CLEAR_VEL': {
      const { [action.payload.dpci]: _, ...rest } = state.velOverrides;
      return { ...state, velOverrides: rest };
    }
    case 'SET_LIFT': {
      return {
        ...state,
        liftOverrides: { ...state.liftOverrides, [action.payload.key]: action.payload.value },
      };
    }
    case 'CLEAR_LIFT': {
      const { [action.payload.key]: _, ...rest } = state.liftOverrides;
      return { ...state, liftOverrides: rest };
    }
    case 'SET_UPC': {
      return {
        ...state,
        upcOverrides: { ...state.upcOverrides, [action.payload.dpci]: action.payload.value },
      };
    }
    case 'CLEAR_UPC': {
      const { [action.payload.dpci]: _, ...rest } = state.upcOverrides;
      return { ...state, upcOverrides: rest };
    }
    case 'RESET_ALL': {
      return { ...initialState };
    }
    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────────────
interface OverridesContextValue {
  state: OverridesState;
  dispatch: Dispatch<OverridesAction>;
}

const OverridesContext = createContext<OverridesContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────
export function OverridesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(overridesReducer, initialState);

  return (
    <OverridesContext.Provider value={{ state, dispatch }}>
      {children}
    </OverridesContext.Provider>
  );
}

// ─── Raw context hook ───────────────────────────────────────────────────────
export function useOverridesContext(): OverridesContextValue {
  const ctx = useContext(OverridesContext);
  if (!ctx) {
    throw new Error('useOverridesContext must be used within an <OverridesProvider>');
  }
  return ctx;
}

export type { OverridesAction };
