// ─── Little Spoon Retail OS · Color Tokens ─────────────────────
// Source of truth for category colors and multi-series palette.
// Pages/components should import from here rather than hard-coding hex.

export const LS = {
  blue: '#00E3CD',
  blueDark: '#00B5A2',
  blueSoft: '#E5FBF8',
  mint: '#00F9B8',
  mango: '#FFC711',
  guava: '#FF8766',
  pitaya: '#FF8FF5',
  prune: '#DC7BFF',
  blueberry: '#18A7FF',
  spinach: '#00CF92',
  lime: '#C2FF7F',
  black: '#141414',
  almond: '#FFFEF8',
  oatmeal: '#FBF7E8',
  // grays
  gray50: '#F8F9FB',
  gray100: '#F1F3F6',
  gray200: '#E5E8ED',
  gray300: '#D5D9E0',
  gray400: '#9AA0A8',
  gray500: '#6E7480',
  gray600: '#4A5060',
  gray700: '#2E323D',
} as const;

// ─── Canonical category colors (per Retail OS brief) ──────────
// Keys cover both the brief's canonical list and the data layer's
// current category names (Multi-Serve, Snacks, etc.) so existing
// pages don't break.
export const CATEGORY_COLORS: Record<string, string> = {
  // Brief canonical
  'YOGOS': LS.pitaya,
  'YoGos': LS.pitaya,
  'Yogos': LS.pitaya,
  'Puffs + Cereals': LS.mango,
  'Smoothies': LS.blueberry,
  'Frozen/Meals': LS.spinach,
  'Frozen': LS.spinach,
  'Multi-Serve': LS.spinach,
  'Baked Bars': LS.guava,
  'Fruit+Veggie Minis': LS.lime,
  // Existing data labels
  'Baby Snacks': LS.guava,
  'Kids Snacks': LS.mango,
  'Snacks': LS.mango,
  'Brand-Wide': LS.blue,
  'All Categories': LS.blue,
  // Fallback
  'Other': LS.gray400,
};

/** Returns the canonical color for a category, or gray-400 if unknown. */
export function categoryColor(category: string | null | undefined): string {
  if (!category) return LS.gray400;
  return CATEGORY_COLORS[category] ?? LS.gray400;
}

// ─── Multi-series palette (non-categorical charts) ─────────────
// Used in order; cycles after position 9.
export const SERIES_PALETTE: string[] = [
  LS.blueDark,    // 0
  LS.blueberry,   // 1
  LS.guava,       // 2
  LS.mango,       // 3
  LS.spinach,     // 4
  LS.pitaya,      // 5
  LS.prune,       // 6
  LS.lime,        // 7
  LS.black,       // 8
  LS.gray400,     // 9
];

/** Returns a series color by index (cycles). */
export function seriesColor(i: number): string {
  return SERIES_PALETTE[i % SERIES_PALETTE.length];
}

// ─── Brightness modulation helpers ─────────────────────────────
// For showing multiple SKUs in the same category in one chart,
// modulate brightness by approximately ±18% to keep visual grouping
// while remaining distinguishable (per brief).

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Adjust a hex color's lightness toward white (positive amount) or black
 * (negative amount). Amount is 0..1; e.g. 0.18 ≈ +18%.
 */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) {
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  const a = -amount;
  return rgbToHex(r * (1 - a), g * (1 - a), b * (1 - a));
}

/**
 * Generate a list of brightness-modulated variants of a base color, for
 * showing N SKUs in the same category in one chart. Variants spread
 * symmetrically around the base, ±18% maximum.
 */
export function categoryShades(baseHex: string, count: number): string[] {
  if (count <= 1) return [baseHex];
  const out: string[] = [];
  const range = 0.18;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..+1
    out.push(shade(baseHex, t * range));
  }
  return out;
}

// ─── Tonal text/bg pairs for badges (light theme) ──────────────
/** Returns a soft tinted background + readable text color for a base hex. */
export function tonalPair(hex: string): { bg: string; fg: string } {
  return {
    bg: hex + '22', // ~13% alpha
    fg: shade(hex, -0.4),
  };
}
