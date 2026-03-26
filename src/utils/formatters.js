// ─── Formatting Utilities ─────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html

/** Format number with commas, or '—' if null */
export const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString());

/** Format number with decimal places, or '—' if null */
export const fmtD = (n, d = 1) => (n == null ? '—' : (+n).toFixed(d));

/** Format as percentage with sign, e.g. "+12.3%" */
export const fmtP = (n) =>
  n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

/** Format as dollar amount, e.g. "$1,234" */
export const fmtDol = (n) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString();

/** Safe float: parse value as number, returning default d on failure */
export const sf = (v, d = 0) => {
  try {
    return isNaN(+v) ? d : +v;
  } catch {
    return d;
  }
};

/** Safe float v2: returns number as-is or parseFloat, fallback 0 */
export function sf2(v) {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

// ─── Aliases ──────────────────────────────────────────────────────────
/** Alias for fmt — used by daily module */
export const fmtN = fmt;

/** Alias for fmtP — used by daily module */
export const fmtPct = fmtP;

// ─── Change-direction CSS class ───────────────────────────────────────
/** Return 'cg' (green), 'cr' (red), or 'cy2' (yellow) based on value */
export const chgCls = (v) =>
  v == null ? '' : v >= 0.05 ? 'cg' : v <= -0.05 ? 'cr' : 'cy2';
