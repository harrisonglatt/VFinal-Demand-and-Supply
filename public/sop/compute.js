// Unify SKU + Subclass + Promo + Roundel into analytics-ready time series.
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf-8'));

// Sales week dates are Saturday-ending (Target convention).
// Roundel CSVs may use either Friday "week ending" OR Sunday "week starting".
// Snap any Roundel date forward to the next Saturday on/after that date —
// both conventions land on the correct sales week.
function alignRoundelToSalesWeek(roundelDate, salesDates) {
  const [m, d, y] = roundelDate.split('/').map(Number);
  const rd = new Date(Date.UTC(y, m - 1, d));
  const dow = rd.getUTCDay(); // Sun=0, Mon=1, ..., Sat=6
  const daysToSat = (6 - dow + 7) % 7; // 0 if already Sat
  const target = new Date(rd.getTime() + daysToSat * 24 * 60 * 60 * 1000);
  const targetKey = `${target.getUTCMonth() + 1}/${target.getUTCDate()}/${target.getUTCFullYear()}`;
  if (salesDates.includes(targetKey)) return targetKey;
  // fallback: nearest sales date within ±4 days
  let best = null, bestDelta = 999;
  for (const sd of salesDates) {
    const [sm, sdd, sy] = sd.split('/').map(Number);
    const sdate = new Date(Date.UTC(sy, sm - 1, sdd));
    const delta = Math.abs((sdate - rd) / (24 * 60 * 60 * 1000));
    if (delta < bestDelta) { bestDelta = delta; best = sd; }
  }
  return bestDelta <= 4 ? best : null;
}

const salesDates = data.subclassDates;
// Build roundel -> sales date mapping
const roundelToSalesDate = {};
for (const rd of data.roundelDates) {
  if (!rd) continue;
  roundelToSalesDate[rd] = alignRoundelToSalesWeek(rd, salesDates);
}
console.log('Roundel→sales date alignment sample:',
  Object.entries(roundelToSalesDate).slice(0, 5));

// Aggregate item-level data into Roundel categories
// itemData: { dpci: { description, metrics: { metric: { date: value } } } }
// skuMap: { dpci: { description, roundelCategory } }

const ROUNDEL_CATS = ['YOGOS', 'Puffs + Cereals', 'Smoothies', 'Frozen/Meals', 'Baked Bars', 'Fruit+Veggie Minis', 'Other'];
const METRICS = [
  'Sales $ - Total',
  'Units - Total ',
  'Sales $ - Promo ',
  'Promo Units - Total ',
  '4 Week Base Sales $ ',
  '4 Week Base Units ',
  'OOS % ',
  '$PSPW ',
  'UPSPW ',
  'Stores Tracked ',
];

// Discover available item metrics
const sampleItem = data.itemData[Object.keys(data.itemData)[0]];
const availableMetrics = Object.keys(sampleItem.metrics);
console.log('Available item metrics:', availableMetrics);

// Aggregate by Roundel category
const categoryWeekly = {}; // { category: { metric: { date: sum } } }
for (const cat of ROUNDEL_CATS) categoryWeekly[cat] = {};
const itemWeeklyByCategory = {}; // for use later

for (const dpci in data.itemData) {
  const cat = data.skuMap[dpci]?.roundelCategory || 'Other';
  const it = data.itemData[dpci];
  for (const metric of availableMetrics) {
    if (!categoryWeekly[cat][metric]) categoryWeekly[cat][metric] = {};
    const series = it.metrics[metric] || {};
    for (const d of salesDates) {
      const v = series[d];
      if (typeof v === 'number') {
        categoryWeekly[cat][metric][d] = (categoryWeekly[cat][metric][d] || 0) + v;
      }
    }
  }
}

// Total across all categories
categoryWeekly['__ALL__'] = {};
for (const metric of availableMetrics) {
  categoryWeekly['__ALL__'][metric] = {};
  for (const d of salesDates) {
    let sum = 0, hasAny = false;
    for (const cat of ROUNDEL_CATS) {
      const v = categoryWeekly[cat][metric]?.[d];
      if (typeof v === 'number') { sum += v; hasAny = true; }
    }
    if (hasAny) categoryWeekly['__ALL__'][metric][d] = sum;
  }
}

// Roundel spend per Roundel category by sales-week date
const roundelByWeek = {}; // { date: { category: spend } }
for (const cat in data.roundelData) {
  for (const rd in data.roundelData[cat]) {
    const sd = roundelToSalesDate[rd];
    if (!sd) continue;
    const v = data.roundelData[cat][rd];
    if (typeof v === 'number') {
      if (!roundelByWeek[sd]) roundelByWeek[sd] = {};
      roundelByWeek[sd][cat] = (roundelByWeek[sd][cat] || 0) + v;
    }
  }
}

// Channel pen per category from item channel data (L13W snapshot)
const categoryChannel = {};
for (const cat of ROUNDEL_CATS) categoryChannel[cat] = { LW_total: 0, LW_online: 0, L4W_total: 0, L4W_online: 0, L13W_total: 0, L13W_online: 0 };
for (const dpci in data.channelData) {
  const cat = data.skuMap[dpci]?.roundelCategory || 'Other';
  const c = data.channelData[dpci];
  if (typeof c.LW_total === 'number') categoryChannel[cat].LW_total += c.LW_total;
  if (typeof c.LW_online === 'number') categoryChannel[cat].LW_online += c.LW_online;
  if (typeof c.L4W_total === 'number') categoryChannel[cat].L4W_total += c.L4W_total;
  if (typeof c.L4W_online === 'number') categoryChannel[cat].L4W_online += c.L4W_online;
  if (typeof c.L13W_total === 'number') categoryChannel[cat].L13W_total += c.L13W_total;
  if (typeof c.L13W_online === 'number') categoryChannel[cat].L13W_online += c.L13W_online;
}
// Compute pens
for (const cat in categoryChannel) {
  const cc = categoryChannel[cat];
  cc.LW_pen = cc.LW_total > 0 ? cc.LW_online / cc.LW_total : null;
  cc.L4W_pen = cc.L4W_total > 0 ? cc.L4W_online / cc.L4W_total : null;
  cc.L13W_pen = cc.L13W_total > 0 ? cc.L13W_online / cc.L13W_total : null;
}

// Promo data is by Class (Target subclass), not by Roundel category. We'll still pass through as is.

// Save the unified data structure
const unified = {
  meta: data.meta,
  salesDates,
  itemDates: data.itemDates,
  roundelDates: data.roundelDates,
  roundelToSalesDate,
  itemMeta: data.itemMeta,
  itemData: data.itemData,
  skuMap: data.skuMap,
  subclassData: data.subclassData,
  categoryWeekly,
  roundelByWeek,
  rawRoundelData: data.roundelData,
  channelData: data.channelData,
  categoryChannel,
  targetWeekly: data.targetWeekly,
  promoData: data.promoData,
  typeData: data.typeData,
  inventoryData: data.inventoryData,
  availableItemMetrics: availableMetrics,
  ROUNDEL_CATS,
};

fs.writeFileSync('unified.json', JSON.stringify(unified));
console.log('Wrote unified.json:', fs.statSync('unified.json').size, 'bytes');

// Quick sanity: total sales L13W vs roundel ROAS
const recent13 = salesDates.slice(-13);
console.log('Last 13 weeks:', recent13);

let totalSalesL13 = 0, totalOnlineL13 = 0, totalSpendL13 = 0;
for (const d of recent13) {
  totalSalesL13 += categoryWeekly['__ALL__']['Sales $ - Total']?.[d] || 0;
  for (const cat of Object.keys(roundelByWeek[d] || {})) {
    totalSpendL13 += roundelByWeek[d][cat] || 0;
  }
}
for (const cat in categoryChannel) {
  totalOnlineL13 += categoryChannel[cat].L13W_online || 0;
}
console.log(`L13W: Total Sales=$${totalSalesL13.toFixed(0)}, Online Sales (snapshot)=$${totalOnlineL13.toFixed(0)}, Roundel Spend=$${totalSpendL13.toFixed(0)}`);
console.log(`Implied ROAS (online sales / spend) = ${totalSpendL13 ? (totalOnlineL13 / totalSpendL13).toFixed(2) : 'n/a'}`);

// Per-category L13W spend vs sales
console.log('\nPer-Roundel-category L13W:');
for (const cat of ROUNDEL_CATS) {
  let s = 0, sp = 0;
  for (const d of recent13) {
    s += categoryWeekly[cat]['Sales $ - Total']?.[d] || 0;
    sp += roundelByWeek[d]?.[cat] || 0;
  }
  console.log(`  ${cat}: sales=$${s.toFixed(0)}, spend=$${sp.toFixed(0)}, ratio=${sp ? (s/sp).toFixed(2) : 'n/a'}`);
}
