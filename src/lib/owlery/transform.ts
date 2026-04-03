// ─── Owlery Data Transformation ───────────────────────────────────────
// Transforms raw Owlery PO lines into the OwleryPOData shape
// consumed by the PO Tracker dashboard page.
//
// SKU Convention:
//   Case code:  LS-XYR05  (X prefix = case-level identifier used in Owlery/Target)
//   Unit code:  LS-YR05   (no X = unit-level, used in demand plan / avf)
//   To convert: strip the 'X' after 'LS-' → LS-XYR05 → LS-YR05

import type { OwleryPOLine, OwleryPOSkuRollup, OwleryPOData } from '@/data/types';

// ── Case code → DPCI lookup ─────────────────────────────────────────
// Maps Target case codes (LS-X...) to their DPCI and product metadata.
// This is the authoritative mapping used when Owlery doesn't supply DPCI.
export const CASE_CODE_MAP: Record<string, { dpci: string; name: string; category: string; upc: number; unitPrice: number; casePrice: number; msrp: number }> = {
  // ── Smoothies singles — W prefix, 8 units/case ─────────────────
  // unitPrice = wholesale to Target, casePrice = case wholesale, msrp = consumer retail price
  'LS-WMR01': { dpci: '211340232', name: 'Green Dream 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.45 },
  'LS-WMR02': { dpci: '', name: 'Sweet Potato Carrot Cake 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR04': { dpci: '', name: 'Purple Carrot Acai 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR05': { dpci: '211340231', name: 'Berry Banana Blast 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR06': { dpci: '211340230', name: 'Strawberry Banana Shake 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR08': { dpci: '', name: 'Golden Apple Pie 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR14': { dpci: '211340237', name: 'Tropical Avocado Greens 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  'LS-WMR15': { dpci: '211340236', name: 'Pineapple Guava Punch 4oz', category: 'Smoothies', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.44 },
  // ── Smoothies multipacks — X prefix, 8 units/case ────────────
  'LS-XMR19': { dpci: '211340238', name: 'Strawberry Banana Shake 4oz 4ct', category: 'Smoothies', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 11.80 },
  'LS-XMR20': { dpci: '211340240', name: 'Green Dream 4oz 4ct', category: 'Smoothies', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 11.63 },
  'LS-XMR22': { dpci: '211340239', name: 'Berry Banana Blast 4oz 4ct', category: 'Smoothies', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 11.76 },
  // ── YoGos singles — W prefix, 8 units/case ───────────────────
  'LS-WYR01': { dpci: '284101821', name: 'Strawberry Bananza YoGos 3.5oz', category: 'YoGos', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.46 },
  'LS-WYR02': { dpci: '', name: 'Apple Berry Blast YoGos 3.5oz', category: 'YoGos', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.45 },
  'LS-WYR03': { dpci: '', name: 'Peach YoGos 3.5oz', category: 'YoGos', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.45 },
  'LS-WYR04': { dpci: '284100310', name: 'Tropical Mango Twist YoGos 3.5oz', category: 'YoGos', upc: 8, unitPrice: 2.16, casePrice: 17.31, msrp: 3.45 },
  // ── YoGos multipacks — X prefix, 8 units/case ────────────────
  'LS-XYR05': { dpci: '284104983', name: 'Strawberry Bananza YoGos 3.5oz 4ct', category: 'YoGos', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 11.82 },
  'LS-XYR06': { dpci: '', name: 'Tropical Mango Twist YoGos 3.5oz 4ct', category: 'YoGos', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 3.45 },
  'LS-XYR07': { dpci: '284108661', name: 'Apple Berry Blast YoGos 3.5oz 4ct', category: 'YoGos', upc: 8, unitPrice: 7.43, casePrice: 59.47, msrp: 11.84 },
  // ── Kids Snacks — Oat Bakes 12 units/case ─────────────────────
  'LS-XKR09': { dpci: '071200965', name: 'Chocolate Chip Oat Bakes 5.3oz', category: 'Kids Snacks', upc: 12, unitPrice: 3.71, casePrice: 44.57, msrp: 5.51 },
  'LS-XKR10': { dpci: '071200966', name: 'Blueberry Muffin Oat Bakes 5.3oz', category: 'Kids Snacks', upc: 12, unitPrice: 3.71, casePrice: 44.57, msrp: 5.51 },
  'LS-XKR11': { dpci: '071200967', name: 'Apple Pie Oat Bakes 5.3oz', category: 'Kids Snacks', upc: 12, unitPrice: 3.71, casePrice: 44.57, msrp: 5.44 },
  // ── Kids Snacks — Veggie Loops 12 units/case ──────────────────
  'LS-XKR12': { dpci: '071060658', name: 'Mac + Cheesy Veggie Loops 6oz', category: 'Kids Snacks', upc: 12, unitPrice: 3.71, casePrice: 44.57, msrp: 5.09 },
  'LS-XKR13': { dpci: '071060659', name: 'Pizzalicious Veggie Loops 6oz', category: 'Kids Snacks', upc: 12, unitPrice: 3.71, casePrice: 44.57, msrp: 5.09 },
  // ── Kids Snacks — Stellar Puffs 40 units/case ─────────────────
  'LS-XK012': { dpci: '007106435', name: 'Stellar Puffs White Cheddar 2oz', category: 'Kids Snacks', upc: 40, unitPrice: 3.09, casePrice: 123.75, msrp: 4.99 },
  'LS-XK013': { dpci: '007105166', name: 'Stellar Puffs Cinna-Banana 2oz', category: 'Kids Snacks', upc: 40, unitPrice: 3.09, casePrice: 123.75, msrp: 4.99 },
  // ── Kids Snacks — PB Puffs 24 units/case ──────────────────────
  'LS-XK014': { dpci: '', name: 'PB Puffs Original Peanut Butter', category: 'Kids Snacks', upc: 24, unitPrice: 3.09, casePrice: 74.25, msrp: 5.29 },
  'LS-XK015': { dpci: '', name: 'PB Puffs PB + Strawberry', category: 'Kids Snacks', upc: 24, unitPrice: 3.09, casePrice: 74.25, msrp: 5.29 },
  // ── Kids Snacks — Melts 12 units/case ─────────────────────────
  'LS-XK016': { dpci: '', name: 'Melts Mango Carrot', category: 'Kids Snacks', upc: 12, unitPrice: 4.02, casePrice: 48.29, msrp: 5.29 },
  'LS-XK017': { dpci: '', name: 'Melts Strawberry Apple Carrot', category: 'Kids Snacks', upc: 12, unitPrice: 4.02, casePrice: 48.29, msrp: 5.29 },
  // ── Kids Snacks — Fruit+Veggie Minis 12 units/case ────────────
  'LS-XK018': { dpci: '007102732', name: 'Fruit+Veggie Minis Strawberry Banana 1oz', category: 'Kids Snacks', upc: 12, unitPrice: 5.57, casePrice: 66.89, msrp: 8.99 },
  'LS-XK019': { dpci: '007103137', name: 'Fruit+Veggie Minis Mango Blueberry 1oz', category: 'Kids Snacks', upc: 12, unitPrice: 5.57, casePrice: 66.89, msrp: 8.99 },
  // ── Kids Snacks — Fruit Puzzlers 12 units/case ────────────────
  'LS-XK020': { dpci: '', name: 'Mango Fruit Puzzlers', category: 'Kids Snacks', upc: 12, unitPrice: 6.19, casePrice: 74.33, msrp: 5.29 },
  'LS-XK021': { dpci: '', name: 'Peach Fruit Puzzlers', category: 'Kids Snacks', upc: 12, unitPrice: 6.19, casePrice: 74.33, msrp: 5.29 },
  'LS-XK022': { dpci: '', name: 'Mixed Berry Fruit Puzzlers', category: 'Kids Snacks', upc: 12, unitPrice: 6.19, casePrice: 74.33, msrp: 5.29 },
  // ── Baby Snacks — Puffs 40 units/case ─────────────────────────
  'LS-XDR01': { dpci: '007102035', name: 'Kale Apple Curls 1oz', category: 'Baby Snacks', upc: 40, unitPrice: 3.09, casePrice: 123.75, msrp: 4.47 },
  'LS-XDR02': { dpci: '007100291', name: 'Banana Pitaya Rings 1oz', category: 'Baby Snacks', upc: 40, unitPrice: 3.09, casePrice: 123.75, msrp: 4.51 },
  'LS-XDR06': { dpci: '007103297', name: 'Blueberry Carrot Wheels 1oz', category: 'Baby Snacks', upc: 40, unitPrice: 3.09, casePrice: 123.75, msrp: 4.30 },
  // ── Baby Snacks — Cereal 12 units/case ────────────────────────
  'LS-XDR03': { dpci: '007109801', name: 'Oatmeal w/ Ancient Grains Cereal 6oz', category: 'Baby Snacks', upc: 12, unitPrice: 3.59, casePrice: 43.08, msrp: 5.49 },
  // ── Baby Snacks — Fruit+Veggie Minis (DR codes) 12 units/case ─
  'LS-XDR018': { dpci: '', name: 'Fruit+Veggie Minis Banana Strawberry 1oz', category: 'Baby Snacks', upc: 12, unitPrice: 5.57, casePrice: 66.89, msrp: 4.49 },
  'LS-XDR019': { dpci: '', name: 'Fruit+Veggie Minis Mango Blueberry 1oz', category: 'Baby Snacks', upc: 12, unitPrice: 5.57, casePrice: 66.89, msrp: 4.49 },
  // ── Frozen — 10 units/case ────────────────────────────────────
  'LS-XZR01': { dpci: '270020128', name: 'Super Chicken Dippers 10oz', category: 'Frozen', upc: 10, unitPrice: 6.19, casePrice: 61.94, msrp: 8.87 },
  'LS-XZR02': { dpci: '270028577', name: 'Chicken Veggie Sliders 9.8oz', category: 'Frozen', upc: 10, unitPrice: 6.19, casePrice: 61.94, msrp: 8.88 },
  'LS-XZR03': { dpci: '270022902', name: 'Mini Turkey Kale Meatballs 9.8oz', category: 'Frozen', upc: 10, unitPrice: 6.19, casePrice: 61.94, msrp: 8.87 },
  'LS-XZ004': { dpci: '270028253', name: 'Broccoli Bites 10oz', category: 'Frozen', upc: 10, unitPrice: 6.19, casePrice: 61.94, msrp: 8.87 },
  'LS-XZ005': { dpci: '270020921', name: 'Cauliflower Bites 10oz', category: 'Frozen', upc: 10, unitPrice: 6.19, casePrice: 61.94, msrp: 8.87 },
};

/**
 * Resolve DPCI, product name, category, and units_per_case from a case code.
 * Falls back to whatever was passed if the code isn't in our lookup.
 */
export function resolveFromCaseCode(
  sku: string, fallbackDpci: string, fallbackName: string, fallbackCat: string, fallbackUpc: number,
) {
  const entry = CASE_CODE_MAP[sku.toUpperCase()];
  return {
    dpci: entry?.dpci ?? fallbackDpci,
    product_name: entry?.name ?? fallbackName,
    category: entry?.category ?? fallbackCat,
    units_per_case: entry?.upc ?? fallbackUpc,
    casePrice: entry?.casePrice ?? 0,
    unitPrice: entry?.unitPrice ?? 0,
    msrp: entry?.msrp ?? 0,
  };
}

/** Get case price for a SKU by case code (wholesale cost to Target) */
export function getCasePrice(caseCode: string): number {
  return CASE_CODE_MAP[caseCode.toUpperCase()]?.casePrice ?? 0;
}

/** Get MSRP for a SKU by case code (consumer retail price) */
export function getMSRP(caseCode: string): number {
  return CASE_CODE_MAP[caseCode.toUpperCase()]?.msrp ?? 0;
}

/** Get both revenue numbers for a case code:
 *  - shippedRevenue = cases × casePrice (what LS receives)
 *  - sellThroughRevenue = cases × upc × msrp (what consumer pays at Target)
 */
export function getRevenue(caseCode: string, cases: number): { shipped: number; sellThrough: number } {
  const entry = CASE_CODE_MAP[caseCode.toUpperCase()];
  if (!entry) return { shipped: 0, sellThrough: 0 };
  return {
    shipped: Math.round(cases * entry.casePrice * 100) / 100,
    sellThrough: Math.round(cases * entry.upc * entry.msrp * 100) / 100,
  };
}

/**
 * Build the full OwleryPOData object from an array of PO line items.
 */
export function buildOwleryPOData(lines: OwleryPOLine[]): OwleryPOData {
  const today = new Date().toISOString().slice(0, 10);

  // ── SKU rollup ─────────────────────────────────────────────────────
  const skuMap = new Map<string, OwleryPOSkuRollup>();

  for (const line of lines) {
    let rollup = skuMap.get(line.sku);
    if (!rollup) {
      rollup = {
        sku: line.sku,
        dpci: line.dpci,
        product_name: line.product_name,
        category: line.category,
        units_per_case: line.units_per_case,
        total_cases: 0,
        total_units: 0,
        po_count: 0,
        deliveries: [],
        next_delivery: '',
        pct_delivered: 0,
      };
      skuMap.set(line.sku, rollup);
    }

    rollup.total_cases += line.cases;
    rollup.total_units += line.total_units;
    rollup.deliveries.push({
      date: line.delivery_date,
      cases: line.cases,
      po_number: line.po_number,
      status: line.status,
    });
  }

  // Deduplicate PO count & compute delivery metrics per SKU
  for (const rollup of skuMap.values()) {
    const uniquePOs = new Set(rollup.deliveries.map(d => d.po_number));
    rollup.po_count = uniquePOs.size;

    // Sort deliveries by date
    rollup.deliveries.sort((a, b) => a.date.localeCompare(b.date));

    // Next delivery = earliest future non-closed delivery
    const future = rollup.deliveries.find(d => d.date >= today && d.status !== 'closed');
    rollup.next_delivery = future?.date ?? '';

    // % delivered
    const deliveredCases = rollup.deliveries
      .filter(d => d.status === 'closed')
      .reduce((sum, d) => sum + d.cases, 0);
    rollup.pct_delivered = rollup.total_cases > 0
      ? Math.round((deliveredCases / rollup.total_cases) * 100)
      : 0;
  }

  const sku_rollup = Array.from(skuMap.values())
    .sort((a, b) => b.total_cases - a.total_cases);

  // ── Summary KPIs ───────────────────────────────────────────────────
  const uniquePOs = new Set(lines.map(l => l.po_number));
  const PRE_SHIP_STATUSES = new Set(['open', 'planned', 'quoted', 'tendered']);
  const preShipLines = lines.filter(l => PRE_SHIP_STATUSES.has(l.status));
  const inTransitLines = lines.filter(l => l.status === 'inProgress');
  const deliveredLines = lines.filter(l => l.status === 'closed');

  // Open POs = POs with at least one non-closed, non-cancelled line
  const activeLines = lines.filter(l => l.status !== 'closed' && l.status !== 'cancelled');
  const openPOs = new Set(activeLines.map(l => l.po_number)).size;

  const d7 = new Date();
  d7.setDate(d7.getDate() + 7);
  const d14 = new Date();
  d14.setDate(d14.getDate() + 14);
  const d7Str = d7.toISOString().slice(0, 10);
  const d14Str = d14.toISOString().slice(0, 10);

  const upcoming7d = lines.filter(
    l => l.delivery_date >= today && l.delivery_date <= d7Str && l.status !== 'closed',
  ).reduce((sum, l) => sum + l.cases, 0);

  const upcoming14d = lines.filter(
    l => l.delivery_date >= today && l.delivery_date <= d14Str && l.status !== 'closed',
  ).reduce((sum, l) => sum + l.cases, 0);

  return {
    as_of: today,
    source: 'Owlery TMS',
    lines,
    sku_rollup,
    summary: {
      total_pos: uniquePOs.size,
      total_lines: lines.length,
      total_cases: lines.reduce((sum, l) => sum + l.cases, 0),
      total_units: lines.reduce((sum, l) => sum + l.total_units, 0),
      open_pos: openPOs,
      pre_shipment: preShipLines.reduce((sum, l) => sum + l.cases, 0),
      pre_shipment_loads: new Set(preShipLines.map(l => l.load_number).filter(Boolean)).size,
      in_transit: inTransitLines.reduce((sum, l) => sum + l.cases, 0),
      in_transit_loads: new Set(inTransitLines.map(l => l.load_number).filter(Boolean)).size,
      delivered: deliveredLines.reduce((sum, l) => sum + l.cases, 0),
      upcoming_7d: upcoming7d,
      upcoming_14d: upcoming14d,
    },
  };
}
