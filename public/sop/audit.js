// Audit dashboard data against the source Excel.
// Picks specific cells from the .xlsx, computes the same value from unified.json, reports diffs.
const XLSX = require('xlsx');
const fs = require('fs');

const xlsxPath = 'C:\\Users\\HarrisonGlatt\\Downloads\\2026-4wk3 Little Spoon Sales and Inventory.xlsx';
const csvPath = 'C:\\Users\\HarrisonGlatt\\Downloads\\Little Spoon Retailer 101 - Roundel Campaign Spend Tracker .csv';
const wb = XLSX.readFile(xlsxPath);
const data = JSON.parse(fs.readFileSync('unified.json', 'utf-8'));

function num(v) {
  if (v === null || v === undefined || v === '' || v === '-' || v === 'N/A') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[$,\s]/g, '');
  if (s.endsWith('%')) return parseFloat(s.slice(0, -1)) / 100;
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function getRows(name) { return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }); }
function pct(actual, expected) {
  if (actual == null || expected == null) return null;
  if (Math.abs(expected) < 1) return Math.abs(actual - expected);
  return Math.abs(actual - expected) / Math.abs(expected);
}
function check(label, actual, expected, tolerance = 0.01) {
  const diff = pct(actual, expected);
  const pass = diff != null && diff <= tolerance;
  const sym = pass ? '✓' : (actual == null ? '?' : '✗');
  console.log(`${sym} ${label}: dashboard=${actual} excel=${expected} diff=${diff != null ? (diff*100).toFixed(2)+'%' : 'n/a'}`);
  return pass;
}

console.log('========== AUDIT vs Excel ==========\n');

// --- 1) Weekly Sales tab: Last Week values for a sample of SKUs ---
console.log('\n--- Weekly Sales tab · Last Week ---');
const wsRows = getRows('Weekly Sales');
// Header row 7 (index 7) is the data for the first SKU. Columns 0-12: Dept, Class, ClassName, DPCI, Item, Sales$, Units, $PSPW, UPSPW, Price, Promo%, OOS%, Stores
const sampleDPCIs = [];
for (let i = 7; i < Math.min(20, wsRows.length); i++) {
  const r = wsRows[i];
  if (!r[3]) continue;
  sampleDPCIs.push({
    dpci: r[3], item: r[4],
    lwSales: num(r[5]), lwUnits: num(r[6]), lwPSPW: num(r[7]), lwUPSPW: num(r[8]),
    lwPromoPct: num(r[10]), lwOOS: num(r[11]),
  });
}
const lastWeek = '4/25/2026';
let pass = 0, fail = 0;
for (const s of sampleDPCIs.slice(0, 10)) {
  const it = data.itemData[s.dpci];
  if (!it) { console.log(`✗ ${s.dpci} ${s.item} — not found in unified data`); fail++; continue; }
  const dashSales = it.metrics['Sales $ - Total']?.[lastWeek];
  const dashUnits = it.metrics['Units - Total']?.[lastWeek];
  const dashPSPW = it.metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[lastWeek];
  const dashOOS = it.metrics['Out of Stock %']?.[lastWeek];
  console.log(`\n  ${s.dpci} ${s.item}:`);
  if (check('    LW Sales', dashSales, s.lwSales, 0.01)) pass++; else fail++;
  if (check('    LW Units', dashUnits, s.lwUnits, 0.01)) pass++; else fail++;
  if (check('    LW $PSPW', dashPSPW, s.lwPSPW, 0.02)) pass++; else fail++;
  if (check('    LW OOS%',  dashOOS,  s.lwOOS,  0.05)) pass++; else fail++;
}

// --- 2) Verify L13W aggregate from Item Trends: sum across last 13 weeks for one item ---
console.log('\n--- L13W aggregate · sample SKUs ---');
const itemRows = getRows('Last 52wks Item Trends');
const dateHeader = itemRows[5];
const dates = dateHeader.slice(3).filter(d => d && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(d).trim()));
const last13 = dates.slice(-13);
console.log(`Excel last 13 dates: ${last13.join(', ')}`);
console.log(`Dashboard salesDates last 13: ${data.salesDates.slice(-13).join(', ')}`);

for (const s of sampleDPCIs.slice(0, 5)) {
  // Find this SKU's "Sales $ - Total" row in itemRows
  let salesRow = null;
  for (let i = 6; i < itemRows.length; i++) {
    if ((itemRows[i][0]||'').trim() === s.dpci && (itemRows[i][2]||'').trim() === 'Sales $ - Total') { salesRow = itemRows[i]; break; }
  }
  if (!salesRow) continue;
  let excelL13 = 0;
  for (const d of last13) {
    const idx = dateHeader.indexOf(d);
    if (idx >= 0) { const v = num(salesRow[idx]); if (typeof v === 'number') excelL13 += v; }
  }
  const it = data.itemData[s.dpci];
  let dashL13 = 0;
  for (const d of data.salesDates.slice(-13)) {
    const v = it?.metrics['Sales $ - Total']?.[d];
    if (typeof v === 'number') dashL13 += v;
  }
  if (check(`  ${s.dpci} L13W Sales`, dashL13, excelL13, 0.005)) pass++; else fail++;
}

// --- 3) Roundel CSV totals: per category total and grand total ---
console.log('\n--- Roundel spend · totals ---');
const csvRaw = fs.readFileSync(csvPath, 'utf-8');
const csvWb = XLSX.read(csvRaw, { type: 'string' });
const csvRows = XLSX.utils.sheet_to_json(csvWb.Sheets[csvWb.SheetNames[0]], { header: 1, defval: '', raw: false });
const expectedTotals = {};
for (let i = 2; i < csvRows.length; i++) {
  const cat = String(csvRows[i][0] || '').trim();
  if (!cat) continue;
  let s = 0;
  for (let j = 1; j < csvRows[i].length; j++) {
    const v = num(csvRows[i][j]);
    if (typeof v === 'number') s += v;
  }
  expectedTotals[cat] = s;
}
console.log('Excel totals (full 32 weeks):', expectedTotals);
const dashTotals = {};
for (const cat of data.ROUNDEL_CATS) dashTotals[cat] = 0;
for (const wk in data.roundelByWeek) {
  for (const cat in data.roundelByWeek[wk]) {
    if (cat in dashTotals) dashTotals[cat] += data.roundelByWeek[wk][cat];
  }
}
console.log('Dashboard totals (aligned to sales weeks):', dashTotals);
for (const cat in expectedTotals) {
  if (cat === 'Total') continue;
  const dashKey = cat;
  if (dashTotals[dashKey] != null) {
    if (check(`  ${cat} total spend`, dashTotals[dashKey], expectedTotals[cat], 0.005)) pass++; else fail++;
  }
}

// --- 4) Channel breakout: L13W enterprise online sales total ---
console.log('\n--- Channel breakout · L13W online ---');
const chRows = getRows('Sales $ Breakout by Channel');
let excelL13EntTotal = 0, excelL13Online = 0;
for (let i = 8; i < chRows.length; i++) {
  const r = chRows[i];
  if (!r[3]) continue;
  excelL13EntTotal += num(r[17]) || 0;
  excelL13Online += num(r[18]) || 0;
}
let dashTotalChan = 0, dashOnlineChan = 0;
for (const dpci in data.channelData) {
  dashTotalChan += data.channelData[dpci].L13W_total || 0;
  dashOnlineChan += data.channelData[dpci].L13W_online || 0;
}
if (check('L13W enterprise total (channel sheet)', dashTotalChan, excelL13EntTotal, 0.001)) pass++; else fail++;
if (check('L13W online sales (channel sheet)', dashOnlineChan, excelL13Online, 0.001)) pass++; else fail++;

// --- 5) Promo recap weekly: total promo $ for last week ---
console.log('\n--- Promo recap · last week ---');
const promoRows = getRows('Last 52wks Promo Recap');
let excelLWPromo = 0, excelLWSales = 0, excelLWBase = 0;
for (let i = 7; i < promoRows.length; i++) {
  const r = promoRows[i];
  const wd = String(r[0] || '').trim();
  if (!/^04\/25\/2026$/.test(wd)) continue;
  excelLWPromo += num(r[16]) || 0;
  excelLWSales += num(r[15]) || 0;
  excelLWBase += num(r[5]) || 0;
}
let dashLWPromo = 0, dashLWSales = 0, dashLWBase = 0;
for (const r of data.promoData) {
  if (r.weekDate !== '4/25/2026') continue;
  if (typeof r.promoSales === 'number') dashLWPromo += r.promoSales;
  if (typeof r.sales === 'number') dashLWSales += r.sales;
  if (typeof r.baseSales4W === 'number') dashLWBase += r.baseSales4W;
}
if (check('LW Promo $', dashLWPromo, excelLWPromo, 0.005)) pass++; else fail++;
if (check('LW Total $', dashLWSales, excelLWSales, 0.005)) pass++; else fail++;
if (check('LW Base $ (4W)', dashLWBase, excelLWBase, 0.005)) pass++; else fail++;

// --- 6) Subclass weekly trend: BABY FOOD last-week sales ---
console.log('\n--- Subclass weekly · BABY FOOD LW ---');
const scRows = getRows('Last 52wks Subclass Trend');
const scDateHeader = scRows[5];
let bfRow = null;
for (let i = 6; i < scRows.length; i++) {
  if ((scRows[i][2]||'').trim() === 'BABY FOOD' && (scRows[i][3]||'').trim() === 'Sales $ - Total') {
    bfRow = scRows[i]; break;
  }
}
if (bfRow) {
  const idx = scDateHeader.indexOf('4/25/2026');
  const excelBFSales = idx >= 0 ? num(bfRow[idx]) : null;
  const dashBFSales = data.subclassData?.['BABY FOOD']?.['Sales $ - Total']?.['4/25/2026'];
  if (check('BABY FOOD 4/25 sales', dashBFSales, excelBFSales, 0.001)) pass++; else fail++;
}

console.log(`\n=========== RESULT: ${pass} passed, ${fail} failed ===========`);
