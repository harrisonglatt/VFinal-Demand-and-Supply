// Walk through Online ROAS calc step by step
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('unified.json', 'utf-8'));

const last13 = data.salesDates.slice(-13);
console.log('Window: L13W');
console.log('Weeks:', last13.join(', '));
console.log('');

// Per-category breakdown using current default mapping
const cats = ['YOGOS', 'Puffs + Cereals', 'Smoothies', 'Frozen/Meals', 'Baked Bars', 'Fruit+Veggie Minis', 'Other'];

let grandSales = 0, grandOnline = 0, grandSpend = 0;
let spendCats_sales = 0, spendCats_online = 0, spendCats_spend = 0;

console.log('Per-category L13W:');
console.log('Cat | Sales | Online (Sales×Pen) | Spend | Online/Spend');
console.log('---'.repeat(20));
for (const cat of cats) {
  let sales = 0, online = 0, spend = 0;
  // Sales × Pen across SKUs in this cat
  for (const dpci in data.itemData) {
    if ((data.skuMap[dpci]?.roundelCategory || 'Other') !== cat) continue;
    for (const w of last13) {
      const sv = data.itemData[dpci].metrics['Sales $ - Total']?.[w];
      const pv = data.itemData[dpci].metrics['Sales $ - Online Orig Penetration']?.[w];
      if (typeof sv === 'number') {
        sales += sv;
        if (typeof pv === 'number') online += sv * pv;
      }
    }
  }
  for (const w of last13) {
    const v = data.roundelByWeek[w]?.[cat];
    if (typeof v === 'number') spend += v;
  }
  grandSales += sales; grandOnline += online; grandSpend += spend;
  if (spend > 0) {
    spendCats_sales += sales;
    spendCats_online += online;
    spendCats_spend += spend;
  }
  const roas = spend > 0 ? (online / spend).toFixed(2) + 'x' : 'no spend';
  console.log(`${cat.padEnd(20)} | $${sales.toFixed(0).padStart(10)} | $${online.toFixed(0).padStart(10)} | $${spend.toFixed(0).padStart(8)} | ${roas}`);
}
console.log('---'.repeat(20));
console.log(`${'TOTAL (all cats)'.padEnd(20)} | $${grandSales.toFixed(0).padStart(10)} | $${grandOnline.toFixed(0).padStart(10)} | $${grandSpend.toFixed(0).padStart(8)}`);
console.log('');

console.log('=== ROAS calculations ===');
console.log(`Total Sales (all cats): $${grandSales.toFixed(0)}`);
console.log(`Online Sales (all cats): $${grandOnline.toFixed(0)}`);
console.log(`Total Roundel Spend: $${grandSpend.toFixed(0)}`);
console.log('');
console.log(`Online ROAS (all cats / spend): ${(grandOnline / grandSpend).toFixed(2)}x   <-- current dashboard KPI`);
console.log(`Online ROAS (only spend-bearing cats): ${(spendCats_online / spendCats_spend).toFixed(2)}x   <-- cleaner version`);
console.log('');
console.log(`Total ROAS (all cats sales / spend): ${(grandSales / grandSpend).toFixed(2)}x`);
console.log(`Total ROAS (only spend-bearing cats): ${(spendCats_sales / spendCats_spend).toFixed(2)}x`);
console.log('');
console.log(`The "Other" category contributes:`);
console.log(`  Sales: $${(grandSales - spendCats_sales).toFixed(0)}`);
console.log(`  Online: $${(grandOnline - spendCats_online).toFixed(0)}`);
console.log(`  Spend: $0 — these inflate ROAS by ~${((grandOnline - spendCats_online) / spendCats_spend).toFixed(2)}x`);
