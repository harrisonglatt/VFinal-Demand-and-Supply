// ─── Data Loader ──────────────────────────────────────────────────────
// Central module that imports all JSON data files and exports them
// along with derived promo-calendar values.

import daily from './daily.json';
import dp from './dp.json';
import inv from './inv.json';
import ship from './ship.json';
import promo from './promo.json';
import launch from './launch.json';
import hist from './hist.json';
import endcapHistory from './endcap-history.json';
import accuracy from './accuracy.json';
import stopship from './stopship.json';
import fcastRev from './fcast-rev.json';
import backtest from './backtest.json';
import histPromo from './hist-promo.json';
import omni from './omni.json';
import avf from './avf.json';
import targetDc from './target-dc.json';
import pofc from './pofc.json';

// ─── Raw data exports ─────────────────────────────────────────────────
export const DATA_DAILY = daily;
export const DATA_DP = dp;
export const DATA_INV = inv;
export const DATA_SHIP = ship;
export const DATA_PROMO = promo;
export const DATA_LAUNCH = launch;
export const DATA_HIST = hist;
export const DATA_ENDCAP_HISTORY = endcapHistory;
export const DATA_ACCURACY = accuracy;
export const DATA_STOPSHIP = stopship;
export const DATA_BACKTEST = backtest;
export const DATA_HIST_PROMO = histPromo;
export const DATA_OMNI = omni;
export const DATA_AVF = avf;
export const DATA_TARGET_DC = targetDc;
export const DATA_POFC = pofc;

// ─── Forecast revenue 52-week array ───────────────────────────────────
export const FCAST_REV_52WK = fcastRev;

// ─── Promo-week set ───────────────────────────────────────────────────
/** Set of all week numbers that have at least one promo event */
export const PROMO_WKS = new Set([...DATA_PROMO.map((p) => p.wk)]);

// ─── Category mapping: promo category → DP forecast categories ───────
export const PROMO_CAT_MAP_SRC = {
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
 * @param {Object} p - A DATA_PROMO record
 * @returns {string[]|null}
 */
export function promoSkuCats(p) {
  const base = PROMO_CAT_MAP_SRC[p.category];
  if (base === undefined) return null;
  if (base === null) {
    // Parse event text for specific hints
    const ev = (p.event || '').toLowerCase();
    const cats = [];
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

// ─── Promo week → categories lookup ───────────────────────────────────
/** Map of weekNum → { cats: Set<string>, all: boolean } */
export const PROMO_WK_CATS = {};
DATA_PROMO.forEach((p) => {
  if (!PROMO_WK_CATS[p.wk]) PROMO_WK_CATS[p.wk] = { cats: new Set(), all: false };
  const c = promoSkuCats(p);
  if (c === null) {
    PROMO_WK_CATS[p.wk].all = true;
  } else {
    c.forEach((x) => PROMO_WK_CATS[p.wk].cats.add(x));
  }
});

/**
 * Check whether a given week + SKU category is on promo.
 * @param {number} weekNum     - 1-indexed forecast week number
 * @param {string} skuCategory - DP-level category name
 * @returns {boolean}
 */
export function isOnPromo(weekNum, skuCategory) {
  const w = PROMO_WK_CATS[weekNum];
  if (!w) return false;
  return w.all || w.cats.has(skuCategory);
}
