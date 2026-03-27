// ─── Promo Computation Logic ────────────────────────────────────────────
// Extracted from data/index.js — pure functions for promo calendar analysis.

import type { PromoEvent, PromoCatMapSrc, PromoWkCats, PromoWkCatEntry } from '../../data/types';

// ─── Category mapping: promo category → DP forecast categories ─────────

export const PROMO_CAT_MAP_SRC: PromoCatMapSrc = {
  'Smoothies': ['Smoothies'],
  'YoGos': ['YoGos'],
  'BFY Snacks': ['Kids Snacks'],
  'Baby Snacks': ['Baby Snacks'],
  'Baby/Kids': ['Baby Snacks', 'Kids Snacks'],
  'Baby+Kids+Bars': ['Baby Snacks', 'Kids Snacks'],
  'Kids Snacks': ['Kids Snacks'],
  'Frozen': ['Frozen Multiserve'],
  'Frozen Multiserve': ['Frozen Multiserve'],
  'Bars/Cereal': ['Kids Snacks', 'Baby Snacks'],
  'Brand-Wide': null,
  'Multiple': null,
};

/**
 * Resolve which DP-level categories a promo record applies to.
 * Returns an array of category strings, or null if the promo is brand-wide.
 */
export function promoSkuCats(p: PromoEvent): string[] | null {
  const base = PROMO_CAT_MAP_SRC[p.category];
  if (base === undefined) return null;
  if (base === null) {
    // Parse event text for specific hints
    const ev = (p.event || '').toLowerCase();
    const cats: string[] = [];
    if (ev.includes('loop') || ev.includes('bar') || ev.includes('stellar') || ev.includes('oat'))
      cats.push('Kids Snacks');
    if (ev.includes('baby') || ev.includes('cereal') || ev.includes('puff') || ev.includes('mini'))
      cats.push('Baby Snacks');
    if (ev.includes('smooth')) cats.push('Smoothies');
    if (
      ev.includes('frozen') ||
      ev.includes('meatball') ||
      ev.includes('chicken') ||
      ev.includes('slider')
    )
      cats.push('Frozen Multiserve');
    if (ev.includes('yogo')) cats.push('YoGos');
    return cats.length ? cats : null; // null = all
  }
  return base;
}

/**
 * Build the PROMO_WK_CATS lookup from a promo event array.
 * Returns a map of weekNum -> { cats: Set<string>, all: boolean }
 */
export function buildPromoWkCats(promos: PromoEvent[]): PromoWkCats {
  const result: PromoWkCats = {};
  promos.forEach((p) => {
    if (!result[p.wk]) result[p.wk] = { cats: new Set(), all: false };
    const c = promoSkuCats(p);
    if (c === null) {
      result[p.wk].all = true;
    } else {
      c.forEach((x) => result[p.wk].cats.add(x));
    }
  });
  return result;
}

/**
 * Check whether a given week + SKU category is on promo.
 */
export function isOnPromo(
  weekNum: number,
  skuCategory: string,
  promoWkCats: PromoWkCats
): boolean {
  const w = promoWkCats[weekNum];
  if (!w) return false;
  return w.all || w.cats.has(skuCategory);
}

/**
 * Build set of all week numbers that have at least one promo event.
 */
export function buildPromoWks(promos: PromoEvent[]): Set<number> {
  return new Set(promos.map((p) => p.wk));
}
