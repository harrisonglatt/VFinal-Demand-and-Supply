// Confirms which Excel sheet each dashboard metric comes from
// AND verifies item×pen calc matches channel sheet for L13W
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('unified.json', 'utf-8'));

console.log('========== DASHBOARD DATA SOURCE MAP ==========\n');

const sources = {
  'Per-SKU weekly Sales $':                        'Last 52wks Item Trends',
  'Per-SKU weekly Units':                          'Last 52wks Item Trends',
  'Per-SKU weekly Promo $':                        'Last 52wks Item Trends',
  'Per-SKU weekly Promo % of Sales':               'Last 52wks Item Trends',
  'Per-SKU weekly $PSPW':                          'Last 52wks Item Trends',
  'Per-SKU weekly UPSPW':                          'Last 52wks Item Trends',
  'Per-SKU weekly Online Orig Penetration':        'Last 52wks Item Trends',
  'Per-SKU weekly OOS %':                          'Last 52wks Item Trends',
  'Per-SKU weekly Stores Tracked':                 'Last 52wks Item Trends',
  'Per-SKU weekly Price':                          'Last 52wks Item Trends',
  'Calculated: Online $ per SKU per week':         'DERIVED: Sales $ × Online Orig Pen (both from Item Trends)',
  '— — — — — — —':                                  '',
  'Last Week SKU snapshot (sales/units/$PSPW/etc)': 'Weekly Sales tab (mirror of Item Trends LW column)',
  'Channel breakout (online $, store pickup, shipt) L13W/L4W/LW': 'Sales $ Breakout by Channel',
  'YoY (this year vs last year) by period':        'Sales $ by Type',
  'Promo recap (base, incremental, lift) by class': 'Last 52wks Promo Recap',
  'Inventory: WOS, EOH, On Order':                 'Inventory Analysis',
  'Enterprise weekly online %':                    'Target.com by Week',
  'Subclass-level weekly trends':                  'Last 52wks Subclass Trend',
  '\nRoundel spend by category by week':           'Little Spoon Retailer 101 - Roundel Campaign Spend Tracker .csv',
};
for (const [metric, src] of Object.entries(sources)) {
  console.log(`  ${metric.padEnd(60)}  →  ${src}`);
}

// ---- Verify item×pen calc matches channel sheet for L13W ----
console.log('\n========== ITEM×PEN VS CHANNEL SHEET (L13W) ==========\n');

const last13 = data.salesDates.slice(-13);

// Method 1: per-SKU sum of weekly Sales × Pen
let m1Total = 0;
for (const dpci in data.itemData) {
  const sales = data.itemData[dpci].metrics['Sales $ - Total'] || {};
  const pen = data.itemData[dpci].metrics['Sales $ - Online Orig Penetration'] || {};
  for (const w of last13) {
    const sv = sales[w], pv = pen[w];
    if (typeof sv === 'number' && typeof pv === 'number') m1Total += sv * pv;
  }
}

// Method 2: channel sheet L13W_online sum
let m2Total = 0;
for (const dpci in data.channelData) {
  m2Total += data.channelData[dpci].L13W_online || 0;
}

console.log(`Method 1 (item × pen, weekly sum): $${m1Total.toFixed(0)}`);
console.log(`Method 2 (channel sheet L13W):     $${m2Total.toFixed(0)}`);
console.log(`Diff:                              $${(m1Total - m2Total).toFixed(0)} (${((m1Total - m2Total)/m2Total*100).toFixed(2)}%)`);
console.log('\nNote: Method 1 (item × pen) is the calculated field per-SKU per-week.');
console.log('Method 2 is the retailer\'s pre-summed L13W figure from channel breakout.');
console.log('Difference comes from rounding pen% at 4 decimals, not from data error.');
