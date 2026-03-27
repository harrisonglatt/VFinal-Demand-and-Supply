# Little Spoon × Target — Supply & Demand Intelligence

A modular demand intelligence dashboard for Little Spoon's Target business. Built with Next.js, React, and TypeScript. Covers SKU-level forecasting, inventory risk analysis, promo lift modeling, scenario planning, and actuals tracking across all active categories.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **UI:** React 19
- **Charts:** Chart.js 4 via react-chartjs-2
- **State:** React Context + useReducer
- **Styling:** CSS custom properties (vanilla CSS modules)

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

The app opens at `http://localhost:3000`.

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Production build (TypeScript type-checking included) |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
src/
├── app/                          # Next.js App Router — one directory per page
│   ├── layout.tsx                # Root layout: fonts, CSS, providers, AppShell
│   ├── page.tsx                  # Root redirect → /executive
│   ├── executive/page.tsx        # Executive Summary dashboard
│   ├── overview/page.tsx         # Brand Overview with charts
│   ├── demand-plan/page.tsx      # 52-week demand plan table
│   ├── daily/page.tsx            # Daily performance (WoW, trend, product, SKU)
│   ├── actuals-vs-forecast/page.tsx
│   ├── inventory/page.tsx        # LS warehouse + Target DC inventory
│   ├── shipment/page.tsx         # Case-level shipment plan
│   ├── po-forecast/page.tsx      # PO forecast (order/coverage models)
│   ├── promo/page.tsx            # Promo calendar (forward + historical)
│   ├── launch/page.tsx           # New SKU launch ramp analysis
│   ├── historical/page.tsx       # 35-week historical sell-through
│   ├── scenario/page.tsx         # Bear / Base / Bull scenario analysis
│   ├── endcap/page.tsx           # Endcap lift analysis
│   ├── assumptions/page.tsx      # Model assumptions + override controls
│   ├── guide/page.tsx            # Model guide (data sources, methodology)
│   ├── forecast-versions/page.tsx # Forecast lock + audit trail
│   ├── backtest/page.tsx         # Walk-forward backtest engine
│   ├── model-learning/page.tsx   # Model learning + calibration
│   ├── add-sku/page.tsx          # Add new SKUs with analog forecasting
│   ├── risk-os/page.tsx          # Risk Operating Center
│   └── actuals-tracking/page.tsx # Daily actuals ingestion + WTD tracking
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx          # Header + Sidebar + ChartProvider + main wrapper
│   │   ├── Header.tsx            # Top header bar with branding and badges
│   │   ├── Sidebar.tsx           # Navigation sidebar (uses Next.js Link)
│   │   └── PageShell.tsx         # Reusable page header (title + subtitle)
│   ├── ui/
│   │   ├── KpiCard.tsx           # KPI metric card
│   │   ├── KpiGrid.tsx           # 2/3/4-column KPI grid wrapper
│   │   ├── Chip.tsx              # Status chip + RiskChip
│   │   ├── ButtonGroup.tsx       # Toggle button group (.btn.on pattern)
│   │   ├── SelectFilter.tsx      # Dropdown filter with auto-dedup
│   │   ├── FilterBar.tsx         # Filter bar wrapper with metadata
│   │   ├── DataTable.tsx         # Scrollable table container
│   │   └── Toast.tsx             # Auto-dismissing notification toast
│   └── charts/
│       ├── ChartProvider.tsx     # Chart.js registration + brand defaults
│       ├── LineChart.tsx          # react-chartjs-2 Line with LS styling
│       ├── BarChart.tsx           # react-chartjs-2 Bar with LS styling
│       └── DoughnutChart.tsx      # react-chartjs-2 Doughnut with LS styling
│
├── context/
│   └── OverridesContext.tsx       # useReducer store for velocity/lift/UPC overrides
│
├── hooks/
│   ├── useOverrides.ts           # Typed access to OverridesContext + selectors
│   └── useLocalStorage.ts        # Generic localStorage persistence hook
│
├── data/
│   ├── types.ts                  # TypeScript interfaces for all data shapes
│   ├── index.ts                  # Typed data loader + derived promo helpers
│   └── json/                     # 17 JSON data files (future API endpoints)
│       ├── dp.json               # 52-week demand plan
│       ├── promo.json            # Promo calendar events
│       ├── ship.json             # Shipment plan
│       ├── daily.json            # Daily Omni performance
│       ├── accuracy.json         # Model accuracy (MAPE, bias, trust)
│       ├── stopship.json         # Stop-ship inventory exposure
│       ├── inv.json              # LS warehouse inventory
│       ├── hist.json             # 35-week historical sell-through
│       ├── launch.json           # Launch SKU data
│       ├── avf.json              # Actuals vs forecast
│       ├── omni.json             # Omni channel metrics
│       ├── target-dc.json        # Target DC inventory
│       ├── pofc.json             # PO forecast data
│       ├── backtest.json         # Backtest results
│       ├── hist-promo.json       # Historical promo actuals
│       ├── endcap-history.json   # Endcap lift events
│       └── fcast-rev.json        # 52-week revenue forecast
│
├── lib/
│   ├── formatters.ts             # Number/currency/percent formatting (pure functions)
│   ├── charts.ts                 # Chart.js brand defaults + config builders
│   └── computations/
│       ├── executive.ts          # calcCV, calcBands, aggregateExec, detectRiskSkus
│       ├── scenario.ts           # Scenario projection + SKU breakdown
│       ├── pofc.ts               # PO forecast computations
│       └── promo.ts              # Promo category mapping + isOnPromo
│
└── styles/
    ├── globals.css               # Imports all 5 CSS layers
    ├── variables.css             # Design tokens (colors, spacing, brand palette)
    ├── base.css                  # Reset + body
    ├── layout.css                # Header, sidebar, main container
    ├── components.css            # KPI cards, badges, tables, buttons, charts
    └── pages.css                 # Page-specific styles
```

---

## Architecture

### Routing

Uses the Next.js App Router with file-based routing. Each page is a `'use client'` component in `src/app/{page-name}/page.tsx`. The root page (`/`) redirects to `/executive`.

### State Management

**OverridesContext** (`src/context/OverridesContext.tsx`) manages user-editable model assumptions via `useReducer`:

| Store | Purpose |
|---|---|
| `velOverrides` | Velocity (UPSPW) overrides by DPCI |
| `liftOverrides` | Promo lift multiplier overrides by `"category\|type"` key |
| `upcOverrides` | Units-per-case overrides by DPCI |

The Assumptions page dispatches changes. All consuming pages re-render automatically through React's context propagation — no manual refresh needed.

Access overrides via the `useOverrides()` hook:

```tsx
const { velFor, upcFor, liftFor, setVel, resetAll, overrideCount } = useOverrides();
```

### Data Layer

All data lives in `src/data/json/*.json` with TypeScript interfaces in `src/data/types.ts`. The `src/data/index.ts` loader imports everything and exports typed constants:

```tsx
import { DATA_DP, DATA_PROMO, isOnPromo } from '@/data/index';
import type { DPSku, PromoEvent } from '@/data/types';
```

**Swapping JSON for API calls:** Replace the static imports in `src/data/index.ts` with `fetch()` calls or React Query hooks. All consumers use the same exported constants, so the rest of the app is unchanged.

### Charts

Chart components wrap `react-chartjs-2` with Little Spoon brand defaults (colors, fonts, tooltips). Chart.js component registration happens at the module level in each chart component.

```tsx
import LineChart from '@/components/charts/LineChart';

<LineChart
  labels={['W1', 'W2', 'W3']}
  datasets={[{ label: 'Units', data: [100, 200, 150], borderColor: '#00E3CD' }]}
/>
```

### Styling

CSS is split into five layers imported via `src/styles/globals.css`. The same class names from the original design are used throughout JSX. All design tokens are CSS custom properties in `variables.css`.

### Persistence

Three pages use `localStorage` for client-side persistence via the `useLocalStorage` hook:
- **Add SKU** — user-created SKUs
- **Forecast Versions** — locked forecast snapshots
- **Actuals Tracking** — ingested daily actuals

---

## Pages

| Route | Page | Key Features |
|---|---|---|
| `/executive` | Executive Summary | Bear/Base/Bull toggle, 13-wk scenario bars, risk watchlist, auto-insights |
| `/overview` | Overview | Revenue chart (actuals + forecast), inventory donut, promo list |
| `/demand-plan` | Demand Plan | 52-week SKU table, scenario + unit toggle, promo week highlighting |
| `/daily` | Daily Performance | WoW by day, 14-day trend, product mix, SKU detail |
| `/actuals-vs-forecast` | Actuals vs Forecast | LW actuals vs model, MAPE per SKU, miss/beat filtering |
| `/inventory` | Inventory Intel | OOS alerts, WOS, lost $/wk — LS warehouse + Target DC views |
| `/shipment` | Shipment Plan | Case-level weekly plan, inline forecast editing |
| `/po-forecast` | PO Forecast | Order/sales ratio model + coverage-based model, 13-wk view |
| `/promo` | Promo Calendar | Forward + historical events, lift modeling, stacking rules |
| `/launch` | Launch Ramp | 4 new SKU ramp analysis, Bear/Base/Bull velocity curves |
| `/historical` | Historical S/T | 35-week sell-through table + heatmap view |
| `/scenario` | Scenario Analysis | 52-week revenue/units across all three scenarios |
| `/endcap` | Endcap Lift | Co-space incremental revenue + confirmed vs proposed split |
| `/assumptions` | Assumptions | Live override controls — velocity, lift multipliers, UPC |
| `/guide` | Model Guide | Data sources, refresh schedule, KPI definitions, methodology |
| `/forecast-versions` | Forecast Versions | Lock snapshots, weekly variance table, audit trail |
| `/backtest` | Backtest Lab | Walk-forward engine, MAPE/bias by SKU and category |
| `/model-learning` | Model Learning | Conservative calibration, trust scores, model feedback loop |
| `/add-sku` | Add SKU | Analog-based new SKU forecasting with ramp profiles |
| `/risk-os` | Risk OS | Stop-ship exposure, decision cards, integrated risk view |
| `/actuals-tracking` | Actuals Tracking | Daily actuals ingestion, WTD vs forecast, run-rate projection |

---

## Data Categories

| Category | Brand Color | SKU Examples |
|---|---|---|
| Baby Snacks | Teal (`#00E3CD`) | Baby Puffs, Baby Cereal |
| Kids Snacks | Mango (`#FFC711`) | Oat Bakes, Veggie Loops, Stellar Puffs |
| Frozen Multiserve | Blueberry (`#18A7FF`) | Mini Turkey Meatballs, Chicken Dippers |
| Smoothies | Spinach (`#00CF92`) | Berry Banana Blast, Green Dream |
| YoGos | Prune (`#DC7BFF`) | Strawberry Bananza, Apple Berry Blast |
