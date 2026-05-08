# Little Spoon — PO Delivery Tracker (Web)

Single-file web app that turns two Extensiv/3PL Central CSV exports + an optional SKU Reference workbook into an interactive PO delivery tracker. Everything runs in the browser — no server, no data upload.

## What it does

1. Takes three inputs (drag & drop or file picker):
   - **Items CSV** — Extensiv shipment/load detail export
   - **Sales Orders CSV** — Extensiv sales order export
   - **SKU Reference XLSX** *(optional)* — enables Layer Check + cost + descriptions
2. Joins items to sales on `Reference #s` (with fallback to `Order/Load Number` → `Order #`).
3. Verifies every SKU's total ordered quantity ties out against the source items file.
4. Renders a 4-tab dashboard:
   - **By SKU** — one row per SKU, columns = delivery dates
   - **By PO** — one row per DC-level PO
   - **Hierarchy** — expandable Parent PO → DC → SKU tree
   - **Layer Check** — every DC × SKU with cases / cases-per-layer / remainder / $ value
5. Provides an editable SKU Reference panel so stakeholders can model "what if this SKU's layer count changed" without re-running anything.

## Running it

It's a single file. Three options:

- **Open directly:** double-click `index.html`. Works in any modern browser.
- **Serve locally (recommended for dev):**
  ```bash
  cd po-tracker-web
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```
- **Host on GitHub Pages / internal static host:** drop `index.html` on any static server.

## Input file formats

### Items CSV
Required columns: `Order/Load Number`, `Reference #s`, `Item`, `Ordered`, `Scheduled Dropoff Start`, `Load Status from Broker`

### Sales Orders CSV
Required columns: `Order #`, `Reference #s`, `Trading Partner`, `Order Status`, `Load Status`, `Dropoff Date`

Dates may be:
- Ranges: `"4/27/2026 - 4/30/2026"` → start date is used
- Datetimes with timezones: `"4/13/2026, 12:00 EDT"` → date portion is used

### SKU Reference XLSX (optional)
First sheet, columns:
| Col | Field |
|---|---|
| A | SKU |
| B | Product/service name |
| F | Cost Per Case |
| G | Units/Case |
| H | Cost per each |
| J | Cases/Layer |

First occurrence wins when a SKU appears more than once.

## Layer Check math

For each (Parent PO, DC, SKU) group:

```
layers    = cases / cases_per_layer
remainder = cases % cases_per_layer
status    = remainder == 0 ? 'clean' : 'partial'
```

SKUs with no reference entry render as `no ref` and don't count toward the partial-layer stat.

## Parent PO extraction

Retailer POs fan out across multiple DCs with a trailing `-XXXX` DC suffix. Extraction:

1. Take the first comma-separated ref
2. Strip a trailing 3–4 digit DC suffix (`/-\d{3,4}$/`)
3. Empty result → `#N/A`

Examples:
- `10001574225-0590` → Parent `10001574225`, DC `0590`
- `0284-0016815-3712, 10000000002795916` → Parent `0284-0016815`, DC `3712`

## Dependencies

Two CDN-hosted libs (no npm install required):
- [PapaParse](https://www.papaparse.com/) — CSV parsing
- [SheetJS (xlsx.js)](https://sheetjs.com/) — XLSX parsing

Fonts: Mulish + Roboto from Google Fonts.

## Brand

Little Spoon palette: LS Blue `#00E3CD` · Almond `#FFFEF8` · Black `#141414` · Oatmeal `#FBF7E8` · Mint `#D6F9F3`/`#EFFDFA`. Copy uses `+` instead of "and".

## Lineage

Ported from the `po-tracker-v2` Cowork skill (Python + openpyxl builder). See `CLAUDE.md` for details on the original architecture and porting notes.
