const XLSX = require('xlsx');
const fs = require('fs');

const xlsxPath = 'C:\\Users\\HarrisonGlatt\\Downloads\\2026-4wk3 Little Spoon Sales and Inventory.xlsx';
const csvPath = 'C:\\Users\\HarrisonGlatt\\Downloads\\Little Spoon Retailer 101 - Roundel Campaign Spend Tracker - NEW.csv';

const wb = XLSX.readFile(xlsxPath);

function num(v) {
  if (v === null || v === undefined || v === '' || v === '-' || v === 'N/A') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  s = s.replace(/[$,\s]/g, '');
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? null : n / 100;
  }
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getRows(sheetName) {
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

// =========== 1) Subclass weekly trend - extract all metrics ===========
const subclassRows = getRows('Last 52wks Subclass Trend');
const subclassDateHeader = subclassRows[5];
const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const subclassDates = subclassDateHeader.slice(4).filter(d => d && dateRegex.test(String(d).trim()));
const subclassData = {}; // { className: { metric: { date: value } } }
for (let i = 6; i < subclassRows.length; i++) {
  const row = subclassRows[i];
  const className = (row[2] || '').trim();
  const metric = (row[3] || '').trim();
  if (!className || !metric) continue;
  if (!subclassData[className]) subclassData[className] = {};
  subclassData[className][metric] = {};
  for (let j = 0; j < subclassDates.length; j++) {
    const d = subclassDates[j];
    const v = num(row[4 + j]);
    subclassData[className][metric][d] = v;
  }
}

// =========== 2) Item weekly trend ===========
const itemRows = getRows('Last 52wks Item Trends');
const itemDateHeader = itemRows[5];
const itemDates = itemDateHeader.slice(3).filter(d => d && dateRegex.test(String(d).trim()));
const itemData = {}; // { dpci: { description, metrics: { metric: { date: value } } } }
for (let i = 6; i < itemRows.length; i++) {
  const row = itemRows[i];
  const dpci = (row[0] || '').trim();
  const desc = (row[1] || '').trim();
  const metric = (row[2] || '').trim();
  if (!dpci || !metric) continue;
  if (!itemData[dpci]) itemData[dpci] = { description: desc, metrics: {} };
  itemData[dpci].metrics[metric] = {};
  for (let j = 0; j < itemDates.length; j++) {
    const v = num(row[3 + j]);
    itemData[dpci].metrics[metric][itemDates[j]] = v;
  }
}

// =========== 3) Weekly Sales (Last Week snapshot) - to get class for each DPCI ===========
const weeklyRows = getRows('Weekly Sales');
const itemMeta = {}; // { dpci: { class, dept, desc, lastWeekSales, lastWeekUnits, ... } }
for (let i = 7; i < weeklyRows.length; i++) {
  const row = weeklyRows[i];
  const dpci = (row[3] || '').trim();
  if (!dpci) continue;
  itemMeta[dpci] = {
    deptId: row[0],
    classId: row[1],
    className: (row[2] || '').trim(),
    description: (row[4] || '').trim(),
    lastWeekSales: num(row[5]),
    lastWeekUnits: num(row[6]),
    lastWeekPSPW: num(row[7]),
    lastWeekUPSPW: num(row[8]),
    lastWeekPriceTotal: num(row[9]),
    lastWeekPromoPct: num(row[10]),
    lastWeekOOS: num(row[11]),
    storesTracked: num(row[12]),
  };
}

// =========== 4) Channel breakout (Last 13 Weeks) ===========
const channelRows = getRows('Sales $ Breakout by Channel');
const channelData = {}; // by DPCI
for (let i = 8; i < channelRows.length; i++) {
  const row = channelRows[i];
  const dpci = (row[3] || '').trim();
  if (!dpci) continue;
  channelData[dpci] = {
    description: (row[4] || '').trim(),
    LW_total: num(row[5]),
    LW_online: num(row[6]),
    LW_onlinePen: num(row[7]),
    LW_storePickup: num(row[8]),
    LW_shipt: num(row[9]),
    LW_shipFromStore: num(row[10]),
    L4W_total: num(row[11]),
    L4W_online: num(row[12]),
    L4W_onlinePen: num(row[13]),
    L4W_storePickup: num(row[14]),
    L4W_shipt: num(row[15]),
    L4W_shipFromStore: num(row[16]),
    L13W_total: num(row[17]),
    L13W_online: num(row[18]),
    L13W_onlinePen: num(row[19]),
    L13W_storePickup: num(row[20]),
    L13W_shipt: num(row[21]),
    L13W_shipFromStore: num(row[22]),
  };
}

// =========== 5) Target.com by Week (enterprise online totals) ===========
const targetWeekRows = getRows('Target.com by Week');
const targetWeekly = []; // { fiscalWeek, salesTotal, onlineOrig, onlineOrigPen, storePickup, shipt, shipFromStore }
for (let i = 7; i < targetWeekRows.length; i++) {
  const row = targetWeekRows[i];
  const fw = (row[0] || '').trim();
  if (!fw) continue;
  targetWeekly.push({
    fiscalWeek: fw,
    salesTotal: num(row[1]),
    onlineOrig: num(row[2]),
    onlineOrigPen: num(row[3]),
    storePickup: num(row[4]),
    shipt: num(row[5]),
    shipFromStore: num(row[6]),
  });
}

// =========== 6) Promo Recap weekly ===========
const promoRows = getRows('Last 52wks Promo Recap');
const promoData = []; // {weekDate, deptId, classId, className, baseUnits, baseSales, totalUnits, promoUnits, lift, incremental, sales, promoSales, $pspw, oos}
function normalizeDate(s) {
  // "04/25/2026" -> "4/25/2026" to match sales/item date format
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${parseInt(m[1])}/${parseInt(m[2])}/${m[3]}`;
}
for (let i = 7; i < promoRows.length; i++) {
  const row = promoRows[i];
  const wd = normalizeDate((row[0] || '').trim());
  if (!wd) continue;
  promoData.push({
    weekDate: wd,
    deptId: row[1],
    classId: row[2],
    className: (row[3] || '').trim(),
    baseUnits4W: num(row[4]),
    baseSales4W: num(row[5]),
    baseUnitsPSPW: num(row[6]),
    baseSalesPSPW: num(row[7]),
    basePrice: num(row[8]),
    priceTotal: num(row[9]),
    totalUnits: num(row[10]),
    promoUnits: num(row[11]),
    baseUnitsLift: num(row[12]),
    incrementalUnits: num(row[13]),
    UPSPW: num(row[14]),
    sales: num(row[15]),
    promoSales: num(row[16]),
    baseSalesLift: num(row[17]),
    incrementalSales: num(row[18]),
    $pspw: num(row[19]),
    mdD: num(row[20]),
    oos: num(row[21]),
  });
}

// =========== 7) Sales by Type (TY vs LY) ===========
const typeRows = getRows('Sales $ by Type');
const typeData = {};
for (let i = 8; i < typeRows.length; i++) {
  const row = typeRows[i];
  const dpci = (row[0] || '').trim();
  if (!dpci) continue;
  typeData[dpci] = {
    description: (row[1] || '').trim(),
    LW: { total: num(row[2]), totalLY: num(row[3]), regular: num(row[5]), regularLY: num(row[6]), promo: num(row[8]), promoLY: num(row[9]), clearance: num(row[11]), clearanceLY: num(row[12]) },
    L4W: { total: num(row[14]), totalLY: num(row[15]), regular: num(row[17]), regularLY: num(row[18]), promo: num(row[20]), promoLY: num(row[21]), clearance: num(row[23]), clearanceLY: num(row[24]) },
    L13W: { total: num(row[26]), totalLY: num(row[27]), regular: num(row[29]), regularLY: num(row[30]), promo: num(row[32]), promoLY: num(row[33]), clearance: num(row[35]), clearanceLY: num(row[36]) },
    L52W: { total: num(row[38]), totalLY: num(row[39]), regular: num(row[41]), regularLY: num(row[42]), promo: num(row[44]), promoLY: num(row[45]), clearance: num(row[47]), clearanceLY: num(row[48]) },
  };
}

// =========== 8) Inventory ===========
const invRows = getRows('Inventory Analysis');
const inventoryData = {};
for (let i = 7; i < invRows.length; i++) {
  const row = invRows[i];
  const dpci = (row[0] || '').trim();
  if (!dpci) continue;
  inventoryData[dpci] = {
    description: (row[1] || '').trim(),
    className: (row[2] || '').trim(),
    oos: num(row[3]),
    oos1w: num(row[4]),
    oos2w: num(row[5]),
    oos3w: num(row[6]),
    oos4w: num(row[7]),
    oos5w: num(row[8]),
    storesTracked: num(row[9]),
    base4W: num(row[10]),
    inStoreEOH: num(row[11]),
    fdcEOH: num(row[12]),
    rdcEOH: num(row[13]),
    eohOW: num(row[14]),
    wos: num(row[15]),
    onOrder: num(row[16]),
    onOrderPastDue: num(row[17]),
    onOrderCurr: num(row[18]),
    onOrder2W: num(row[19]),
    onOrder3W: num(row[20]),
    onOrder48W: num(row[21]),
    onOrder9W: num(row[22]),
  };
}

// =========== 9) Roundel CSV - parse spend by category by week ===========
const csvRaw = fs.readFileSync(csvPath, 'utf-8');
// CSV has multi-line headers because of newlines in column names; the file uses CRLF? Let me parse with sheetjs
const csvWb = XLSX.read(csvRaw, { type: 'string' });
const csvSheet = csvWb.Sheets[csvWb.SheetNames[0]];
const csvRows = XLSX.utils.sheet_to_json(csvSheet, { header: 1, defval: '', raw: false });

// Header row is row index 1, but the campaign names are in column 0. The dates in row 1 are like "Week 1\n09-12-25"
const roundelHeader = csvRows[1];
const roundelDates = []; // mm-dd-yy
for (let j = 1; j < roundelHeader.length; j++) {
  const h = String(roundelHeader[j] || '').trim();
  const m = h.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (m) {
    const mo = m[1], d = m[2], y = '20' + m[3];
    roundelDates.push(`${parseInt(mo)}/${parseInt(d)}/${y}`);
  } else {
    roundelDates.push(null);
  }
}
const roundelData = {}; // category -> { date: spend }
for (let i = 2; i < csvRows.length; i++) {
  const row = csvRows[i];
  const cat = String(row[0] || '').trim();
  if (!cat || cat === 'Total') continue;
  roundelData[cat] = {};
  for (let j = 1; j < row.length && j - 1 < roundelDates.length; j++) {
    const d = roundelDates[j - 1];
    if (!d) continue;
    roundelData[cat][d] = num(row[j]);
  }
}

// =========== 10) Map SKU description -> Roundel category ===========
function mapToRoundelCategory(desc) {
  const d = desc.toLowerCase();
  if (d.includes('yogo') || d.includes('yogurt')) return 'YOGOS';
  if (d.includes('smoothie') || d.includes('shake')) return 'Smoothies';
  if (/\bpuffs?\b/.test(d) || d.includes('cereal')) return 'Puffs + Cereals';
  if (d.includes('baked snack bar') || d.includes('snack bar') || d.includes('biteable') || /\bbars?\b/.test(d)) return 'Baked Bars';
  if (/fruit\s*&?\s*veggie\s*mini/.test(d) || (d.includes('mini') && (d.includes('fruit') || d.includes('veg')))) return 'Fruit+Veggie Minis';
  if (d.includes('ring')) return 'Fruit+Veggie Minis';
  if (d.includes('frozen') || d.includes('meatball') || d.includes('slider') || d.includes('dipper') || d.includes('mac') || d.includes('pizza') || d.includes('loops') || d.includes('chicken')) return 'Frozen/Meals';
  if (d.includes('cauliflower') || d.includes('broccoli') || d.includes('zucchini') || d.includes('popper') || d.includes('bite') || d.includes('tots')) return 'Frozen/Meals';
  if (d.includes('pasta') || d.includes('rice') || d.includes('lasagna') || d.includes('quesadilla') || d.includes('bowl') || d.includes('plate') || d.includes('meal')) return 'Frozen/Meals';
  return 'Other';
}

// Save
const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceXlsx: xlsxPath,
    sourceCsv: csvPath,
    lastWeek: '4/25/2026',
  },
  subclassDates,
  subclassData,
  itemDates,
  itemData,
  itemMeta,
  channelData,
  targetWeekly,
  promoData,
  typeData,
  inventoryData,
  roundelDates,
  roundelData,
};

// Build SKU-level Roundel mapping
const skuMap = {};
for (const dpci in itemData) {
  const desc = itemData[dpci].description;
  skuMap[dpci] = { description: desc, roundelCategory: mapToRoundelCategory(desc) };
}
out.skuMap = skuMap;

// Inspect category distribution
const catCount = {};
for (const dpci in skuMap) {
  const c = skuMap[dpci].roundelCategory;
  catCount[c] = (catCount[c] || 0) + 1;
}
console.log('Roundel category counts (by SKU):', catCount);
console.log('Total subclasses:', Object.keys(subclassData));
console.log('Subclass dates count:', subclassDates.length, 'first:', subclassDates[0], 'last:', subclassDates[subclassDates.length - 1]);
console.log('Item dates count:', itemDates.length);
console.log('Roundel dates count:', roundelDates.length, 'first:', roundelDates[0], 'last:', roundelDates[roundelDates.length - 1]);
console.log('Item count:', Object.keys(itemData).length);
console.log('Channel count:', Object.keys(channelData).length);
console.log('Promo data rows:', promoData.length);
console.log('Inventory items:', Object.keys(inventoryData).length);
console.log('Target weekly rows:', targetWeekly.length);

// Output JSON
fs.writeFileSync('data.json', JSON.stringify(out));
console.log('Wrote data.json:', fs.statSync('data.json').size, 'bytes');

// Show sample item descriptions per Roundel category
const samples = {};
for (const dpci in skuMap) {
  const c = skuMap[dpci].roundelCategory;
  if (!samples[c]) samples[c] = [];
  if (samples[c].length < 6) samples[c].push(skuMap[dpci].description);
}
console.log('\nSamples by category:');
for (const c in samples) {
  console.log(`\n${c}:`);
  for (const s of samples[c]) console.log('  -', s);
}
