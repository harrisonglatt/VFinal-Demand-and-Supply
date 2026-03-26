# Little Spoon × Target — Supply & Demand Intelligence

A modular demand intelligence dashboard for Little Spoon's Target business. Covers SKU-level forecasting, inventory risk analysis, promo lift modeling, scenario planning, and actuals tracking across all active categories.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

### Other Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Project Structure

```
supply-and-demand-intel/
├── index.html              # App shell — header, sidebar, all 21 page containers
├── vite.config.js          # Vite config
├── package.json
│
├── src/
│   ├── main.js             # Entry point: Chart.js init, router, event delegation
│   │
│   ├── styles/
│   │   ├── index.css       # Import aggregator (import this one)
│   │   ├── variables.css   # CSS custom properties & brand tokens
│   │   ├── base.css        # Reset, body, scrollbars
│   │   ├── layout.css      # Header, sidebar, main container
│   │   ├── components.css  # KPI cards, badges, charts, tables, buttons
│   │   └── pages.css       # Page-specific styles
│   │
│   ├── data/
│   │   ├── index.js        # Data loader — imports all JSON, exports DATA_* constants
│   │   │                   #   + derived promo helpers (isOnPromo, promoSkuCats, etc.)
│   │   ├── dp.json         # 52-week demand plan (SKUs, forecasts, historical)
│   │   ├── promo.json      # Promo calendar events
│   │   ├── hist-promo.json # Historical promo actuals
│   │   ├── inv.json        # LS warehouse inventory / OOS analysis
│   │   ├── ship.json       # Shipment plan (case-level, weekly)
│   │   ├── daily.json      # Daily Omni performance data
│   │   ├── accuracy.json   # Model accuracy (MAPE, bias, trust scores per SKU)
│   │   ├── stopship.json   # Stop-ship / inventory-at-risk exposure
│   │   ├── backtest.json   # Walk-forward backtest results
│   │   ├── hist.json       # 35-week historical sell-through
│   │   ├── launch.json     # New SKU launch ramp data
│   │   ├── avf.json        # Actuals vs forecast (LW vs model)
│   │   ├── omni.json       # Omni channel summary metrics
│   │   ├── target-dc.json  # Target DC inventory levels
│   │   ├── pofc.json       # PO forecast (order/coverage model)
│   │   ├── endcap-history.json # Historical endcap lift events
│   │   └── fcast-rev.json  # 52-week revenue forecast array
│   │
│   ├── utils/
│   │   ├── formatters.js   # fmt, fmtP, fmtN, fmtDol, sf, chgCls
│   │   ├── dom.js          # chip, riskChip, fillSel, kpiCard
│   │   ├── charts.js       # Chart.js brand defaults, mkLine, destroyChart
│   │   └── state.js        # Global override stores + upcFor/velFor/liftFor accessors
│   │
│   └── pages/              # One module per page — lazy-loaded on first navigation
│       ├── executive.js         # Executive Summary dashboard
│       ├── overview.js          # Overview KPIs + charts
│       ├── demand-plan.js       # 52-week demand plan table
│       ├── daily.js             # Daily performance (WoW, trend, product, SKU views)
│       ├── actuals-vs-forecast.js # LW actuals vs model forecast
│       ├── inventory.js         # Inventory intelligence (LS warehouse + Target DC)
│       ├── shipment.js          # Case-level shipment plan
│       ├── po-forecast.js       # PO forecast — order/sales ratio + coverage model
│       ├── promo.js             # Promo calendar (forward + historical)
│       ├── launch.js            # New SKU launch ramp analysis
│       ├── historical.js        # 35-week historical sell-through
│       ├── scenario.js          # Bear / Base / Bull scenario analysis
│       ├── endcap.js            # Endcap / co-space lift analysis
│       ├── assumptions.js       # Model assumptions + override controls
│       ├── guide.js             # Model guide — data sources, methodology, KPI defs
│       ├── forecast-versions.js # Forecast version locking + audit trail
│       ├── backtest.js          # Walk-forward backtest engine
│       ├── model-learning.js    # Model learning + conservative calibration engine
│       ├── add-sku.js           # Add new SKUs with analog-based forecasting
│       ├── risk-os.js           # Risk Operating Center — stop-ship exposure
│       └── actuals-tracking.js  # Daily actuals ingestion + WTD tracking
│
└── .claude/
    └── launch.json         # Dev server configs for Claude Code preview
```

---

## Architecture

### Routing & Page Loading

Pages are lazy-loaded on first navigation using dynamic `import()`. The router in `src/main.js` maintains a module registry and calls each page's `init*()` function once on first visit. All exported functions are registered on `window` so pages can call into each other (e.g. Assumptions refreshing the Executive Summary).

```js
// Navigating to a page triggers:
const mod = await import('./pages/executive.js');
mod.initEXEC();
```

### Data Layer

All data lives in `src/data/*.json`. The `src/data/index.js` loader imports every file and re-exports it as a named constant (`DATA_DP`, `DATA_PROMO`, etc.). It also computes derived values at import time (promo week maps, category lookups).

**Swapping JSON for API calls:** Replace any `import X from './X.json'` in `src/data/index.js` with a `fetch()` call. The rest of the app is unchanged since it only consumes the exported constants.

### State Management

`src/utils/state.js` holds three mutable override stores:

| Store | Purpose |
|---|---|
| `upcOverrides` | Units-per-case overrides by DPCI |
| `velOverrides` | Velocity (UPSPW) overrides by DPCI |
| `liftOverrides` | Promo lift multiplier overrides by `"category|type"` key |

The Assumptions page writes to these. Accessor functions (`velFor`, `upcFor`, `liftFor`) are used throughout other pages so overrides propagate automatically.

### Styling

CSS is split into five layers imported via `src/styles/index.css`:

1. `variables.css` — all design tokens (colors, spacing, brand palette)
2. `base.css` — reset + body
3. `layout.css` — header, sidebar, main content area
4. `components.css` — reusable UI: KPI cards, badges, tables, buttons, charts
5. `pages.css` — page-specific overrides

---

## Pages

| Page | Nav Label | Key Features |
|---|---|---|
| Executive Summary | 🎯 Executive Summary | Bear/Base/Bull toggle, 13-wk scenario bars, risk watchlist, auto-insights |
| Overview | 📊 Overview | Revenue chart (actuals + forecast), inventory donut, promo list |
| Demand Plan | 📈 Demand Plan | 52-week SKU table, scenario + unit toggle, promo week highlighting |
| Daily Performance | 📅 Daily Performance | WoW by day, 14-day trend, product mix, SKU detail |
| Actuals vs Forecast | 🎯 Actuals vs Forecast | LW actuals vs model, MAPE per SKU, miss/beat filtering |
| Inventory Intel | 📦 Inventory Intel | OOS alerts, WOS, lost $/wk — LS warehouse + Target DC views |
| Shipment Plan | 🚚 Shipment Plan | Case-level weekly plan, inline forecast editing |
| PO Forecast | 📦 PO Forecast | Order/sales ratio model + coverage-based model, 13-wk view |
| Promo Calendar | 🗓 Promo Calendar | Forward + historical events, lift modeling, stacking rules |
| Launch Ramp | 🚀 Launch Ramp | 4 new SKU ramp analysis, Bear/Base/Bull velocity curves |
| Historical S/T | 📅 Historical S/T | 35-week sell-through table + heatmap view |
| Scenario Analysis | 🔮 Scenario Analysis | 52-week revenue/units across all three scenarios |
| Endcap Lift | 📐 Endcap Lift | Co-space incremental revenue + confirmed vs proposed split |
| Assumptions | ⚙️ Assumptions | Live override controls — velocity, lift multipliers, UPC |
| Model Guide | 📋 Model Guide | Data sources, refresh schedule, KPI definitions, methodology |
| Forecast Versions | 🔒 Forecast Versions | Lock snapshots, weekly variance table, audit trail |
| Backtest Lab | 🔬 Backtest Lab | Walk-forward engine, MAPE/bias by SKU and category |
| Model Learning | 🧠 Model Learning | Conservative calibration, trust scores, model feedback loop |
| Add SKU | ➕ Add SKU | Analog-based new SKU forecasting with ramp profiles |
| Risk Operating Center | 🚨 Risk OS | Stop-ship exposure, decision cards, integrated risk view |
| Actuals Tracking | 📈 Actuals Tracking | Daily actuals ingestion, WTD vs forecast, run-rate projection |

---

## Data Categories

| Category | Brand Color | SKU Examples |
|---|---|---|
| Baby Snacks | Teal (`#00E3CD`) | Baby Puffs, Baby Cereal |
| Kids Snacks | Mango (`#FFC711`) | Oat Bakes, Veggie Loops, Stellar Puffs |
| Frozen Multiserve | Blueberry (`#18A7FF`) | Mini Turkey Meatballs, Chicken Dippers |
| Smoothies | Spinach (`#00CF92`) | Berry Banana Blast, Green Dream |
| YoGos | Prune (`#DC7BFF`) | Strawberry Bananza, Apple Berry Blast |
