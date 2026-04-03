'use client';

// ─── NewSkuContext ─────────────────────────────────────────────────────
// Global context for new SKUs added via the Add SKU module.
// When a new SKU is added, it automatically flows to:
//   - Launch Ramp Tracker (appears as a new launch)
//   - Demand Plan (adds a new row with forecast)
//   - Shipment Plan (translates forecast to cases)
//   - Executive Summary (included in totals)
//
// Data persists in localStorage so it survives page refreshes.

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'ls_ti_new_skus_v1';

export interface NewSku {
  id: string;
  name: string;
  dpci: string;
  category: string;
  price: number;
  stores: number;
  ucase: number;
  launchDate: string;
  baseUpspw: number;
  fcast: number[];           // 52-week unit forecast
  rampType: string;          // "gradual" | "aggressive"
  skuType: string;           // "innovation" | "analog"
  promoEligibility: string[];
  notes: string;
  caseCode: string;          // LS-X... code
  createdAt: string;
}

interface NewSkuContextValue {
  newSkus: NewSku[];
  addSku: (sku: NewSku) => void;
  removeSku: (id: string) => void;
  updateSku: (id: string, changes: Partial<NewSku>) => void;
  getNewSkuCount: () => number;
  // For downstream consumption as DPSku-compatible objects
  getAsDPSkus: () => { name: string; dpci: string; category: string; stores: number; price: number; ucase: number; lw_upspw: number; lw_dpspw: number; lw_rev: number; hist: number[]; fcast: number[] }[];
}

const NewSkuCtx = createContext<NewSkuContextValue | null>(null);

function loadFromStorage(): NewSku[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(skus: NewSku[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skus));
  } catch { /* silent */ }
}

export function NewSkuProvider({ children }: { children: ReactNode }) {
  const [newSkus, setNewSkus] = useState<NewSku[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setNewSkus(loadFromStorage());
  }, []);

  const addSku = useCallback((sku: NewSku) => {
    setNewSkus(prev => {
      const updated = [...prev, sku];
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const removeSku = useCallback((id: string) => {
    setNewSkus(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const updateSku = useCallback((id: string, changes: Partial<NewSku>) => {
    setNewSkus(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...changes } : s);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const getNewSkuCount = useCallback(() => newSkus.length, [newSkus]);

  // Convert to DPSku-compatible format for demand plan integration
  const getAsDPSkus = useCallback(() => {
    return newSkus.map(s => ({
      name: s.name,
      dpci: s.dpci,
      category: s.category,
      stores: s.stores,
      price: s.price,
      ucase: s.ucase,
      lw_upspw: s.baseUpspw,
      lw_dpspw: s.baseUpspw * s.price,
      lw_rev: s.baseUpspw * s.stores * s.price,
      hist: new Array(13).fill(0), // No history yet (new launch)
      fcast: s.fcast,
    }));
  }, [newSkus]);

  const value = useMemo(() => ({
    newSkus, addSku, removeSku, updateSku, getNewSkuCount, getAsDPSkus,
  }), [newSkus, addSku, removeSku, updateSku, getNewSkuCount, getAsDPSkus]);

  return <NewSkuCtx.Provider value={value}>{children}</NewSkuCtx.Provider>;
}

export function useNewSkus(): NewSkuContextValue {
  const ctx = useContext(NewSkuCtx);
  if (!ctx) throw new Error('useNewSkus must be used within <NewSkuProvider>');
  return ctx;
}
