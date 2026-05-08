# Project context for Claude Code

This repo is a single-file web port of the `po-tracker-v2` Cowork skill. Read this before making changes.

## Shape

- One file: `index.html`. Everything — markup, CSS, JS — lives there.
- No build step, no package manager, no server. Just open in a browser (or serve statically).
- External deps are CDN-loaded: PapaParse (CSV) + SheetJS (XLSX). Do not add more deps without a strong reason.
- Little Spoon internal tool. Keep branding (LS Blue `#00E3CD`, Almond `#FFFEF8`, Mulish/Roboto fonts, `+` instead of "and").

## Two layers inside `index.html`

### 1. Upload layer (top of the `<script>` block)
Handles file picking, parsing, joining, verification. Functions to know:
- `parseDeliveryDate(d)` — handles `"M/D/YYYY"`, `"4/27/2026 - 4/30/2026"`, `"4/13/2026, 12:00 EDT"`
- `getSunday(d)` — Sun–Sat week buckets. JS `Date.getDay()` has Sun=0, so `setDate(date - getDay())` lands on Sunday.
- `parentPoFromRef(ref)` — takes first comma-separated ref, strips trailing `/-\d{3,4}$/`
- `normalizeStatus(s)` — maps raw statuses via `STATUS_MAP`; Load Status wins over Order Status in `getStatus(row)`
- `joinFiles(items, sales)` — two-pass: primary on `Reference #s`, fallback on `Order/Load Number` → `Order #`
- `verifyTotals(items, joined)` — per-SKU tie-out; non-negotiable, must pass
- `loadSkuRef(arrayBuffer)` — SheetJS; first sheet; cols A/B/F/G/H/J → sku/name/cost_case/units_case/cost_each/cs_per_layer; first-occurrence wins
- `buildPayload(dated, skuRef)` — aggregates to the JSON shape the dashboard expects
- `initDashboard(payload)` — hands off to the dashboard layer

### 2. Dashboard layer (rest of the `<script>` block)
Ported line-for-line from the Python skill's `_DASHBOARD_TEMPLATE`. 4 tabs:
- `renderFlat(fil, groupFn, label, isSkuGroup)` — By SKU + By PO
- `renderHier(fil)` — Parent PO → DC → SKU expandable tree; flags DC × SKU partial-layer rows
- `renderLayer(fil)` — flat DC × SKU layer check

Key state: `currentView` (`'days'` | `'weeks'`), `currentGroup` (`'sku'` | `'po'` | `'hier'` | `'layer'`), `selectedStatuses`/`selectedSKUs`/`selectedPOs`/`selectedParents` (Sets), `expandedParents`/`expandedDCs` (Sets).

`skuRef` is a mutable working copy; `skuRefDefaults` is the frozen original. Edits to Cases/Layer in the bottom panel mutate `skuRef` and trigger `render()`.

## Data payload shape

```js
{
  data: [{ sku, date: 'YYYY-MM-DD', status, po, tp, parent_po, qty }, ...],
  skus: [...],
  statuses: [...],
  pos: [...],
  parents: [...],
  skuRef: { [sku]: { name, cost_case, units_case, cost_each, cs_per_layer } }
}
```

Every SKU in `data` must have an entry in `skuRef` (backfilled with empties if unknown).

## Invariants (don't break these)

1. **Totals tie out.** If `verifyTotals` returns `allMatch: false`, something's wrong with the join — fix it, don't paper over.
2. **No server calls.** Everything client-side. Don't add network requests beyond CDN deps.
3. **No browser storage APIs.** No `localStorage`/`sessionStorage`. State lives in memory; that's fine.
4. **Layer Check math.** `layers = cases / cases_per_layer`; `remainder = cases % cases_per_layer`; `clean` iff `remainder === 0`. SKUs with no `cs_per_layer` are `no-ref` and don't count toward the partial-layer stat.
5. **Weeks are Sun–Sat.** Anchored on Sunday via `getSunday()`.
6. **Brand copy:** use `+` instead of "and" in user-facing strings.

## Source of truth

Original Python skill: `po-tracker-v2` (Cowork skill). If HTML + Python ever diverge, the Python version is the reference implementation — check `build_tracker.py` in the skill directory.

## Common tasks

- **Add a column to the Layer Check tab:** modify `renderLayer()`. Remember to update the header array + the `TOTAL` row.
- **Change a color / font:** top of `<style>`. CSS variables aren't used — search/replace is fine given the file size.
- **Support a new date format:** extend `parseDeliveryDate()`. Add a regex branch before the fallback `new Date()` parse.
- **Add a filter:** follow the pattern of the existing multi-select dropdowns — add the wrapper/button/dropdown to markup, add a `Set` to state, wire it through `initDD()` + `filteredRows()` + `resetAll()`.

## What's out of scope (for now)

- Excel output (stayed in the Python builder).
- Automatic retailer-specific DC mapping.
- Persistence of Cases/Layer overrides between sessions. If you add this, prefer file export/import over browser storage.
