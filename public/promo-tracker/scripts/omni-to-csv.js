#!/usr/bin/env node
// Convert an Omni MCP getData result file (JSON) into the CSV schema the dashboard expects.
// Usage: node scripts/omni-to-csv.js <omni-result.txt> <output.csv>
//
// Omni columns ←→ Dashboard CSV columns:
//   As Of Date Week        ←→ Date: Week (formatted as "Mon DD, YYYY - Mon DD, YYYY")
//   Product Name           ←→ Product (LS-XX suffixes stripped)
//   DPCI                   ←→ Product → Target DPCI
//   Product Type           ←→ Product → Muffin Product Line
//   Total Sales            ←→ Sales Dollars
//   Total Unit Sales       ←→ Sales Units
//   Total Stores Scanning  ←→ Stores Scanning
//   Total PODs Scanning    ←→ PODs Scanning
//   Total Amount - Promo   ←→ Promo Sales Dollars
//   Total Units - Promo    ←→ Promo Sales Units

const fs = require('fs');
const path = require('path');

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('Usage: node scripts/omni-to-csv.js <omni-result.txt> <output.csv>');
  process.exit(1);
}

const raw = fs.readFileSync(inFile, 'utf8');
const wrapper = JSON.parse(raw);
const text = Array.isArray(wrapper) && wrapper[0] && wrapper[0].text ? wrapper[0].text : raw;
const omni = JSON.parse(text);
const rows = (omni.result || []);

if (!rows.length) {
  console.error('Omni result is empty.');
  process.exit(1);
}

// Map Product Type → Muffin Product Line (matches the existing CSV's category labels)
const PRODUCT_LINE_MAP = {
  smoothie: 'Smoothie Pouches',
  yogo: 'YOGO',
  puff: 'Toddler Snack',
  cereal: 'Baby Cereal',
  bar: 'BFY Snacks',
  loops: 'BFY Snacks',
  oatbake: 'Kids Lunchbox',
  'oat bake': 'Kids Lunchbox',
  frozen: 'Kids Meals',
  meal: 'Kids Meals',
  bite: 'Kids Meals',
};

// Fallback: when Omni's Product Type is generic ("snack"), refine by SKU name keywords
// so the dashboard's Category filter stays meaningful.
const refineByName = (name) => {
  const n = String(name||'').toLowerCase();
  if (/oat\s*bake/.test(n)) return 'Kids Lunchbox';
  if (/loops/.test(n)) return 'BFY Snacks';
  if (/bar\b/.test(n)) return 'BFY Snacks';
  if (/stellar\s*puff/.test(n)) return 'Toddler Snack';
  if (/\bminis?\b/.test(n)) return 'Toddler Snack';
  if (/puff/.test(n)) return 'Toddler Snack';
  if (/yogo/.test(n)) return 'YOGO';
  if (/smoothie|shake|punch|dream|greens/.test(n)) return 'Smoothie Pouches';
  if (/cereal/.test(n)) return 'Baby Cereal';
  if (/slider|meatball|dipper|bite\b/.test(n)) return 'Kids Meals';
  return null;
};

const lineFor = (productType, productName) => {
  const k = String(productType||'').toLowerCase().trim();
  const direct = PRODUCT_LINE_MAP[k] || PRODUCT_LINE_MAP[k.replace(/s$/, '')];
  if (direct) return direct;
  const refined = refineByName(productName);
  if (refined) return refined;
  return k || '';
};

// "Banana Pitaya Rings LS-DR02" → "Banana Pitaya Rings"
const cleanProductName = (n) => String(n || '').replace(/\s+LS-[A-Z0-9]+\b.*$/i, '').trim();

// Format a date string like "Jul 14, 2025" into a week range "Jul 14, 2025 - Jul 20, 2025"
const formatWeekRange = (asOfWeek) => {
  if (!asOfWeek) return '';
  const d = new Date(asOfWeek);
  if (isNaN(d.getTime())) return asOfWeek;
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const opt = { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opt) + ' - ' + end.toLocaleDateString('en-US', opt);
};

const formatMoney = (v) => {
  if (v == null || v === '') return '$0.00 ';
  const cleaned = String(v).replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  if (isNaN(n)) return '$0.00 ';
  return '$' + n.toFixed(2) + ' ';
};

const formatInt = (v) => {
  if (v == null || v === '') return '0';
  const cleaned = String(v).replace(/[,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? '0' : String(Math.round(n));
};

const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const headers = [
  'Date: Week',
  'Product',
  'Product → Target DPCI',
  'Product → Muffin Product Line',
  'Sales Dollars',
  'Sales Units',
  'Stores Scanning',
  'PODs Scanning',
  'Promo Sales Dollars',
  'Promo Sales Units',
];

const csvRows = [headers.join(',')];

for (const r of rows) {
  const out = [
    formatWeekRange(r['As Of Date Week']),
    cleanProductName(r['Product Name']),
    r['DPCI'] || '',
    lineFor(r['Product Type'], r['Product Name']),
    formatMoney(r['Total Sales']),
    formatInt(r['Total Unit Sales']),
    formatInt(r['Total Stores Scanning']),
    formatInt(r['Total PODs Scanning']),
    formatMoney(r['Total Amount - Promo']),
    formatInt(r['Total Units - Promo']),
  ];
  csvRows.push(out.map(csvCell).join(','));
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, csvRows.join('\n'), 'utf8');
console.log(`Wrote ${rows.length} rows to ${outFile}`);
