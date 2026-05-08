# Little Spoon Retail OS — Data & Module Reference

**Repo:** https://github.com/harrisonglatt/VFinal-Demand-and-Supply
**Live:** https://v-final-demand-and-supply.vercel.app

This document is the single source of truth for:
1. The unified per-SKU data model (every field, every source)
2. CSV / file inputs needed today and where they live
3. The live-data API roadmap — what each file becomes
4. Module-by-module summary of every page, embedded dashboard, context, and API route

---

## 1. SKU-level data inventory

### 1.1 Unified per-SKU schema

If we joined all 11 SKU-level JSON files into one canonical record, this is what we'd have. Today they live in separate files keyed by `dpci`; eventually this is the shape a single API endpoint should return.

```typescript
interface UnifiedSku {
  // ── Identity (from sku-specs.json) ──────────────────────────
  itemNumber:            string;   // "LS-WMR01" (retail/fulfillment SKU)
  productionSku:         string;   // "LS-MR01"
  dpci:                  string;   // "284-26-0151" (Target DPCI — primary key)
  upc:                   string;   // "850073237182"
  gtin:                  string;   // "10850073237189"

  // ── Product definition (sku-specs.json) ─────────────────────
  description:           string;   // "Green Dream, Refrigerated, 8 ct."
  name:                  string;   // user-facing name
  category:              string;   // "Smoothies"
  storageTransit:        "Frozen" | "Refrigerated" | "Ambient";
  coPacker:              string;   // "IFI/APC"

  // ── Pack / pallet (sku-specs.json) ──────────────────────────
  unitsPerCase:          number;
  unitCount:             number;   // 1 or 4 (multipack)
  unitWeightLbs:         number;
  caseWeightLbs:         number;
  caseDimensions:        string;   // "10\" x 3.25\" x 6.5\""
  casesPerPallet:        number;
  casesPerLayer:         number;
  layers:                number;
  palletDimensions:      string | null;
  unitsPerPallet:        number;

  // ── Shelf life + supply (sku-specs.json) ────────────────────
  shelfLifeDays:           number;
  stopShipDays:            number;
  moqCases:                number | null;
  productionLeadTimeWeeks: number | null; // user-editable
  transitLeadTimeWeeks:    number | null; // user-editable

  // ── Pricing (CASE_CODE_MAP in lib/owlery/transform.ts) ──────
  msrp:                  number;
  unitPrice:             number;   // wholesale
  casePrice:             number;

  // ── Distribution (dp.json) ──────────────────────────────────
  stores:                number;   // # of Target stores carrying

  // ── Last-week actuals (dp.json + avf.json) ──────────────────
  lw_units:              number;
  lw_sales:              number;
  lw_stores:             number;
  lw_upspw:              number;   // units / store / week
  lw_dpspw:              number;   // dollars / store / week
  lw_rev:                number;

  // ── Current-week to-date (avf.json) ─────────────────────────
  cw_units_to_date:      number;
  cw_sales_to_date:      number;
  cw_stores:             number;

  // ── Forecast vs actual (avf.json) ───────────────────────────
  fcast_units:           number;
  fcast_sales:           number;
  vs_fcast_units:        number;
  vs_fcast_pct:          number;
  l4w_avg_units:         number;

  // ── 52-week forecast (dp.json) ──────────────────────────────
  hist:                  number[]; // historical weekly units
  fcast:                 number[]; // forward 52w weekly units

  // ── Ship plan (ship.json) ───────────────────────────────────
  ship_weeks:            Record<string, number>;     // weekLabel → cases
  ship_fcast_weeks:      Record<string, boolean>;    // weekLabel → isForecast
  ship_units_per_case:   number;

  // ── Inventory (inv.json + target-dc.json) ───────────────────
  stores_tracked:        number;
  l4w_upspw:             number;
  oos_pct:               number;
  wos_current:           number;
  wos_4w_ago:            number;
  eoh_units:             number;       // LS warehouse end-on-hand
  on_order_units:        number;       // LS open POs from co-packers
  dc_oh_units:           number;       // Target DC on-hand
  dc_on_order:           number;       // Target DC inbound
  dc_velocity:           number;
  dc_wos:                number;
  dc_oos_pct:            string;
  dc_risk:               string;
  lost_dollar_week:      number;
  risk_flag:             string;
  action:                string;

  // ── Forecast accuracy (accuracy.json) ───────────────────────
  mape_l4w:              number;
  mape_l8w:              number;
  bias_l4w:              number;
  bias_l8w:              number;
  mape_promo:            number;
  mape_base:             number;
  volatility:            number;
  trust_score:           number;
  trust_level:           "high" | "medium" | "low";
  data_quality:          string;
  lw_actual:             number;
  lw_fcast:              number;
  lw_err_pct:            number;

  // ── Stop-ship / risk (stopship.json) ────────────────────────
  stop_ship_wk:          number;
  stop_ship_date:        string;
  reason:                string;
  total_available:       number;
  fcast_to_stop_base:    number;
  fcast_to_stop_bear:    number;
  fcast_to_stop_bull:    number;
  leftover_base:         number;
  leftover_bear:         number;
  leftover_bull:         number;
  risk_usd_base:         number;
  risk_usd_bear:         number;
  risk_usd_bull:         number;
  st_pct_base:           number;
  st_pct_bear:           number;
  st_pct_bull:           number;
  risk_level:            "critical" | "high" | "medium" | "low" | "none";
  confidence_flag:       string;

  // ── PO forecast (pofc.json) ─────────────────────────────────
  os_ratio:              number;
  hist_cases:            number;
  hist_units_sold:       number;
  fcast_units_13wk:      number;
  ratio_total_cases:     number;
  cov_total_cases:       number;
  plan_total_cases:      number;
  ratio_by_week:         number[]; // 13 weeks
  cov_by_week:           number[];
  plan_by_week:          number[];

  // ── Launch ramp (launch.json — only for new SKUs) ───────────
  launch_stores?:        number;
  launch_bear?:          number;
  launch_base?:          number;
  launch_bull?:          number;
}
```

### 1.2 Where the data lives today

| File | Source today | Records | What it powers |
|---|---|---|---|
| `src/data/json/sku-specs.json` | Co-packer Excel files (manual) | 31 | Pack specs, lead times, MOQ, pallet math |
| `src/data/json/dp.json` | Internal demand plan model | 28 | 52-wk forecast, last-week actuals |
| `src/data/json/inv.json` | LS warehouse export | 29 | LS inventory, OOS, WOC |
| `src/data/json/target-dc.json` | Target Partners Online (manual) | 28 | Target DC on-hand + WOC |
| `src/data/json/accuracy.json` | Computed (model_learning) | 28 | MAPE / bias / trust score |
| `src/data/json/stopship.json` | Computed from inv + shelf life | 7 | Stop-ship exposure |
| `src/data/json/pofc.json` | Computed from dp + ship | 30 | 13-wk PO forecast |
| `src/data/json/ship.json` | Owlery API + plan | 30 | Shipped + planned cases |
| `src/data/json/avf.json` | Computed (Omni + dp) | 28 | Last-week actuals vs forecast |
| `src/data/json/hist.json` | Omni weekly export | 29 | Historical weekly units (long-form) |
| `src/data/json/omni.json` | Omni weekly export | 29 | Daily + weekly totals + sku breakdown |
| `src/data/json/launch.json` | Manual launch plan | 4 | New-SKU ramp scenarios |
| `src/data/json/daily.json` | Omni daily export | n/a | Daily performance dashboard |
| `src/data/json/promo.json` | Manual + parsed calendar | events | Promo events |
| `src/data/json/promo-calendar.json` | Parsed Target promo calendar XLSX | events | Calendar grid |
| `src/data/json/endcap-history.json` | Manual capture | events | Endcap actuals |
| `src/data/json/hist-promo.json` | Manual capture | events | Historical promo lift seeds |
| `src/data/json/backtest.json` | Computed (backtest tool) | n/a | Model bias by category |
| `src/data/json/fcast-rev.json` | Computed | 52 weeks | Top-line revenue forecast |
| `public/sop/unified.json` | Retail-SOP build pipeline | 1.1 MB | S&OP dashboard data |
| `public/promo-tracker/data/sales-latest.csv` | Omni `getData` export | weeks | Promo Intel sales feed |
| `public/promo-tracker/Little Spoon Promo Calendar.xlsx` | Target promo calendar | events | Promo Intel calendar |

---

## 2. CSV / file inputs needed and where they go

### 2.1 Today (manual file refresh)

| Where it goes | What you drop in | Refresh cadence | Build step |
|---|---|---|---|
| `src/data/json/dp.json` | Demand plan output (Excel/internal model) | Weekly | Re-import + commit |
| `src/data/json/inv.json` | LS warehouse inventory snapshot | Daily | Re-import + commit |
| `src/data/json/target-dc.json` | Target DC view from Partners Online | Weekly | Re-import + commit |
| `src/data/json/omni.json` + `hist.json` + `daily.json` + `avf.json` | Omni `getData` weekly pulls | Weekly | Re-import + commit |
| `src/data/json/promo-calendar.json` | Parsed Target promo calendar XLSX | When updated | Re-parse + commit |
| `src/data/json/sku-specs.json` | Co-packer pack/pallet/MOQ data | Per SKU change | Manual edit |
| `public/promo-tracker/data/sales-latest.csv` | Omni weekly sales (raw) | Weekly | `node scripts/omni-to-csv.js …` then commit |
| `public/promo-tracker/Little Spoon Promo Calendar.xlsx` | Target promo calendar (raw XLSX) | When updated | Replace file + commit |
| `public/sop/unified.json` + `index.html` | Retail-SOP build (POS + Roundel + promo) | Weekly | `node build.js` in upstream repo |
| **PO Delivery Tracker** drag-drop (no commit) | Two Extensiv CSVs (Items + Sales Orders) + optional SKU Reference XLSX | Per session | None — runs in-browser |

### 2.2 What the embedded modules read

```
/sop                  reads → public/sop/unified.json  (inlined in index.html)
/promo-tracker        reads → public/promo-tracker/data/sales-latest.csv
                            + Little Spoon Promo Calendar.xlsx
/po-tracker-web       reads → user-uploaded CSVs (no persistent storage)
```

### 2.3 CSV column requirements

**Promo Intel sales CSV** (`public/promo-tracker/data/sales-latest.csv`):
```
Date: Week, Product, Product → Target DPCI, Product → Muffin Product Line,
Sales Dollars, Sales Units, Stores Scanning, PODs Scanning,
Promo Sales Dollars, Promo Sales Units
```

**PO Delivery Tracker — Items CSV**:
```
Order/Load Number, Reference #s, Item, Ordered,
Scheduled Dropoff Start, Load Status from Broker
```

**PO Delivery Tracker — Sales Orders CSV**:
```
Order #, Reference #s, Trading Partner, Order Status,
Load Status, Dropoff Date
```

**PO Delivery Tracker — SKU Reference XLSX** (optional):
```
A: SKU | B: Product name | F: Cost Per Case | G: Units/Case | H: Cost per each | J: Cases/Layer
```

---

## 3. Live data roadmap — what API connections eventually replace what

| Today (file) | Replaced by | What changes |
|---|---|---|
| `dp.json` | Internal demand-plan **model API** | 52-wk forecast refreshes on every plan change instead of weekly commit |
| `inv.json` | **LS WMS / ERP API** | Real-time on-hand, in-transit, allocated. EOH updates on pick/pack/ship events |
| `target-dc.json` | **Target Partners Online API** (or scraped + cached) | DC on-hand + on-order live, no manual download |
| `omni.json` / `hist.json` / `daily.json` / `avf.json` | **Omni MCP `getData`** → server-side scheduled pull | Cron-driven refresh, not a manual export |
| `ship.json` | **Owlery API** (already integrated for `/po-tracker`) — extend to ship plan | Live ship statuses (planned / in-transit / delivered) |
| `pofc.json` | Computed live from `dp` + `inv` + `ship` | Drops as a stored file |
| `accuracy.json` | Computed live from `omni` actuals vs `dp` forecast versions | Drops as a stored file |
| `stopship.json` | Computed live from `inv.lots` + `sku-specs.shelfLifeDays/stopShipDays` | Drops as a stored file |
| `promo-calendar.json` | **Target Promo Calendar API or POL feed** | XLSX upload retired |
| `public/promo-tracker/data/sales-latest.csv` | Same Omni server pull → tracker reads from a hosted URL (the tracker already supports this — see "Data sources" modal in `/promo-tracker`) | Auto-refresh every N hours |
| `public/sop/unified.json` | Same — server-side scheduled rebuild | Dashboard refreshes itself on schedule |
| **PO Delivery Tracker** uploads | **Extensiv API** (3PL Central) | Drag-drop step retired; tracker fetches directly |
| `sku-specs.json` | **Co-packer EDI 856 / spec sheets** + **internal product master** | Single source of truth, syncs into the app |
| `MeasuredLifts` localStorage | Same Omni-driven pipeline → server-side compute → API endpoint | Sync button auto-runs nightly instead of manual click |
| `PlannedPOs` localStorage | **EDI 850 PO write API** to co-packers + Owlery | "Stage PO" becomes "Issue PO" — emits real ASN-tracked POs |

**Adapter layer principle:** every live integration should land in a normalized form matching the existing types in `src/data/types.ts`. That keeps the app insulated from where the data came from. Today the JSON files are this layer — replacing them with API calls should not require touching any page component.

---

## 4. Module-by-module summary

### 4.1 Core surfaces (React, native to this app)

| Module | Route | What it does | Inputs |
|---|---|---|---|
| **Executive Summary** | `/executive` | Single-page leadership dashboard: 52-wk revenue/units (bear/base/bull), last-week sell-through with WoW, OOS watch, top risks, performance vs forecast, category mix, AI insights (`/api/insights`) | `dp`, `ship`, `promo`, `accuracy`, `stopship`, `avf`, `omni`, `inv`, `fcast-rev` |
| **S&OP Dashboard** | `/sop` | Embedded full Retail-SOP module (8 tabs) — your weekly meeting view | `public/sop/unified.json` (inlined) |
| **Overview** | `/overview` | Brand-level snapshot: KPIs, sales trend, category mix, top SKUs | `dp`, `omni`, `accuracy` |
| **Demand Plan** | `/demand-plan` | 52-wk SKU-level demand plan with bear/base/bull, manual velocity overrides, **promo lifts auto-apply** | `dp`, `PromoContext.getLift` (now measured-lift-aware) |
| **Daily Performance** | `/daily` | Day-of-week tracking, current-week run-rate, category mix | `daily`, `omni` |
| **ST vs Forecast** | `/actuals-vs-forecast` | Last-week actuals vs forecast, MAPE per SKU | `avf`, `accuracy` |
| **Supply Planning** | `/supply-planning` | The big one. 8 view tabs: Control Tower, Inventory States, **WOC Simulation**, **SKU Planner** (new), PO Recommendations, **PO Creator** (PDF generator + signature pad), Risk Center, Finance, CM Plans | `sku-specs`, `inv`, `target-dc`, `ship`, `dp` + Owlery POs + **`PlannedPOsContext`** + `PromoContext` |
| **SKU Specs & Lead Times** | `/sku-specs` | Editable pack/MOQ/lead-time master | `sku-specs.json` (with localStorage overrides for lead times) |
| **Inventory Intel** | `/inventory` | LS + Target DC inventory, OOS alerts, lost $ per week | `inv`, `target-dc` |
| **Shipment Plan** | `/shipment` | 52-wk ship plan vs forecast, gap analysis | `ship`, `dp` |
| **PO Tracker (Owlery)** | `/po-tracker` | Live Owlery PO data via `/api/owlery/pos` | Owlery API (live) |
| **PO Delivery Tracker** | `/po-tracker-web` | Embedded po-tracker-web — drag-in Extensiv CSVs → 4-tab dashboard (By SKU / By PO / Hierarchy / Layer Check) | User-uploaded CSVs |
| **Promo Calendar** | `/promo` | Add/edit/delete promo events; **drives demand plan via PromoContext** | `promo-calendar.json` + user state |
| **Promo Intel** | `/promo-tracker` | Embedded Retail-promo-tracker (8 tabs: Overview, Promo lift, Display, SKU detail, Calendar, Forecast, Diagnostics, Compare) — **measures actual lifts and syncs them back into demand plan via the bridge** | `public/promo-tracker/data/sales-latest.csv` + Promo Calendar XLSX → `MeasuredLiftsContext` |
| **Launch Ramp** | `/launch` | New-SKU launch plan with bear/base/bull store ramp | `launch.json` |
| **Historical S/T** | `/historical` | Long-form weekly history with category trend lines | `hist` |
| **Scenario Analysis** | `/scenario` | Ad-hoc scenario explorer, multi-SKU comparison | `dp`, `accuracy` |
| **Promo Lift** | `/endcap` | Endcap + Co-Space lift analysis on historical events | `endcap-history`, `hist-promo`, `backtest` |
| **Assumptions** | `/assumptions` | Global planning assumptions (target WOC, lead times, scenario multipliers) | static + localStorage |
| **Forecast Versions** | `/forecast-versions` | Locked snapshots of past forecast runs for accountability | `dp` history |
| **Model Learning Lab** | `/backtest` | Walk-forward backtest, bias by promo type, lift calibration | `backtest.json` |
| **Add SKU** | `/add-sku` | New SKU intake form (writes to `NewSkuContext`) | localStorage |
| **Risk Operating Center** | `/risk-os` | Aggregated risk surface (stop-ship, OOS, excess, missed PO windows) | computed from supply engine |
| **Actuals Tracking** | `/actuals-tracking` | Detailed actuals reconciliation | `omni`, `avf` |
| **Model Learning** | `/model-learning` | Calibration overrides per SKU/category | `CalibrationContext` |
| **Model Guide** | `/guide` | Documentation of the methodology | static |

### 4.2 Embedded modules (third-party, iframe-loaded)

| Module | Route | Stack | Source repo | Internal vs API |
|---|---|---|---|---|
| **S&OP Dashboard** | `/sop` | Vanilla JS + Chart.js + xlsx (CDN) | [Retail-SOP](https://github.com/harrisonglatt/Retail-SOP) | Reads `public/sop/unified.json` (rebuild script in repo) |
| **PO Delivery Tracker** | `/po-tracker-web` | Vanilla JS + PapaParse + SheetJS (CDN) | [po-tracker-web](https://github.com/harrisonglatt/po-tracker-web) | Pure client — no persistent state |
| **Promo Intel** | `/promo-tracker` | Vanilla JS + xlsx + PapaParse + Chart.js (CDN) | [Retail-promo-tracker-](https://github.com/harrisonglatt/Retail-promo-tracker-) | Reads bundled CSV/XLSX OR user upload OR hosted URL with auto-refresh |

### 4.3 Connective tissue (contexts)

| Context | What it holds | Persistence | Consumed by |
|---|---|---|---|
| **PromoContext** | Promo events + LIFT_MATRIX + getLift | in-memory + measured-lift override | Demand Plan, Shipments, Supply Planning sims, Executive |
| **MeasuredLiftsContext** | Synced measured lifts from Promo Intel | localStorage `ls.measuredLifts.v1` | PromoContext (overrides matrix) |
| **PlannedPOsContext** | User-staged co-man POs | localStorage `ls.plannedPOs.v1` | Supply Planning, SKU Planner, PO Creator |
| **OverridesContext** | Per-SKU velocity / lift / UPC overrides | in-memory | Demand Plan |
| **NewSkuContext** | User-added SKUs not yet in master | in-memory | Demand Plan, Supply Planning |
| **CalibrationContext** | Per-SKU and per-category forecast calibration factors | in-memory | Supply engine |

### 4.4 API routes (server-side)

| Route | What it does |
|---|---|
| `/api/owlery/pos` | Proxies Owlery API for live PO data (uses `OWLERY_API_KEY` env var) |
| `/api/insights` | LLM-powered insight generation for Executive Summary |

---

## 5. The clean mental model

```
                    ┌──────────────────────────────────────┐
                    │           UI / pages                 │
                    │  (executive, demand-plan, supply,    │
                    │   promo, sop, po-tracker-web, …)     │
                    └──────────────────────────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────────┐
                    │  React contexts (PromoContext,       │
                    │  PlannedPOs, MeasuredLifts, etc.)    │
                    └──────────────────────────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────────┐
                    │  Adapter layer (src/data/index.ts +  │
                    │  src/data/types.ts) — normalized     │
                    │  shapes that pages depend on         │
                    └──────────────────────────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
        │ JSON files    │    │ CSV / XLSX    │    │ APIs (live)   │
        │ (today)       │    │ uploads       │    │ Owlery,       │
        │ src/data/json/│    │ public/sop/   │    │ /api/insights │
        │               │    │ public/promo- │    │ Omni MCP      │
        │               │    │ tracker/      │    │               │
        └───────────────┘    └───────────────┘    └───────────────┘
                ▲                                         │
                │                                         │
                └─────────────────────────────────────────┘
                  Each row in section 3 = one file moves
                  from "JSON file" column to "API" column
```

**JSON files = adapter layer.** Replace them one by one with live API calls and the rest of the app doesn't need to change.

---

*Generated 2026-05-08. Maintained alongside the codebase — when you add a new module, source, or context, update this file in the same PR.*
