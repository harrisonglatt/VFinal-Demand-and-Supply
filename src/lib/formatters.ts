// ─── Formatting Utilities ─────────────────────────────────────────────
// Pure formatting functions for the demand intelligence dashboard.

/** Format number with commas, or '\u2014' if null/undefined */
export const fmt = (n: number | null | undefined): string =>
  n == null ? '\u2014' : Math.round(n).toLocaleString();

/** Format number with decimal places, or '\u2014' if null/undefined */
export const fmtD = (n: number | null | undefined, d: number = 1): string =>
  n == null ? '\u2014' : (+n).toFixed(d);

/** Format as percentage with sign, e.g. "+12.3%" */
export const fmtP = (n: number | null | undefined): string =>
  n == null ? '\u2014' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

/** Format as dollar amount, e.g. "$1,234" */
export const fmtDol = (n: number | null | undefined): string =>
  n == null ? '\u2014' : '$' + Math.round(n).toLocaleString();

/** Safe float: parse value as number, returning default d on failure */
export const sf = (v: unknown, d: number = 0): number => {
  try {
    return isNaN(+(v as number)) ? d : +(v as number);
  } catch {
    return d;
  }
};

/** Safe float v2: returns number as-is or parseFloat, fallback 0 */
export function sf2(v: unknown): number {
  return typeof v === 'number' ? v : parseFloat(v as string) || 0;
}

// ─── Aliases ──────────────────────────────────────────────────────────

/** Alias for fmt \u2014 used by daily module */
export const fmtN = fmt;

/** Alias for fmtP \u2014 used by daily module */
export const fmtPct = fmtP;

// ─── Change-direction CSS class ───────────────────────────────────────

/** Return 'cg' (green), 'cr' (red), or 'cy2' (yellow) based on value */
export const chgCls = (v: number | null | undefined): string =>
  v == null ? '' : v >= 0.05 ? 'cg' : v <= -0.05 ? 'cr' : 'cy2';
