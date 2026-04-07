// ─── Supply Planning Mock Data ───────────────────────────────────────────────
// Derives SupplySku and LotRecord data from existing app data sources.
// Replace these functions with real WMS/ERP API calls when available.
// All inventory positions, lead times, and lot codes are mock until wired to reality.

import { DATA_DP, DATA_INV } from '@/data/index';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { sf } from '@/lib/formatters';
import { computeATS } from './engine';
import type { SupplySku, LotRecord, ContractManufacturer } from './engine';

// ─── Lead time defaults by category (weeks) ──────────────────────────────────
// Assumption: frozen/smoothies have longer production cycles due to co-man capacity.
const LEAD_TIMES: Record<string, { prod: number; transit: number; receipt: number }> = {
  Frozen:        { prod: 6, transit: 1, receipt: 1 },
  Smoothie:      { prod: 5, transit: 1, receipt: 0 },
  YoGo:          { prod: 4, transit: 1, receipt: 0 },
  'Baby Snacks': { prod: 4, transit: 1, receipt: 0 },
  'Kids Snacks': { prod: 4, transit: 1, receipt: 0 },
};

function getLeadTimes(category: string) {
  for (const [key, val] of Object.entries(LEAD_TIMES)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { prod: 4, transit: 1, receipt: 0 };
}

// ─── WOC targets by category ─────────────────────────────────────────────────
// Assumption: frozen carries more WOC due to production inflexibility; smoothies slightly lower.
const WOC_TARGETS: Record<string, { target: number; min: number; safety: number }> = {
  Frozen:        { target: 10, min: 4, safety: 2 },
  Smoothie:      { target: 8,  min: 3, safety: 2 },
  YoGo:          { target: 6,  min: 2, safety: 1 },
  'Baby Snacks': { target: 8,  min: 3, safety: 2 },
  'Kids Snacks': { target: 8,  min: 3, safety: 2 },
};

function getWOCTargets(category: string) {
  for (const [key, val] of Object.entries(WOC_TARGETS)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { target: 8, min: 3, safety: 2 };
}

// ─── Shelf life by category ───────────────────────────────────────────────────
// Assumption: frozen and smoothies have 26-week shelf life; dry snacks 52 weeks.
function getShelfLife(category: string): { shelfLifeWeeks: number; stopShipBuffer: number } {
  if (category.toLowerCase().includes('frozen')) return { shelfLifeWeeks: 26, stopShipBuffer: 6 };
  if (category.toLowerCase().includes('smooth')) return { shelfLifeWeeks: 26, stopShipBuffer: 4 };
  return { shelfLifeWeeks: 52, stopShipBuffer: 4 };
}

// ─── Reverse-map dpci → caseCode ─────────────────────────────────────────────
function buildDpciToCaseCode(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [caseCode, info] of Object.entries(CASE_CODE_MAP)) {
    if (info.dpci) map[info.dpci] = caseCode;
  }
  return map;
}

// ─── Map dpci → inv snapshot ──────────────────────────────────────────────────
function buildDpciToInv(): Record<string, { eoh_units: number; on_order_units: number; wos_current: number }> {
  const map: Record<string, { eoh_units: number; on_order_units: number; wos_current: number }> = {};
  DATA_INV.skus.forEach(s => {
    if (s.dpci) map[s.dpci] = {
      eoh_units: s.eoh_units || 0,
      on_order_units: s.on_order_units || 0,
      wos_current: s.wos_current || 0,
    };
  });
  return map;
}

// ─── Build SupplySku array ────────────────────────────────────────────────────
export function buildSupplySkus(): SupplySku[] {
  const dpciToCaseCode = buildDpciToCaseCode();
  const dpciToInv = buildDpciToInv();

  return DATA_DP.skus.map(s => {
    const caseCode = dpciToCaseCode[s.dpci] || '';
    const caseInfo = caseCode ? CASE_CODE_MAP[caseCode] : undefined;
    const invData = dpciToInv[s.dpci];

    const lt = getLeadTimes(s.category);
    const woc = getWOCTargets(s.category);
    const shelf = getShelfLife(s.category);

    const unitsPerCase = caseInfo?.upc ?? (sf(s.ucase) || 12);
    const avgWeeklyDemand = s.fcast.slice(0, 8).reduce((a, b) => a + sf(b), 0) / 8;

    // Inventory — real if in inv.json, otherwise estimated from demand plan
    const onHandUnits = invData?.eoh_units
      ? invData.eoh_units
      : Math.round(avgWeeklyDemand * 6);

    const inTransitUnits = invData?.on_order_units
      ? invData.on_order_units
      : Math.round(avgWeeklyDemand * lt.transit);

    const onOrderUnits = 0; // Assumption: no pre-confirmed POs beyond what's in transit

    // At-risk / expiry fractions — derived from shelf life category
    // Assumption: shorter-shelf products have higher at-risk fraction due to lot age
    const atRiskFraction = shelf.shelfLifeWeeks <= 26 ? 0.12 : 0.05;
    const atRiskUnits = Math.round(onHandUnits * atRiskFraction);
    const expiringSoonUnits = Math.round(onHandUnits * atRiskFraction * 0.5);
    const stopShipRestrictedUnits = Math.round(onHandUnits * atRiskFraction * 0.25);
    const allocatedUnits = Math.round(onHandUnits * 0.04); // 4% allocated to confirmed retail replenishment

    const mockSku: Omit<SupplySku, 'availableToSellUnits'> = {
      dpci: s.dpci,
      caseCode,
      name: (s.name || '').replace(/,\s+[\d.]+\s+oz.*/i, '').substring(0, 42),
      category: s.category,
      unitsPerCase,
      onHandUnits,
      inTransitUnits,
      onOrderUnits,
      allocatedUnits,
      atRiskUnits,
      expiringSoonUnits,
      stopShipRestrictedUnits,
      productionLeadTimeWeeks: lt.prod,
      transitLeadTimeWeeks: lt.transit,
      receiptLagWeeks: lt.receipt,
      totalLeadTimeWeeks: lt.prod + lt.transit + lt.receipt,
      targetWOC: woc.target,
      minWOC: woc.min,
      safetyStockWeeks: woc.safety,
      moqCases: Math.max(50, Math.ceil(avgWeeklyDemand / unitsPerCase) * 2),
      batchSizeCases: Math.max(25, Math.ceil(avgWeeklyDemand / unitsPerCase)),
      shelfLifeWeeks: shelf.shelfLifeWeeks,
      stopShipWeeksBeforeExpiry: shelf.stopShipBuffer,
      casePrice: caseInfo?.casePrice ?? s.price * unitsPerCase,
      unitPrice: caseInfo?.unitPrice ?? s.price,
      msrp: caseInfo?.msrp ?? s.price * 1.45,
    };

    const full = mockSku as SupplySku;
    full.availableToSellUnits = computeATS(full);
    return full;
  });
}

// ─── Build lot records ────────────────────────────────────────────────────────
// Generates 2–3 mock lots per SKU.
// Lot A: older lot (70% through shelf life) — may be expiringSoon or stopShipRisk
// Lot B: newer lot (20% through shelf life) — healthy
// Lot C: in-transit lot (if inTransitUnits > 0)

export function buildLots(skus: SupplySku[]): Record<string, LotRecord[]> {
  const today = new Date('2026-04-06');
  const result: Record<string, LotRecord[]> = {};

  for (const sku of skus) {
    const lots: LotRecord[] = [];
    const shelfMs = sku.shelfLifeWeeks * 7 * 86400000;
    const stopShipMs = sku.stopShipWeeksBeforeExpiry * 7 * 86400000;

    // ── Lot A: older lot
    const lot1Manuf = new Date(today.getTime() - shelfMs * 0.70);
    const lot1Exp = new Date(lot1Manuf.getTime() + shelfMs);
    const lot1Stop = new Date(lot1Exp.getTime() - stopShipMs);
    const lot1Units = Math.round(sku.onHandUnits * 0.35);
    const lot1Cases = Math.max(1, Math.ceil(lot1Units / sku.unitsPerCase));
    const daysToStop1 = (lot1Stop.getTime() - today.getTime()) / 86400000;
    const lot1Risk: LotRecord['riskStatus'] =
      daysToStop1 <= 0 ? 'stopShipRisk' :
      daysToStop1 <= 28 ? 'expiringSoon' : 'healthy';

    lots.push({
      lotCode: `LOT-${sku.dpci.replace(/\D/g, '').slice(-6)}-A`,
      dpci: sku.dpci,
      units: lot1Units,
      cases: lot1Cases,
      manufactureDate: lot1Manuf.toISOString().slice(0, 10),
      expirationDate: lot1Exp.toISOString().slice(0, 10),
      stopShipDate: lot1Stop.toISOString().slice(0, 10),
      availableDate: lot1Manuf.toISOString().slice(0, 10),
      currentState: 'onHand',
      currentLocation: 'Target DC Minneapolis',
      inventoryValue: Math.round(lot1Cases * sku.casePrice),
      riskStatus: lot1Risk,
    });

    // ── Lot B: newer lot (healthy)
    const lot2Manuf = new Date(today.getTime() - shelfMs * 0.20);
    const lot2Exp = new Date(lot2Manuf.getTime() + shelfMs);
    const lot2Stop = new Date(lot2Exp.getTime() - stopShipMs);
    const lot2Units = Math.round(sku.onHandUnits * 0.50);
    const lot2Cases = Math.max(1, Math.ceil(lot2Units / sku.unitsPerCase));

    lots.push({
      lotCode: `LOT-${sku.dpci.replace(/\D/g, '').slice(-6)}-B`,
      dpci: sku.dpci,
      units: lot2Units,
      cases: lot2Cases,
      manufactureDate: lot2Manuf.toISOString().slice(0, 10),
      expirationDate: lot2Exp.toISOString().slice(0, 10),
      stopShipDate: lot2Stop.toISOString().slice(0, 10),
      availableDate: lot2Manuf.toISOString().slice(0, 10),
      currentState: 'onHand',
      currentLocation: 'Target DC Minneapolis',
      inventoryValue: Math.round(lot2Cases * sku.casePrice),
      riskStatus: 'healthy',
    });

    // ── Lot C: in-transit lot (if applicable)
    if (sku.inTransitUnits > 0) {
      const lot3Manuf = new Date(today.getTime() - 14 * 86400000);
      const lot3Exp = new Date(lot3Manuf.getTime() + shelfMs);
      const lot3Stop = new Date(lot3Exp.getTime() - stopShipMs);
      const lot3Units = sku.inTransitUnits;
      const lot3Cases = Math.max(1, Math.ceil(lot3Units / sku.unitsPerCase));
      const arrivalDate = new Date(today.getTime() + sku.transitLeadTimeWeeks * 7 * 86400000);

      lots.push({
        lotCode: `LOT-${sku.dpci.replace(/\D/g, '').slice(-6)}-C`,
        dpci: sku.dpci,
        units: lot3Units,
        cases: lot3Cases,
        manufactureDate: lot3Manuf.toISOString().slice(0, 10),
        expirationDate: lot3Exp.toISOString().slice(0, 10),
        stopShipDate: lot3Stop.toISOString().slice(0, 10),
        availableDate: arrivalDate.toISOString().slice(0, 10),
        currentState: 'inTransit',
        currentLocation: 'In Transit → Target DC',
        inventoryValue: Math.round(lot3Cases * sku.casePrice),
        riskStatus: 'healthy',
      });
    }

    result[sku.dpci] = lots;
  }

  return result;
}

// ─── Contract Manufacturer Registry ──────────────────────────────────────────
// 3 co-mans covering all Little Spoon × Target categories.
// Replace with real partner names and details when ready to operationalize.

const CM_REGISTRY: ContractManufacturer[] = [
  {
    id: 'cm-01',
    name: 'NorCal Cold Co.',
    shortName: 'NorCal',
    location: 'Sacramento, CA',
    categories: ['Frozen', 'Smoothie'],
    poApprovalLeadTimeWeeks: 1,
    capacityNotes: 'Runs 3 production lines. 5-day run notice required. Frozen lines take priority over Smoothies when capacity is constrained. Q3 capacity limited due to seasonal soft-serve commitments.',
  },
  {
    id: 'cm-02',
    name: 'Prairie Snack Works',
    shortName: 'Prairie',
    location: 'Mankato, MN',
    categories: ['Baby', 'Kids', 'Snack'],
    poApprovalLeadTimeWeeks: 1,
    capacityNotes: 'Shared extrusion line across Baby Puffs and Kids Snacks. MOQ of 50 cases enforced strictly — no exceptions. Lead times extend to 5 weeks during Q4 holiday season. Allergen changeovers add 1–2 days.',
  },
  {
    id: 'cm-03',
    name: 'Pacific Fresh Foods',
    shortName: 'Pacific',
    location: 'Portland, OR',
    categories: ['YoGo'],
    poApprovalLeadTimeWeeks: 1,
    capacityNotes: 'Refrigerated facility. Weekly shipping windows (Mon/Wed). Smaller batch runs available at a 5% premium per case. Cold chain compliance required — all shipments must use temperature-controlled carriers.',
  },
];

export function buildManufacturers(): ContractManufacturer[] {
  return CM_REGISTRY;
}
