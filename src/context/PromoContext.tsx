'use client';

// ─── PromoContext ──────────────────────────────────────────────────────
// CORE: This context is the demand model's promo input layer.
// When promos are added/edited/deleted here, the entire system reacts:
//   - Demand Plan applies lift-adjusted forecasts
//   - Shipment Plan adjusts planned cases for promo weeks
//   - Executive Summary reflects promo-adjusted totals
//
// Every downstream consumer should use usePromo() instead of static DATA_PROMO.

import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { DATA_PROMO_CAL } from '@/data/index';
import histPromoJson from '@/data/json/hist-promo.json';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { useMeasuredLifts } from './MeasuredLiftsContext';

// ─── PromoEvent Type ──────────────────────────────────────────────────

export interface PromoEvent {
  id: string;
  weekIdx: number;
  week: string;
  category: string;
  categoryId: string;
  subCategory: string;
  promoType: string;
  mechanic: string;
  description: string;
  status: string;
  duration: number;
  stores: string;
  skus: string[];           // Case codes (auto-mapped from category, user-narrowable)
  liftPct: number;          // Expected lift %
  liftSource: string;
  confidence: 'high' | 'medium' | 'low';
  isNew: boolean;
}

// ─── Historical Lift Benchmarks ───────────────────────────────────────

interface LiftBenchmark {
  avgLift: number;
  count: number;
}

let _liftByType: Record<string, LiftBenchmark> | null = null;
let _liftByTypeCat: Record<string, LiftBenchmark> | null = null;

function ensureBenchmarks() {
  if (_liftByType) return;
  _liftByType = {};
  _liftByTypeCat = {};

  try {
    const histPromo = histPromoJson as { type: string; category: string; actual_lift_pct: number }[];
    histPromo.forEach(e => {
      if (!_liftByType![e.type]) _liftByType![e.type] = { avgLift: 0, count: 0 };
      _liftByType![e.type].avgLift += e.actual_lift_pct;
      _liftByType![e.type].count++;

      const key = `${e.type}|${e.category}`;
      if (!_liftByTypeCat![key]) _liftByTypeCat![key] = { avgLift: 0, count: 0 };
      _liftByTypeCat![key].avgLift += e.actual_lift_pct;
      _liftByTypeCat![key].count++;
    });

    for (const v of Object.values(_liftByType)) v.avgLift = Math.round(v.avgLift / v.count);
    for (const v of Object.values(_liftByTypeCat)) v.avgLift = Math.round(v.avgLift / v.count);
  } catch {
    _liftByType = {};
    _liftByTypeCat = {};
  }
}

function getLiftByType(): Record<string, LiftBenchmark> { ensureBenchmarks(); return _liftByType!; }
function getLiftByTypeCat(): Record<string, LiftBenchmark> { ensureBenchmarks(); return _liftByTypeCat!; }

// ─── Category × Type Lift Matrix ──────────────────────────────────────
// Granular lift expectations by promo type AND product category.
// Sources: hist-promo.json actuals (marked 'H'), Omni POS analysis ('O'),
// category elasticity estimates ('E'). Each category responds differently
// to the same promo mechanic.
//
// Key insights from data:
// - Baby Snacks: High base velocity, lower promo sensitivity (essentials)
// - Frozen: High promo elasticity (impulse + endcap driven)
// - Smoothies: Moderate sensitivity, strong TPC response for $2 items
// - YoGos: Moderate sensitivity, newer category, still building
// - Kids Snacks: Low-moderate, price-sensitive parents
//
// Format: LIFT_MATRIX[promoType][dpCategory] = { pct, source, confidence }

const LIFT_MATRIX: Record<string, Record<string, { pct: number; src: string; conf: 'high' | 'medium' | 'low' }>> = {
  'Co-space': {
    'Smoothies':          { pct: 35, src: 'E: endcap placement, strong single-serve impulse', conf: 'medium' },
    'YoGos':              { pct: 30, src: 'E: similar to smoothies, newer category', conf: 'low' },
    'Frozen Multiserve':  { pct: 49, src: 'H: 4 events avg 48.8%, rounded', conf: 'high' },
    'Frozen':             { pct: 49, src: 'H: 4 events avg 48.8%, rounded', conf: 'high' },
    'Baby Snacks':        { pct: 25, src: 'E: essential category, lower impulse lift', conf: 'medium' },
    'Kids Snacks':        { pct: 30, src: 'E: cross-merch potential in lunchbox zone', conf: 'low' },
  },
  'TPC': {
    'Smoothies':          { pct: 11, src: 'H: 1 event at 11%, 2/$6 mechanic', conf: 'medium' },
    'YoGos':              { pct: 12, src: 'H: 1 event at 12%, 2/$6 mechanic', conf: 'medium' },
    'Frozen Multiserve':  { pct: 18, src: 'E: $2 off TPC drives strong frozen trial', conf: 'medium' },
    'Frozen':             { pct: 18, src: 'E: $2 off TPC drives strong frozen trial', conf: 'medium' },
    'Baby Snacks':        { pct: 11, src: 'H: 1 event at 11%, 2/$8 mechanic', conf: 'medium' },
    'Kids Snacks':        { pct: 14, src: 'E: 2/$10 TPC, price-sensitive category', conf: 'low' },
  },
  'DWA': {
    'Smoothies':          { pct: 25, src: 'E: brand-wide DWA, smoothies get halo', conf: 'low' },
    'YoGos':              { pct: 22, src: 'E: brand-wide DWA, similar to smoothies', conf: 'low' },
    'Frozen Multiserve':  { pct: 28, src: 'E: DWA + frozen = strong combo', conf: 'low' },
    'Frozen':             { pct: 28, src: 'E: DWA + frozen = strong combo', conf: 'low' },
    'Baby Snacks':        { pct: 15, src: 'E: essentials less responsive to DWA', conf: 'low' },
    'Kids Snacks':        { pct: 21, src: 'H: 1 event at 21% for Kids Snacks DWA', conf: 'medium' },
  },
  'Circle': {
    'Smoothies':          { pct: 12, src: 'E: digital-only, moderate conversion', conf: 'low' },
    'YoGos':              { pct: 10, src: 'E: digital-only, smaller base', conf: 'low' },
    'Frozen Multiserve':  { pct: 15, src: 'E: frozen category shoppers engage Circle', conf: 'low' },
    'Frozen':             { pct: 15, src: 'E: frozen category shoppers engage Circle', conf: 'low' },
    'Baby Snacks':        { pct: 8,  src: 'E: parents less Circle-responsive', conf: 'low' },
    'Kids Snacks':        { pct: 10, src: 'E: moderate digital engagement', conf: 'low' },
  },
  'BOGO': {
    'Smoothies':          { pct: 35, src: 'E: strong BOGO response on $3 items', conf: 'medium' },
    'YoGos':              { pct: 30, src: 'E: BOGO on $3.49 items, good value perception', conf: 'low' },
    'Frozen Multiserve':  { pct: 45, src: 'E: BOGO on $6+ items = big value, high lift', conf: 'medium' },
    'Frozen':             { pct: 45, src: 'E: BOGO on $6+ items = big value, high lift', conf: 'medium' },
    'Baby Snacks':        { pct: 20, src: 'E: essentials stock-up on BOGO', conf: 'low' },
    'Kids Snacks':        { pct: 25, src: 'E: BOGO drives trial in snacks', conf: 'low' },
  },
  'Circle + Co-space': {
    'Smoothies':          { pct: 65, src: 'E: combined digital + physical, strong', conf: 'low' },
    'YoGos':              { pct: 55, src: 'E: combined, newer category', conf: 'low' },
    'Frozen Multiserve':  { pct: 91, src: 'H: 1 event at 91%, endcap + Circle', conf: 'high' },
    'Frozen':             { pct: 91, src: 'H: 1 event at 91%, endcap + Circle', conf: 'high' },
    'Baby Snacks':        { pct: 40, src: 'E: combined placement + digital', conf: 'low' },
    'Kids Snacks':        { pct: 50, src: 'E: combined, lunchbox zone + digital', conf: 'low' },
  },
};

// Default fallbacks if category not in matrix
const TYPE_DEFAULTS: Record<string, number> = {
  'Co-space': 35, 'TPC': 12, 'DWA': 20, 'Circle': 10, 'BOGO': 30, 'Circle + Co-space': 60, 'Other': 5,
};

/** Map promo calendar category names to demand plan category names */
function mapPromoCatToDPCat(promoCat: string): string {
  const c = promoCat.toLowerCase();
  if (c.includes('smoothie')) return 'Smoothies';
  if (c.includes('yogo')) return 'YoGos';
  if (c.includes('frozen')) return 'Frozen Multiserve';
  if (c.includes('baby') || c.includes('puff') && !c.includes('stellar')) return 'Baby Snacks';
  if (c.includes('lunchbox') || c.includes('bar') || c.includes('loop') || c.includes('salty') || c.includes('kid') || c.includes('snack') || c.includes('puzzler') || c.includes('stellar')) return 'Kids Snacks';
  if (c.includes('cereal')) return 'Baby Snacks';
  return promoCat; // pass through if already DP format
}

/** Normalize any free-form promo type string to a LIFT_MATRIX key. */
export function normalizePromoType(promoType: string): string {
  const t = (promoType || '').toLowerCase();
  if (t.includes('co-space') || t.includes('cospace')) {
    return t.includes('circle') ? 'Circle + Co-space' : 'Co-space';
  }
  if (t.includes('dwa')) return 'DWA';
  if (t.includes('circle')) return 'Circle';
  if (t.includes('bogo')) return 'BOGO';
  if (t.includes('tpc')) return 'TPC';
  return 'TPC';
}

export function computeLift(promoType: string, category: string): { liftPct: number; source: string; confidence: 'high' | 'medium' | 'low' } {
  const matrixType = normalizePromoType(promoType);

  // Map promo calendar category to DP category
  const dpCat = mapPromoCatToDPCat(category);

  // 1. Try historical type × category data first (highest confidence)
  const histKey = `${matrixType === 'Co-space' ? 'Co-space' : matrixType}|${dpCat}`;
  const histBench = getLiftByTypeCat()[histKey];
  if (histBench && histBench.count >= 2) {
    return { liftPct: histBench.avgLift, source: `Historical: ${histBench.count} events, ${dpCat}`, confidence: 'high' };
  }

  // 2. Try the granular matrix (informed estimates)
  const matrixEntry = LIFT_MATRIX[matrixType]?.[dpCat];
  if (matrixEntry) {
    // If we also have 1 historical point, blend it
    if (histBench && histBench.count === 1) {
      const blended = Math.round((histBench.avgLift + matrixEntry.pct) / 2);
      return { liftPct: blended, source: `Blended: 1 hist event (${histBench.avgLift}%) + category model (${matrixEntry.pct}%)`, confidence: 'medium' };
    }
    return { liftPct: matrixEntry.pct, source: matrixEntry.src, confidence: matrixEntry.conf };
  }

  // 3. Type-level fallback
  const fb = TYPE_DEFAULTS[matrixType] ?? 10;
  return { liftPct: fb, source: `Type fallback: ${matrixType}`, confidence: 'low' };
}

// ─── SKU Auto-Mapping ─────────────────────────────────────────────────

const ALL_CASE_CODES = Object.keys(CASE_CODE_MAP);

export function getSkusForCategory(category: string, subCategory: string): string[] {
  const cat = category.toLowerCase();
  const sub = subCategory.toLowerCase();

  if (cat.includes('smoothie')) {
    if (sub.includes('4pk') || sub.includes('4 pack') || sub.includes('multipack')) {
      return ALL_CASE_CODES.filter(c => c.startsWith('LS-XMR'));
    }
    if (sub.includes('single')) {
      return ALL_CASE_CODES.filter(c => c.startsWith('LS-WMR'));
    }
    return ALL_CASE_CODES.filter(c => c.startsWith('LS-WMR') || c.startsWith('LS-XMR'));
  }
  if (cat.includes('yogo')) {
    if (sub.includes('4pk') || sub.includes('4 pack')) {
      return ALL_CASE_CODES.filter(c => c.startsWith('LS-XYR'));
    }
    if (sub.includes('single')) {
      return ALL_CASE_CODES.filter(c => c.startsWith('LS-WYR'));
    }
    return ALL_CASE_CODES.filter(c => c.startsWith('LS-WYR') || c.startsWith('LS-XYR'));
  }
  if (cat.includes('frozen')) return ALL_CASE_CODES.filter(c => c.startsWith('LS-XZR') || c.startsWith('LS-XZ0'));
  if (cat.includes('baby')) {
    if (sub.includes('puff')) return ALL_CASE_CODES.filter(c => ['LS-XDR01', 'LS-XDR02', 'LS-XDR06'].includes(c));
    if (sub.includes('cereal')) return ['LS-XDR03'];
    if (sub.includes('stellar')) return ALL_CASE_CODES.filter(c => c.startsWith('LS-XK01') && (c === 'LS-XK012' || c === 'LS-XK013'));
    if (sub.includes('bite') || sub.includes('mini')) return ALL_CASE_CODES.filter(c => c.startsWith('LS-XK01') || c.startsWith('LS-XDR01'));
    return ALL_CASE_CODES.filter(c => c.startsWith('LS-XDR'));
  }
  if (cat.includes('lunchbox') || cat.includes('bar')) {
    if (sub.includes('oatbake') || sub.includes('bar')) return ['LS-XKR09', 'LS-XKR10', 'LS-XKR11'];
    if (sub.includes('puzzler')) return ['LS-XK020', 'LS-XK021', 'LS-XK022'];
    return ['LS-XKR09', 'LS-XKR10', 'LS-XKR11', 'LS-XK020', 'LS-XK021', 'LS-XK022'];
  }
  if (cat.includes('salty') || cat.includes('loop')) return ['LS-XKR12', 'LS-XKR13'];
  if (cat.includes('cereal')) return ['LS-XDR03'];

  // Brand-wide: all SKUs
  return ALL_CASE_CODES;
}

// ─── Map DP category names to promo categories ────────────────────────

const DP_TO_PROMO_CAT: Record<string, string[]> = {
  'Baby Snacks': ['Baby', 'baby'],
  'Kids Snacks': ['Lunchbox', 'BFY Salty', 'lunchbox', 'salty', 'loop', 'bar'],
  'Smoothies': ['Smoothies', 'smoothie'],
  'YoGos': ['YoGos', 'yogo'],
  'Frozen Multiserve': ['Frozen', 'frozen'],
  'Frozen': ['Frozen', 'frozen'],
};

// ─── Context ──────────────────────────────────────────────────────────

interface PromoContextValue {
  events: PromoEvent[];
  addPromo: (event: Omit<PromoEvent, 'id' | 'skus' | 'liftPct' | 'liftSource' | 'confidence' | 'isNew'>) => void;
  updatePromo: (id: string, changes: Partial<PromoEvent>) => void;
  deletePromo: (id: string) => void;
  getLift: (weekIdx: number, dpCategory: string) => number;
  isOnPromo: (weekIdx: number, dpCategory: string) => boolean;
  getPromoEvents: (weekIdx: number, dpCategory: string) => PromoEvent[];
  liftBenchmarks: Record<string, LiftBenchmark>;
  /** True iff measured lifts are currently overriding the matrix. */
  usingMeasuredLifts: boolean;
  /** Returns 'measured' or 'matrix' for an event, indicating which source produced its lift. */
  getLiftSource: (event: PromoEvent, dpCategory?: string) => 'measured' | 'matrix';
}

const PromoCtx = createContext<PromoContextValue | null>(null);

export function PromoProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<PromoEvent[]>(() => {
    // Initialize from parsed CSV data
    return DATA_PROMO_CAL.events
      .filter(e => e.status !== 'info' && e.status !== 'blocked')
      .map((e, i) => {
        const lift = computeLift(e.promoType, e.category);
        const skus = getSkusForCategory(e.category, e.subCategory);
        return {
          id: `csv-${i}`,
          weekIdx: e.weekIdx,
          week: e.week,
          category: e.category,
          categoryId: e.categoryId,
          subCategory: e.subCategory,
          promoType: e.promoType,
          mechanic: '',
          description: e.description,
          status: e.status,
          duration: 1,
          stores: '',
          skus,
          liftPct: lift.liftPct,
          liftSource: lift.source,
          confidence: lift.confidence,
          isNew: false,
        };
      });
  });

  // ── Measured lifts override layer (synced from /promo-tracker) ──
  const measured = useMeasuredLifts();

  // Resolves an event's effective lift% — measured overrides matrix when available
  // for the event's (normalized type × DP category) combo.
  const getEffectiveLiftFor = useCallback((e: PromoEvent, dpCat: string): number => {
    if (!measured.hasMeasured) return e.liftPct;
    const matrixType = normalizePromoType(e.promoType);
    const m = measured.getMeasuredLift(matrixType, dpCat);
    return m ? m.liftPct : e.liftPct;
  }, [measured]);

  // ── Derived: lift map (weekIdx|dpCategory → max lift %) ──────────
  const liftMap = useMemo(() => {
    const map: Record<string, number> = {};

    for (const e of events) {
      if (e.status === 'rejected') continue; // Don't apply rejected promos

      // Map promo category to DP categories
      const dpCats: string[] = [];
      for (const [dpCat, promoNames] of Object.entries(DP_TO_PROMO_CAT)) {
        if (promoNames.some(p => e.category.toLowerCase().includes(p.toLowerCase()))) {
          dpCats.push(dpCat);
        }
      }
      // If no specific match, check if brand-wide
      if (dpCats.length === 0 && (e.promoType === 'DWA' || e.description.toLowerCase().includes('brand'))) {
        dpCats.push(...Object.keys(DP_TO_PROMO_CAT));
      }

      for (const dpCat of dpCats) {
        const key = `${e.weekIdx}|${dpCat}`;
        // Take max lift if multiple promos overlap (don't stack).
        // Use measured lift when available for this (type, category), else matrix-derived.
        const effective = getEffectiveLiftFor(e, dpCat);
        map[key] = Math.max(map[key] ?? 0, effective);
      }
    }

    return map;
  }, [events, getEffectiveLiftFor]);

  const getLiftSource = useCallback((e: PromoEvent, dpCategory?: string): 'measured' | 'matrix' => {
    if (!measured.hasMeasured) return 'matrix';
    const matrixType = normalizePromoType(e.promoType);
    // If a dpCategory is specified, check that combo.
    // Otherwise, return 'measured' if ANY DP category for this event has a measured value.
    if (dpCategory) {
      return measured.getMeasuredLift(matrixType, dpCategory) ? 'measured' : 'matrix';
    }
    for (const [dpCat, promoNames] of Object.entries(DP_TO_PROMO_CAT)) {
      if (promoNames.some(p => e.category.toLowerCase().includes(p.toLowerCase()))) {
        if (measured.getMeasuredLift(matrixType, dpCat)) return 'measured';
      }
    }
    return 'matrix';
  }, [measured]);

  // ── Methods ──────────────────────────────────────────────────────
  const addPromo = useCallback((event: Omit<PromoEvent, 'id' | 'skus' | 'liftPct' | 'liftSource' | 'confidence' | 'isNew'>) => {
    const lift = computeLift(event.promoType, event.category);
    const skus = getSkusForCategory(event.category, event.subCategory);
    const newEvent: PromoEvent = {
      ...event,
      id: `new-${Date.now()}`,
      skus,
      liftPct: lift.liftPct,
      liftSource: lift.source,
      confidence: lift.confidence,
      isNew: true,
    };
    setEvents(prev => [...prev, newEvent]);
  }, []);

  const updatePromo = useCallback((id: string, changes: Partial<PromoEvent>) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, ...changes };
      // Re-compute lift if type or category changed
      if (changes.promoType || changes.category) {
        const lift = computeLift(updated.promoType, updated.category);
        updated.liftPct = lift.liftPct;
        updated.liftSource = lift.source;
        updated.confidence = lift.confidence;
      }
      // Re-compute SKUs if category changed
      if (changes.category || changes.subCategory) {
        updated.skus = getSkusForCategory(updated.category, updated.subCategory);
      }
      return updated;
    }));
  }, []);

  const deletePromo = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const getLift = useCallback((weekIdx: number, dpCategory: string): number => {
    return liftMap[`${weekIdx}|${dpCategory}`] ?? 0;
  }, [liftMap]);

  const isOnPromo = useCallback((weekIdx: number, dpCategory: string): boolean => {
    return (liftMap[`${weekIdx}|${dpCategory}`] ?? 0) > 0;
  }, [liftMap]);

  const getPromoEvents = useCallback((weekIdx: number, dpCategory: string): PromoEvent[] => {
    return events.filter(e => {
      if (e.weekIdx !== weekIdx || e.status === 'rejected') return false;
      const dpCats: string[] = [];
      for (const [dpCat, promoNames] of Object.entries(DP_TO_PROMO_CAT)) {
        if (promoNames.some(p => e.category.toLowerCase().includes(p.toLowerCase()))) dpCats.push(dpCat);
      }
      return dpCats.includes(dpCategory);
    });
  }, [events]);

  const value = useMemo(() => ({
    events, addPromo, updatePromo, deletePromo, getLift, isOnPromo, getPromoEvents,
    liftBenchmarks: getLiftByType(),
    usingMeasuredLifts: measured.hasMeasured,
    getLiftSource,
  }), [events, addPromo, updatePromo, deletePromo, getLift, isOnPromo, getPromoEvents, measured.hasMeasured, getLiftSource]);

  return <PromoCtx.Provider value={value}>{children}</PromoCtx.Provider>;
}

export function usePromo(): PromoContextValue {
  const ctx = useContext(PromoCtx);
  if (!ctx) throw new Error('usePromo must be used within <PromoProvider>');
  return ctx;
}
