// ─── Global App State ─────────────────────────────────────────────────
// Mutable state stores shared across pages.
// Extracted from LS-Target-Demand-Intelligence.html

/** Tracks which pages have been lazy-initialized */
export const pgInited = {};

// ─── Override stores (user-editable in Assumptions page) ──────────────
/** dpci → override UPC value */
export const upcOverrides = {};

/** dpci → override last-week units-per-store-per-week */
export const velOverrides = {};

/** "category|type" → override lift multiplier */
export const liftOverrides = {};

// ─── State accessors ──────────────────────────────────────────────────

/**
 * Return the effective UPC for a SKU, respecting user overrides.
 * @param {Object} s - SKU record with .dpci and .upc properties
 * @returns {*} Overridden UPC or original
 */
export function upcFor(s) {
  return upcOverrides[s.dpci] || s.upc;
}

/**
 * Return the effective velocity (lw_upspw) for a SKU, respecting user overrides.
 * @param {Object} s - SKU record with .dpci and .lw_upspw properties
 * @returns {number|undefined}
 */
export function velFor(s) {
  return velOverrides[s.dpci] !== undefined ? velOverrides[s.dpci] : s.lw_upspw;
}

/**
 * Return the override lift multiplier for a category + promo type, or null if none set.
 * @param {string} cat  - Category name
 * @param {string} type - Promo type (e.g. "TPC", "DWA")
 * @returns {number|null}
 */
export function liftFor(cat, type) {
  const k = cat + '|' + type;
  return liftOverrides[k] !== undefined ? liftOverrides[k] : null;
}
