# Retail Promo Tracker

A single-file dashboard that turns a weekly sales feed + a promo calendar into a SKU-level lift, ROI, and forecast tool. Built for Little Spoon's Target retail program but works for any retailer with a similar data shape.

## What it does

- Compares promo + display weeks against a per-store baseline
- Calculates incremental units + dollars by SKU, promo type, discount depth, retailer, time period
- Auto-classifies promo events (Circle, TPC, DWA, Co-Space, BOGO, Launch/Reset, Sampling)
- Auto-infers Target-driven category Circle offers when calendar events are missing
- Forecasts incremental $ for planned future events using historical lift by SKU + type + depth
- Detects cannibalization, halo, promo fatigue + confidence intervals
- Persists user-authored promo events alongside the parsed calendar

## Quick start

The whole app is one HTML file. Open it directly in a browser, or serve it with any static host.

### Local

```bash
npx http-server . -p 5180 -c-1
```

Then open <http://localhost:5180>.

### Live data

In the dashboard, click **Data sources** in the top bar to point at hosted CSV / XLSX URLs and set an auto-refresh cadence. The dashboard fetches → re-parses → recomputes every refresh.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The complete app. All CSS + JS inline, no build step. |
| `data/sales-latest.csv` | Latest weekly sales pull (Omni-sourced). |
| `scripts/omni-to-csv.js` | Converts Omni `getData` JSON output into the dashboard CSV schema. |
| `vercel.json` | Vercel config — security headers + clean URLs. |
| `.gitignore` | Editor / build artifact ignores. |

## Deploy to Vercel

1. From the Vercel dashboard, click **Add New → Project**
2. Import this GitHub repo
3. Framework preset: **Other** (no build step)
4. Output directory: `.` (root)
5. Click **Deploy**

Vercel serves `index.html` at the root URL automatically.

### Updating the data

Two paths:

**(1) Pull from Omni (recommended).** The script `scripts/omni-to-csv.js` converts an Omni `getData` JSON result into the dashboard CSV schema. Workflow when refreshing:

```bash
# After pulling fresh data via the Omni MCP getData tool, save the result file path:
node scripts/omni-to-csv.js path/to/omni-result.txt data/sales-latest.csv
git add data/sales-latest.csv
git commit -m "Refresh sales from Omni — week of YYYY-MM-DD"
git push
```

Vercel auto-deploys in ~30 seconds. Dashboard reloads with new data.

**(2) Drop a new CSV manually.** Replace `data/sales-latest.csv` with any CSV that has the columns: `Date: Week, Product, Product → Target DPCI, Product → Muffin Product Line, Sales Dollars, Sales Units, Stores Scanning, PODs Scanning, Promo Sales Dollars, Promo Sales Units`. Push, Vercel deploys.

The promo calendar XLSX is updated the same way — replace the file at the repo root and push.

## Data inputs (uploaded or fetched live)

**Sales CSV** (weekly, by SKU). Expected columns:

- `Date: Week` — week range, e.g. `Jul 20, 2025 - Jul 26, 2025`
- `Product`, `Product → Target DPCI`, `Product → Muffin Product Line`
- `Sales Dollars`, `Sales Units`, `Stores Scanning`, `PODs Scanning`
- `Promo Sales Dollars`, `Promo Sales Units`

**Promo calendar** — Excel wide-format (weeks across columns) or long CSV with: `Week, Category/SKU, Promo Type, Description, Discount %, Display`.

## Methodology

Open the **How it works** modal in the top bar for the full math. Short version:

- **Baseline** = per-store productivity from clean weeks (no promo, no display, ≥15% promo penetration filtered, launch weeks excluded), scaled to the current week's store count.
- **Lift %** = sum of incremental $ across the period ÷ sum of baseline $. Never average percentages.
- **Bucket** = Baseline / Promo only / Display only / Promo + Display / Launch.
