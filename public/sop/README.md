# Little Spoon · Retail S&OP Dashboard

Single-file interactive dashboard for Little Spoon's weekly retail review meeting.
Unifies Target/Circana sales + Roundel campaign spend into one self-contained HTML.

## Open it

**Local:** open `index.html` (or the friendlier `Little Spoon Retail Dashboard.html` —
they're identical) in any modern browser. No server needed; the data is inlined.

**Hosted (Vercel):** the repo is Vercel-ready. Two ways:

1. **One-click via GitHub** — go to [vercel.com/new](https://vercel.com/new), import
   `harrisonglatt/Retail-SOP`, leave all settings as defaults, and Deploy. Vercel detects
   the static `index.html`, no build step is needed. Every push to `main` auto-redeploys.

2. **Vercel CLI** — from this folder:
   ```bash
   npx vercel       # first deploy (preview URL)
   npx vercel --prod # promote to production
   ```

Once deployed, share the Vercel URL with anyone — the dashboard runs entirely client-side
so there's nothing to break.

The dashboard's first tab is **S&OP Meeting** — a one-page narrative built for live
walkthroughs. Hit the **Present** button (top right) for an executive view that
hides the sidebar and scales up fonts for screen-share.

## What's in it

- **S&OP Meeting** — KPI snapshot, brand performance (sales / promo / digital),
  category-by-week, SKU velocity table with momentum chips, $PSPW trend, Roundel summary
- **Executive Overview** — KPI cards, sales trend, category mix, top SKUs, insights
- **SKU Performance** — period-comparison table (LW / Prior / L4W avg / L13W avg), trend chart, full sortable SKU table
- **Category Performance** — multi-line trend, small-multiples bar grid per category, scorecard
- **Promo Analysis** — base vs incremental, lift by class, promo+Roundel interaction
- **Digital Penetration** — penetration % by category, spend by category, online $ stacked
- **Roundel / Media** — spend trend, ROAS by category, scatter with lag toggle, scorecard
- **Compare** — overlay any metrics on any SKUs/categories, multi-axis
- **SKU Mappings** — remap SKU → category, persisted in localStorage, flows through every metric live
- **Data Sources** — exact Excel sheet for every dashboard field
- **Weekly Snapshot** — Excel "Weekly Sales" tab reimagined
- **Data Explorer** — pivot/filter/export

## Calculations

**Online (digital) sales** = Σ over SKU per week of `Sales $ - Total × Sales $ - Online Orig Penetration`
(both rows from the "Last 52wks Item Trends" sheet).
Validated against "Sales $ Breakout by Channel" L13W: matches to $25 (0.0007%) on $3.79M.

**ROAS** = Online sales ÷ Roundel spend. Always uses online sales — never total sales —
because Roundel drives digital orders, not in-store.

**Spend** comes from the Roundel Campaign Spend Tracker CSV, aligned to Target's
Saturday week-end (Friday-ending Roundel weeks → next-day Saturday sales week).

**$PSPW** is shown to 2 decimals everywhere.

## Rebuilding from source

If you have updated weekly data:

1. Drop the new Target Sales & Inventory `.xlsx` and Roundel Spend `.csv` into `Downloads/`
2. Update the file paths in `extract.js` if the names differ
3. `npm install`
4. `node extract.js && node compute.js && node build.js`
5. `Little Spoon Retail Dashboard.html` is re-bundled

## Auditing

- `node audit.js` — verifies dashboard values match the Excel cell-for-cell (55+ checks)
- `node source-audit.js` — confirms which Excel sheet feeds each metric
- `node roas-audit.js` — walks through ROAS calc step-by-step per category

## Files

- `Little Spoon Retail Dashboard.html` — bundled output (open this)
- `dashboard_template.html` — HTML scaffold
- `dashboard.js` — all logic, charts, filtering, state
- `extract.js` — reads .xlsx + .csv, normalizes, writes `data.json`
- `compute.js` — joins/aligns into `unified.json`
- `build.js` — inlines `unified.json` + `dashboard.js` into the final HTML
- `audit.js`, `source-audit.js`, `roas-audit.js` — verification scripts
- `unified.json` — analytics-ready dataset (week × SKU × category)
