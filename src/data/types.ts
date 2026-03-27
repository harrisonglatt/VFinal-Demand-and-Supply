// ─── Data Type Definitions ──────────────────────────────────────────────
// TypeScript interfaces for all JSON data shapes in the demand intelligence dashboard.

// ─── Demand Plan (dp.json) ──────────────────────────────────────────────

export interface DPSku {
  name: string;
  dpci: string;
  category: string;
  stores: number;
  price: number;
  ucase: number;
  lw_upspw: number;
  lw_dpspw: number;
  lw_rev: number;
  hist: number[];
  fcast: number[];
}

export interface DPData {
  skus: DPSku[];
  hist_weeks: string[];
  fcast_weeks: string[];
}

// ─── Promo Calendar (promo.json) ────────────────────────────────────────

export interface PromoEvent {
  wk: number;
  date: string;
  event: string;
  category: string;
  status: string;
  type: string;
  stores: string;
  mechanic: string;
  lift_pct: string;
  confidence: string;
}

// ─── Ship Plan (ship.json) ──────────────────────────────────────────────

export interface ShipSku {
  description: string;
  category: string;
  dpci: string;
  units_per_case: number;
  /** Keyed by week label or summary label (e.g. "3/22 '26", "13-wk PO Cases", "Gap Cases", "Gap Units", "Coverage %", "13-wk Fcast Cases") */
  weeks: Record<string, number>;
  /** Keyed by week label; true = that week is a forecast (not committed PO) */
  fcast_weeks: Record<string, boolean>;
}

export interface ShipData {
  week_labels: string[];
  skus: ShipSku[];
}

// ─── Daily Tracker (daily.json) ─────────────────────────────────────────

export interface DailyTotal {
  date: string;
  dow: string;
  wk: string;
  units: number;
  sales: number;
}

export interface DowCompare {
  dow: string;
  lw_date: string;
  cw_date: string;
  lw_units: number;
  cw_units: number;
  lw_sales: number;
  cw_sales: number;
}

export interface CatSummary {
  cat: string;
  cw_units: number;
  cw_sales: number;
  lw_units: number;
  lw_sales: number;
  lw_3day_sales: number;
  lw_3day_units: number;
  wow_sales: number;
}

export interface DailyData {
  as_of: string;
  cw_label: string;
  lw_label: string;
  days_in: number;
  lw_days: number;
  cw_units: number;
  cw_sales: number;
  lw_units: number;
  lw_sales: number;
  lw_daily_avg_u: number;
  lw_daily_avg_s: number;
  cw_daily_avg_u: number;
  cw_daily_avg_s: number;
  daily_totals: DailyTotal[];
  dow_compare: DowCompare[];
  cat_summary: CatSummary[];
}

// ─── Forecast Accuracy (accuracy.json) ──────────────────────────────────

export interface AccuracySku {
  dpci: string;
  name: string;
  category: string;
  mape_l4w: number;
  mape_l8w: number;
  bias_l4w: number;
  bias_l8w: number;
  mape_promo: number;
  mape_base: number;
  volatility: number;
  trust_score: number;
  trust_level: string;
  data_quality: string;
  lw_actual: number;
  lw_fcast: number;
  lw_err_pct: number;
}

export interface AccuracyData {
  as_of: string;
  model_mape_l4w: number;
  model_bias_l4w: number;
  cat_mape: Record<string, number>;
  cat_bias: Record<string, number>;
  skus: AccuracySku[];
}

// ─── Stop-Ship / Risk OS (stopship.json) ────────────────────────────────

export interface StopShipSku {
  dpci: string;
  name: string;
  category: string;
  price: number;
  stop_ship_wk: number;
  stop_ship_date: string;
  reason: string;
  action: string;
  dc_on_hand: number;
  dc_inbound: number;
  total_available: number;
  fcast_to_stop_base: number;
  fcast_to_stop_bear: number;
  fcast_to_stop_bull: number;
  leftover_base: number;
  leftover_bear: number;
  leftover_bull: number;
  risk_usd_base: number;
  risk_usd_bear: number;
  risk_usd_bull: number;
  st_pct_base: number;
  st_pct_bear: number;
  st_pct_bull: number;
  risk_level: string;
  trust_level: string;
  mape_l4w: number;
  confidence_flag: string;
}

export interface StopShipData {
  as_of: string;
  total_bear_exposure_usd: number;
  total_base_exposure_usd: number;
  total_bear_units: number;
  high_risk_count: number;
  medium_risk_count: number;
  skus: StopShipSku[];
}

// ─── Inventory Health (inv.json) ────────────────────────────────────────

export interface InvSku {
  description: string;
  dpci: string;
  stores_tracked: number;
  l4w_upspw: number;
  oos_pct: number;
  wos_current: number;
  wos_4w_ago: number;
  eoh_units: number;
  on_order_units: number;
  lost_dollar_week: number;
  risk_flag: string;
  action: string;
}

export interface InvData {
  summary: {
    oos_alerts: number;
    supply_watch: number;
    lost_per_week: number;
    annualized_loss: number;
  };
  skus: InvSku[];
}

// ─── Historical Sales (hist.json) ───────────────────────────────────────

export interface HistSku {
  product: string;
  dpci: string;
  product_line: string;
  weeks: Record<string, number>;
}

export interface HistData {
  weeks: string[];
  skus: HistSku[];
}

// ─── Launch Tracker (launch.json) ───────────────────────────────────────

export interface LaunchSku {
  dpci: string;
  name: string;
  stores: number;
  bear: number;
  base: number;
  bull: number;
}

export interface LaunchData {
  launch_date: string;
  skus: LaunchSku[];
}

// ─── Actual vs Forecast (avf.json) ──────────────────────────────────────

export interface AVFSku {
  sku: string;
  name: string;
  dpci: string;
  category: string;
  lw_units: number;
  lw_sales: number;
  lw_stores: number;
  lw_upspw: number;
  fcast_units: number;
  fcast_sales: number;
  vs_fcast_units: number;
  vs_fcast_pct: number;
  l4w_avg_units: number;
  price: number;
  cw_units_to_date: number;
  cw_sales_to_date: number;
  cw_stores: number;
}

// ─── Omni Channel (omni.json) ───────────────────────────────────────────

export interface OmniWeeklyTotal {
  week: string;
  units: number;
  sales: number;
}

export interface OmniSkuWeek {
  units: number;
  sales: number;
  stores: number;
  upspw: number;
}

export interface OmniSku {
  name: string;
  dpci: string;
  weeks: Record<string, OmniSkuWeek>;
}

export interface OmniData {
  as_of_date: string;
  lw_date: string;
  cw_date: string;
  weeks: string[];
  weekly_totals: OmniWeeklyTotal[];
  /** Keyed by SKU code (e.g. "LS-DR01") */
  skus: Record<string, OmniSku>;
  lw_summary: {
    units: number;
    sales: number;
  };
}

// ─── Target DC Inventory (target-dc.json) ───────────────────────────────

export interface TargetDCSku {
  dpci: string;
  sku: string;
  name: string;
  oh_units: number;
  on_order: number;
  velocity: number;
  wos_dc: number;
  stores: number;
  oos_pct: string;
  dc_risk: string;
}

export interface TargetDCData {
  as_of: string;
  source: string;
  note: string;
  skus: TargetDCSku[];
}

// ─── PO Forecast (pofc.json) ────────────────────────────────────────────

export interface POFCSku {
  dpci: string;
  name: string;
  desc: string;
  cat: string;
  upc: number;
  os_ratio: number;
  hist_cases: number;
  hist_units_sold: number;
  fcast_units_13wk: number;
  ratio_total_cases: number;
  cov_total_cases: number;
  plan_total_cases: number;
  ratio_by_week: number[];
  cov_by_week: number[];
  plan_by_week: number[];
}

export interface POFCData {
  weeks: string[];
  target_wos: number;
  min_reorder_wos: number;
  reorder_cycle_wks: number;
  as_of: string;
  totals: {
    plan: number;
    ratio: number;
    cov: number;
  };
  skus: POFCSku[];
}

// ─── Backtest (backtest.json) ───────────────────────────────────────────

export interface BacktestCatBias {
  bias_pct: number;
  mape_pct: number;
  n_obs: number;
}

export interface BacktestPromoType {
  bias_pct: number;
  mape_pct: number;
  n_obs: number;
  by_cat: Record<string, BacktestCatBias>;
  summary: string;
  action: string;
}

export interface BacktestCatBaseline {
  mape_base: number;
  bias_base: number;
  n_obs: number;
  trend: string;
}

export interface BacktestSku {
  dpci: string;
  bias_base: number;
  bias_promo: number;
  n_obs_base: number;
  n_obs_promo: number;
  conservative_tilt: number;
  reason: string;
}

export interface BacktestData {
  as_of: string;
  methodology_note: string;
  promo_type_bias: Record<string, BacktestPromoType>;
  cat_baseline: Record<string, BacktestCatBaseline>;
  skus: BacktestSku[];
}

// ─── Endcap History (endcap-history.json) ───────────────────────────────

export interface EndcapHistoryEvent {
  wk: number;
  date: string;
  event: string;
  category: string;
  status: string;
  type: string;
  stores: string;
  mechanic: string;
  lift_pct: string;
  actual_lift: number;
}

// ─── Historical Promo (hist-promo.json) ─────────────────────────────────

export interface HistPromoEvent {
  wk: number;
  date: string;
  event: string;
  category: string;
  type: string;
  mechanic: string;
  model_lift_pct: number;
  actual_lift_pct: number;
  model_lift_x: number;
  actual_lift_x: number;
  model_units: number;
  actual_units: number;
  delta_pct: number;
  over_under: string;
  key_skus: string;
  notes: string;
  status: string;
  confidence_in_actual: string;
}

// ─── Forecast Revenue (fcast-rev.json) ──────────────────────────────────

/** 52-week forward revenue forecast as a flat number array */
export type FcastRev52Wk = number[];

// ─── Promo Computation Derived Types ────────────────────────────────────

export type PromoCatMapSrc = Record<string, string[] | null>;

export interface PromoWkCatEntry {
  cats: Set<string>;
  all: boolean;
}

export type PromoWkCats = Record<number, PromoWkCatEntry>;

// ─── Scenario Types ─────────────────────────────────────────────────────

export type ScenarioKey = 'bear' | 'base' | 'bull';

export interface ScenarioBands {
  p10: number;
  p50: number;
  p90: number;
}
