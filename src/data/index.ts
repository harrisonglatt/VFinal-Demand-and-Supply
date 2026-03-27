// ─── Data Loader ──────────────────────────────────────────────────────
// Central module that imports all JSON data files and exports them
// along with derived promo-calendar values.

import type {
  DailyData,
  DPData,
  InvData,
  ShipData,
  PromoEvent,
  LaunchData,
  HistData,
  EndcapHistoryEvent,
  AccuracyData,
  StopShipData,
  BacktestData,
  HistPromoEvent,
  OmniData,
  AVFSku,
  TargetDCData,
  POFCData,
  FcastRev52Wk,
  PromoWkCats,
} from './types';

import {
  PROMO_CAT_MAP_SRC,
  promoSkuCats,
  buildPromoWkCats,
  buildPromoWks,
  isOnPromo as _isOnPromo,
} from '../lib/computations/promo';

import daily from './json/daily.json';
import dp from './json/dp.json';
import inv from './json/inv.json';
import ship from './json/ship.json';
import promo from './json/promo.json';
import launch from './json/launch.json';
import hist from './json/hist.json';
import endcapHistory from './json/endcap-history.json';
import accuracy from './json/accuracy.json';
import stopship from './json/stopship.json';
import fcastRev from './json/fcast-rev.json';
import backtest from './json/backtest.json';
import histPromo from './json/hist-promo.json';
import omni from './json/omni.json';
import avf from './json/avf.json';
import targetDc from './json/target-dc.json';
import pofc from './json/pofc.json';

// ─── Raw data exports ─────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
// JSON imports need `unknown` intermediate cast because TS infers
// literal types from the JSON that don't match our wider interfaces.
export const DATA_DAILY = daily as unknown as DailyData;
export const DATA_DP = dp as unknown as DPData;
export const DATA_INV = inv as unknown as InvData;
export const DATA_SHIP = ship as unknown as ShipData;
export const DATA_PROMO = promo as unknown as PromoEvent[];
export const DATA_LAUNCH = launch as unknown as LaunchData;
export const DATA_HIST = hist as unknown as HistData;
export const DATA_ENDCAP_HISTORY = endcapHistory as unknown as EndcapHistoryEvent[];
export const DATA_ACCURACY = accuracy as unknown as AccuracyData;
export const DATA_STOPSHIP = stopship as unknown as StopShipData;
export const DATA_BACKTEST = backtest as unknown as BacktestData;
export const DATA_HIST_PROMO = histPromo as unknown as HistPromoEvent[];
export const DATA_OMNI = omni as unknown as OmniData;
export const DATA_AVF = avf as unknown as AVFSku[];
export const DATA_TARGET_DC = targetDc as unknown as TargetDCData;
export const DATA_POFC = pofc as unknown as POFCData;

// ─── Forecast revenue 52-week array ───────────────────────────────────

export const FCAST_REV_52WK = fcastRev as unknown as FcastRev52Wk;

// ─── Promo-week set ───────────────────────────────────────────────────

/** Set of all week numbers that have at least one promo event */
export const PROMO_WKS: Set<number> = buildPromoWks(DATA_PROMO);

// ─── Promo week → categories lookup ───────────────────────────────────

/** Map of weekNum → { cats: Set<string>, all: boolean } */
export const PROMO_WK_CATS: PromoWkCats = buildPromoWkCats(DATA_PROMO);

// ─── Re-export promo computation helpers ──────────────────────────────

export { PROMO_CAT_MAP_SRC, promoSkuCats };

/**
 * Check whether a given week + SKU category is on promo.
 * Convenience wrapper that uses the module-level PROMO_WK_CATS.
 */
export function isOnPromo(weekNum: number, skuCategory: string): boolean {
  return _isOnPromo(weekNum, skuCategory, PROMO_WK_CATS);
}

// ─── Re-export types for consumer convenience ─────────────────────────

export type * from './types';
