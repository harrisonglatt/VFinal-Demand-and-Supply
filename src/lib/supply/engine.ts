// ─── Supply Planning Engine ──────────────────────────────────────────────────
// Pure functions — no React, no data imports.
// Wire real WMS/ERP data by replacing mock-data.ts; this file stays unchanged.

import { SC_MULT } from '../computations/scenario';
import type { ScenarioKey } from '../../data/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SupplySku {
  dpci: string;
  caseCode: string;
  name: string;
  category: string;
  unitsPerCase: number;
  // Inventory states (all in units)
  onHandUnits: number;
  inTransitUnits: number;
  onOrderUnits: number;
  allocatedUnits: number;
  atRiskUnits: number;
  expiringSoonUnits: number;
  stopShipRestrictedUnits: number;
  availableToSellUnits: number;   // computed: onHand - allocated - atRisk - stopShipRestricted
  // Lead times (weeks)
  productionLeadTimeWeeks: number;
  transitLeadTimeWeeks: number;
  receiptLagWeeks: number;
  totalLeadTimeWeeks: number;     // computed: sum of above
  // WOC config
  targetWOC: number;
  minWOC: number;
  safetyStockWeeks: number;
  // Order constraints
  moqCases: number;
  batchSizeCases: number;
  // Shelf life / lot
  shelfLifeWeeks: number;
  stopShipWeeksBeforeExpiry: number;
  // Pricing (from CASE_CODE_MAP)
  casePrice: number;
  unitPrice: number;
  msrp: number;
}

export interface LotRecord {
  lotCode: string;
  dpci: string;
  units: number;
  cases: number;
  manufactureDate: string;        // ISO date
  expirationDate: string;
  stopShipDate: string;
  availableDate: string;
  currentState: 'onHand' | 'inTransit' | 'onOrder';
  currentLocation: string;
  inventoryValue: number;         // cases × casePrice
  riskStatus: 'healthy' | 'expiringSoon' | 'stopShipRisk' | 'expired';
}

export interface WeekSimRow {
  weekIdx: number;
  weekLabel: string;
  beginningUnits: number;
  inboundUnits: number;
  demandUnits: number;
  endingUnits: number;
  woc: number;
  ats: number;
  expiringSoonUnits: number;
  stopShipRestrictedUnits: number;
  isStockout: boolean;
  isExcess: boolean;
  promoLift: number;              // % lift this week
  scenarioMult: number;           // combined scenario × promo multiplier
}

export interface PORecommendation {
  dpci: string;
  caseCode: string;
  name: string;
  category: string;
  onHandUnits: number;
  atsUnits: number;
  inTransitUnits: number;
  onOrderUnits: number;
  atRiskUnits: number;
  expiringSoonUnits: number;
  currentWOC: number;
  targetWOC: number;
  demandDuringLeadTime: number;
  safetyStockUnits: number;
  reorderPoint: number;
  recommendedCases: number;
  recommendedUnits: number;
  orderDate: string;
  prodStartDate: string;
  shipDate: string;
  arrivalDate: string;
  postDeliveryWOC: number;
  postDeliveryATS: number;
  rationale: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  // PO timing (manufacturer execution fields)
  prodCompleteDate: string;
  availableDate: string;
  poValue: number;               // recommendedCases × casePrice
  orderWeekOffset: number;       // weeks from today when PO should be placed (≤0 = already late)
  isLate: boolean;               // PO window has passed for critical/high/medium SKUs
  daysUntilLatestPO: number;     // positive = days remaining, negative = days overdue
  serviceRiskIfMissed: string;   // human-readable consequence of missing the PO window
}

export interface RiskFlag {
  id: string;
  dpci: string;
  caseCode: string;
  name: string;
  category: string;
  riskType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impactDate: string;
  unitsAffected: number;
  casesAffected: number;
  revenueAtRisk: number;
  inventoryValueAtRisk: number;
  lotCode?: string;
  recommendedAction: string;
}

export interface FinanceSummary {
  onHandValue: number;
  inTransitValue: number;
  onOrderValue: number;
  atRiskValue: number;
  expiringSoonValue: number;
  availableToSellValue: number;
  stockoutRevenueRisk: number;
  excessInventoryValue: number;
  projectedPOSpend30d: number;
  projectedPOSpend60d: number;
  projectedPOSpend90d: number;
  workingCapitalExposure: number;
  bearStockoutRisk: number;
  baseStockoutRisk: number;
  bullStockoutRisk: number;
}

// ─── Core computations ───────────────────────────────────────────────────────

/** ATS = onHand - allocated - atRisk - stopShipRestricted */
export function computeATS(sku: SupplySku): number {
  return Math.max(0,
    sku.onHandUnits
    - sku.allocatedUnits
    - sku.atRiskUnits
    - sku.stopShipRestrictedUnits,
  );
}

/** WOC based on forward average demand, not trailing. Returns 99 if demand=0. */
export function computeWOC(units: number, weeklyDemand: number): number {
  if (weeklyDemand <= 0) return units > 0 ? 99 : 0;
  return units / weeklyDemand;
}

export function computeTotalLeadTime(sku: SupplySku): number {
  return sku.productionLeadTimeWeeks + sku.transitLeadTimeWeeks + sku.receiptLagWeeks;
}

/** Sum of forecast units over leadTimeWeeks starting at startWeek, with scenario mult applied. */
export function computeDemandDuringLeadTime(
  fcast: number[],
  startWeek: number,
  leadTimeWeeks: number,
  mult: number,
): number {
  let total = 0;
  for (let w = startWeek; w < Math.min(startWeek + leadTimeWeeks, fcast.length); w++) {
    total += (fcast[w] || 0) * mult;
  }
  return Math.round(total);
}

export function computeSafetyStock(sku: SupplySku, avgWeeklyDemand: number): number {
  return Math.round(avgWeeklyDemand * sku.safetyStockWeeks);
}

// ─── 52-week simulation ───────────────────────────────────────────────────────

/**
 * Runs a week-by-week inventory simulation for one SKU.
 * fcast: base calibrated demand (units/week, before scenario).
 * Scenario multiplier + promo lift applied inside.
 * Uses simplified FEFO lot consumption for expiry overlay.
 */
export function runWeeklySimulation(
  sku: SupplySku,
  fcast: number[],
  lots: LotRecord[],
  scenario: ScenarioKey,
  weekLabels: string[],
  getPromoLift: (weekIdx: number, category: string) => number,
): WeekSimRow[] {
  const scenMult = SC_MULT[scenario];

  // Sort lots FEFO (earliest expiry first) for consumption tracking
  const lotBalances = lots
    .filter(l => l.currentState === 'onHand')
    .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime())
    .map(l => ({ ...l, remaining: l.units }));

  const avgFwdDemand = fcast.slice(0, 13).reduce((a, b) => a + b, 0) / 13;
  let inventory = sku.onHandUnits;

  const rows: WeekSimRow[] = [];

  for (let w = 0; w < 52; w++) {
    const label = weekLabels[w] || `Wk ${w + 1}`;
    const promoLift = getPromoLift(w, sku.category);
    const adjMult = scenMult * (1 + promoLift / 100);
    const demand = Math.round((fcast[w] || avgFwdDemand) * adjMult);

    // Inbound: inTransit arrives at transitLeadTimeWeeks, onOrder at totalLeadTimeWeeks
    let inbound = 0;
    if (w === sku.transitLeadTimeWeeks) inbound += sku.inTransitUnits;
    if (w === sku.totalLeadTimeWeeks && sku.onOrderUnits > 0) inbound += sku.onOrderUnits;

    const beginning = inventory;
    inventory = Math.max(0, inventory + inbound - demand);

    // Lot-based expiry overlay (days offset from today)
    const todayMs = new Date('2026-04-06').getTime();
    const weekOffsetMs = w * 7 * 86400000;
    let expiringSoon = 0;
    let stopShipRestricted = 0;
    for (const lb of lotBalances) {
      if (lb.remaining <= 0) continue;
      const daysToStopShip = (new Date(lb.stopShipDate).getTime() - todayMs - weekOffsetMs) / 86400000;
      const daysToExpiry = (new Date(lb.expirationDate).getTime() - todayMs - weekOffsetMs) / 86400000;
      if (daysToStopShip <= 0) {
        stopShipRestricted += lb.remaining;
      } else if (daysToExpiry <= (sku.stopShipWeeksBeforeExpiry + 2) * 7) {
        expiringSoon += lb.remaining;
      }
    }

    // Consume demand FEFO
    let toConsume = demand;
    for (const lb of lotBalances) {
      if (toConsume <= 0) break;
      const consumed = Math.min(lb.remaining, toConsume);
      lb.remaining -= consumed;
      toConsume -= consumed;
    }

    const woc = computeWOC(inventory, avgFwdDemand);
    const ats = Math.max(0, inventory - Math.min(stopShipRestricted, inventory) - sku.allocatedUnits);

    rows.push({
      weekIdx: w,
      weekLabel: label,
      beginningUnits: beginning,
      inboundUnits: inbound,
      demandUnits: demand,
      endingUnits: inventory,
      woc: Math.round(woc * 10) / 10,
      ats,
      expiringSoonUnits: Math.min(Math.round(expiringSoon), inventory),
      stopShipRestrictedUnits: Math.min(Math.round(stopShipRestricted), inventory),
      isStockout: inventory <= 0,
      isExcess: woc > sku.targetWOC * 1.5,
      promoLift,
      scenarioMult: Math.round(adjMult * 100) / 100,
    });
  }
  return rows;
}

// ─── PO Recommendation ───────────────────────────────────────────────────────

/**
 * Derives a replenishment recommendation for one SKU.
 * Uses forward-looking demand, not trailing, for reorder math.
 * Backsolves all key dates from a "need by" week.
 */
export function computeReorderRecommendation(
  sku: SupplySku,
  sim: WeekSimRow[],
  fcast: number[],
  scenario: ScenarioKey,
  weekLabels: string[],
  poApprovalLeadTimeWeeks = 1,
): PORecommendation {
  const scenMult = SC_MULT[scenario];
  const avgWeeklyDemand = fcast.slice(0, 8).reduce((a, b) => a + b, 0) / 8 * scenMult;
  const leadTime = computeTotalLeadTime(sku);
  const demandDuringLeadTime = computeDemandDuringLeadTime(fcast, 0, leadTime, scenMult);
  const safetyStock = computeSafetyStock(sku, avgWeeklyDemand);
  const reorderPoint = demandDuringLeadTime + safetyStock;

  // Total reachable inventory today
  const currentPosition = sku.availableToSellUnits + sku.inTransitUnits + sku.onOrderUnits;
  const currentWOC = computeWOC(currentPosition, avgWeeklyDemand);

  // First sim week where inventory < reorder point
  const triggerWeek = sim.findIndex(w => w.endingUnits < reorderPoint);

  let severity: PORecommendation['severity'] = 'none';
  let rationale = 'Inventory position is healthy.';
  let recommendedCases = 0;

  if (sku.availableToSellUnits <= 0 || currentWOC < sku.minWOC) {
    severity = 'critical';
    rationale = `ATS critically low (${sku.availableToSellUnits.toLocaleString()} units, ${currentWOC.toFixed(1)} WOC vs ${sku.minWOC} min). Immediate order required.`;
  } else if (triggerWeek >= 0 && triggerWeek <= leadTime + 2) {
    severity = 'high';
    rationale = `Projected to breach reorder point in week ${triggerWeek}. Must order within ${Math.max(1, triggerWeek - leadTime)} weeks.`;
  } else if (currentWOC < sku.targetWOC) {
    severity = 'medium';
    rationale = `WOC ${currentWOC.toFixed(1)} below target ${sku.targetWOC}. Order to restore coverage.`;
  } else if (currentWOC > sku.targetWOC * 2 && sku.expiringSoonUnits > 0) {
    severity = 'low';
    rationale = `Excess inventory with ${sku.expiringSoonUnits.toLocaleString()} units expiring soon. Pause replenishment.`;
  } else if (currentWOC > sku.targetWOC * 1.5) {
    severity = 'none';
    rationale = `Excess WOC (${currentWOC.toFixed(1)}). No order recommended.`;
  }

  if (severity === 'critical' || severity === 'high' || severity === 'medium') {
    const targetUnits = Math.max(0, sku.targetWOC * avgWeeklyDemand - currentPosition);
    const batchUnits = sku.batchSizeCases * sku.unitsPerCase;
    const minBatches = Math.ceil((sku.moqCases * sku.unitsPerCase) / batchUnits);
    const neededBatches = Math.ceil(targetUnits / batchUnits);
    recommendedCases = Math.max(minBatches, neededBatches) * sku.batchSizeCases;
  }

  // Date backsolve — all relative to Apr 6 2026 baseline
  const base = new Date('2026-04-06');
  const addWks = (d: Date, w: number): string => {
    const n = new Date(d);
    n.setDate(n.getDate() + Math.round(w) * 7);
    return n.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // rawNeedByWeek can be negative (already late) or far-future (52 = no action needed)
  const rawNeedByWeek = triggerWeek > 0
    ? triggerWeek - leadTime - poApprovalLeadTimeWeeks
    : (severity !== 'none' && severity !== 'low' ? 0 : 52);
  const needByWeek = Math.max(0, rawNeedByWeek);

  const orderDate      = addWks(base, rawNeedByWeek);   // can be in the past if late
  const prodStartDate  = addWks(base, needByWeek + poApprovalLeadTimeWeeks);
  const prodCompleteDate = addWks(base, needByWeek + poApprovalLeadTimeWeeks + sku.productionLeadTimeWeeks);
  const shipDate       = addWks(base, needByWeek + poApprovalLeadTimeWeeks + sku.productionLeadTimeWeeks);
  const arrivalDate    = addWks(base, needByWeek + poApprovalLeadTimeWeeks + sku.productionLeadTimeWeeks + sku.transitLeadTimeWeeks);
  const availableDate  = addWks(base, needByWeek + poApprovalLeadTimeWeeks + sku.productionLeadTimeWeeks + sku.transitLeadTimeWeeks + sku.receiptLagWeeks);

  const orderWeekOffset    = rawNeedByWeek;
  const isLate             = rawNeedByWeek <= 0 && (severity === 'critical' || severity === 'high' || severity === 'medium');
  const daysUntilLatestPO  = Math.round(rawNeedByWeek * 7);
  const stockoutWk         = triggerWeek > 0 ? triggerWeek : needByWeek + leadTime + 2;
  const serviceRiskIfMissed = isLate
    ? `${Math.abs(daysUntilLatestPO)}d overdue — stockout risk ${addWks(base, stockoutWk)}`
    : severity === 'none' ? 'Minimal — inventory is healthy'
    : `Stockout risk by ${addWks(base, stockoutWk)} if PO not placed by ${orderDate}`;
  const poValue = recommendedCases * sku.casePrice;

  const recUnits = recommendedCases * sku.unitsPerCase;
  const postPosition = currentPosition + recUnits;
  const postWOC = computeWOC(postPosition, avgWeeklyDemand);

  return {
    dpci: sku.dpci,
    caseCode: sku.caseCode,
    name: sku.name,
    category: sku.category,
    onHandUnits: sku.onHandUnits,
    atsUnits: sku.availableToSellUnits,
    inTransitUnits: sku.inTransitUnits,
    onOrderUnits: sku.onOrderUnits,
    atRiskUnits: sku.atRiskUnits,
    expiringSoonUnits: sku.expiringSoonUnits,
    currentWOC: Math.round(currentWOC * 10) / 10,
    targetWOC: sku.targetWOC,
    demandDuringLeadTime,
    safetyStockUnits: Math.round(safetyStock),
    reorderPoint: Math.round(reorderPoint),
    recommendedCases,
    recommendedUnits: recUnits,
    orderDate,
    prodStartDate,
    shipDate,
    arrivalDate,
    postDeliveryWOC: Math.round(postWOC * 10) / 10,
    postDeliveryATS: Math.max(0, postPosition - sku.allocatedUnits),
    rationale,
    severity,
    prodCompleteDate,
    availableDate,
    poValue: Math.round(poValue),
    orderWeekOffset,
    isLate,
    daysUntilLatestPO,
    serviceRiskIfMissed,
  };
}

// ─── Risk detection ───────────────────────────────────────────────────────────

/** Produces ranked RiskFlags for one SKU. Returns empty array if no risks found. */
export function detectRisks(
  sku: SupplySku,
  sim: WeekSimRow[],
  lots: LotRecord[],
  rec: PORecommendation,
): RiskFlag[] {
  const risks: RiskFlag[] = [];
  const base = new Date('2026-04-06');
  const addWks = (w: number): string => {
    const d = new Date(base);
    d.setDate(d.getDate() + w * 7);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Missed PO window — PO deadline already passed
  if (rec.isLate && rec.recommendedCases > 0) {
    risks.push({
      id: `${sku.dpci}-late-po`,
      dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
      riskType: 'Missed PO Window',
      severity: rec.severity === 'critical' ? 'critical' : 'high',
      impactDate: rec.orderDate,
      unitsAffected: rec.recommendedUnits,
      casesAffected: rec.recommendedCases,
      revenueAtRisk: Math.round(rec.demandDuringLeadTime * sku.msrp),
      inventoryValueAtRisk: rec.poValue,
      recommendedAction: `PO window passed (due ${rec.orderDate}). Issue ${rec.recommendedCases} cases now. ${rec.serviceRiskIfMissed}`,
    });
  }

  // Stockout risk
  const soWeek = sim.findIndex(w => w.isStockout);
  if (soWeek >= 0 && soWeek <= 16) {
    const demandAtRisk = sim.slice(soWeek, soWeek + 4).reduce((a, w) => a + w.demandUnits, 0);
    risks.push({
      id: `${sku.dpci}-stockout`,
      dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
      riskType: 'Imminent Stockout',
      severity: soWeek <= 4 ? 'critical' : 'high',
      impactDate: addWks(soWeek),
      unitsAffected: demandAtRisk,
      casesAffected: Math.ceil(demandAtRisk / sku.unitsPerCase),
      revenueAtRisk: Math.round(demandAtRisk * sku.msrp),
      inventoryValueAtRisk: 0,
      recommendedAction: `Order ${rec.recommendedCases} cases. Order by ${rec.orderDate}. Arrival: ${rec.arrivalDate}.`,
    });
  }

  // Below min WOC (without full stockout)
  if (rec.currentWOC < sku.minWOC && soWeek < 0) {
    risks.push({
      id: `${sku.dpci}-lowwoc`,
      dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
      riskType: 'Below Min WOC',
      severity: 'high',
      impactDate: 'Now',
      unitsAffected: sku.availableToSellUnits,
      casesAffected: Math.ceil(sku.availableToSellUnits / sku.unitsPerCase),
      revenueAtRisk: Math.round(sku.availableToSellUnits * sku.msrp),
      inventoryValueAtRisk: Math.round(sku.availableToSellUnits * sku.unitPrice),
      recommendedAction: `Place order for ${rec.recommendedCases} cases by ${rec.orderDate}.`,
    });
  }

  // Lot-level expiry / stop-ship risks
  for (const lot of lots) {
    if (lot.riskStatus === 'stopShipRisk') {
      const daysLeft = Math.ceil((new Date(lot.expirationDate).getTime() - base.getTime()) / 86400000);
      risks.push({
        id: `${sku.dpci}-lot-${lot.lotCode}`,
        dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
        riskType: 'Stop-Ship Exposure',
        severity: 'critical',
        impactDate: new Date(lot.stopShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        unitsAffected: lot.units,
        casesAffected: lot.cases,
        revenueAtRisk: Math.round(lot.units * sku.msrp),
        inventoryValueAtRisk: lot.inventoryValue,
        lotCode: lot.lotCode,
        recommendedAction: `${daysLeft} days to expiry. Accelerate sell-through or request Target disposition approval.`,
      });
    } else if (lot.riskStatus === 'expiringSoon') {
      const daysLeft = Math.ceil((new Date(lot.expirationDate).getTime() - base.getTime()) / 86400000);
      risks.push({
        id: `${sku.dpci}-lot-${lot.lotCode}`,
        dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
        riskType: 'Lot Expiry Risk',
        severity: 'high',
        impactDate: new Date(lot.stopShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        unitsAffected: lot.units,
        casesAffected: lot.cases,
        revenueAtRisk: Math.round(lot.units * sku.msrp),
        inventoryValueAtRisk: lot.inventoryValue,
        lotCode: lot.lotCode,
        recommendedAction: `${daysLeft} days to expiry. Monitor sell-through rate. Prioritize in promo plan.`,
      });
    }
  }

  // Excess inventory
  const avgWOC = sim.slice(0, 13).reduce((a, w) => a + w.woc, 0) / 13;
  if (avgWOC > sku.targetWOC * 1.8) {
    const avgDemand = sim.slice(0, 4).reduce((a, w) => a + w.demandUnits, 0) / 4;
    const excessUnits = Math.max(0, sim[0]?.endingUnits - sku.targetWOC * avgDemand);
    if (excessUnits > 0) {
      risks.push({
        id: `${sku.dpci}-excess`,
        dpci: sku.dpci, caseCode: sku.caseCode, name: sku.name, category: sku.category,
        riskType: 'Excess / Overstock',
        severity: 'medium',
        impactDate: 'Ongoing',
        unitsAffected: Math.round(excessUnits),
        casesAffected: Math.ceil(excessUnits / sku.unitsPerCase),
        revenueAtRisk: 0,
        inventoryValueAtRisk: Math.round(excessUnits * sku.unitPrice),
        recommendedAction: `Avg WOC ${avgWOC.toFixed(1)} over 13 weeks. Pause replenishment. Investigate velocity.`,
      });
    }
  }

  return risks;
}

// ─── Finance summary ──────────────────────────────────────────────────────────

export function computeFinanceSummary(
  skus: SupplySku[],
  recs: PORecommendation[],
): FinanceSummary {
  const onHandValue = skus.reduce((a, s) => a + s.onHandUnits * s.unitPrice, 0);
  const inTransitValue = skus.reduce((a, s) => a + s.inTransitUnits * s.unitPrice, 0);
  const onOrderValue = skus.reduce((a, s) => a + s.onOrderUnits * s.unitPrice, 0);
  const atRiskValue = skus.reduce((a, s) => a + s.atRiskUnits * s.unitPrice, 0);
  const expiringSoonValue = skus.reduce((a, s) => a + s.expiringSoonUnits * s.unitPrice, 0);
  const availableToSellValue = skus.reduce((a, s) => a + s.availableToSellUnits * s.unitPrice, 0);

  // Stockout revenue risk: demand during lead time for critical/high SKUs × MSRP × 0.5 exposure factor
  const criticalRecs = recs.filter(r => r.severity === 'critical' || r.severity === 'high');
  const skuMap = new Map(skus.map(s => [s.dpci, s]));
  const stockoutRevenueRisk = criticalRecs.reduce((a, r) => {
    const sku = skuMap.get(r.dpci);
    return a + (sku ? r.demandDuringLeadTime * sku.msrp * 0.5 : 0);
  }, 0);

  // Excess inventory value: onHand above targetWOC threshold
  const excessInventoryValue = skus.reduce((a, s) => {
    const avgWklyDemand = s.onHandUnits / Math.max(s.targetWOC, 1);
    const excessUnits = Math.max(0, s.onHandUnits - s.targetWOC * 1.5 * avgWklyDemand);
    return a + excessUnits * s.unitPrice;
  }, 0);

  // 30-day PO spend: critical + high severity recommendations
  const projectedPOSpend30d = criticalRecs.reduce((a, r) => {
    const sku = skuMap.get(r.dpci);
    return a + (sku ? r.recommendedCases * sku.casePrice : 0);
  }, 0);

  // 60-day: add medium severity
  const projectedPOSpend60d = projectedPOSpend30d + recs
    .filter(r => r.severity === 'medium')
    .reduce((a, r) => {
      const sku = skuMap.get(r.dpci);
      return a + (sku ? r.recommendedCases * sku.casePrice : 0);
    }, 0);

  // 90-day: extrapolate at 1.15× of 60-day (assumes some new orders emerge)
  const projectedPOSpend90d = projectedPOSpend60d * 1.15;

  const workingCapitalExposure = excessInventoryValue + atRiskValue + expiringSoonValue;

  return {
    onHandValue: Math.round(onHandValue),
    inTransitValue: Math.round(inTransitValue),
    onOrderValue: Math.round(onOrderValue),
    atRiskValue: Math.round(atRiskValue),
    expiringSoonValue: Math.round(expiringSoonValue),
    availableToSellValue: Math.round(availableToSellValue),
    stockoutRevenueRisk: Math.round(stockoutRevenueRisk),
    excessInventoryValue: Math.round(excessInventoryValue),
    projectedPOSpend30d: Math.round(projectedPOSpend30d),
    projectedPOSpend60d: Math.round(projectedPOSpend60d),
    projectedPOSpend90d: Math.round(projectedPOSpend90d),
    workingCapitalExposure: Math.round(workingCapitalExposure),
    bearStockoutRisk: Math.round(stockoutRevenueRisk * 1.25),  // bear = more demand miss
    baseStockoutRisk: Math.round(stockoutRevenueRisk),
    bullStockoutRisk: Math.round(stockoutRevenueRisk * 0.75),  // bull = more sell-through cushion
  };
}

// ─── Contract Manufacturer types ─────────────────────────────────────────────

export interface ContractManufacturer {
  id: string;
  name: string;
  shortName: string;
  location: string;
  categories: string[];               // category keywords this CM handles
  poApprovalLeadTimeWeeks: number;    // time from PO release to production start
  capacityNotes: string;
  contactName: string;                // primary supplier contact
  contactEmail: string;
  contactPhone?: string;
}

export interface ManufacturerPlan {
  cm: ContractManufacturer;
  skus: SupplySku[];                  // all SKUs produced by this CM
  lines: PORecommendation[];          // all actionable recs (severity !== 'none')
  lines4wk: PORecommendation[];       // POs that need to be placed within 4 weeks
  lines8wk: PORecommendation[];
  lines12wk: PORecommendation[];
  lines26wk: PORecommendation[];
  totalLines: number;
  criticalLines: number;
  lateLines: number;
  totalCases: number;
  totalPOValue: number;
  commitmentByMonth: { month: string; cases: number; value: number }[];
  missedWindowCount: number;
}

/**
 * Aggregates SKU-level PO recommendations into per-manufacturer execution plans.
 * Each ManufacturerPlan contains rolling horizon buckets, monthly commitment schedule,
 * and all data needed to generate both internal action plans and external CM-facing supply plans.
 */
export function buildManufacturerPlans(
  cms: ContractManufacturer[],
  skus: SupplySku[],
  recs: PORecommendation[],
): ManufacturerPlan[] {
  const base = new Date('2026-04-06');
  const sevOrd: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

  return cms.map(cm => {
    // Match SKUs to this CM by category keyword overlap
    const cmSkus = skus.filter(s =>
      cm.categories.some(c => s.category.toLowerCase().includes(c.toLowerCase())),
    );
    const cmDpcis = new Set(cmSkus.map(s => s.dpci));

    // Actionable PO lines for this CM, sorted by severity
    const lines = recs
      .filter(r => cmDpcis.has(r.dpci) && r.severity !== 'none' && r.recommendedCases > 0)
      .sort((a, b) => sevOrd[a.severity] - sevOrd[b.severity]);

    // Rolling horizon buckets by orderWeekOffset
    const lines4wk  = lines.filter(r => r.orderWeekOffset <= 4);
    const lines8wk  = lines.filter(r => r.orderWeekOffset <= 8);
    const lines12wk = lines.filter(r => r.orderWeekOffset <= 12);
    const lines26wk = lines.filter(r => r.orderWeekOffset <= 26);

    // Monthly production commitment — bucket by prod start month
    const monthMap = new Map<string, { cases: number; value: number }>();
    for (const rec of lines) {
      const prodOffset = Math.max(0, rec.orderWeekOffset + cm.poApprovalLeadTimeWeeks);
      const prodStartD = new Date(base);
      prodStartD.setDate(prodStartD.getDate() + prodOffset * 7);
      const month = prodStartD.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const entry = monthMap.get(month) || { cases: 0, value: 0 };
      entry.cases += rec.recommendedCases;
      entry.value += rec.poValue;
      monthMap.set(month, entry);
    }

    return {
      cm,
      skus: cmSkus,
      lines,
      lines4wk,
      lines8wk,
      lines12wk,
      lines26wk,
      totalLines: lines.length,
      criticalLines: lines.filter(r => r.severity === 'critical').length,
      lateLines:     lines.filter(r => r.isLate).length,
      totalCases:    lines.reduce((a, r) => a + r.recommendedCases, 0),
      totalPOValue:  lines.reduce((a, r) => a + r.poValue, 0),
      commitmentByMonth: [...monthMap.entries()].map(([month, d]) => ({ month, ...d })),
      missedWindowCount: lines.filter(r => r.isLate).length,
    };
  });
}
