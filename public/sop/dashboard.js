// =================== Little Spoon Retail Performance Dashboard ===================
// Logic, filtering, charts. Reads global DATA injected from unified.json,
// or from a user-uploaded dataset persisted in localStorage (see initUpload).

const CUSTOM_DATA_LS_KEY = 'lsdash_customData_v1';
function loadCustomData() {
  try {
    const s = localStorage.getItem(CUSTOM_DATA_LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function clearCustomData() {
  try { localStorage.removeItem(CUSTOM_DATA_LS_KEY); } catch {}
}
const _customData = loadCustomData();
if (_customData) window.DATA = _customData;
const D = window.DATA;
if (!D) {
  document.body.innerHTML = '<div style="padding:48px;font-family:Mulish;"><h1>Data missing.</h1><p>Run <code>node build.js</code> to inject data.</p></div>';
}

// ============================================================
//   SKU → Category mapping (with user override via localStorage)
// ============================================================
const SKU_MAP_LS_KEY = 'lsdash_skuMap_v1';
function loadSkuOverrides() {
  try { return JSON.parse(localStorage.getItem(SKU_MAP_LS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveSkuOverrides(map) {
  try { localStorage.setItem(SKU_MAP_LS_KEY, JSON.stringify(map)); } catch {}
}
let SKU_OVERRIDES = {};
// Authoritative SKU → category. Reads override first, then falls back to default.
function skuCategory(dpci) {
  const o = SKU_OVERRIDES[dpci];
  if (o) return o;
  return D?.skuMap?.[dpci]?.roundelCategory || 'Other';
}
function setSkuCategory(dpci, cat) {
  SKU_OVERRIDES[dpci] = cat;
  saveSkuOverrides(SKU_OVERRIDES);
}
function clearSkuCategory(dpci) {
  delete SKU_OVERRIDES[dpci];
  saveSkuOverrides(SKU_OVERRIDES);
}
function resetAllSkuOverrides() {
  SKU_OVERRIDES = {};
  saveSkuOverrides(SKU_OVERRIDES);
}

// ============================================================
//   CALCULATED FIELD: Online $ per SKU per week
//   = Sales $ - Total  ×  Sales $ - Online Orig Penetration
//   (both metrics come from Last 52wks Item Trends)
// ============================================================
function itemOnlineSales(dpci, week) {
  const it = D.itemData?.[dpci];
  if (!it) return null;
  const s = it.metrics['Sales $ - Total']?.[week];
  const p = it.metrics['Sales $ - Online Orig Penetration']?.[week];
  if (typeof s !== 'number' || typeof p !== 'number') return null;
  return s * p;
}
function itemOnlineSalesWindow(dpci, weeks) {
  let total = 0, has = false;
  for (const w of weeks) {
    const v = itemOnlineSales(dpci, w);
    if (typeof v === 'number') { total += v; has = true; }
  }
  return has ? total : null;
}

// ---------- Brand palette ----------
const CAT_COLORS = {
  'YOGOS':            '#FF8FF5', // Pitaya
  'Puffs + Cereals':  '#FFC711', // Mango
  'Smoothies':        '#18A7FF', // Blueberry
  'Frozen/Meals':     '#00CF92', // Spinach
  'Baked Bars':       '#FF8766', // Guava
  'Fruit+Veggie Minis':'#C2FF7F',// Lime
  'Other':            '#9AA0A8', // Gray
};
const LS_BLUE = '#00E3CD';
const LS_BLACK = '#141414';
const ALMOND = '#FFFEF8';

// ---------- Chart.js global defaults ----------
Chart.defaults.font.family = "'Roboto', 'Mulish', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#4A5060';
Chart.defaults.borderColor = '#E5E8ED';
Chart.defaults.plugins.legend.position = 'bottom';
Chart.defaults.plugins.legend.labels.font = { size: 11, family: "'Roboto', 'Mulish', sans-serif" };
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(20,20,20,0.92)';
Chart.defaults.plugins.tooltip.titleFont = { weight: 700, size: 12 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.boxPadding = 6;
// Register datalabels plugin globally but disable by default; enable per-chart where useful
if (window.ChartDataLabels) {
  Chart.register(window.ChartDataLabels);
  Chart.defaults.plugins.datalabels = { display: false };
}

// ---------- State ----------
const state = {
  page: 'sop',
  presentation: false,
  // S&OP page
  sopCatMetric: 'sales',
  sopSearch: '',
  sopSort: { key: 'momentum', dir: 'desc' },
  sopPSPWSelected: new Set(),
  // Bridge
  bridgeFrom: 'lwp',  // string key: 'lwp' | 'lw' | 'l4w' | 'l13w' | 'l26w' | 'l52w' | week date string
  bridgeTo: 'lw',
  bridgeMetric: 'sales',
  window: 13,        // LW / L4W / L13W / L26W / L52W or 'custom'
  customStart: null, // index into D.salesDates (inclusive)
  customEnd: null,   // index into D.salesDates (inclusive)
  channel: 'all',    // all / online / store
  categories: new Set(D.ROUNDEL_CATS), // all by default; "Other" included
  selectedSKU: null,
  trendMetric: 'sales',
  catTrendMetric: 'sales',
  catTrendShape: 'line',
  roundelTrendView: 'stacked',
  roundelLag: 0,
  // ---- Roundel Intelligence (new 8-view OS) ----
  rdTab: 'exec',                  // exec | category | sku | incr | promo | digital | budget | readout
  rdMethod: 'trailing13',         // trailing4 | trailing13 | nonpromo | comparable
  rdExecMetric: 'spend',          // spend | online | total | roas | pspw
  rdSkuSearch: '',
  rdSkuActionFilter: 'all',
  rdSkuSort: { key: 'spend', dir: 'desc' },
  rdSkuSelected: null,            // dpci of selected SKU for trend chart
  rdSkuTrendMetric: 'sales',
  rdSimBudget: 500000,
  rdSimScenario: 'base',
  rdSimAlloc: null,               // {cat: pct} — overrides
  rdSupportedThreshold: 250,      // $ spend per category-week to count as "supported"
  rdCorrLag: 0,                   // 0 / 1 / 2 weeks for spend×sales scatter
  charts: {},        // chart instances keyed by canvas id
  skuSort: { key: 'sales', dir: 'desc' },
  skuSearch: '',
  skuTrendMetric: 'velocity',
  skuTrendGrouping: 'sku',
  skuTrendSelected: new Set(), // dpci's chosen by user; empty = top N
  categoryMultiMetric: 'sales',
  drawerMetric: 'sales',
  explorerGrain: 'sku',
  explorerSearch: '',
  weeklyMetric: 'sales',
  weeklySearch: '',
  weeklySort: { key: 'l13w', dir: 'desc' },
  // Compare module
  compareMode: 'sku',
  compareSelected: new Set(),
  compareMetrics: new Set(['velocity']),
  compareSearch: '',
  // Mappings
  mappingsSearch: '',
  // SKU period table
  skuPeriodSearch: '',
  skuPeriodSort: { key: 'l13w_sales', dir: 'desc' },
  // Digital page toggles
  digitalPenView: 'cat',     // 'cat' | 'enterprise'
  digitalSpendView: 'stacked', // 'stacked' | 'line'
};

// ---------- Helpers ----------
function fmt$(v, opts = {}) {
  if (v == null || isNaN(v)) return '–';
  const abs = Math.abs(v);
  if (opts.compact !== false) {
    if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  }
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtNum(v, opts = {}) {
  if (v == null || isNaN(v)) return '–';
  const abs = Math.abs(v);
  if (opts.compact !== false) {
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  }
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function fmtPct(v, digits = 1) {
  if (v == null || isNaN(v)) return '–';
  return (v * 100).toFixed(digits) + '%';
}
function fmtMult(v, digits = 2) {
  if (v == null || isNaN(v)) return '–';
  return v.toFixed(digits) + 'x';
}
// $PSPW always shows 2 decimals (e.g. $72.86)
function fmtPSPW(v) {
  if (v == null || isNaN(v)) return '–';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeDiv(a, b) { if (b == null || b === 0) return null; return a / b; }
function shortDate(d) {
  if (!d) return '';
  const [m, day, y] = d.split('/');
  return `${m}/${day}`;
}
function pillTabFor(metric) {
  if (metric === 'sales') return 'Sales $ - Total';
  if (metric === 'units') return 'Units - Total';
  if (metric === 'velocity') return 'Sales $ - Total per Store Per Week ($PSPW)';
  if (metric === 'upspw') return 'Units - Total Per Store Per Week (UPSPW)';
  if (metric === 'pen') return 'Sales $ - Online Orig Penetration';
  if (metric === 'onlinePen') return 'Sales $ - Online Orig Penetration';
  if (metric === 'oos') return 'Out of Stock %';
  if (metric === 'price') return 'Price - Total';
  if (metric === 'promoPct') return 'Sales $ - Promo % of Total Sales';
  return metric;
}
// Format a value based on metric type (for tooltips & axes)
function metricFmt(metric, v) {
  if (v == null || isNaN(v)) return '–';
  if (metric === 'velocity') return fmtPSPW(v);
  if (metric === 'sales' || metric === 'price' || metric === 'spend') return fmt$(v);
  if (metric === 'units' || metric === 'upspw') return fmtNum(v);
  if (metric === 'oos' || metric === 'promoPct' || metric === 'onlinePen' || metric === 'pen') return fmtPct(v);
  return fmtNum(v);
}
function metricLabel(metric) {
  return ({sales:'Sales $', units:'Units', velocity:'$ PSPW', upspw:'UPSPW', oos:'OOS %', promoPct:'Promo %', onlinePen:'Online %', pen:'Online %', price:'Price', spend:'Roundel $'})[metric] || metric;
}
function categoryClassName(cat) {
  return cat.replace(/[^A-Za-z]/g, '');
}

// ---------- Data Slice (selected window) ----------
function selectedWeeks() {
  if (state.window === 'custom' && state.customStart != null && state.customEnd != null) {
    return D.salesDates.slice(state.customStart, state.customEnd + 1);
  }
  const n = typeof state.window === 'number' ? state.window : 13;
  return D.salesDates.slice(-n);
}
function priorWeeks() {
  const all = D.salesDates;
  if (state.window === 'custom' && state.customStart != null && state.customEnd != null) {
    const len = state.customEnd - state.customStart + 1;
    const end = state.customStart;
    const start = Math.max(0, end - len);
    return all.slice(start, end);
  }
  const n = typeof state.window === 'number' ? state.window : 13;
  const start = Math.max(0, all.length - 2 * n);
  return all.slice(start, all.length - n);
}
function activeCats() {
  return D.ROUNDEL_CATS.filter(c => state.categories.has(c));
}
// Active categories that map to a Roundel campaign (excludes "Other")
function activeRoundelCats() {
  return activeCats().filter(c => c !== 'Other');
}

// LIVE category aggregation: sum the raw metric across SKUs that currently map to `cat`.
// Used everywhere instead of D.categoryWeekly so that mapping changes flow through.
function catWeekValue(cat, metricKey, week) {
  let s = 0, has = false;
  for (const dpci in D.itemData) {
    if (skuCategory(dpci) !== cat) continue;
    const v = D.itemData[dpci].metrics[metricKey]?.[week];
    if (typeof v === 'number') { s += v; has = true; }
  }
  return has ? s : null;
}
function sumMetric(cat, metric, weeks) {
  let sum = 0;
  for (const w of weeks) {
    const v = catWeekValue(cat, metric, w);
    if (typeof v === 'number') sum += v;
  }
  return sum;
}
// Build a date-keyed series for a category using current mapping (live).
function catSeries(cat, metricKey) {
  const out = {};
  for (const dpci in D.itemData) {
    if (skuCategory(dpci) !== cat) continue;
    const series = D.itemData[dpci].metrics[metricKey] || {};
    for (const d in series) {
      const v = series[d];
      if (typeof v === 'number') out[d] = (out[d] || 0) + v;
    }
  }
  return out;
}
function sumAllSelected(metric, weeks) {
  let s = 0;
  for (const c of activeCats()) s += sumMetric(c, metric, weeks);
  return s;
}
function sumRoundelSpend(weeks, cats = null) {
  const list = cats || activeCats();
  let s = 0;
  for (const w of weeks) {
    const wk = D.roundelByWeek?.[w];
    if (!wk) continue;
    for (const cat of list) {
      const v = wk[cat];
      if (typeof v === 'number') s += v;
    }
  }
  return s;
}

// Online sales: from item-level "Online Orig Penetration" * "Sales $ - Total" since
// we don't have a clean weekly online dollar series at item level.
// Better: use Target.com weekly which gives us total enterprise online weekly.
// Canonical Online $ method:
// = sum over SKUs of  sum over weeks of  ( Sales × Online Orig Pen )
// Both source metrics live in "Last 52wks Item Trends".
// Validated against "Sales $ Breakout by Channel" L13W: matches to $25 (0.0007%) on $3.79M.
function sumOnlineSales(weeks) {
  if (weeks === undefined || weeks === null) weeks = selectedWeeks();
  let s = 0;
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    const v = itemOnlineSalesWindow(dpci, weeks);
    if (typeof v === 'number') s += v;
  }
  return s;
}
// Aggregate online $ by category (uses live mapping)
function categoryOnlineSales(cat, weeks) {
  let s = 0;
  for (const dpci in D.itemData) {
    if (skuCategory(dpci) !== cat) continue;
    const v = itemOnlineSalesWindow(dpci, weeks);
    if (typeof v === 'number') s += v;
  }
  return s;
}
function onlineSourceLabel() { return 'Sales × Online Pen (per SKU, weekly)'; }

// "Total Digital" = Online Orig + Store Pickup + Shipt + Ship from Store
// All four are e-commerce / digitally-influenced. Roundel typically credits all four.
// Real $ available from "Sales $ Breakout by Channel" for LW / L4W / L13W only.
// For other windows we scale Online Orig by the L13W ratio of (all e-com / Online Orig).
function _matchSnapshotKey(weeks) {
  if (!weeks) return null;
  const all = D.salesDates;
  const tail = all.slice(-weeks.length);
  if (JSON.stringify(tail) !== JSON.stringify(weeks)) return null;
  if (weeks.length === 1) return 'LW';
  if (weeks.length === 4) return 'L4W';
  if (weeks.length === 13) return 'L13W';
  return null;
}
function sumTotalDigitalSales(weeks) {
  if (weeks === undefined || weeks === null) weeks = selectedWeeks();
  const key = _matchSnapshotKey(weeks);
  if (key) {
    let s = 0;
    for (const dpci in D.channelData) {
      if (!state.categories.has(skuCategory(dpci))) continue;
      const c = D.channelData[dpci];
      s += (c[key + '_online'] || 0) + (c[key + '_storePickup'] || 0) + (c[key + '_shipt'] || 0) + (c[key + '_shipFromStore'] || 0);
    }
    return s;
  }
  // Estimate: scale Online Orig by L13W ratio
  const last13 = D.salesDates.slice(-13);
  const onlineOrigL13 = sumOnlineSales(last13);
  let totalDigL13 = 0;
  for (const dpci in D.channelData) {
    if (!state.categories.has(skuCategory(dpci))) continue;
    const c = D.channelData[dpci];
    totalDigL13 += (c.L13W_online || 0) + (c.L13W_storePickup || 0) + (c.L13W_shipt || 0) + (c.L13W_shipFromStore || 0);
  }
  const ratio = onlineOrigL13 > 0 ? totalDigL13 / onlineOrigL13 : 1.98;
  return sumOnlineSales(weeks) * ratio;
}
// Per-category Total Digital
function categoryTotalDigital(cat, weeks) {
  if (weeks === undefined || weeks === null) weeks = selectedWeeks();
  const key = _matchSnapshotKey(weeks);
  if (key) {
    let s = 0;
    for (const dpci in D.channelData) {
      if (skuCategory(dpci) !== cat) continue;
      const c = D.channelData[dpci];
      s += (c[key + '_online'] || 0) + (c[key + '_storePickup'] || 0) + (c[key + '_shipt'] || 0) + (c[key + '_shipFromStore'] || 0);
    }
    return s;
  }
  // Estimate via category's Online Orig × overall L13W ratio
  const last13 = D.salesDates.slice(-13);
  const catOOL13 = categoryOnlineSales(cat, last13);
  let catTDL13 = 0;
  for (const dpci in D.channelData) {
    if (skuCategory(dpci) !== cat) continue;
    const c = D.channelData[dpci];
    catTDL13 += (c.L13W_online || 0) + (c.L13W_storePickup || 0) + (c.L13W_shipt || 0) + (c.L13W_shipFromStore || 0);
  }
  const ratio = catOOL13 > 0 ? catTDL13 / catOOL13 : null;
  return ratio != null ? categoryOnlineSales(cat, weeks) * ratio : null;
}
function digitalSourceLabel(weeks) {
  return _matchSnapshotKey(weeks)
    ? 'Online + Pickup + Shipt + SFS (channel sheet)'
    : 'Estimated · Online Orig × L13W scale';
}

// Dynamic L13W online penetration % per category (uses live mapping)
function categoryOnlinePen(cat, weeks) {
  weeks = weeks || D.salesDates.slice(-13);
  const online = categoryOnlineSales(cat, weeks);
  let total = 0;
  for (const dpci in D.itemData) {
    if (skuCategory(dpci) !== cat) continue;
    for (const w of weeks) {
      const v = D.itemData[dpci].metrics['Sales $ - Total']?.[w];
      if (typeof v === 'number') total += v;
    }
  }
  return total > 0 ? online / total : null;
}
function sumStoreSales(weeks) {
  return sumAllSelected('Sales $ - Total', weeks) - sumOnlineSales(weeks);
}

// Channel-aware sales total
function sumSalesChan(weeks) {
  if (state.channel === 'online') return sumOnlineSales(weeks);
  if (state.channel === 'store')  return sumStoreSales(weeks);
  return sumAllSelected('Sales $ - Total', weeks);
}
function sumUnitsChan(weeks) {
  // Units don't have direct online pen; treat units as is (channel toggle for $ only)
  return sumAllSelected('Units - Total', weeks);
}

// ---------- Init UI ----------
function initFilters() {
  const catFilter = document.getElementById('category-filter');
  catFilter.innerHTML = '';
  D.ROUNDEL_CATS.forEach(cat => {
    const el = document.createElement('span');
    el.className = 'pill-cat active';
    el.dataset.cat = cat;
    el.textContent = cat;
    el.addEventListener('click', () => {
      if (state.categories.has(cat)) state.categories.delete(cat); else state.categories.add(cat);
      el.classList.toggle('active');
      renderAll();
    });
    catFilter.appendChild(el);
  });

  // Populate custom-range dropdowns
  const startSel = document.getElementById('custom-start');
  const endSel = document.getElementById('custom-end');
  if (startSel && endSel) {
    const opts = D.salesDates.map((d, i) => `<option value="${i}">${d}</option>`).join('');
    startSel.innerHTML = opts;
    endSel.innerHTML = opts;
    // Default custom = last 13 weeks
    state.customStart = D.salesDates.length - 13;
    state.customEnd = D.salesDates.length - 1;
    startSel.value = state.customStart;
    endSel.value = state.customEnd;
    const updateCount = () => {
      const len = state.customEnd - state.customStart + 1;
      document.getElementById('custom-range-count').textContent = len > 0 ? `${len} wk` : '⚠ invalid';
    };
    updateCount();
    startSel.addEventListener('change', e => {
      state.customStart = parseInt(e.target.value);
      if (state.customStart > state.customEnd) state.customEnd = state.customStart;
      endSel.value = state.customEnd;
      updateCount();
      if (state.window === 'custom') renderAll();
    });
    endSel.addEventListener('change', e => {
      state.customEnd = parseInt(e.target.value);
      if (state.customEnd < state.customStart) state.customStart = state.customEnd;
      startSel.value = state.customStart;
      updateCount();
      if (state.window === 'custom') renderAll();
    });
  }

  document.querySelectorAll('#window-toggle .pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('#window-toggle .pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      const w = p.dataset.window;
      state.window = w === 'custom' ? 'custom' : parseInt(w);
      const customRange = document.getElementById('custom-range');
      if (customRange) customRange.style.display = state.window === 'custom' ? 'flex' : 'none';
      renderAll();
    });
  });
  document.querySelectorAll('#channel-toggle .pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('#channel-toggle .pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      state.channel = p.dataset.channel;
      renderAll();
    });
  });

  // Page navigation
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      n.classList.add('active');
      state.page = n.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + state.page).classList.add('active');
      const titles = {
        sop: ['S&OP Meeting', 'A one-page narrative of the business — open, present, decide'],
        overview: ['Executive Overview', 'Retail performance · Roundel media · Digital penetration'],
        sku: ['SKU Performance', 'Sales, units, velocity + ranking by SKU'],
        category: ['Category Performance', 'Trends, contribution, and Roundel impact by category'],
        promo: ['Promo Analysis', 'Lift, baseline, and pre / during / post effects'],
        digital: ['Digital Penetration', 'Online share + Roundel relationship'],
        roundel: ['Roundel Performance Intelligence', 'An operating system for where Roundel dollars should go next'],
        weekly: ['Weekly Snapshot', 'Every SKU × every time horizon — Excel "Weekly Sales" reimagined'],
        compare: ['Compare', 'Overlay any metrics across any SKUs or categories'],
        graph: ['Graph Builder', 'Build presentation-ready, brand-styled charts in one click'],
        mappings: ['SKU Mappings', 'Edit SKU → category — flows through every metric live'],
        sources: ['Data Sources', 'Where every number on this dashboard comes from'],
        explorer: ['Data Explorer', 'Pivot, filter, and export the underlying dataset'],
      };
      document.getElementById('page-title').textContent = titles[state.page][0];
      document.getElementById('page-sub').textContent = titles[state.page][1];
      // Hide the global filter bar on the Graph Builder — it has its own controls
      const fb = document.querySelector('.filterbar');
      if (fb) fb.style.display = state.page === 'graph' ? 'none' : '';
      renderAll();
    });
  });

  // Trend metric toggles
  document.querySelectorAll('#overview-trend-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#overview-trend-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.trendMetric = b.dataset.metric;
      renderOverviewTrend();
    });
  });
  document.querySelectorAll('#category-trend-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#category-trend-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.catTrendMetric = b.dataset.metric;
      renderCategoryTrend();
    });
  });
  document.querySelectorAll('#category-trend-shape button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#category-trend-shape button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.catTrendShape = b.dataset.shape;
      renderCategoryTrend();
    });
  });
  // ---- Roundel Intelligence sub-tab nav ----
  document.querySelectorAll('.rd-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.rdTab = tab.dataset.rd;
      rdRender();
    });
  });

  // Method toggles (category + incrementality views share state.rdMethod)
  document.querySelectorAll('#rd-method-cat button, #rd-method-incr button').forEach(b => {
    b.addEventListener('click', () => {
      state.rdMethod = b.dataset.method;
      rdRender();
    });
  });

  // Exec trend metric toggle
  document.querySelectorAll('#rd-exec-trend-metric button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#rd-exec-trend-metric button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.rdExecMetric = b.dataset.m;
      rdRenderExecTrend();
    });
  });

  // Exec correlation lag toggle
  document.querySelectorAll('#rd-corr-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#rd-corr-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.rdCorrLag = parseInt(b.dataset.lag);
      rdRenderCorrelation();
    });
  });

  // SKU search + filter + sort
  const skuSearchEl = document.getElementById('rd-sku-search');
  if (skuSearchEl) skuSearchEl.addEventListener('input', e => {
    state.rdSkuSearch = e.target.value;
    rdRenderSku();
  });
  const skuActFilEl = document.getElementById('rd-sku-action-filter');
  if (skuActFilEl) skuActFilEl.addEventListener('change', e => {
    state.rdSkuActionFilter = e.target.value;
    rdRenderSku();
  });
  document.querySelectorAll('#rd-sku-table th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (!k) return;
      if (state.rdSkuSort.key === k) state.rdSkuSort.dir = state.rdSkuSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.rdSkuSort.key = k; state.rdSkuSort.dir = 'desc'; }
      rdRenderSku();
    });
  });

  // SKU trend metric toggle
  document.querySelectorAll('#rd-sku-trend-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#rd-sku-trend-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.rdSkuTrendMetric = b.dataset.m;
      rdRenderSkuTrend();
    });
  });

  // Budget simulator inputs
  const simBudgetEl = document.getElementById('rd-sim-budget');
  if (simBudgetEl) simBudgetEl.addEventListener('input', e => {
    state.rdSimBudget = parseFloat(e.target.value) || 0;
    rdRenderBudget();
  });
  document.querySelectorAll('.rd-sim-scenario').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.rd-sim-scenario').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      state.rdSimScenario = s.dataset.scenario;
      state.rdSimAlloc = null;
      rdRenderBudget();
    });
  });

  // SKU table
  document.querySelectorAll('#sku-table th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.skuSort.key === k) state.skuSort.dir = state.skuSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.skuSort.key = k; state.skuSort.dir = 'desc'; }
      renderSKUTable();
    });
  });
  document.getElementById('sku-search').addEventListener('input', e => {
    state.skuSearch = e.target.value.toLowerCase();
    renderSKUTable();
  });

  // SKU trend metric + grouping
  const skuMetricSel = document.getElementById('sku-trend-metric');
  if (skuMetricSel) {
    skuMetricSel.value = state.skuTrendMetric;
    skuMetricSel.addEventListener('change', e => {
      state.skuTrendMetric = e.target.value;
      renderSKUTrend();
    });
  }
  document.querySelectorAll('#sku-trend-grouping button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#sku-trend-grouping button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.skuTrendGrouping = b.dataset.group;
      renderSKUTrend();
    });
  });

  // Category multi metric
  document.querySelectorAll('#category-multi-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#category-multi-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.categoryMultiMetric = b.dataset.metric;
      renderCategoryMulti();
    });
  });

  // Explorer
  document.getElementById('explorer-grain').addEventListener('change', e => {
    state.explorerGrain = e.target.value;
    renderExplorer();
  });
  document.getElementById('explorer-search').addEventListener('input', e => {
    state.explorerSearch = e.target.value.toLowerCase();
    renderExplorer();
  });

  // Digital page toggles
  document.querySelectorAll('#digital-pen-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#digital-pen-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.digitalPenView = b.dataset.view;
      if (state.digitalPenView === 'enterprise') renderDigitalPenChart();
      else renderDigitalPenByCategory();
    });
  });
  document.querySelectorAll('#digital-spend-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#digital-spend-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.digitalSpendView = b.dataset.view;
      renderDigitalSpendByCategory();
    });
  });

  // Compare module
  document.querySelectorAll('#compare-mode button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#compare-mode button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.compareMode = b.dataset.mode;
      // Clear selections that don't match the new mode
      const filtered = [...state.compareSelected].filter(sel => {
        if (state.compareMode === 'sku') return sel.startsWith('sku:');
        if (state.compareMode === 'category') return sel.startsWith('cat:');
        return sel === 'total';
      });
      state.compareSelected = new Set(filtered);
      renderCompare();
    });
  });
  document.getElementById('compare-search')?.addEventListener('input', e => {
    state.compareSearch = e.target.value.toLowerCase();
    renderComparePicker();
  });
  document.getElementById('compare-clear')?.addEventListener('click', () => {
    state.compareSelected.clear();
    renderCompare();
  });
  document.getElementById('compare-top5')?.addEventListener('click', () => {
    state.compareMode = 'sku';
    document.querySelectorAll('#compare-mode button').forEach(x => x.classList.remove('active'));
    document.querySelector('#compare-mode button[data-mode="sku"]').classList.add('active');
    state.compareSelected.clear();
    const w = selectedWeeks();
    const ranked = Object.keys(D.itemData)
      .filter(dpci => state.categories.has(skuCategory(dpci)))
      .map(dpci => ({ dpci, s: itemOnlineSalesWindow(dpci, w) || 0, totalS: w.reduce((acc, wk) => acc + (D.itemData[dpci].metrics['Sales $ - Total']?.[wk] || 0), 0) }))
      .sort((a, b) => b.totalS - a.totalS)
      .slice(0, 5);
    for (const r of ranked) state.compareSelected.add('sku:' + r.dpci);
    renderCompare();
  });

  // S&OP Bridge listeners
  document.getElementById('bridge-from')?.addEventListener('change', e => {
    state.bridgeFrom = e.target.value;
    renderSopBridge();
  });
  document.getElementById('bridge-to')?.addEventListener('change', e => {
    state.bridgeTo = e.target.value;
    renderSopBridge();
  });
  document.querySelectorAll('#bridge-metric button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#bridge-metric button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.bridgeMetric = b.dataset.metric;
      renderSopBridge();
    });
  });

  // S&OP Meeting page listeners
  document.querySelectorAll('#sop-cat-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#sop-cat-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.sopCatMetric = b.dataset.metric;
      renderSopCategoryChart();
    });
  });
  document.getElementById('sop-sku-search')?.addEventListener('input', e => {
    state.sopSearch = e.target.value.toLowerCase();
    renderSopVelocityTable();
  });
  document.querySelectorAll('#sop-velocity-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sopSort.key === k) state.sopSort.dir = state.sopSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.sopSort.key = k; state.sopSort.dir = 'desc'; }
      renderSopVelocityTable();
    });
  });
  document.getElementById('sop-pspw-top5')?.addEventListener('click', () => {
    state.sopPSPWSelected.clear();
    renderSopPSPWChart();
  });
  document.getElementById('sop-pspw-clear')?.addEventListener('click', () => {
    state.sopPSPWSelected.clear();
    renderSopPSPWChart();
  });

  // Presentation Mode
  function togglePresentation(force) {
    state.presentation = (force === undefined) ? !state.presentation : !!force;
    document.body.classList.toggle('presentation-mode', state.presentation);
    // Resize all charts to fit new dimensions
    setTimeout(() => {
      for (const id in state.charts) state.charts[id].resize();
    }, 100);
  }
  window.togglePresentation = togglePresentation;
  document.getElementById('presentation-toggle')?.addEventListener('click', () => togglePresentation());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.presentation) togglePresentation(false);
    else if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      togglePresentation();
    }
  });

  // SKU Period table
  document.getElementById('sku-period-search')?.addEventListener('input', e => {
    state.skuPeriodSearch = e.target.value.toLowerCase();
    renderSkuPeriodTable();
  });
  document.querySelectorAll('#sku-period-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.skuPeriodSort.key === k) state.skuPeriodSort.dir = state.skuPeriodSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.skuPeriodSort.key = k; state.skuPeriodSort.dir = 'desc'; }
      renderSkuPeriodTable();
    });
  });

  // Mappings
  document.getElementById('mappings-search')?.addEventListener('input', e => {
    state.mappingsSearch = e.target.value.toLowerCase();
    renderMappings();
  });
  document.getElementById('mappings-reset')?.addEventListener('click', () => {
    if (confirm('Reset all SKU mapping overrides? This will revert to the default categorization.')) {
      resetAllSkuOverrides();
      renderMappings();
    }
  });

  // Weekly Snapshot
  document.getElementById('weekly-metric')?.addEventListener('change', e => {
    state.weeklyMetric = e.target.value;
    renderWeekly();
  });
  document.getElementById('weekly-search')?.addEventListener('input', e => {
    state.weeklySearch = e.target.value.toLowerCase();
    renderWeekly();
  });
  document.querySelectorAll('#weekly-table th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.weeklySort.key === k) state.weeklySort.dir = state.weeklySort.dir === 'asc' ? 'desc' : 'asc';
      else { state.weeklySort.key = k; state.weeklySort.dir = 'desc'; }
      renderWeekly();
    });
  });

  // Upload
  initUpload();
}

// ---------- KPI cards ----------
function kpiCard({ label, value, delta, accent, deltaLabel }) {
  const accentClass = accent ? `accent-${accent}` : '';
  let deltaHTML = '';
  if (delta != null) {
    const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-neutral';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
    deltaHTML = `<div class="kpi-delta"><span class="${cls}">${arrow} ${(delta*100).toFixed(1)}%</span><span class="muted">${deltaLabel || 'vs prior'}</span></div>`;
  } else if (deltaLabel) {
    deltaHTML = `<div class="kpi-delta"><span class="muted">${deltaLabel}</span></div>`;
  }
  return `<div class="kpi ${accentClass}"><div class="kpi-bar"></div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${deltaHTML}</div>`;
}

// ============================================================
//   S&OP MEETING PAGE
// ============================================================
function renderSopAll() {
  renderSopKPIs();
  renderSopBrandCharts();
  renderSopCategoryChart();
  renderSopBridge();
  renderSopVelocityTable();
  renderSopPSPWChart();
  renderSopDigitalRoundelChart();
  renderSopRoundelTable();
}

// Bridge picker periods (each maps to weeks() resolver and a label)
function bridgePeriods() {
  const all = D.salesDates;
  const list = [
    { key: 'lw',   label: 'Last week (' + all[all.length-1] + ')',                  weeks: () => [all[all.length-1]] },
    { key: 'lwp',  label: 'Prior week (' + all[all.length-2] + ')',                 weeks: () => [all[all.length-2]] },
    { key: 'l4w',  label: 'L4W avg (' + all[all.length-4] + ' – ' + all[all.length-1] + ')',  weeks: () => all.slice(-4) },
    { key: 'l13w', label: 'L13W avg (' + all[all.length-13] + ' – ' + all[all.length-1] + ')', weeks: () => all.slice(-13) },
    { key: 'l26w', label: 'L26W avg (' + all[all.length-26] + ' – ' + all[all.length-1] + ')', weeks: () => all.slice(-26) },
    { key: 'l52w', label: 'L52W avg (' + all[all.length-52] + ' – ' + all[all.length-1] + ')', weeks: () => all.slice(-52) },
  ];
  // Append every individual week as picker option
  for (let i = all.length - 1; i >= 0; i--) {
    list.push({ key: 'wk:' + all[i], label: 'Week ending ' + all[i], weeks: () => [all[i]] });
  }
  return list;
}
function bridgePeriodValue(cat, periodKey, metric) {
  const p = bridgePeriods().find(x => x.key === periodKey);
  if (!p) return null;
  const wks = p.weeks();
  if (metric === 'sales' || metric === 'units') {
    const key = metric === 'sales' ? 'Sales $ - Total' : 'Units - Total';
    let s = 0, n = 0;
    for (const w of wks) {
      const v = catWeekValue(cat, key, w);
      if (typeof v === 'number') { s += v; n++; }
    }
    return n > 0 ? s / wks.length : null; // average per week (so single weeks compare fairly to multi-week avgs)
  }
  if (metric === 'online') {
    let s = 0, n = 0;
    for (const w of wks) {
      let online = 0;
      for (const dpci in D.itemData) {
        if (skuCategory(dpci) !== cat) continue;
        const v = itemOnlineSales(dpci, w);
        if (typeof v === 'number') online += v;
      }
      s += online; n++;
    }
    return n > 0 ? s / wks.length : null;
  }
  return null;
}
function bridgePeriodTotal(periodKey, metric) {
  let total = 0;
  for (const cat of activeCats()) {
    const v = bridgePeriodValue(cat, periodKey, metric);
    if (typeof v === 'number') total += v;
  }
  return total;
}
function bridgePeriodLabel(key) {
  const p = bridgePeriods().find(x => x.key === key);
  return p ? p.label : key;
}

function renderSopBridge() {
  // Populate dropdowns once
  const fromSel = document.getElementById('bridge-from');
  const toSel = document.getElementById('bridge-to');
  if (fromSel && toSel && fromSel.children.length === 0) {
    const opts = bridgePeriods().map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;
    fromSel.value = state.bridgeFrom;
    toSel.value = state.bridgeTo;
  }

  const cats = activeCats();
  const m = state.bridgeMetric;
  const fromTotal = bridgePeriodTotal(state.bridgeFrom, m);
  const toTotal = bridgePeriodTotal(state.bridgeTo, m);
  const delta = toTotal - fromTotal;
  const pct = fromTotal !== 0 ? delta / fromTotal : null;

  // Per-category contributions
  const catRows = cats.map(c => {
    const f = bridgePeriodValue(c, state.bridgeFrom, m) || 0;
    const t = bridgePeriodValue(c, state.bridgeTo, m) || 0;
    return { cat: c, from: f, to: t, delta: t - f };
  });
  // Filter zero contributors and sort by absolute delta desc
  const nonZero = catRows.filter(r => Math.abs(r.delta) > 0.5);
  nonZero.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Build waterfall: From total | each category delta | To total
  const labels = ['From: ' + state.bridgeFrom.toUpperCase()];
  const baseData = [fromTotal];   // base = where the bar starts
  const deltaData = [0];           // data = the actual bar height
  const colors = [LS_BLACK + '88'];
  // For "From" bar, just show the value as a positive bar
  const stepBars = [];
  let running = fromTotal;
  for (const r of nonZero) {
    labels.push(r.cat);
    const start = Math.min(running, running + r.delta);
    baseData.push(start);
    deltaData.push(Math.abs(r.delta));
    colors.push(r.delta >= 0 ? '#00CF92' : '#FF8766');
    running += r.delta;
  }
  labels.push('To: ' + state.bridgeTo.toUpperCase());
  baseData.push(0);
  deltaData.push(toTotal);
  colors.push(LS_BLACK + 'CC');

  // Need separate datasets for bars: a "spacer" (transparent) + the visible bar (colored)
  // Use stacked bar approach
  const spacerData = baseData.map((b, i) => i === 0 || i === baseData.length - 1 ? 0 : b);
  const totalData = deltaData.map((d, i) => i === 0 ? fromTotal : i === deltaData.length - 1 ? toTotal : d);

  // Display values for labels
  const displayValues = nonZero.map(r => r.delta);
  const allValues = [fromTotal, ...displayValues, toTotal];

  const fmt = m === 'units' ? fmtNum : fmt$;

  renderChart('sop-chart-bridge', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'spacer', data: spacerData, backgroundColor: 'transparent', borderWidth: 0, datalabels: { display: false }, stack: 's' },
        { label: 'bar',    data: totalData,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 3,
          stack: 's',
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'top',
            offset: 4,
            color: (ctx) => {
              const v = allValues[ctx.dataIndex];
              if (ctx.dataIndex === 0 || ctx.dataIndex === allValues.length - 1) return '#141414';
              return v >= 0 ? '#00735A' : '#C44A23';
            },
            font: { weight: 700, size: 11 },
            formatter: (val, ctx) => {
              const i = ctx.dataIndex;
              const v = allValues[i];
              if (i === 0) return 'Start: ' + fmt(v);
              if (i === allValues.length - 1) return 'End: ' + fmt(v);
              return (v >= 0 ? '+' : '') + fmt(v);
            },
          },
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 28 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'spacer') return null;
              const i = ctx.dataIndex;
              const v = allValues[i];
              if (i === 0) return 'From total: ' + fmt(v);
              if (i === allValues.length - 1) return 'To total: ' + fmt(v);
              return labels[i] + ': ' + (v >= 0 ? '+' : '') + fmt(v);
            },
          },
          filter: ctx => ctx.dataset.label !== 'spacer',
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { stacked: true, grid: { display: false }, ticks: { callback: v => fmt(v) } },
      },
    },
  });

  // Summary text
  const dirArrow = delta >= 0 ? '↑' : '↓';
  const cls = delta >= 0 ? 'status-good' : 'status-bad';
  const summary = `${fmt(fromTotal)} → ${fmt(toTotal)}  ·  <span class="${cls}"><b>${dirArrow} ${(delta>=0?'+':'')}${fmt(delta)}${pct != null ? ' (' + (pct>=0?'+':'') + (pct*100).toFixed(1) + '%)' : ''}</b></span>`;
  document.getElementById('sop-bridge-sub').innerHTML = `Pick two periods · see which categories drove the change · per-week values when picker is a multi-week average`;
  document.getElementById('bridge-summary').innerHTML = summary;
}

function renderSopKPIs() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const sales = sumAllSelected('Sales $ - Total', w);
  const salesP = sumAllSelected('Sales $ - Total', wp);
  const units = sumAllSelected('Units - Total', w);
  const unitsP = sumAllSelected('Units - Total', wp);
  const promoSales = sumAllSelected('Sales $ - Promo', w);
  const promoSalesP = sumAllSelected('Sales $ - Promo', wp);
  const promoPct = sales > 0 ? promoSales / sales : null;
  const promoPctP = salesP > 0 ? promoSalesP / salesP : null;
  const onlineSales = sumOnlineSales(w);
  const onlineSalesP = sumOnlineSales(wp);
  const digPen = sales > 0 ? onlineSales / sales : null;
  const digPenP = salesP > 0 ? onlineSalesP / salesP : null;
  const spend = sumRoundelSpend(w);
  const spendP = sumRoundelSpend(wp);
  const roas = spend > 0 ? onlineSales / spend : null;
  const roasP = spendP > 0 ? onlineSalesP / spendP : null;

  const _priorN = selectedWeeks().length;
  document.getElementById('sop-snapshot-sub').textContent = `${windowLabel()} · vs ${_priorN === 1 ? 'prior week' : `prior ${_priorN}-week period`}`;
  document.getElementById('sop-kpis').innerHTML = [
    kpiCard({ label: 'Total Sales', value: fmt$(sales), delta: safeDiv(sales-salesP, salesP), accent: null }),
    kpiCard({ label: 'Total Units', value: fmtNum(units), delta: safeDiv(units-unitsP, unitsP), accent: 'mango' }),
    kpiCard({ label: 'Sales on Promo', value: fmtPct(promoPct), delta: promoPctP != null ? promoPct - promoPctP : null, deltaLabel: 'pp change', accent: 'guava' }),
    kpiCard({ label: 'Digital %', value: fmtPct(digPen), delta: digPenP != null ? digPen - digPenP : null, deltaLabel: 'pp change', accent: 'spinach' }),
    kpiCard({ label: 'Roundel Spend', value: fmt$(spend), delta: safeDiv(spend-spendP, spendP), accent: 'blueberry', deltaLabel: 'vs prior period' }),
    kpiCard({ label: 'Roundel ROAS', value: fmtMult(roas), delta: roasP != null && roasP !== 0 ? (roas - roasP) / roasP : null, accent: 'prune', deltaLabel: 'online ÷ spend' }),
  ].join('');
}

function renderSopBrandCharts() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();

  // Layout: 3-up for L4W and shorter, stacked single-column for longer windows
  const stacked = w.length > 4;
  const grid = document.getElementById('sop-brand-grid');
  if (grid) grid.style.gridTemplateColumns = stacked ? '1fr' : 'repeat(3, 1fr)';
  const chartHeight = stacked ? 360 : 280;
  ['sop-chart-sales-units-wrap', 'sop-chart-sales-promo-wrap', 'sop-chart-sales-digital-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.height = chartHeight + 'px';
  });

  // Per-week aggregates
  const weeklySales = w.map(d => cats.reduce((s, c) => s + (catWeekValue(c, 'Sales $ - Total', d) || 0), 0));
  const weeklyUnits = w.map(d => cats.reduce((s, c) => s + (catWeekValue(c, 'Units - Total', d) || 0), 0));
  const weeklyPromo = w.map(d => cats.reduce((s, c) => s + (catWeekValue(c, 'Sales $ - Promo', d) || 0), 0));
  const weeklyOnline = w.map(d => {
    let s = 0;
    for (const dpci in D.itemData) {
      if (!cats.includes(skuCategory(dpci))) continue;
      const v = itemOnlineSales(dpci, d);
      if (typeof v === 'number') s += v;
    }
    return s;
  });

  // Data-label styling. display:'auto' lets the plugin hide labels that would overlap.
  const barLabel$ = { display: 'auto', anchor: 'end', align: 'end', offset: 2, color: '#141414', font: { weight: 700, size: 10 }, formatter: v => v ? fmt$(v) : '' };
  const lineLabelNum = { display: 'auto', anchor: 'end', align: 'top', offset: 4, color: LS_BLACK, font: { weight: 700, size: 10 }, formatter: v => v ? fmtNum(v) : '' };
  const lineLabelPct = (color) => ({ display: 'auto', anchor: 'end', align: 'top', offset: 4, color, font: { weight: 700, size: 10 }, formatter: v => v == null ? '' : v.toFixed(1) + '%' });

  // Chart 1: Sales bars + Units line (dual axis)
  renderChart('sop-chart-sales-units', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Sales $', data: weeklySales, backgroundColor: LS_BLUE + 'CC', borderRadius: 3, yAxisID: 'y', datalabels: barLabel$ },
        { label: 'Units', data: weeklyUnits, type: 'line', borderColor: LS_BLACK, borderWidth: 2.5, fill: false, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, yAxisID: 'y1', datalabels: lineLabelNum },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18 } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Sales $' ? `Sales: ${fmt$(ctx.parsed.y)}` : `Units: ${fmtNum(ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Sales $', color: '#9AA0A8', font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, ticks: { callback: v => fmtNum(v) }, title: { display: true, text: 'Units', color: '#9AA0A8', font: { size: 10 } } },
      },
    },
  });

  // Chart 2: Sales bars + Promo % line
  const weeklyPromoPct = weeklySales.map((s, i) => s > 0 ? (weeklyPromo[i] / s) * 100 : null);
  renderChart('sop-chart-sales-promo', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Sales $', data: weeklySales, backgroundColor: LS_BLUE + 'CC', borderRadius: 3, yAxisID: 'y', datalabels: barLabel$ },
        { label: '% on Promo', data: weeklyPromoPct, type: 'line', borderColor: '#FF8766', borderWidth: 2.5, fill: false, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, yAxisID: 'y1', datalabels: lineLabelPct('#FF8766') },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18 } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Sales $' ? `Sales: ${fmt$(ctx.parsed.y)}` : `Promo %: ${ctx.parsed.y == null ? '–' : ctx.parsed.y.toFixed(1)+'%'}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Sales $', color: '#9AA0A8', font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, min: 0, ticks: { callback: v => v + '%' }, title: { display: true, text: '% on Promo', color: '#9AA0A8', font: { size: 10 } } },
      },
    },
  });

  // Chart 3: Sales (in-store) + Digital stacked + Digital % line
  const weeklyInStore = weeklySales.map((s, i) => Math.max(0, s - weeklyOnline[i]));
  const weeklyDigPct = weeklySales.map((s, i) => s > 0 ? (weeklyOnline[i] / s) * 100 : null);
  // Show $ totals on top of the stacked bars (attached to the top dataset = Digital)
  const stackTotalLabel = {
    display: 'auto', anchor: 'end', align: 'end', offset: 2,
    color: '#141414', font: { weight: 700, size: 10 },
    formatter: (v, ctx) => {
      const i = ctx.dataIndex;
      const total = (weeklyInStore[i] || 0) + (weeklyOnline[i] || 0);
      return total ? fmt$(total) : '';
    },
  };
  renderChart('sop-chart-sales-digital', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'In-store', data: weeklyInStore, backgroundColor: '#9AA0A8' + 'CC', borderRadius: 0, stack: 'a', yAxisID: 'y', datalabels: { display: false } },
        { label: 'Digital', data: weeklyOnline, backgroundColor: LS_BLUE, borderRadius: 0, stack: 'a', yAxisID: 'y', datalabels: stackTotalLabel },
        { label: 'Digital %', data: weeklyDigPct, type: 'line', borderColor: LS_BLACK, borderWidth: 2.5, fill: false, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, yAxisID: 'y1', datalabels: lineLabelPct(LS_BLACK) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18 } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Digital %' ? `Digital %: ${ctx.parsed.y == null ? '–' : ctx.parsed.y.toFixed(1)+'%'}` : `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, font: { size: 10 } } },
        y: { stacked: true, grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Sales $', color: '#9AA0A8', font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, min: 0, ticks: { callback: v => v + '%' }, title: { display: true, text: 'Digital %', color: '#9AA0A8', font: { size: 10 } } },
      },
    },
  });
}

function renderSopCategoryChart() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();
  const metric = state.sopCatMetric;
  const metricKey = metric === 'sales' ? 'Sales $ - Total' : 'Units - Total';
  const fmtMetric = v => metric === 'sales' ? fmt$(v) : fmtNum(v);
  // Per-week totals (sum across categories) for the "total on top" label
  const weeklyTotals = w.map((d, i) => cats.reduce((s, c) => s + (catWeekValue(c, metricKey, d) || 0), 0));
  // Per-segment labels: white text inside segment, only when the segment is big enough to fit
  const segmentLabel = {
    display: 'auto', anchor: 'center', align: 'center', clamp: true,
    color: '#FFFFFF', font: { weight: 700, size: 10 },
    formatter: (v) => v >= (metric === 'sales' ? 50000 : 5000) ? fmtMetric(v) : '',
  };
  const datasets = cats.map((cat, idx) => ({
    label: cat,
    data: w.map(d => catWeekValue(cat, metricKey, d) || 0),
    backgroundColor: CAT_COLORS[cat] + 'DD',
    borderColor: CAT_COLORS[cat],
    borderWidth: 0,
    borderRadius: 0,
    stack: 'a',
    // Topmost dataset carries both a segment label and a "total on top" label; others carry only segment label
    datalabels: idx === cats.length - 1
      ? {
          labels: {
            segment: segmentLabel,
            total: {
              display: 'auto', anchor: 'end', align: 'end', offset: 2,
              color: '#141414', font: { weight: 700, size: 11 },
              formatter: (_, ctx) => weeklyTotals[ctx.dataIndex] ? fmtMetric(weeklyTotals[ctx.dataIndex]) : '',
            },
          },
        }
      : segmentLabel,
  }));
  renderChart('sop-chart-categories', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 22 } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtMetric(ctx.parsed.y)}` } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
        y: { stacked: true, grid: { display: false }, ticks: { callback: v => fmtMetric(v) } },
      },
    },
  });
}

function buildSopVelocityRows() {
  const all = D.salesDates;
  const lwIdx = all.length - 1;
  const lwpIdx = all.length - 2;
  const lwWeek = all[lwIdx];
  const lwpWeek = all[lwpIdx];
  const l4wWeeks = all.slice(-4);
  const l13wWeeks = all.slice(-13);

  const rows = [];
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    const desc = D.itemData[dpci].description;
    if (state.sopSearch && !desc.toLowerCase().includes(state.sopSearch) && !dpci.includes(state.sopSearch)) continue;
    const it = D.itemData[dpci];
    const sales = it.metrics['Sales $ - Total'] || {};
    const units = it.metrics['Units - Total'] || {};
    const pspw = it.metrics['Sales $ - Total per Store Per Week ($PSPW)'] || {};
    const sumOver = (weeks, series) => { let s=0,n=0; for (const w of weeks) { const v=series[w]; if (typeof v==='number') {s+=v;n++;}} return n?s/n:null; };
    const avgPositive = (weeks, series) => { let s=0,n=0; for (const w of weeks) { const v=series[w]; if (typeof v==='number'&&v>0) {s+=v;n++;}} return n?s/n:null; };
    const r = {
      dpci, description: desc, category: cat,
      lw_sales: typeof sales[lwWeek] === 'number' ? sales[lwWeek] : null,
      lw_units: typeof units[lwWeek] === 'number' ? units[lwWeek] : null,
      lw_pspw: typeof pspw[lwWeek] === 'number' ? pspw[lwWeek] : null,
      lwp_sales: typeof sales[lwpWeek] === 'number' ? sales[lwpWeek] : null,
      lwp_units: typeof units[lwpWeek] === 'number' ? units[lwpWeek] : null,
      lwp_pspw: typeof pspw[lwpWeek] === 'number' ? pspw[lwpWeek] : null,
      l4w_sales: sumOver(l4wWeeks, sales),
      l4w_units: sumOver(l4wWeeks, units),
      l4w_pspw: avgPositive(l4wWeeks, pspw),
      l13w_sales: sumOver(l13wWeeks, sales),
      l13w_units: sumOver(l13wWeeks, units),
      l13w_pspw: avgPositive(l13wWeeks, pspw),
    };
    // Momentum = LW Sales vs L13W avg Sales (% change).
    // Using sales (not $PSPW) avoids false negatives when distribution expands —
    // e.g., a SKU going from 1 store at $90/store to 200 stores at $25/store
    // looks "down" on $PSPW but is massively up on sales (ramping).
    if (r.lw_sales != null && r.l13w_sales && r.l13w_sales > 0) {
      r.momentum = (r.lw_sales - r.l13w_sales) / r.l13w_sales;
    } else r.momentum = null;
    // Skip SKUs that had no sales in any of the four reporting windows
    const anySales = (r.lw_sales || 0) + (r.lwp_sales || 0) + (r.l4w_sales || 0) + (r.l13w_sales || 0);
    if (anySales <= 0) continue;
    rows.push(r);
  }
  return rows;
}

function renderSopVelocityTable() {
  const rows = buildSopVelocityRows();
  const k = state.sopSort.key, dir = state.sopSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });

  // Top/bottom highlighting based on momentum
  const valid = rows.filter(r => r.momentum != null && r.lw_sales > 1000);
  const sortedByMomentum = valid.slice().sort((a, b) => b.momentum - a.momentum);
  const top3 = new Set(sortedByMomentum.slice(0, 3).map(r => r.dpci));
  const bot3 = new Set(sortedByMomentum.slice(-3).map(r => r.dpci));

  const tbody = document.querySelector('#sop-velocity-table tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => {
    let cls = '';
    if (top3.has(r.dpci)) cls = 'row-top';
    else if (bot3.has(r.dpci)) cls = 'row-bottom';
    let momentumChip = '–';
    if (r.momentum != null) {
      const c = r.momentum > 0.05 ? 'up' : r.momentum < -0.05 ? 'down' : 'flat';
      const arrow = r.momentum > 0 ? '↑' : r.momentum < 0 ? '↓' : '→';
      momentumChip = `<span class="momentum-chip momentum-${c}">${arrow} ${(r.momentum*100).toFixed(1)}%</span>`;
    }
    return `<tr class="${cls}" style="cursor: pointer;" onclick="openSKUDrawer('${r.dpci}')">
      <td>
        <div style="font-weight: 600;">${r.description.replace(/^Little Spoon /, '')}</div>
        <div class="muted" style="font-size: 11px;">${r.dpci}</div>
      </td>
      <td><span class="chip ${categoryClassName(r.category)}">${r.category}</span></td>
      <td class="text-right col-group-start" style="background: var(--ls-blue-soft);">${momentumChip}</td>
      <td class="table-num col-group-start">${fmtPSPW(r.lw_pspw)}</td>
      <td class="table-num lw-cell-sales">${fmt$(r.lw_sales)}</td>
      <td class="table-num">${fmtNum(r.lw_units)}</td>
      <td class="table-num col-group-start">${fmtPSPW(r.lwp_pspw)}</td>
      <td class="table-num">${fmt$(r.lwp_sales)}</td>
      <td class="table-num">${fmtNum(r.lwp_units)}</td>
      <td class="table-num avg-cell col-group-start">${fmtPSPW(r.l4w_pspw)}</td>
      <td class="table-num avg-cell">${fmt$(r.l4w_sales)}</td>
      <td class="table-num avg-cell">${fmtNum(r.l4w_units)}</td>
      <td class="table-num avg-cell col-group-start">${fmtPSPW(r.l13w_pspw)}</td>
      <td class="table-num avg-cell">${fmt$(r.l13w_sales)}</td>
      <td class="table-num avg-cell">${fmtNum(r.l13w_units)}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#sop-velocity-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === k) th.classList.add(state.sopSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function renderSopPSPWChart() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  // Default selection: top 5 by L13W sales if none selected
  let chosen;
  if (state.sopPSPWSelected.size) {
    chosen = [...state.sopPSPWSelected].filter(dpci => state.categories.has(skuCategory(dpci)));
  } else {
    const last13 = D.salesDates.slice(-13);
    const ranked = Object.keys(D.itemData)
      .filter(dpci => state.categories.has(skuCategory(dpci)))
      .map(dpci => {
        let s = 0;
        for (const wk of last13) { const v = D.itemData[dpci].metrics['Sales $ - Total']?.[wk]; if (typeof v === 'number') s += v; }
        return { dpci, s };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);
    chosen = ranked.map(r => r.dpci);
  }
  const datasets = chosen.map(dpci => {
    const cat = skuCategory(dpci);
    const desc = D.itemData[dpci]?.description?.replace(/^Little Spoon /, '') || dpci;
    return {
      label: desc.slice(0, 36),
      data: w.map(d => D.itemData[dpci].metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[d] ?? null),
      borderColor: CAT_COLORS[cat] || '#9AA0A8',
      backgroundColor: (CAT_COLORS[cat] || '#9AA0A8') + '22',
      borderWidth: 2.5,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true,
    };
  });
  renderChart('sop-chart-pspw', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtPSPW(ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { display: false }, ticks: { callback: v => fmtPSPW(v) }, title: { display: true, text: '$ PSPW', color: '#9AA0A8', font: { size: 11 } } },
      },
    },
  });
}

function renderSopDigitalRoundelChart() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();

  // Per-week digital $ (online sales), Roundel spend, and digital pen %
  const digital$ = w.map(d => {
    let s = 0;
    for (const dpci in D.itemData) {
      if (!cats.includes(skuCategory(dpci))) continue;
      const v = itemOnlineSales(dpci, d);
      if (typeof v === 'number') s += v;
    }
    return s;
  });
  const spend = w.map(d => {
    const wk = D.roundelByWeek?.[d];
    if (!wk) return 0;
    let s = 0;
    for (const c of cats) {
      const v = wk[c];
      if (typeof v === 'number') s += v;
    }
    return s;
  });
  const totalSales = w.map(d => cats.reduce((s, c) => s + (catWeekValue(c, 'Sales $ - Total', d) || 0), 0));
  const digPct = digital$.map((d, i) => totalSales[i] > 0 ? (d / totalSales[i]) * 100 : null);

  setSubtitle('sop-digital-roundel-sub', `${windowLabel()} · weekly`);

  const stacked = w.length > 4;
  const wrap = document.getElementById('sop-chart-digital-roundel').parentElement;
  if (wrap) wrap.style.height = (stacked ? 360 : 320) + 'px';

  const barLabel$ = { display: 'auto', anchor: 'end', align: 'end', offset: 2, color: '#141414', font: { weight: 700, size: 10 }, formatter: v => v ? fmt$(v) : '' };
  const lineLabelPct = { display: 'auto', anchor: 'end', align: 'top', offset: 4, color: LS_BLACK, font: { weight: 700, size: 10 }, formatter: v => v == null ? '' : v.toFixed(1) + '%' };

  renderChart('sop-chart-digital-roundel', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Digital $', data: digital$, backgroundColor: LS_BLUE + 'CC', borderRadius: 3, yAxisID: 'y', datalabels: barLabel$ },
        { label: 'Roundel Spend', data: spend, backgroundColor: '#FF8766CC', borderRadius: 3, yAxisID: 'y', datalabels: barLabel$ },
        { label: 'Digital %', data: digPct, type: 'line', borderColor: LS_BLACK, borderWidth: 2.5, fill: false, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, yAxisID: 'y1', datalabels: lineLabelPct },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Digital %') return `Digital %: ${ctx.parsed.y == null ? '–' : ctx.parsed.y.toFixed(1) + '%'}`;
              return `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Digital $ / Spend', color: '#9AA0A8', font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, min: 0, ticks: { callback: v => v + '%' }, title: { display: true, text: 'Digital %', color: '#9AA0A8', font: { size: 10 } } },
      },
    },
  });
}

function renderSopRoundelTable() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const cats = activeCats().filter(c => c !== 'Other');
  const rows = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    const o = categoryOnlineSales(c, w);
    const s = sumMetric(c, 'Sales $ - Total', w);
    const oP = categoryOnlineSales(c, wp);
    const spP = sumRoundelSpend(wp, [c]);
    const roasP = spP > 0 ? oP / spP : null;
    return {
      c, sp, o, s,
      pen: s > 0 ? o / s : null,
      roas: sp > 0 ? o / sp : null,
      cpd: o > 0 ? sp / o : null,
      roasDelta: roasP != null && roasP !== 0 ? ((sp > 0 ? o / sp : null) - roasP) / roasP : null,
    };
  }).sort((a, b) => (b.roas || 0) - (a.roas || 0));
  const tbody = document.querySelector('#sop-roundel-table tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.sp)}</td>
      <td class="table-num">${fmt$(r.o)}</td>
      <td class="table-num">${fmt$(r.s)}</td>
      <td class="table-num">${fmtPct(r.pen)}</td>
      <td class="table-num"><b>${fmtMult(r.roas)}</b></td>
    </tr>
  `).join('');
}

// ---------- Overview ----------
function renderOverviewKPIs() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const sales = sumSalesChan(w);
  const salesP = sumSalesChan(wp);
  const units = sumUnitsChan(w);
  const unitsP = sumUnitsChan(wp);
  const spend = sumRoundelSpend(w);
  const spendP = sumRoundelSpend(wp);
  const onlineSales = sumOnlineSales(w);
  const totalSales = sumAllSelected('Sales $ - Total', w);
  const digitalPen = safeDiv(onlineSales, totalSales);
  // ROAS uses ONLINE (digital) sales only, never total sales
  const roas = safeDiv(onlineSales, spend);

  const html = [
    kpiCard({ label: 'Total sales', value: fmt$(sales), delta: safeDiv(sales-salesP, salesP), accent: null }),
    kpiCard({ label: 'Units sold',  value: fmtNum(units), delta: safeDiv(units-unitsP, unitsP), accent: 'mango' }),
    kpiCard({ label: 'Digital sales', value: fmt$(onlineSales), accent: 'blueberry', deltaLabel: 'Sales × Online Orig Pen' }),
    kpiCard({ label: 'Digital %', value: fmtPct(digitalPen), accent: 'spinach', deltaLabel: `${fmtPct(safeDiv(sumOnlineSales(wp), sumAllSelected('Sales $ - Total', wp)))} prior` }),
    kpiCard({ label: 'Roundel spend', value: fmt$(spend), delta: safeDiv(spend-spendP, spendP), accent: 'guava', deltaLabel: 'vs prior period' }),
    kpiCard({ label: 'ROAS', value: fmtMult(roas), accent: 'prune', deltaLabel: 'online sales ÷ spend' }),
  ].join('');
  document.getElementById('overview-kpis').innerHTML = html;
}

function renderOverviewTrend() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();
  const datasets = cats.map(cat => {
    const series = catSeries(cat, pillTabFor(state.trendMetric));
    return {
      label: cat,
      data: w.map(d => series[d] || 0),
      backgroundColor: CAT_COLORS[cat] + '88',
      borderColor: CAT_COLORS[cat],
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      stack: 'y',
    };
  });
  // Roundel spend overlay
  const spendData = w.map(d => {
    const wk = D.roundelByWeek[d] || {};
    let s = 0;
    for (const c of cats) s += wk[c] || 0;
    return s;
  });
  datasets.push({
    label: 'Roundel spend',
    type: 'line',
    data: spendData,
    backgroundColor: 'transparent',
    borderColor: LS_BLACK,
    borderWidth: 2,
    borderDash: [4, 4],
    fill: false,
    tension: 0.2,
    pointRadius: 0,
    pointHoverRadius: 4,
    yAxisID: 'y2',
    order: -1,
  });

  renderChart('chart-overview-trend', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, grid: { display: false }, ticks: { callback: v => state.trendMetric === 'sales' ? fmt$(v) : fmtNum(v) } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel $', color: '#9AA0A8', font: { size: 11 } } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => {
          const lbl = ctx.dataset.label;
          const v = ctx.parsed.y;
          return `${lbl}: ${state.trendMetric === 'sales' || lbl === 'Roundel spend' ? fmt$(v) : fmtNum(v)}`;
        }}},
      },
    },
  });
}

function renderOverviewMix() {
  const w = selectedWeeks();
  const cats = activeCats();
  const data = cats.map(c => sumMetric(c, 'Sales $ - Total', w));
  renderChart('chart-overview-mix', {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data,
        backgroundColor: cats.map(c => CAT_COLORS[c]),
        borderColor: 'white',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 8 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt$(ctx.parsed)} (${(ctx.parsed/data.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)` }},
      },
    },
  });
}

function renderOverviewTop() {
  const w = selectedWeeks();
  const items = [];
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    const sales = D.itemData[dpci].metrics['Sales $ - Total'] || {};
    let s = 0;
    for (const wk of w) s += sales[wk] || 0;
    items.push({ desc: D.itemData[dpci].description, cat, sales: s });
  }
  items.sort((a, b) => b.sales - a.sales);
  const top = items.slice(0, 10).reverse();

  renderChart('chart-overview-top', {
    type: 'bar',
    data: {
      labels: top.map(i => i.desc.replace(/^Little Spoon /, '').slice(0, 36)),
      datasets: [{
        data: top.map(i => i.sales),
        backgroundColor: top.map(i => CAT_COLORS[i.cat] || '#9AA0A8'),
        borderRadius: 4,
        barThickness: 18,
        datalabels: { display: true, anchor: 'end', align: 'end', offset: 4, color: '#141414', font: { weight: 700, size: 11 }, formatter: v => fmt$(v) },
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 64 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt$(ctx.parsed.x)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { callback: v => fmt$(v) } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

function renderRoundelSnapshot() {
  const w = selectedWeeks();
  const cats = activeCats().filter(c => c !== 'Other');
  const rows = cats.map(c => {
    const spend = sumRoundelSpend(w, [c]);
    const onlineSales = categoryOnlineSales(c, w);
    return { cat: c, spend, onlineSales, roas: safeDiv(onlineSales, spend) };
  }).filter(r => r.spend > 0);
  rows.sort((a, b) => (b.roas || 0) - (a.roas || 0));
  let html = '<div style="display: grid; gap: 10px;">';
  const maxRoas = Math.max(1, ...rows.map(r => r.roas || 0));
  for (const r of rows) {
    const w_ = Math.min(100, ((r.roas || 0) / maxRoas) * 100);
    html += `<div>
      <div class="flex-between" style="font-size: 12px; margin-bottom: 4px;">
        <span style="font-weight: 700;">${r.cat}</span>
        <span class="num"><b>${fmtMult(r.roas)}</b> <span class="muted">· ${fmt$(r.spend)} spend</span></span>
      </div>
      <div style="height: 6px; background: var(--gray-100); border-radius: 999px; overflow: hidden;">
        <div style="height: 100%; width: ${w_}%; background: ${CAT_COLORS[r.cat]}; border-radius: 999px;"></div>
      </div>
    </div>`;
  }
  html += '</div>';
  if (rows.length === 0) html = '<div class="muted" style="padding: 24px; text-align: center;">No spend in selected window.</div>';
  document.getElementById('roundel-snapshot').innerHTML = html;
}

function renderOverviewInsights() {
  const w = selectedWeeks(), wp = priorWeeks();
  const cats = activeCats();

  // Top growth category
  const growth = cats.map(c => {
    const cur = sumMetric(c, 'Sales $ - Total', w);
    const prior = sumMetric(c, 'Sales $ - Total', wp);
    return { cat: c, cur, prior, g: safeDiv(cur - prior, prior) };
  }).filter(x => x.cur > 0);
  growth.sort((a, b) => (b.g || -Infinity) - (a.g || -Infinity));

  // Best ROAS — require meaningful spend. Uses ONLINE sales only.
  const totalSpendW = sumRoundelSpend(w);
  const minSpendW = Math.max(20000, totalSpendW * 0.05);
  const roas = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    const o = categoryOnlineSales(c, w);
    return { cat: c, sp, o, r: safeDiv(o, sp) };
  }).filter(x => x.sp >= minSpendW && x.r != null);
  roas.sort((a, b) => b.r - a.r);

  // Total stats
  const totalSales = sumAllSelected('Sales $ - Total', w);
  const onlineSales = sumOnlineSales(w);
  const spend = sumRoundelSpend(w);

  const top = growth[0];
  const bottom = growth[growth.length - 1];
  const bestR = roas[0];
  const worstR = roas[roas.length - 1];

  const insights = [];
  if (top && top.g != null) insights.push(`<strong>${top.cat}</strong> is the fastest-growing category, up <strong>${(top.g*100).toFixed(1)}%</strong> vs ${state.window === 1 ? 'prior week' : `prior ${state.window}-week period`}.`);
  if (bottom && bottom.g != null && bottom.g < -0.05) insights.push(`<strong>${bottom.cat}</strong> declined <strong>${Math.abs(bottom.g*100).toFixed(1)}%</strong> — investigate promo cadence + Roundel support.`);
  if (bestR && worstR && bestR.cat !== worstR.cat) insights.push(`<strong>${bestR.cat}</strong> is the most efficient Roundel category at <strong>${bestR.r.toFixed(1)}x</strong> ROAS, vs <strong>${worstR.cat}</strong> at <strong>${worstR.r.toFixed(1)}x</strong>.`);
  if (totalSales && onlineSales) insights.push(`Digital is <strong>${(onlineSales/totalSales*100).toFixed(1)}%</strong> of total sales — Online Orig accounts for <strong>${fmt$(onlineSales)}</strong>.`);
  if (spend && onlineSales) insights.push(`<strong>${fmt$(spend)}</strong> in Roundel spend tracked alongside <strong>${fmt$(onlineSales)}</strong> in online sales — <strong>${(onlineSales/spend).toFixed(2)}x</strong> ROAS (online sales ÷ spend, correlation not causation).`);

  let html = '';
  for (const i of insights) {
    html += `<div class="insight"><div class="insight-label">Insight</div><div class="insight-body">${i}</div></div>`;
  }
  document.getElementById('overview-insights').innerHTML = html || '<div class="muted">No insights for this view.</div>';
}

// ---------- SKU Page ----------
function buildSKURows() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const rows = [];
  const totalSales = sumAllSelected('Sales $ - Total', w);
  for (const dpci in D.itemData) {
    const it = D.itemData[dpci];
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    if (state.skuSearch && !it.description.toLowerCase().includes(state.skuSearch) && !dpci.includes(state.skuSearch)) continue;

    const sales = it.metrics['Sales $ - Total'] || {};
    const units = it.metrics['Units - Total'] || {};
    const promo = it.metrics['Sales $ - Promo'] || {};
    const pen = it.metrics['Sales $ - Online Orig Penetration'] || {};
    const oos = it.metrics['Out of Stock %'] || {};
    const stores = it.metrics['Stores Tracked'] || {};
    const pspw = it.metrics['Sales $ - Total per Store Per Week ($PSPW)'] || {};

    let s = 0, u = 0, p = 0, st = 0, oosSum = 0, oosCount = 0, penSum = 0, penCount = 0, salesP = 0, vSum = 0, vCount = 0;
    for (const wk of w) {
      const sv = sales[wk]; if (typeof sv === 'number') s += sv;
      const uv = units[wk]; if (typeof uv === 'number') u += uv;
      const pv = promo[wk]; if (typeof pv === 'number') p += pv;
      const stv = stores[wk]; if (typeof stv === 'number') st = Math.max(st, stv);
      const ov = oos[wk]; if (typeof ov === 'number') { oosSum += ov; oosCount++; }
      const pen_v = pen[wk]; if (typeof pen_v === 'number' && typeof sv === 'number' && sv > 0) { penSum += sv * pen_v; penCount += sv; }
      const vv = pspw[wk]; if (typeof vv === 'number') { vSum += vv; vCount++; }
    }
    for (const wk of wp) {
      const sv = sales[wk]; if (typeof sv === 'number') salesP += sv;
    }
    const avgOOS = oosCount ? oosSum / oosCount : null;
    const avgPen = penCount > 0 ? penSum / penCount : null;
    const promoPct = s > 0 ? p / s : null;
    const velocity = vCount ? vSum / vCount : null;
    const growth = salesP > 0 ? (s - salesP) / salesP : null;
    const contrib = totalSales > 0 ? s / totalSales : null;
    rows.push({
      dpci, description: it.description, category: cat,
      sales: s, units: u, velocity, promoPct, onlinePen: avgPen, oos: avgOOS, growth, contrib, stores: st,
    });
  }
  return rows;
}

function renderSKUKPIs() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const sales = sumAllSelected('Sales $ - Total', w);
  const salesP = sumAllSelected('Sales $ - Total', wp);
  const rows = buildSKURows();
  const skuCount = rows.filter(r => r.sales > 0).length;
  const top10Share = rows.sort((a,b)=>b.sales-a.sales).slice(0,10).reduce((a,b)=>a+b.sales,0) / sales;
  const promoRows = rows.filter(r => r.promoPct != null && r.sales > 0);
  const avgPromo = promoRows.length ? promoRows.reduce((a,b)=>a+b.promoPct*b.sales,0) / promoRows.reduce((a,b)=>a+b.sales,0) : null;
  const oosRows = rows.filter(r => r.oos != null);
  const avgOOS = oosRows.length ? oosRows.reduce((a,b)=>a+b.oos*b.sales,0) / oosRows.reduce((a,b)=>a+b.sales,0) : null;

  document.getElementById('sku-kpis').innerHTML = [
    kpiCard({ label: 'Active SKUs', value: skuCount, accent: 'spinach', deltaLabel: 'with sales in window' }),
    kpiCard({ label: 'Total sales', value: fmt$(sales), delta: safeDiv(sales-salesP, salesP) }),
    kpiCard({ label: 'Top 10 share', value: fmtPct(top10Share), accent: 'mango', deltaLabel: 'concentration' }),
    kpiCard({ label: 'Avg promo %', value: fmtPct(avgPromo), accent: 'guava', deltaLabel: 'sales-weighted' }),
    kpiCard({ label: 'Avg OOS %', value: fmtPct(avgOOS), accent: 'prune', deltaLabel: 'sales-weighted' }),
    kpiCard({ label: 'Avg online %', value: fmtPct(rows.reduce((a,b)=>b.onlinePen!=null?a+b.onlinePen*b.sales:a,0) / Math.max(1, rows.reduce((a,b)=>b.onlinePen!=null?a+b.sales:a,0))), accent: 'blueberry' }),
  ].join('');
}

function renderSKUTable() {
  const rows = buildSKURows();
  const k = state.skuSort.key, dir = state.skuSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  const tbody = document.querySelector('#sku-table tbody');
  tbody.innerHTML = rows.slice(0, 200).map(r => {
    const pinned = state.skuTrendSelected.has(r.dpci);
    return `
    <tr data-dpci="${r.dpci}" class="${pinned ? 'sku-pinned' : ''}">
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="pin-btn ${pinned ? 'pinned' : ''}" data-pin="${r.dpci}" title="${pinned ? 'Remove from chart' : 'Add to chart above'}">${pinned ? '✓' : '+'}</button>
          <div onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">
            <div style="font-weight: 600;">${r.description.replace(/^Little Spoon /, '')}</div>
            <div class="muted" style="font-size: 11px;">${r.dpci}</div>
          </div>
        </div>
      </td>
      <td onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;"><span class="chip ${categoryClassName(r.category)}">${r.category}</span></td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;"><b>${fmt$(r.sales)}</b><div class="muted" style="font-size:11px;">${r.growth != null ? (r.growth>=0?'+':'')+(r.growth*100).toFixed(1)+'%' : '–'}</div></td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">${fmtNum(r.units)}</td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">${fmtPSPW(r.velocity)}</td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">${fmtPct(r.promoPct)}</td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">${fmtPct(r.onlinePen)}</td>
      <td class="table-num" onclick="openSKUDrawer('${r.dpci}')" style="cursor: pointer;">${fmtPct(r.oos)}</td>
    </tr>`;
  }).join('');
  // Wire pin buttons
  tbody.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const dpci = btn.dataset.pin;
      if (state.skuTrendSelected.has(dpci)) state.skuTrendSelected.delete(dpci);
      else state.skuTrendSelected.add(dpci);
      renderSKUTable();
      renderSKUTrend();
    });
  });
  document.querySelectorAll('#sku-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === k) th.classList.add(state.skuSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function buildSkuPeriodRows() {
  const all = D.salesDates;
  const lwIdx = all.length - 1;
  const lwpIdx = all.length - 2;
  const lwWeek = all[lwIdx];
  const lwpWeek = all[lwpIdx];
  const l4wWeeks = all.slice(-4);
  const l13wWeeks = all.slice(-13);

  const rows = [];
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    const desc = D.itemData[dpci].description;
    if (state.skuPeriodSearch && !desc.toLowerCase().includes(state.skuPeriodSearch) && !dpci.includes(state.skuPeriodSearch)) continue;
    const it = D.itemData[dpci];
    const sales = it.metrics['Sales $ - Total'] || {};
    const units = it.metrics['Units - Total'] || {};
    const pspw = it.metrics['Sales $ - Total per Store Per Week ($PSPW)'] || {};

    const sumOver = (weeks, series) => {
      let s = 0, n = 0;
      for (const w of weeks) {
        const v = series[w];
        if (typeof v === 'number') { s += v; n++; }
      }
      return { sum: s, count: n, avg: n ? s / n : null };
    };
    const avgOver = (weeks, series) => {
      let s = 0, n = 0;
      for (const w of weeks) {
        const v = series[w];
        if (typeof v === 'number' && v > 0) { s += v; n++; }
      }
      return n ? s / n : null;
    };

    const r = {
      dpci, description: desc, category: cat,
      // Last week (single week values)
      lw_sales: typeof sales[lwWeek] === 'number' ? sales[lwWeek] : null,
      lw_units: typeof units[lwWeek] === 'number' ? units[lwWeek] : null,
      lw_pspw: typeof pspw[lwWeek] === 'number' ? pspw[lwWeek] : null,
      // Prior LW
      lwp_sales: typeof sales[lwpWeek] === 'number' ? sales[lwpWeek] : null,
      lwp_units: typeof units[lwpWeek] === 'number' ? units[lwpWeek] : null,
      lwp_pspw: typeof pspw[lwpWeek] === 'number' ? pspw[lwpWeek] : null,
      // L4W trailing average
      l4w_sales: sumOver(l4wWeeks, sales).avg,
      l4w_units: sumOver(l4wWeeks, units).avg,
      l4w_pspw:  avgOver(l4wWeeks, pspw),
      // L13W trailing average
      l13w_sales: sumOver(l13wWeeks, sales).avg,
      l13w_units: sumOver(l13wWeeks, units).avg,
      l13w_pspw:  avgOver(l13wWeeks, pspw),
    };
    rows.push(r);
  }
  return rows;
}

function renderSkuPeriodTable() {
  const rows = buildSkuPeriodRows();
  const k = state.skuPeriodSort.key, dir = state.skuPeriodSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  const tbody = document.querySelector('#sku-period-table tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <tr style="cursor: pointer;" onclick="openSKUDrawer('${r.dpci}')">
      <td>
        <div style="font-weight: 600;">${r.description.replace(/^Little Spoon /, '')}</div>
        <div class="muted" style="font-size: 11px;">${r.dpci}</div>
      </td>
      <td><span class="chip ${categoryClassName(r.category)}">${r.category}</span></td>
      <td class="table-num"><b>${fmt$(r.lw_sales)}</b></td>
      <td class="table-num">${fmtPSPW(r.lw_pspw)}</td>
      <td class="table-num">${fmtNum(r.lw_units)}</td>
      <td class="table-num">${fmt$(r.lwp_sales)}</td>
      <td class="table-num">${fmtPSPW(r.lwp_pspw)}</td>
      <td class="table-num">${fmtNum(r.lwp_units)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmt$(r.l4w_sales)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmtPSPW(r.l4w_pspw)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmtNum(r.l4w_units)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmt$(r.l13w_sales)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmtPSPW(r.l13w_pspw)}</td>
      <td class="table-num" style="background: var(--gray-50);">${fmtNum(r.l13w_units)}</td>
    </tr>
  `).join('');
  document.querySelectorAll('#sku-period-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === k) th.classList.add(state.skuPeriodSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function exportPeriod() {
  const tbl = document.getElementById('sku-period-table');
  const rows = [...tbl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => `"${(td.innerText || '').replace(/"/g, '""')}"`).join(','));
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sku-period-comparison.csv';
  a.click();
  URL.revokeObjectURL(url);
}
window.exportPeriod = exportPeriod;

function renderSKUTrend() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const metric = state.skuTrendMetric;
  const metricKey = pillTabFor(metric);

  if (state.skuTrendGrouping === 'category') {
    const cats = activeCats();
    const datasets = cats.map(cat => {
      const data = w.map(d => {
        if (metric === 'velocity') {
          // Aggregate $PSPW: sum sales / sum stores
          let sumSales = 0, sumStores = 0;
          for (const dpci in D.itemData) {
            if (skuCategory(dpci) !== cat) continue;
            const s = D.itemData[dpci].metrics['Sales $ - Total']?.[d];
            const st = D.itemData[dpci].metrics['Stores Tracked']?.[d];
            if (typeof s === 'number' && typeof st === 'number' && st > 0) { sumSales += s; sumStores += st; }
          }
          return sumStores > 0 ? sumSales / sumStores : null;
        } else if (metric === 'upspw') {
          let sumU = 0, sumStores = 0;
          for (const dpci in D.itemData) {
            if (skuCategory(dpci) !== cat) continue;
            const u = D.itemData[dpci].metrics['Units - Total']?.[d];
            const st = D.itemData[dpci].metrics['Stores Tracked']?.[d];
            if (typeof u === 'number' && typeof st === 'number' && st > 0) { sumU += u; sumStores += st; }
          }
          return sumStores > 0 ? sumU / sumStores : null;
        } else if (metric === 'oos' || metric === 'promoPct' || metric === 'onlinePen' || metric === 'price') {
          // Sales-weighted average
          let sumW = 0, sumV = 0;
          for (const dpci in D.itemData) {
            if (skuCategory(dpci) !== cat) continue;
            const v = D.itemData[dpci].metrics[metricKey]?.[d];
            const s = D.itemData[dpci].metrics['Sales $ - Total']?.[d];
            if (typeof v === 'number' && typeof s === 'number' && s > 0) { sumW += s; sumV += s * v; }
          }
          return sumW > 0 ? sumV / sumW : null;
        } else {
          return catWeekValue(cat, metricKey, d) ?? null;
        }
      });
      return {
        label: cat,
        data,
        borderColor: CAT_COLORS[cat],
        backgroundColor: CAT_COLORS[cat] + '22',
        borderWidth: 2.5,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      };
    });
    renderChart('chart-sku-trend', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${metricFmt(metric, ctx.parsed.y)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { grid: { display: false }, ticks: { callback: v => metricFmt(metric, v) }, title: { display: true, text: metricLabel(metric), color: '#9AA0A8', font: { size: 11 } } },
        },
      },
    });
    document.getElementById('sku-trend-hint').textContent = 'Showing each category aggregated. $PSPW + UPSPW are store-weighted; Promo/Online/OOS are sales-weighted.';
    return;
  }

  // Grouping: by SKU
  const rows = buildSKURows();
  // If user has selected SKUs, show those; else top N by sales in window
  let chosen;
  if (state.skuTrendSelected.size) {
    chosen = rows.filter(r => state.skuTrendSelected.has(r.dpci));
  } else {
    chosen = rows.slice().sort((a, b) => b.sales - a.sales).slice(0, 8);
  }
  const datasets = chosen.map(r => {
    const it = D.itemData[r.dpci];
    const data = w.map(d => {
      const v = it.metrics[metricKey]?.[d];
      return typeof v === 'number' ? v : null;
    });
    return {
      label: r.description.replace(/^Little Spoon /, '').slice(0, 36),
      _dpci: r.dpci,
      data,
      borderColor: CAT_COLORS[r.category] || '#9AA0A8',
      backgroundColor: (CAT_COLORS[r.category] || '#9AA0A8') + '22',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
    };
  });

  renderChart('chart-sku-trend', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${metricFmt(metric, ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { display: false }, ticks: { callback: v => metricFmt(metric, v) }, title: { display: true, text: metricLabel(metric), color: '#9AA0A8', font: { size: 11 } } },
      },
    },
  });
  const total = chosen.length;
  const hint = document.getElementById('sku-trend-hint');
  if (state.skuTrendSelected.size) {
    hint.innerHTML = `Showing <b>${total}</b> pinned SKU${total === 1 ? '' : 's'} · <a href="#" id="sku-clear-pin" style="color: var(--ls-blue-dark); text-decoration: none; font-weight: 700;">Clear selection</a>`;
    document.getElementById('sku-clear-pin').addEventListener('click', e => {
      e.preventDefault();
      state.skuTrendSelected.clear();
      renderSKUTable();
      renderSKUTrend();
    });
  } else {
    hint.innerHTML = `Showing <b>top ${total}</b> SKUs by sales in window. Click the <span style="display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--gray-300); font-size: 11px; font-weight: 800; color: var(--gray-500);">+</span> next to any SKU below to pin it.`;
  }
}

function renderCategoryMulti() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();
  const grid = document.getElementById('category-multi-grid');
  if (!grid) return;
  const metric = state.categoryMultiMetric;

  // Build series for each category
  const seriesByCat = {};
  let globalMax = 0;
  for (const cat of cats) {
    let series;
    if (metric === 'spend') {
      series = w.map(d => D.roundelByWeek[d]?.[cat] || 0);
    } else if (metric === 'velocity') {
      series = w.map(d => {
        let sumS = 0, sumSt = 0;
        for (const dpci in D.itemData) {
          if (skuCategory(dpci) !== cat) continue;
          const s = D.itemData[dpci].metrics['Sales $ - Total']?.[d];
          const st = D.itemData[dpci].metrics['Stores Tracked']?.[d];
          if (typeof s === 'number' && typeof st === 'number' && st > 0) { sumS += s; sumSt += st; }
        }
        return sumSt > 0 ? sumS / sumSt : 0;
      });
    } else {
      const key = pillTabFor(metric);
      series = w.map(d => catWeekValue(cat, key, d) || 0);
    }
    seriesByCat[cat] = series;
    const m = Math.max(...series);
    if (m > globalMax) globalMax = m;
  }

  // Render each category as its own card with a mini chart
  grid.innerHTML = '';
  for (const cat of cats) {
    const series = seriesByCat[cat];
    const total = series.reduce((a, b) => a + b, 0);
    const id = 'multi-' + categoryClassName(cat);
    const card = document.createElement('div');
    card.style.background = 'white';
    card.style.border = '1px solid var(--gray-200)';
    card.style.borderRadius = 'var(--radius-md)';
    card.style.padding = '12px 14px';
    card.innerHTML = `
      <div class="flex-between" style="margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${CAT_COLORS[cat]}; display: inline-block;"></span>
          <span style="font-weight: 700; font-size: 13px;">${cat}</span>
        </div>
        <span class="num" style="font-size: 13px; font-weight: 700;">${metric === 'spend' || metric === 'sales' || metric === 'velocity' ? fmt$(total) : metric === 'units' ? fmtNum(total) : ''}</span>
      </div>
      <div style="height: 110px;"><canvas id="${id}"></canvas></div>
    `;
    grid.appendChild(card);
    setTimeout(() => {
      renderChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: series,
            backgroundColor: CAT_COLORS[cat] + 'CC',
            borderColor: CAT_COLORS[cat],
            borderWidth: 0,
            borderRadius: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => metric === 'spend' ? fmt$(ctx.parsed.y) : metricFmt(metric, ctx.parsed.y) } },
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: { display: false, grid: { display: false }, beginAtZero: true, max: globalMax > 0 ? globalMax : undefined },
          },
        },
      });
    }, 0);
  }
}

function renderSKUContrib() {
  const rows = buildSKURows().sort((a,b)=>b.sales-a.sales).slice(0, 15).reverse();
  renderChart('chart-sku-contrib', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.description.replace(/^Little Spoon /,'').slice(0, 30)),
      datasets: [{
        data: rows.map(r => r.sales),
        backgroundColor: rows.map(r => CAT_COLORS[r.category] || '#9AA0A8'),
        borderRadius: 4,
        barThickness: 16,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt$(ctx.parsed.x)}` }},
      },
      scales: {
        x: { grid: { display: false }, ticks: { callback: v => fmt$(v), font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 9 } } },
      },
    },
  });
}

function openSKUDrawer(dpci) {
  state.selectedSKU = dpci;
  const it = D.itemData[dpci];
  const meta = D.skuMap[dpci];
  const ch = D.channelData[dpci] || {};
  const inv = D.inventoryData[dpci] || {};
  const ty = D.typeData[dpci] || {};
  const w = selectedWeeks();
  const wp = priorWeeks();
  let s = 0, sP = 0, p = 0, u = 0;
  const sales = it.metrics['Sales $ - Total'] || {};
  const promo = it.metrics['Sales $ - Promo'] || {};
  const units = it.metrics['Units - Total'] || {};
  for (const wk of w) {
    if (typeof sales[wk] === 'number') s += sales[wk];
    if (typeof promo[wk] === 'number') p += promo[wk];
    if (typeof units[wk] === 'number') u += units[wk];
  }
  for (const wk of wp) if (typeof sales[wk] === 'number') sP += sales[wk];

  document.getElementById('drawer-title').textContent = it.description;
  document.getElementById('drawer-sub').textContent = `DPCI ${dpci} · ${skuCategory(dpci)}`;
  const body = document.getElementById('drawer-body');
  body.innerHTML = `
    <div class="grid grid-2 mb-16">
      ${kpiCard({ label: 'Sales (window)', value: fmt$(s), delta: safeDiv(s-sP, sP) })}
      ${kpiCard({ label: 'Units', value: fmtNum(u) })}
      ${kpiCard({ label: 'Promo $', value: fmt$(p), accent: 'guava', deltaLabel: fmtPct(safeDiv(p, s)) + ' of sales' })}
      ${kpiCard({ label: 'Online %', value: fmtPct(ch.L13W_pen), accent: 'blueberry', deltaLabel: 'L13W' })}
    </div>
    <div class="card mb-16">
      <div class="card-h">
        <div>
          <div class="card-title">Trend over time</div>
          <div class="card-sub" id="drawer-chart-sub">Selected window · pick a metric</div>
        </div>
        <select id="drawer-metric-select" style="font-size: 12px;">
          <option value="sales">Sales $</option>
          <option value="velocity">$ PSPW</option>
          <option value="units">Units</option>
          <option value="upspw">UPSPW</option>
          <option value="promoPct">Promo %</option>
          <option value="onlinePen">Online %</option>
          <option value="oos">OOS %</option>
        </select>
      </div>
      <div class="chart-wrap" style="height: 220px;"><canvas id="drawer-chart-sales"></canvas></div>
    </div>
    <div class="card mb-16">
      <div class="card-title">Channel mix · L13W</div>
      <table class="table">
        <tr><td>Total</td><td class="table-num">${fmt$(ch.L13W_total)}</td></tr>
        <tr><td>Online (Orig.)</td><td class="table-num">${fmt$(ch.L13W_online)}</td></tr>
        <tr><td>Store Pickup</td><td class="table-num">${fmt$(ch.L13W_storePickup)}</td></tr>
        <tr><td>Shipt</td><td class="table-num">${fmt$(ch.L13W_shipt)}</td></tr>
        <tr><td>Ship from Store</td><td class="table-num">${fmt$(ch.L13W_shipFromStore)}</td></tr>
        <tr><td><b>Online %</b></td><td class="table-num"><b>${fmtPct(ch.L13W_pen)}</b></td></tr>
      </table>
    </div>
    <div class="card mb-16">
      <div class="card-title">YoY · L13W</div>
      <table class="table">
        <tr><td>Total Sales</td><td class="table-num">${fmt$(ty.L13W?.total)}</td><td class="table-num muted">${fmt$(ty.L13W?.totalLY)} LY</td></tr>
        <tr><td>Regular</td><td class="table-num">${fmt$(ty.L13W?.regular)}</td><td class="table-num muted">${fmt$(ty.L13W?.regularLY)} LY</td></tr>
        <tr><td>Promo</td><td class="table-num">${fmt$(ty.L13W?.promo)}</td><td class="table-num muted">${fmt$(ty.L13W?.promoLY)} LY</td></tr>
      </table>
    </div>
    <div class="card mb-16">
      <div class="card-title">Inventory</div>
      <div class="grid grid-2" style="gap: 8px;">
        <div><div class="muted caps">OOS %</div><div style="font-size: 18px; font-weight: 800;" class="${inv.oos > 0.1 ? 'status-bad' : inv.oos > 0.05 ? 'status-warn' : 'status-good'}">${fmtPct(inv.oos)}</div></div>
        <div><div class="muted caps">WOS</div><div style="font-size: 18px; font-weight: 800;">${inv.wos != null ? inv.wos.toFixed(1) : '–'}</div></div>
        <div><div class="muted caps">EOH+OW Units</div><div style="font-size: 16px; font-weight: 700;">${fmtNum(inv.eohOW)}</div></div>
        <div><div class="muted caps">On Order</div><div style="font-size: 16px; font-weight: 700;">${fmtNum(inv.onOrder)}</div></div>
      </div>
    </div>
  `;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');

  // Wire up metric selector
  const sel = document.getElementById('drawer-metric-select');
  if (sel) {
    sel.value = state.drawerMetric;
    sel.addEventListener('change', e => {
      state.drawerMetric = e.target.value;
      renderDrawerChart(dpci);
    });
  }
  setTimeout(() => renderDrawerChart(dpci), 50);
}

function renderDrawerChart(dpci) {
  const it = D.itemData[dpci];
  if (!it) return;
  const meta = D.skuMap[dpci];
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const metric = state.drawerMetric;
  const key = pillTabFor(metric);
  const data = w.map(d => {
    const v = it.metrics[key]?.[d];
    return typeof v === 'number' ? v : null;
  });
  // Promo overlay only for sales metric
  const promoOverlay = metric === 'sales' ? w.map(d => {
    const v = it.metrics['Sales $ - Promo']?.[d];
    return typeof v === 'number' ? v : null;
  }) : null;

  const datasets = [
    { label: metricLabel(metric), data, backgroundColor: CAT_COLORS[skuCategory(dpci)] + 'CC', borderColor: CAT_COLORS[skuCategory(dpci)], borderRadius: 2, barThickness: 'flex' },
  ];
  if (promoOverlay) datasets.push({ label: 'Promo $', data: promoOverlay, type: 'line', borderColor: LS_BLACK, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.2 });

  document.getElementById('drawer-chart-sub').textContent = `${metricLabel(metric)} · ${w.length}-week view`;

  renderChart('drawer-chart-sales', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.dataset.label === 'Promo $' ? fmt$(ctx.parsed.y) : metricFmt(metric, ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } },
        y: { grid: { display: false }, ticks: { callback: v => metricFmt(metric, v) } },
      },
    },
  });
}
function closeDrawer() {
  document.getElementById('scrim').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  if (state.charts['drawer-chart-sales']) {
    state.charts['drawer-chart-sales'].destroy();
    delete state.charts['drawer-chart-sales'];
  }
}
window.openSKUDrawer = openSKUDrawer;
window.closeDrawer = closeDrawer;

// ---------- Category Page ----------
function renderCategoryKPIs() {
  const w = selectedWeeks();
  const wp = priorWeeks();
  const cats = activeCats();
  const sales = sumAllSelected('Sales $ - Total', w);
  const salesP = sumAllSelected('Sales $ - Total', wp);
  const units = sumAllSelected('Units - Total', w);
  const unitsP = sumAllSelected('Units - Total', wp);

  // Average $ PSPW (sales weighted) across categories
  let pspwSum = 0, pspwCount = 0;
  for (const cat of cats) {
    const series = catSeries(cat, 'Sales $ - Total per Store Per Week ($PSPW)');
    for (const wk of w) {
      const v = series[wk];
      if (typeof v === 'number') { pspwSum += v; pspwCount++; }
    }
  }
  const avgPSPW = pspwCount ? pspwSum / pspwCount : null;

  // Highest growing
  const growth = cats.map(c => ({ c, g: safeDiv(sumMetric(c,'Sales $ - Total',w) - sumMetric(c,'Sales $ - Total',wp), sumMetric(c,'Sales $ - Total',wp)) })).filter(x=>x.g!=null);
  growth.sort((a,b)=>b.g-a.g);

  document.getElementById('category-kpis').innerHTML = [
    kpiCard({ label: 'Categories', value: cats.length, accent: null, deltaLabel: `${activeCats().length} of ${D.ROUNDEL_CATS.length}` }),
    kpiCard({ label: 'Total sales', value: fmt$(sales), delta: safeDiv(sales-salesP, salesP) }),
    kpiCard({ label: 'Total units', value: fmtNum(units), delta: safeDiv(units-unitsP, unitsP), accent: 'mango' }),
    kpiCard({ label: 'Avg $ PSPW', value: fmtPSPW(avgPSPW), accent: 'spinach' }),
    kpiCard({ label: 'Top grower', value: growth[0]?.c || '–', accent: 'blueberry', deltaLabel: growth[0]?.g != null ? '+' + (growth[0].g*100).toFixed(1)+'%' : '' }),
    kpiCard({ label: 'Roundel spend', value: fmt$(sumRoundelSpend(w)), accent: 'guava' }),
  ].join('');
}

function renderCategoryTrend() {
  const w = selectedWeeks();
  const cats = activeCats();
  const metric = pillTabFor(state.catTrendMetric);
  const isBar = state.catTrendShape === 'bar';
  const datasets = cats.map(cat => ({
    label: cat,
    data: w.map(d => catWeekValue(cat, metric, d) || null),
    borderColor: CAT_COLORS[cat],
    backgroundColor: isBar ? CAT_COLORS[cat] + 'CC' : CAT_COLORS[cat] + '22',
    borderWidth: 2,
    fill: false,
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    stack: isBar ? 'a' : undefined,
  }));
  const fmtAxis = (v) => state.catTrendMetric === 'velocity' ? fmtPSPW(v) : (state.catTrendMetric === 'sales' ? fmt$(v) : fmtNum(v));
  renderChart('chart-cat-trend', {
    type: isBar ? 'bar' : 'line',
    data: { labels: w.map(shortDate), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: isBar, grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: isBar, grid: { display: false }, ticks: { callback: fmtAxis } },
      },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtAxis(ctx.parsed.y)}` } } },
    },
  });
}

function renderCategorySpend() {
  const w = selectedWeeks();
  const cats = activeCats().filter(c => c !== 'Other');
  const sales = cats.map(c => sumMetric(c, 'Sales $ - Total', w));
  const spend = cats.map(c => sumRoundelSpend(w, [c]));
  renderChart('chart-cat-spend', {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [
        { label: 'Sales $', data: sales, backgroundColor: cats.map(c => CAT_COLORS[c]), borderRadius: 4 },
        { label: 'Roundel $', data: spend, backgroundColor: '#141414', borderRadius: 4, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } },
        y1: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel $', color: '#9AA0A8' } },
      },
    },
  });
}

function renderCategoryScorecard() {
  const w = selectedWeeks(), wp = priorWeeks();
  const tbody = document.querySelector('#category-scorecard tbody');
  const rows = activeCats().map(cat => {
    const sales = sumMetric(cat, 'Sales $ - Total', w);
    const salesP = sumMetric(cat, 'Sales $ - Total', wp);
    const units = sumMetric(cat, 'Units - Total', w);
    const promoSales = sumMetric(cat, 'Sales $ - Promo', w);
    const promoPct = sales > 0 ? promoSales / sales : null;
    const pen = categoryOnlinePen(cat);
    const spend = sumRoundelSpend(w, [cat]);
    const pspwSeries = catSeries(cat, 'Sales $ - Total per Store Per Week ($PSPW)');
    let pspwSum = 0, pspwCount = 0;
    for (const wk of w) { const v = pspwSeries[wk]; if (typeof v === 'number') { pspwSum += v; pspwCount++; }}
    const pspw = pspwCount ? pspwSum / pspwCount : null;
    const growth = salesP > 0 ? (sales - salesP) / salesP : null;
    const onlineSales = categoryOnlineSales(cat, w);
    return { cat, sales, growth, units, pspw, promoPct, pen, spend, onlineSales, roas: spend > 0 ? onlineSales / spend : null };
  });
  rows.sort((a, b) => b.sales - a.sales);
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
      <td class="table-num"><b>${fmt$(r.sales)}</b></td>
      <td class="table-num ${r.growth >= 0 ? 'status-good' : 'status-bad'}">${r.growth != null ? (r.growth>=0?'+':'')+(r.growth*100).toFixed(1)+'%' : '–'}</td>
      <td class="table-num">${fmtNum(r.units)}</td>
      <td class="table-num">${fmtPSPW(r.pspw)}</td>
      <td class="table-num">${fmtPct(r.promoPct)}</td>
      <td class="table-num">${fmtPct(r.pen)}</td>
      <td class="table-num">${fmt$(r.onlineSales)}</td>
      <td class="table-num">${fmt$(r.spend)}</td>
      <td class="table-num"><b>${fmtMult(r.roas)}</b></td>
    </tr>
  `).join('');
}

// ---------- Promo ----------
// Map Target Class names to Roundel categories (best fit)
function classToRoundel(className) {
  const c = className.toUpperCase();
  if (c.includes('YOGURT')) return 'YOGOS';
  if (c.includes('PROTEIN BARS') || c.includes('LUNCHBOX')) return 'Baked Bars';
  if (c.includes('FRUIT SNACKS')) return 'Fruit+Veggie Minis';
  if (c.includes('BFY SNACKS') || c.includes('SNACK')) return 'Puffs + Cereals';
  if (c.includes('DINNER') || c.includes('ENTREE')) return 'Frozen/Meals';
  if (c.includes('BABY FOOD')) return 'Smoothies'; // baby food includes smoothies/pouches mostly
  return null;
}
function promoAggregate(weeks) {
  let totalSales = 0, promoSales = 0, baseSales = 0, incrementalSales = 0;
  for (const r of D.promoData) {
    if (!weeks.includes(r.weekDate)) continue;
    const cat = classToRoundel(r.className);
    if (!cat || !state.categories.has(cat)) continue;
    if (typeof r.sales === 'number') totalSales += r.sales;
    if (typeof r.promoSales === 'number') promoSales += r.promoSales;
    if (typeof r.baseSales4W === 'number') baseSales += r.baseSales4W;
    if (typeof r.incrementalSales === 'number') incrementalSales += r.incrementalSales;
  }
  return { totalSales, promoSales, baseSales, incrementalSales };
}

function renderPromoKPIs() {
  const w = selectedWeeks(), wp = priorWeeks();
  const cur = promoAggregate(w);
  const prior = promoAggregate(wp);
  const promoPct = cur.totalSales > 0 ? cur.promoSales / cur.totalSales : null;
  const promoPctP = prior.totalSales > 0 ? prior.promoSales / prior.totalSales : null;
  const lift = cur.baseSales > 0 ? (cur.totalSales - cur.baseSales) / cur.baseSales : null;
  const incr = cur.totalSales > 0 ? cur.incrementalSales / cur.totalSales : null;

  document.getElementById('promo-kpis').innerHTML = [
    kpiCard({ label: 'Total Sales', value: fmt$(cur.totalSales), delta: safeDiv(cur.totalSales-prior.totalSales, prior.totalSales) }),
    kpiCard({ label: 'Promo Sales', value: fmt$(cur.promoSales), accent: 'guava', delta: safeDiv(cur.promoSales-prior.promoSales, prior.promoSales) }),
    kpiCard({ label: 'Promo % of Sales', value: fmtPct(promoPct), accent: 'mango', delta: promoPctP != null ? promoPct - promoPctP : null }),
    kpiCard({ label: 'Promo Lift vs Base', value: fmtPct(lift), accent: 'spinach', deltaLabel: 'Total / 4W base' }),
    kpiCard({ label: 'Incremental %', value: fmtPct(incr), accent: 'blueberry', deltaLabel: 'incr / total sales' }),
    kpiCard({ label: 'Base Sales', value: fmt$(cur.baseSales), accent: 'prune' }),
  ].join('');
}

function renderPromoStack() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const baseW = {}, totalW = {}, incrementalW = {};
  for (const r of D.promoData) {
    const cat = classToRoundel(r.className);
    if (!cat || !state.categories.has(cat)) continue;
    const wk = r.weekDate;
    baseW[wk] = (baseW[wk] || 0) + (r.baseSales4W || 0);
    totalW[wk] = (totalW[wk] || 0) + (r.sales || 0);
    incrementalW[wk] = (incrementalW[wk] || 0) + (r.incrementalSales || 0);
  }
  const baseData = w.map(d => baseW[d] || 0);
  const incrData = w.map(d => Math.max(0, (totalW[d] || 0) - (baseW[d] || 0)));
  renderChart('chart-promo-stack', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Base sales', data: baseData, backgroundColor: '#9AA0A8', borderRadius: 0, stack: 's' },
        { label: 'Incremental (above base)', data: incrData, backgroundColor: LS_BLUE, borderRadius: 0, stack: 's' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } }, y: { stacked: true, grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });
}

function renderPromoLift() {
  // Per-class avg lift (sales / base) over selected window
  const w = selectedWeeks();
  const byClass = {};
  for (const r of D.promoData) {
    if (!w.includes(r.weekDate)) continue;
    const cat = classToRoundel(r.className);
    if (!cat || !state.categories.has(cat)) continue;
    if (!byClass[r.className]) byClass[r.className] = { sales: 0, base: 0, cat };
    byClass[r.className].sales += r.sales || 0;
    byClass[r.className].base += r.baseSales4W || 0;
  }
  const rows = Object.entries(byClass).map(([cls, v]) => ({ cls, lift: v.base > 0 ? (v.sales - v.base) / v.base : 0, cat: v.cat }));
  rows.sort((a, b) => b.lift - a.lift);
  renderChart('chart-promo-lift', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.cls),
      datasets: [{
        data: rows.map(r => r.lift * 100),
        backgroundColor: rows.map(r => CAT_COLORS[r.cat] || '#9AA0A8'),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}% lift` } } },
      scales: { x: { grid: { display: false }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } },
    },
  });
}

function renderPromoInteraction() {
  // 4 buckets: no promo / no spend, promo only, spend only, both
  const w = selectedWeeks();
  // For each (category, week), bucket
  const buckets = { 'No Promo + No Spend': 0, 'Promo Only': 0, 'Spend Only': 0, 'Both': 0 };
  const weekDataByCat = {};
  for (const cat of activeCats()) {
    const series = catSeries(cat, 'Sales $ - Total');
    const promoSeries = catSeries(cat, 'Sales $ - Promo');
    for (const wk of w) {
      const sales = series[wk] || 0;
      const promoS = promoSeries[wk] || 0;
      const spend = D.roundelByWeek[wk]?.[cat] || 0;
      const isPromo = promoS > sales * 0.05;
      const hasSpend = spend > 0;
      const key = (isPromo && hasSpend) ? 'Both' : isPromo ? 'Promo Only' : hasSpend ? 'Spend Only' : 'No Promo + No Spend';
      buckets[key] += sales;
    }
  }
  renderChart('chart-promo-interaction', {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ['#9AA0A8', '#FFC711', '#18A7FF', LS_BLUE],
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt$(ctx.parsed.y) } } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });
}

function renderPromoPDP() {
  // Pre / During / Post: avg sales per week for promo periods
  // Definition: a promo week is one where promoPct > 30% per class. Pre/Post = ±2 weeks around
  const cats = activeCats();
  let pre = 0, during = 0, post = 0, n = 0;
  for (const cat of cats) {
    const sales = catSeries(cat, 'Sales $ - Total');
    const promo = catSeries(cat, 'Sales $ - Promo');
    for (let i = 2; i < D.salesDates.length - 2; i++) {
      const wk = D.salesDates[i];
      const ps = promo[wk] || 0;
      const ts = sales[wk] || 0;
      if (ts > 0 && ps / ts > 0.3) {
        const preAvg = ((sales[D.salesDates[i-1]]||0) + (sales[D.salesDates[i-2]]||0)) / 2;
        const postAvg = ((sales[D.salesDates[i+1]]||0) + (sales[D.salesDates[i+2]]||0)) / 2;
        pre += preAvg; during += ts; post += postAvg; n++;
      }
    }
  }
  pre = n ? pre/n : 0; during = n ? during/n : 0; post = n ? post/n : 0;
  renderChart('chart-promo-pdp', {
    type: 'bar',
    data: {
      labels: ['2W Pre', 'Promo Wk', '2W Post'],
      datasets: [{
        data: [pre, during, post],
        backgroundColor: ['#9AA0A8', LS_BLUE, '#9AA0A8'],
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt$(ctx.parsed.y) } } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });
}

function renderPromoTable() {
  const w = selectedWeeks();
  const byClass = {};
  for (const r of D.promoData) {
    if (!w.includes(r.weekDate)) continue;
    const cat = classToRoundel(r.className);
    if (!cat || !state.categories.has(cat)) continue;
    if (!byClass[r.className]) byClass[r.className] = { totalSales: 0, promoSales: 0, baseSales: 0, incrementalSales: 0, cat };
    byClass[r.className].totalSales += r.sales || 0;
    byClass[r.className].promoSales += r.promoSales || 0;
    byClass[r.className].baseSales += r.baseSales4W || 0;
    byClass[r.className].incrementalSales += r.incrementalSales || 0;
  }
  const rows = Object.entries(byClass).map(([cls, v]) => ({
    cls, ...v,
    promoPct: v.totalSales > 0 ? v.promoSales / v.totalSales : null,
    lift: v.baseSales > 0 ? (v.totalSales - v.baseSales) / v.baseSales : null,
  }));
  rows.sort((a, b) => b.totalSales - a.totalSales);
  document.querySelector('#promo-table tbody').innerHTML = rows.map(r => `
    <tr>
      <td><span class="chip ${categoryClassName(r.cat)}">${r.cls}</span></td>
      <td class="table-num">${fmt$(r.totalSales)}</td>
      <td class="table-num">${fmt$(r.promoSales)}</td>
      <td class="table-num">${fmtPct(r.promoPct)}</td>
      <td class="table-num">${fmt$(r.baseSales)}</td>
      <td class="table-num">${fmt$(r.incrementalSales)}</td>
      <td class="table-num ${r.lift > 0 ? 'status-good' : 'status-bad'}">${fmtPct(r.lift)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="muted" style="padding: 20px; text-align: center;">No promo data for current selection.</td></tr>';
}

// ---------- Digital Page ----------
function renderDigitalKPIs() {
  const w = selectedWeeks(), wp = priorWeeks();
  const totalSales = sumAllSelected('Sales $ - Total', w);
  const totalSalesP = sumAllSelected('Sales $ - Total', wp);
  const onlineSales = sumOnlineSales(w);
  const onlineSalesP = sumOnlineSales(wp);
  const pen = safeDiv(onlineSales, totalSales);
  const penP = safeDiv(onlineSalesP, totalSalesP);
  const spend = sumRoundelSpend(w);
  const onlineRoas = safeDiv(onlineSales, spend);

  document.getElementById('digital-kpis').innerHTML = [
    kpiCard({ label: 'Online (digital) sales', value: fmt$(onlineSales), delta: safeDiv(onlineSales-onlineSalesP, onlineSalesP), accent: 'blueberry', deltaLabel: 'Sales × Online Orig Pen' }),
    kpiCard({ label: 'Total sales', value: fmt$(totalSales), delta: safeDiv(totalSales-totalSalesP, totalSalesP), accent: null, deltaLabel: 'all channels' }),
    kpiCard({ label: 'Digital %', value: fmtPct(pen), accent: 'spinach', delta: penP != null ? pen - penP : null, deltaLabel: 'pp change' }),
    kpiCard({ label: 'Roundel spend', value: fmt$(spend), accent: 'guava', deltaLabel: 'from spend tracker CSV' }),
    kpiCard({ label: 'ROAS', value: fmtMult(onlineRoas), accent: 'prune', deltaLabel: 'online ÷ spend' }),
    kpiCard({ label: 'Cost / digital $', value: onlineSales > 0 ? '$' + (spend/onlineSales).toFixed(2) : '–', accent: 'mango', deltaLabel: 'lower is better' }),
  ].join('');
}

function renderDigitalPenByCategory() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();
  const datasets = cats.map(cat => ({
    label: cat,
    data: w.map(d => {
      // Weekly online pen for this category = sum(item × pen) / sum(sales) over current cat mapping
      let online = 0, total = 0;
      for (const dpci in D.itemData) {
        if (skuCategory(dpci) !== cat) continue;
        const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[d];
        const pv = D.itemData[dpci].metrics['Sales $ - Online Orig Penetration']?.[d];
        if (typeof sv === 'number') {
          total += sv;
          if (typeof pv === 'number') online += sv * pv;
        }
      }
      return total > 0 ? (online / total) * 100 : null;
    }),
    borderColor: CAT_COLORS[cat],
    backgroundColor: CAT_COLORS[cat] + '22',
    borderWidth: 2.5,
    fill: false,
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    spanGaps: true,
  }));
  renderChart('chart-digital-pen', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '–' : ctx.parsed.y.toFixed(1) + '%'}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { display: false }, ticks: { callback: v => v.toFixed(0) + '%' }, title: { display: true, text: 'Online %', color: '#9AA0A8', font: { size: 11 } } },
      },
    },
  });
  setSubtitle('digital-pen-cat-sub', `${windowLabel()} · online share of sales by category`);
}

function renderDigitalSpendByCategory() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats().filter(c => c !== 'Other');
  const view = state.digitalSpendView || 'stacked';
  const datasets = cats.map(cat => ({
    label: cat,
    data: w.map(d => D.roundelByWeek[d]?.[cat] || 0),
    backgroundColor: CAT_COLORS[cat] + (view === 'stacked' ? 'CC' : '00'),
    borderColor: CAT_COLORS[cat],
    borderWidth: 2,
    fill: view === 'stacked',
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    stack: view === 'stacked' ? 'a' : undefined,
  }));
  renderChart('chart-digital-spend-cat', {
    type: view === 'stacked' ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: {
        x: { stacked: view === 'stacked', grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: view === 'stacked', grid: { display: false }, ticks: { callback: v => fmt$(v) } },
      },
    },
  });
  setSubtitle('digital-spend-cat-sub', `${windowLabel()} · ${view === 'stacked' ? 'stacked' : 'lines'} weekly spend by category`);
}

function renderDigitalOnlineByCategory() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = activeCats();
  const datasets = cats.map(cat => ({
    label: cat,
    data: w.map(d => {
      let s = 0, has = false;
      for (const dpci in D.itemData) {
        if (skuCategory(dpci) !== cat) continue;
        const v = itemOnlineSales(dpci, d);
        if (typeof v === 'number') { s += v; has = true; }
      }
      return has ? s : null;
    }),
    borderColor: CAT_COLORS[cat],
    backgroundColor: CAT_COLORS[cat] + '88',
    borderWidth: 2,
    fill: 'origin',
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    stack: 'a',
  }));
  renderChart('chart-digital-online-cat', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Online $', color: '#9AA0A8', font: { size: 11 } } },
      },
    },
  });
  setSubtitle('digital-online-cat-sub', `${windowLabel()} · online $ stacked by category (Sales × Pen)`);
}

function renderDigitalPenChart() {
  // Trim Target weekly to the same length as the selected window
  const tw = D.targetWeekly.slice(-state.window);
  const labels = tw.map(t => t.fiscalWeek.replace(/^(\d{4})-(\d{2}) WK (\d+)/, 'FY$1 W$3'));
  const pen = tw.map(t => t.onlineOrigPen != null ? t.onlineOrigPen * 100 : null);

  const w = selectedWeeks();
  const spend = w.map(d => Object.values(D.roundelByWeek[d] || {}).reduce((a, b) => a + b, 0));
  const padded = new Array(Math.max(0, tw.length - spend.length)).fill(null).concat(spend);

  renderChart('chart-digital-pen', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Online %', data: pen, borderColor: LS_BLUE, backgroundColor: LS_BLUE + '22', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, yAxisID: 'y' },
        { label: 'Roundel spend', data: padded.slice(-pen.length), type: 'bar', backgroundColor: '#14141422', borderColor: LS_BLACK, borderWidth: 0, yAxisID: 'y2', order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => v + '%' }, title: { display: true, text: 'Digital %', color: '#9AA0A8' } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel $', color: '#9AA0A8' } },
      },
    },
  });
}

function renderDigitalCat() {
  const cats = activeCats().filter(c => c !== 'Other');
  const data = cats.map(c => (categoryOnlinePen(c) || 0) * 100);
  renderChart('chart-digital-cat', {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [{
        data,
        backgroundColor: cats.map(c => CAT_COLORS[c]),
        borderRadius: 4,
        datalabels: { display: true, anchor: 'end', align: 'end', offset: 4, color: '#141414', font: { weight: 700, size: 11 }, formatter: v => v.toFixed(1) + '%' },
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 48 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(1) + '%' } } },
      scales: { x: { grid: { display: false }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
    },
  });
}

function renderDigitalPromo() {
  // Avg digital % during promo weeks vs non-promo weeks (per category)
  const cats = activeCats();
  const promoPens = []; const nonPromoPens = [];
  for (const cat of cats) {
    const sales = catSeries(cat, 'Sales $ - Total');
    const promoS = catSeries(cat, 'Sales $ - Promo');
    for (const dpci in D.itemData) {
      if (skuCategory(dpci) !== cat) continue;
      const itemSales = D.itemData[dpci].metrics['Sales $ - Total'] || {};
      const itemPen = D.itemData[dpci].metrics['Sales $ - Online Orig Penetration'] || {};
      for (const wk of D.salesDates) {
        const ts = sales[wk] || 0;
        const ps = promoS[wk] || 0;
        const isPromo = ts > 0 && ps / ts > 0.2;
        const sv = itemSales[wk], pv = itemPen[wk];
        if (typeof sv === 'number' && typeof pv === 'number' && sv > 0) {
          if (isPromo) promoPens.push({ cat, sales: sv, pen: pv });
          else nonPromoPens.push({ cat, sales: sv, pen: pv });
        }
      }
    }
  }
  const wAvg = arr => {
    let s = 0, w = 0;
    for (const r of arr) { s += r.sales * r.pen; w += r.sales; }
    return w > 0 ? s / w : null;
  };
  // Compare per category
  const data = cats.map(c => ({
    cat: c,
    promo: wAvg(promoPens.filter(x => x.cat === c)),
    nonPromo: wAvg(nonPromoPens.filter(x => x.cat === c)),
  })).filter(r => r.promo != null || r.nonPromo != null);

  renderChart('chart-digital-promo', {
    type: 'bar',
    data: {
      labels: data.map(d => d.cat),
      datasets: [
        { label: 'Promo weeks', data: data.map(d => (d.promo||0)*100), backgroundColor: '#FFC711', borderRadius: 4 },
        { label: 'Non-promo weeks', data: data.map(d => (d.nonPromo||0)*100), backgroundColor: '#9AA0A8', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { callback: v => v + '%' } } },
    },
  });
}

function renderDigitalSpend() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const spend = w.map(d => Object.values(D.roundelByWeek[d] || {}).filter((_, i) => true).reduce((a, b) => a + b, 0));
  // Approximate online sales per sales-week by summing item-level sales × pen
  const onlineByWeek = w.map(wk => {
    let s = 0;
    for (const dpci in D.itemData) {
      const cat = skuCategory(dpci);
      if (!state.categories.has(cat)) continue;
      const sales = D.itemData[dpci].metrics['Sales $ - Total'] || {};
      const pen = D.itemData[dpci].metrics['Sales $ - Online Orig Penetration'] || {};
      const sv = sales[wk], pv = pen[wk];
      if (typeof sv === 'number' && typeof pv === 'number') s += sv * pv;
    }
    return s;
  });
  renderChart('chart-digital-spend', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Online sales', data: onlineByWeek, backgroundColor: LS_BLUE, borderRadius: 2, yAxisID: 'y' },
        { label: 'Roundel spend', data: spend, type: 'line', borderColor: LS_BLACK, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.2, yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel $', color: '#9AA0A8' } },
      },
    },
  });
}

// ============================================================
//   ROUNDEL INTELLIGENCE — operating system for media decisions
// ============================================================
// Categories included in Roundel attribution (excludes 'Other')
function rdCats() { return activeCats().filter(c => c !== 'Other'); }
function rdRoundelDates() { return D.salesDates.filter(d => D.roundelByWeek?.[d]); }

// Per-category, per-week values (cached during a render cycle)
const _rdCache = {};
function rdClearCache() { for (const k in _rdCache) delete _rdCache[k]; }
function rdCatWeek(cat, metric, week) {
  const key = cat + '|' + metric + '|' + week;
  if (key in _rdCache) return _rdCache[key];
  const v = catWeekValue(cat, metric, week);
  _rdCache[key] = v;
  return v;
}
function rdSpendWeek(cat, week) { return D.roundelByWeek?.[week]?.[cat] || 0; }
// Online $ for one cat-week (Sales × Online Pen, summed across SKUs)
function rdOnlineWeek(cat, week) {
  const key = 'online|' + cat + '|' + week;
  if (key in _rdCache) return _rdCache[key];
  let s = 0, has = false;
  for (const dpci in D.itemData) {
    if (skuCategory(dpci) !== cat) continue;
    const v = itemOnlineSales(dpci, week);
    if (typeof v === 'number') { s += v; has = true; }
  }
  const r = has ? s : 0;
  _rdCache[key] = r;
  return r;
}
// "Supported" = spend ≥ threshold for this cat-week
function rdIsSupported(cat, week) { return rdSpendWeek(cat, week) >= state.rdSupportedThreshold; }
// "Promo" week = >5% of category sales came from promo
function rdIsPromoWeek(cat, week) {
  const tot = rdCatWeek(cat, 'Sales $ - Total', week) || 0;
  const pro = rdCatWeek(cat, 'Sales $ - Promo', week) || 0;
  return tot > 0 && pro / tot > 0.2;
}

// ---------- BASELINE METHODOLOGIES ----------
// Returns expected sales for cat-week if there had been no Roundel support
function rdBaselineForWeek(cat, week, method) {
  method = method || state.rdMethod;
  const all = D.salesDates;
  const idx = all.indexOf(week);
  if (idx < 0) return null;

  // Trailing-N: average of N weeks before this one
  function trailing(n) {
    const start = Math.max(0, idx - n);
    const wks = all.slice(start, idx);
    let s = 0, count = 0;
    for (const w of wks) {
      const v = rdCatWeek(cat, 'Sales $ - Total', w);
      if (typeof v === 'number') { s += v; count++; }
    }
    return count >= Math.max(2, Math.floor(n / 2)) ? s / count : null;
  }

  if (method === 'trailing4') return trailing(4);
  if (method === 'trailing13') return trailing(13);

  if (method === 'nonpromo') {
    // Average of last 13 weeks where: not supported AND not promo
    const start = Math.max(0, idx - 13);
    const wks = all.slice(start, idx);
    let s = 0, count = 0;
    for (const w of wks) {
      if (rdIsSupported(cat, w)) continue;
      if (rdIsPromoWeek(cat, w)) continue;
      const v = rdCatWeek(cat, 'Sales $ - Total', w);
      if (typeof v === 'number') { s += v; count++; }
    }
    return count >= 3 ? s / count : trailing(13);
  }

  if (method === 'comparable') {
    // Use this week's avg sales of unsupported categories scaled by historical ratio
    const others = rdCats().filter(c => c !== cat);
    let unsuppSum = 0, unsuppCount = 0;
    for (const c of others) {
      if (rdIsSupported(c, week)) continue;
      const v = rdCatWeek(c, 'Sales $ - Total', week);
      if (typeof v === 'number') { unsuppSum += v; unsuppCount++; }
    }
    if (unsuppCount === 0) return trailing(13);
    const unsuppAvgThisWeek = unsuppSum / unsuppCount;

    // Historical ratio of cat to others on unsupported weeks
    let catSum = 0, catN = 0, otherSum = 0, otherN = 0;
    const start = Math.max(0, idx - 26);
    const wks = all.slice(start, idx);
    for (const w of wks) {
      if (rdIsSupported(cat, w)) continue;
      const v = rdCatWeek(cat, 'Sales $ - Total', w);
      if (typeof v === 'number') { catSum += v; catN++; }
      for (const c of others) {
        const ov = rdCatWeek(c, 'Sales $ - Total', w);
        if (typeof ov === 'number') { otherSum += ov; otherN++; }
      }
    }
    if (catN < 2 || otherN < 2) return trailing(13);
    const ratio = (catSum / catN) / (otherSum / otherN);
    return unsuppAvgThisWeek * ratio;
  }

  return trailing(13);
}

// Aggregate incremental sales for a category over a window of weeks
function rdCategoryIncremental(cat, weeks, method) {
  let actual = 0, baseline = 0, supportedWeeks = 0, totalSpend = 0;
  for (const w of weeks) {
    const a = rdCatWeek(cat, 'Sales $ - Total', w);
    if (typeof a !== 'number') continue;
    const sp = rdSpendWeek(cat, w);
    if (sp < state.rdSupportedThreshold) continue; // only count supported weeks
    const b = rdBaselineForWeek(cat, w, method);
    if (b == null) continue;
    actual += a;
    baseline += b;
    totalSpend += sp;
    supportedWeeks++;
  }
  return {
    actual, baseline,
    incremental: actual - baseline,
    lift: baseline > 0 ? (actual - baseline) / baseline : null,
    spend: totalSpend,
    supportedWeeks,
    incrRoas: totalSpend > 0 ? (actual - baseline) / totalSpend : null,
  };
}

// Confidence: based on # supported weeks + spend size
function rdConfidence(supportedWeeks, spend) {
  if (supportedWeeks >= 8 && spend >= 50000) return { level: 'high', label: 'High' };
  if (supportedWeeks >= 4 && spend >= 15000) return { level: 'med', label: 'Medium' };
  return { level: 'low', label: 'Low' };
}

// ---------- SKU-LEVEL ANALYSIS ----------
// Return per-SKU metrics for selected window
function rdSkuRows() {
  const w = selectedWeeks();
  const all = D.salesDates;
  const winSet = new Set(w);
  const rows = [];
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    if (cat === 'Other') continue;
    const it = D.itemData[dpci];
    let pos = 0, units = 0, online = 0, hasPos = false, hasUnits = false;
    let velSum = 0, velN = 0;
    for (const wk of w) {
      const sv = it.metrics['Sales $ - Total']?.[wk];
      if (typeof sv === 'number') { pos += sv; hasPos = true; }
      const uv = it.metrics['Units - Total']?.[wk];
      if (typeof uv === 'number') { units += uv; hasUnits = true; }
      const ov = itemOnlineSales(dpci, wk);
      if (typeof ov === 'number') online += ov;
      const pv = it.metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[wk];
      if (typeof pv === 'number' && pv > 0) { velSum += pv; velN++; }
    }
    // Spend allocated by SKU's share of category POS during supported weeks
    const catSpend = sumRoundelSpend(w, [cat]);
    let catPosWindow = 0;
    for (const dp2 in D.itemData) {
      if (skuCategory(dp2) !== cat) continue;
      for (const wk of w) {
        const sv = D.itemData[dp2].metrics['Sales $ - Total']?.[wk];
        if (typeof sv === 'number') catPosWindow += sv;
      }
    }
    const skuShare = catPosWindow > 0 ? pos / catPosWindow : 0;
    const spend = catSpend * skuShare;

    // Baseline velocity: avg $PSPW over prior 13 weeks (before window start)
    const winStart = all.indexOf(w[0]);
    const baseStart = Math.max(0, winStart - 13);
    const baseWks = all.slice(baseStart, winStart);
    let bSum = 0, bN = 0;
    for (const wk of baseWks) {
      const pv = it.metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[wk];
      if (typeof pv === 'number' && pv > 0) { bSum += pv; bN++; }
    }
    const baseVel = bN > 0 ? bSum / bN : null;
    const curVel = velN > 0 ? velSum / velN : null;
    const lift = (baseVel && curVel) ? (curVel - baseVel) / baseVel : null;

    const roas = spend > 0 ? online / spend : null;

    // Verdict classification
    const action = rdClassifySku({ spend, roas, lift, pos, online, baseVel, curVel });

    rows.push({
      dpci, desc: it.description, cat,
      spend, attr: online, roas,
      pos, units,
      pspw: curVel, baseline: baseVel, lift,
      action,
      hasData: hasPos || hasUnits,
    });
  }
  return rows;
}

function rdClassifySku({ spend, roas, lift, pos, online, baseVel, curVel }) {
  // Test: very low or no spend, but has potential
  if (!spend || spend < 200) {
    if (pos > 5000 && (lift == null || lift >= 0)) return 'Test';
    if (online > 1000) return 'Test';
    return 'Maintain';
  }
  // Pause: large spend, weak ROAS, declining
  if (spend > 5000 && roas != null && roas < 0.8 && lift != null && lift < -0.05) return 'Pause';
  // Scale: strong ROAS + positive lift
  if (roas != null && roas >= 2.0 && lift != null && lift > 0.05) return 'Scale';
  if (roas != null && roas >= 3.0) return 'Scale';
  // Fix: medium spend + weak ROAS but flat/positive lift (creative/targeting issue)
  if (spend > 2000 && roas != null && roas < 1.2) return 'Fix';
  // Default: Maintain
  return 'Maintain';
}

// ---------- BUDGET SIMULATOR HELPERS ----------
function rdHistoricalRoasByCat() {
  // ROAS over the selected window per cat (used for projections)
  const w = selectedWeeks();
  const out = {};
  for (const c of rdCats()) {
    const sp = sumRoundelSpend(w, [c]);
    let online = 0;
    for (const wk of w) online += rdOnlineWeek(c, wk);
    out[c] = { spend: sp, online, roas: sp > 0 ? online / sp : 0 };
  }
  return out;
}

function rdScenarioAllocation(scenario) {
  // Returns object {cat: pct (0-1)} summing to 1
  const cats = rdCats();
  const hist = rdHistoricalRoasByCat();
  const incrByCat = {};
  for (const c of cats) {
    incrByCat[c] = rdCategoryIncremental(c, selectedWeeks(), state.rdMethod);
  }
  // Blended ROAS — used to cap categories with unreliably small spend bases
  const blendSpend = Object.values(hist).reduce((a, b) => a + (b.spend || 0), 0);
  const blendOnline = Object.values(hist).reduce((a, b) => a + (b.online || 0), 0);
  const blendedRoas = blendSpend > 0 ? blendOnline / blendSpend : 1;

  const weights = {};
  for (const c of cats) {
    const rawRoas = hist[c].roas || 0;
    const spend = hist[c].spend || 0;
    // Cap ROAS for categories with tiny historical spend — the ratio is unreliable
    const reliableRoas = spend < 20000 ? Math.min(rawRoas, blendedRoas * 1.5) : rawRoas;
    const lift = incrByCat[c].lift || 0;
    // Spend-weight factor: cats with proven scale (≥ $20K hist spend) get full weight;
    // smaller bases get attenuated (so we don't over-allocate to noise)
    const baseFactor = Math.min(1, spend / 20000);

    if (scenario === 'conservative') {
      // Heavier on proven winners — strong base, high ROAS
      weights[c] = Math.pow(Math.max(0.1, reliableRoas), 2.0) * (0.5 + 0.5 * baseFactor) * (1 + Math.max(0, lift));
    } else if (scenario === 'aggressive') {
      // Lift-weighted with a floor for low-spend tests (capped so they can't dominate)
      const testFloor = baseFactor < 1 ? 1.3 : 1;
      weights[c] = Math.pow(Math.max(0.1, reliableRoas), 1.0) * (1 + Math.max(-0.2, lift) * 2.5) * (0.4 + 0.6 * baseFactor) * testFloor;
    } else { // base
      weights[c] = Math.pow(Math.max(0.1, reliableRoas), 1.4) * (0.4 + 0.6 * baseFactor) * (1 + Math.max(-0.2, lift) * 1.0);
    }
    if (!isFinite(weights[c]) || weights[c] < 0) weights[c] = 0.05;
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const c of cats) out[c] = weights[c] / total;
  return out;
}

function rdProjectOutcome(budget, allocation) {
  const hist = rdHistoricalRoasByCat();
  const cats = rdCats();
  const incrByCat = {};
  for (const c of cats) incrByCat[c] = rdCategoryIncremental(c, selectedWeeks(), state.rdMethod);

  // Cross-cat blended ROAS — used as a sanity ceiling so tiny-base categories don't inflate projections
  const blendSpend = Object.values(hist).reduce((a, b) => a + (b.spend || 0), 0);
  const blendOnline = Object.values(hist).reduce((a, b) => a + (b.online || 0), 0);
  const blendedRoas = blendSpend > 0 ? blendOnline / blendSpend : 1;

  let attributedTotal = 0, incrTotal = 0;
  const perCat = [];
  for (const c of cats) {
    const alloc = allocation[c] || 0;
    const dollars = budget * alloc;
    const histRoas = hist[c].roas || 0;
    const historicalSpend = hist[c].spend || 0;
    const histIncrRoas = incrByCat[c].incrRoas || 0;

    // Cap "sustainable" ROAS at 1.5x the blended rate when the historical spend base
    // is small enough that the ratio is unreliable (< $20K over the window)
    const reliableSpend = Math.max(20000, historicalSpend);
    const sustainableRoas = historicalSpend < 20000
      ? Math.min(histRoas, blendedRoas * 1.5)
      : histRoas;
    const sustainableIncrRoas = historicalSpend < 20000
      ? Math.min(Math.max(0, histIncrRoas), blendedRoas * 0.6)
      : Math.max(0, histIncrRoas);

    // Diminishing returns: marginal ROAS decays as spend exceeds historical base
    // ratio=1 → no decay; ratio=2 → 0.71x; ratio=10 → 0.22x
    const ratio = dollars / Math.max(5000, reliableSpend);
    const decay = ratio <= 1 ? 1 : 1 / (1 + (ratio - 1) * 0.45);

    const projRoas = sustainableRoas * decay;
    const projIncrRoas = sustainableIncrRoas * decay;
    const attributed = dollars * projRoas;
    const incremental = dollars * projIncrRoas;
    attributedTotal += attributed;
    incrTotal += incremental;
    perCat.push({ cat: c, dollars, alloc, projRoas, attributed, incremental, projIncrRoas });
  }
  return {
    budget,
    attributedTotal,
    incrTotal,
    roas: budget > 0 ? attributedTotal / budget : 0,
    perCat,
  };
}

// ---------- DOWNLOAD HELPERS ----------
function rdDownloadTable(tableId, filename) {
  const tbl = document.getElementById(tableId);
  if (!tbl) return;
  const rows = [];
  for (const tr of tbl.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.querySelectorAll('th,td')) {
      let txt = cell.textContent.trim().replace(/\s+/g, ' ');
      if (txt.includes(',') || txt.includes('"')) txt = '"' + txt.replace(/"/g, '""') + '"';
      cells.push(txt);
    }
    rows.push(cells.join(','));
  }
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.rdDownloadTable = rdDownloadTable;

// ---------- METHODOLOGY LABELS ----------
const RD_METHOD_LABELS = {
  trailing4: ['Trailing 4-week average', 'recent momentum baseline'],
  trailing13: ['Trailing 13-week average', 'excludes target week'],
  nonpromo: ['Non-promo, non-supported', 'cleaner causal signal'],
  comparable: ['Comparable categories', 'controls for seasonality'],
};
function rdMethodLabel(m) { const x = RD_METHOD_LABELS[m] || RD_METHOD_LABELS.trailing13; return x[0]; }
function rdMethodHint(m) { const x = RD_METHOD_LABELS[m] || RD_METHOD_LABELS.trailing13; return x[1]; }

// ============================================================
//   RENDERERS — one per tab
// ============================================================

// ---- Tab 1: Executive Overview ----
function rdRenderExec() {
  const w = selectedWeeks(), wp = priorWeeks();
  const cats = rdCats();
  const spend = sumRoundelSpend(w);
  const spendP = sumRoundelSpend(wp);
  const totalSales = sumAllSelected('Sales $ - Total', w);
  const onlineSales = sumOnlineSales(w);
  const roas = safeDiv(onlineSales, spend);
  const spendPctSales = totalSales > 0 ? spend / totalSales : null;

  // Total incremental
  let incrTotal = 0, baselineTotal = 0, actualSupported = 0;
  for (const c of cats) {
    const r = rdCategoryIncremental(c, w, state.rdMethod);
    incrTotal += r.incremental;
    baselineTotal += r.baseline;
    actualSupported += r.actual;
  }
  const lift = baselineTotal > 0 ? (actualSupported - baselineTotal) / baselineTotal : null;

  // $PSPW total (avg)
  let pspwSum = 0, pspwN = 0;
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat) || cat === 'Other') continue;
    for (const wk of w) {
      const v = D.itemData[dpci].metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[wk];
      if (typeof v === 'number' && v > 0) { pspwSum += v; pspwN++; }
    }
  }
  const pspw = pspwN > 0 ? pspwSum / pspwN : null;

  document.getElementById('rd-exec-kpis').innerHTML = [
    kpiCard({ label: 'Roundel spend', value: fmt$(spend), delta: safeDiv(spend - spendP, spendP), accent: 'guava' }),
    kpiCard({ label: 'Attributed sales', value: fmt$(onlineSales), accent: 'blueberry', deltaLabel: 'online $ during selected window' }),
    kpiCard({ label: 'ROAS', value: fmtMult(roas), accent: 'prune', deltaLabel: 'attributed ÷ spend' }),
    kpiCard({ label: 'Total Target sales', value: fmt$(totalSales), accent: 'spinach', deltaLabel: 'all selected categories' }),
    kpiCard({ label: 'Incremental $', value: fmt$(incrTotal), accent: 'mango', deltaLabel: rdMethodLabel(state.rdMethod) }),
    kpiCard({ label: 'Spend % of sales', value: fmtPct(spendPctSales), accent: null, deltaLabel: pspw != null ? '$PSPW · ' + fmtPSPW(pspw) : '' }),
  ].join('');

  // Spend × Digital Sales chart (always-on, no toggle)
  rdRenderSpendDigital();

  // Trend chart
  rdRenderExecTrend();

  // Correlation scatter + lag table
  rdRenderCorrelation();

  // Mix donut
  const mixData = cats.map(c => ({ c, v: sumRoundelSpend(w, [c]) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  renderChart('rd-exec-mix', {
    type: 'doughnut',
    data: {
      labels: mixData.map(x => x.c),
      datasets: [{
        data: mixData.map(x => x.v),
        backgroundColor: mixData.map(x => CAT_COLORS[x.c]),
        borderColor: 'white',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt$(ctx.parsed)} (${((ctx.parsed / spend) * 100).toFixed(0)}%)` } },
      },
    },
  });

  // Category performance table
  const catRows = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    let on = 0; for (const wk of w) on += rdOnlineWeek(c, wk);
    const tot = sumMetric(c, 'Sales $ - Total', w);
    const incr = rdCategoryIncremental(c, w, state.rdMethod);
    let p = 0, n = 0;
    for (const dpci in D.itemData) {
      if (skuCategory(dpci) !== c) continue;
      for (const wk of w) {
        const v = D.itemData[dpci].metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[wk];
        if (typeof v === 'number' && v > 0) { p += v; n++; }
      }
    }
    return {
      c, sp, on, tot,
      roas: sp > 0 ? on / sp : null,
      lift: incr.lift,
      pspw: n > 0 ? p / n : null,
    };
  }).sort((a, b) => (b.roas || 0) - (a.roas || 0));

  document.querySelector('#rd-exec-cat-table tbody').innerHTML = catRows.map(r => {
    let verdict = 'Maintain';
    if ((r.roas || 0) >= 2.5 && (r.lift || 0) > 0.05) verdict = 'Scale';
    else if ((r.roas || 0) < 1 && (r.lift || 0) < 0) verdict = 'Fix';
    else if ((r.roas || 0) < 0.5) verdict = 'Pause';
    const liftBar = (r.lift != null) ? `<div class="rd-bar"><div class="rd-bar-fill ${r.lift >= 0 ? 'pos' : 'neg'}" style="width: ${Math.min(100, Math.abs(r.lift) * 100).toFixed(0)}%"></div></div>` : '';
    return `<tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.sp)}</td>
      <td class="table-num">${fmt$(r.on)}</td>
      <td class="table-num">${fmt$(r.tot)}</td>
      <td class="table-num"><b>${fmtMult(r.roas)}</b></td>
      <td class="table-num">${fmtPct(r.lift)}${liftBar}</td>
      <td class="table-num">${fmtPSPW(r.pspw)}</td>
      <td><span class="rd-action rd-action-${verdict.toLowerCase()}">${verdict}</span></td>
    </tr>`;
  }).join('');

  // Wins / risks / actions
  const wins = catRows.filter(r => r.roas >= 2 && r.lift > 0.03).slice(0, 2);
  const risks = catRows.filter(r => r.roas != null && r.roas < 1 && r.sp > 1000).slice(0, 2);
  const actions = [];
  const top = catRows[0];
  const bottom = catRows[catRows.length - 1];
  if (top && top.roas > 2) actions.push({ icon: 'win', title: `Lean into ${top.c}`, body: `${fmtMult(top.roas)} ROAS · ${fmtPct(top.lift)} lift · the clearest scaling case in the window.`, cta: 'Scale' });
  if (bottom && bottom.roas != null && bottom.roas < 1 && bottom.sp > 1000) actions.push({ icon: 'risk', title: `Rework ${bottom.c}`, body: `${fmtMult(bottom.roas)} ROAS on ${fmt$(bottom.sp)} spend · creative, flighting, or product fit needs review.`, cta: 'Fix' });
  for (const w of wins) {
    if (top && w.c === top.c) continue;
    actions.push({ icon: 'win', title: `${w.c} is over-indexing`, body: `Attributed ${fmt$(w.on)} on ${fmt$(w.sp)} · ${fmtMult(w.roas)} ROAS.`, cta: 'Watch' });
    if (actions.length >= 5) break;
  }
  for (const r of risks) {
    if (bottom && r.c === bottom.c) continue;
    actions.push({ icon: 'risk', title: `${r.c} efficiency drag`, body: `${fmtMult(r.roas)} ROAS · ${fmt$(r.sp)} spend with ${fmtPct(r.lift)} lift vs. baseline.`, cta: 'Investigate' });
    if (actions.length >= 5) break;
  }
  if (incrTotal > 0) actions.push({ icon: 'action', title: 'Estimated incremental impact', body: `${fmt$(incrTotal)} of POS sales this window appear above baseline using the ${rdMethodLabel(state.rdMethod).toLowerCase()} — confirm in the Incrementality view.`, cta: 'Open' });
  if (actions.length === 0) actions.push({ icon: 'action', title: 'Run a holdout', body: 'Pick one category and pause Roundel for 4 weeks to confirm the lift signal observed here.', cta: 'Plan' });

  document.getElementById('rd-exec-recos').innerHTML = actions.slice(0, 5).map(a => `
    <div class="rd-reco">
      <div class="rd-reco-icon ${a.icon}">${a.icon === 'win' ? '▲' : a.icon === 'risk' ? '!' : '→'}</div>
      <div>
        <div class="rd-reco-title">${a.title}</div>
        <div class="rd-reco-body">${a.body}</div>
      </div>
      <div class="rd-reco-cta">${a.cta}</div>
    </div>
  `).join('');

  // Hero meta
  document.getElementById('rd-hero-window').textContent = windowLabel();
  document.getElementById('rd-hero-lw').textContent = D.salesDates[D.salesDates.length - 1];
}

// Spend × sales correlation — scatter (lag toggle) + per-cat best-lag Pearson r
function rdRenderCorrelation() {
  const cats = rdCats();
  const all = D.salesDates;
  const winSet = new Set(selectedWeeks());
  const lag = state.rdCorrLag || 0;

  // Build scatter points within selected window — for each cat-week, capture both the
  // no-lag sales (ghost) and the lagged sales (live point) so we can visualize the shift.
  const points = [];      // current (lagged) points
  const ghosts = [];      // no-lag positions (only when lag > 0)
  const movers = [];      // line segments from ghost → live (only when lag > 0)
  for (const cat of cats) {
    const series = catSeries(cat, 'Sales $ - Total');
    for (let i = 0; i < all.length; i++) {
      const d = all[i];
      if (!winSet.has(d)) continue;
      const spend = D.roundelByWeek?.[d]?.[cat];
      if (!(spend > 0)) continue;
      const ti = i + lag;
      if (ti >= all.length) continue;
      const sd = all[ti];
      const sales = series[sd];
      if (typeof sales !== 'number') continue;
      points.push({ x: spend, y: sales, cat, week: d, lagWeek: sd });
      if (lag > 0) {
        const noLagSales = series[d];
        if (typeof noLagSales === 'number') {
          ghosts.push({ x: spend, y: noLagSales, cat, week: d });
          movers.push({ x: spend, y: noLagSales, cat });
          movers.push({ x: spend, y: sales, cat });
          movers.push({ x: NaN, y: NaN }); // break the line between segments
        }
      }
    }
  }
  const datasets = [];
  // Connector lines (ghost → live) — drawn first so dots sit on top
  if (lag > 0) {
    datasets.push({
      type: 'line',
      label: '_movers_',
      data: movers,
      borderColor: 'rgba(20, 20, 20, 0.35)',
      borderWidth: 1,
      borderDash: [3, 3],
      showLine: true,
      pointRadius: 0,
      tension: 0,
      spanGaps: false,
      fill: false,
      order: 3,
    });
  }
  // Ghost dots (no-lag positions) — gray hollow circles
  if (lag > 0) {
    for (const cat of cats) {
      datasets.push({
        type: 'scatter',
        label: '_ghost_' + cat,
        data: ghosts.filter(g => g.cat === cat),
        backgroundColor: 'rgba(255,255,255,0.0)',
        borderColor: CAT_COLORS[cat] + '66',
        borderWidth: 1.5,
        pointStyle: 'circle',
        pointRadius: 4,
        pointHoverRadius: 4,
        order: 2,
      });
    }
  }
  // Live dots (current lag positions)
  for (const cat of cats) {
    datasets.push({
      type: 'scatter',
      label: cat,
      data: points.filter(p => p.cat === cat),
      backgroundColor: CAT_COLORS[cat],
      borderColor: CAT_COLORS[cat],
      pointRadius: 5,
      pointHoverRadius: 7,
      order: 1,
    });
  }
  // Render with animation on lag change so the move is visually obvious
  const existing = state.charts['rd-corr-scatter'];
  if (existing && existing.config.type === 'scatter') {
    existing.data.datasets = datasets;
    existing.options.scales.y.title.text = lag > 0 ? `Sales $ (+${lag}w)` : 'Sales $';
    existing.options.plugins.tooltip.callbacks.label = ctx => {
      const p = ctx.raw;
      if (!p.cat || !p.week) return null;
      return lag > 0
        ? `${p.cat} · ${p.week}: spend ${fmt$(p.x)} → sales ${fmt$(p.y)} (${p.lagWeek}, +${lag}w)`
        : `${p.cat} · ${p.week}: spend ${fmt$(p.x)} → sales ${fmt$(p.y)}`;
    };
    existing.options.plugins.legend.labels.filter = item => !item.text.startsWith('_');
    existing.update('active');
  } else {
    renderChart('rd-corr-scatter', {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 8, filter: item => !item.text.startsWith('_') } },
          tooltip: { callbacks: { label: ctx => {
            const p = ctx.raw;
            if (!p.cat || !p.week) return null;
            return lag > 0
              ? `${p.cat} · ${p.week}: spend ${fmt$(p.x)} → sales ${fmt$(p.y)} (${p.lagWeek}, +${lag}w)`
              : `${p.cat} · ${p.week}: spend ${fmt$(p.x)} → sales ${fmt$(p.y)}`;
          }}},
        },
        scales: {
          x: { type: 'linear', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel spend $', color: '#9AA0A8', font: { size: 10 } } },
          y: { grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: lag > 0 ? `Sales $ (+${lag}w)` : 'Sales $', color: '#9AA0A8', font: { size: 10 } } },
        },
      },
    });
  }

  // Per-cat best-lag table (respects selected window so it updates with time frame changes)
  const winWeeks = selectedWeeks();
  // For lag detection we need a few more weeks of look-forward — pull up to 2 extra weeks past the window end
  const winStart = all.indexOf(winWeeks[0]);
  const winEnd = all.indexOf(winWeeks[winWeeks.length - 1]);
  const lagAll = all.slice(winStart, Math.min(all.length, winEnd + 3));

  const rows = cats.map(cat => {
    const seriesSales = catSeries(cat, 'Sales $ - Total');
    const online = {};
    for (const wk of lagAll) online[wk] = rdOnlineWeek(cat, wk);
    let bestLag = 0, bestR = -2, salesR = null;
    for (const lg of [0, 1, 2]) {
      const xs = [], ys = [];
      // Only iterate weeks within the selected window for the spend side
      for (let i = 0; i + lg < lagAll.length; i++) {
        const wkSpend = lagAll[i];
        if (!winSet.has(wkSpend)) continue;
        const sp = D.roundelByWeek?.[wkSpend]?.[cat];
        const sa = online[lagAll[i + lg]];
        if (typeof sp === 'number' && typeof sa === 'number' && sp > 0 && sa > 0) {
          xs.push(sp); ys.push(sa);
        }
      }
      const r = pearson(xs, ys);
      if (r != null && r > bestR) { bestR = r; bestLag = lg; }
    }
    // Spend × total sales at the current scatter lag (window-filtered)
    {
      const xs = [], ys = [];
      for (let i = 0; i + lag < lagAll.length; i++) {
        const wkSpend = lagAll[i];
        if (!winSet.has(wkSpend)) continue;
        const sp = D.roundelByWeek?.[wkSpend]?.[cat];
        const sa = seriesSales[lagAll[i + lag]];
        if (typeof sp === 'number' && typeof sa === 'number' && sp > 0) {
          xs.push(sp); ys.push(sa);
        }
      }
      salesR = pearson(xs, ys);
    }
    return { cat, bestLag, bestR: bestR === -2 ? null : bestR, salesR };
  });
  rows.sort((a, b) => (b.bestR || -1) - (a.bestR || -1));

  document.getElementById('rd-corr-table').innerHTML = `
    <table class="table" style="font-size: 12px;">
      <thead><tr><th>Cat</th><th class="text-right">Best lag</th><th class="text-right">r (online)</th><th class="text-right">r (sales · current)</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
        <td class="table-num">${r.bestLag === 0 ? 'same wk' : '+' + r.bestLag + 'w'}</td>
        <td class="table-num ${r.bestR != null && r.bestR > 0.3 ? 'status-good' : r.bestR != null && r.bestR < 0 ? 'status-bad' : ''}">${r.bestR != null ? r.bestR.toFixed(2) : '–'}</td>
        <td class="table-num ${r.salesR != null && r.salesR > 0.3 ? 'status-good' : r.salesR != null && r.salesR < 0 ? 'status-bad' : ''}">${r.salesR != null ? r.salesR.toFixed(2) : '–'}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="muted" style="font-size: 11px; margin-top: 8px; line-height: 1.4;">
      ${windowLabel()} · r &gt; 0.3 = meaningful positive correlation. Best lag uses online (attributed) sales; sales column reflects current scatter lag. Look-forward extends up to 2 weeks past window for lag detection.
    </div>
  `;

  // Subtitle stats
  const sub = document.getElementById('rd-corr-sub');
  if (sub) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const overall = pearson(xs, ys);
    const ghostNote = lag > 0 ? ' · ghost rings show original (no-lag) position; dashed lines show how each cat-week moved' : '';
    sub.textContent = `${windowLabel()} · ${points.length} category-weeks · overall r = ${overall != null ? overall.toFixed(2) : '–'}${lag > 0 ? ` · +${lag}w lag applied` : ''}${ghostNote}`;
  }
}

// Always-on Roundel spend × digital sales chart (no toggle, headline view)
function rdRenderSpendDigital() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = rdCats();
  const spendArr = w.map(d => cats.reduce((s, c) => s + rdSpendWeek(c, d), 0));
  const digitalArr = w.map(d => cats.reduce((s, c) => s + rdOnlineWeek(c, d), 0));

  // Subtitle with totals + blended ROAS
  const totSpend = spendArr.reduce((a, b) => a + b, 0);
  const totDigital = digitalArr.reduce((a, b) => a + b, 0);
  const blended = totSpend > 0 ? totDigital / totSpend : null;
  const sub = document.getElementById('rd-spend-digital-sub');
  if (sub) sub.textContent = `${windowLabel()} · ${fmt$(totSpend)} spend → ${fmt$(totDigital)} digital sales · blended ${fmtMult(blended)} ROAS`;

  renderChart('rd-spend-digital', {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Roundel spend',
          data: spendArr,
          backgroundColor: '#141414CC',
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Digital (online) sales',
          data: digitalArr,
          borderColor: '#18A7FF',
          backgroundColor: '#18A7FF22',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: 'y2',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Roundel spend', color: '#9AA0A8', font: { size: 10 } } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, title: { display: true, text: 'Digital sales', color: '#9AA0A8', font: { size: 10 } } },
      },
    },
  });
}

function rdRenderExecTrend() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);
  const cats = rdCats();
  const m = state.rdExecMetric;

  const spendArr = w.map(d => cats.reduce((s, c) => s + rdSpendWeek(c, d), 0));
  const onlineArr = w.map(d => cats.reduce((s, c) => s + rdOnlineWeek(c, d), 0));
  const totalArr = w.map(d => cats.reduce((s, c) => s + (rdCatWeek(c, 'Sales $ - Total', d) || 0), 0));
  const roasArr = w.map((d, i) => spendArr[i] > 0 ? onlineArr[i] / spendArr[i] : null);

  // PSPW: avg across SKUs
  const pspwArr = w.map(d => {
    let s = 0, n = 0;
    for (const dpci in D.itemData) {
      const cat = skuCategory(dpci);
      if (!state.categories.has(cat) || cat === 'Other') continue;
      const v = D.itemData[dpci].metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[d];
      if (typeof v === 'number' && v > 0) { s += v; n++; }
    }
    return n > 0 ? s / n : null;
  });

  let datasets = [];
  if (m === 'spend') datasets = [
    { type: 'bar', label: 'Spend $', data: spendArr, backgroundColor: LS_BLACK + 'CC', borderRadius: 3, yAxisID: 'y' },
    { type: 'line', label: 'ROAS', data: roasArr, borderColor: LS_BLUE, backgroundColor: LS_BLUE + '33', borderWidth: 2.5, fill: false, tension: 0.3, pointRadius: 0, yAxisID: 'y2' },
  ];
  else if (m === 'online') datasets = [
    { type: 'line', label: 'Attributed $', data: onlineArr, borderColor: '#18A7FF', backgroundColor: '#18A7FF22', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0 },
    { type: 'bar', label: 'Spend $', data: spendArr, backgroundColor: '#14141422', borderRadius: 3, yAxisID: 'y2' },
  ];
  else if (m === 'total') datasets = [
    { type: 'line', label: 'Total POS $', data: totalArr, borderColor: '#00CF92', backgroundColor: '#00CF9222', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0 },
    { type: 'bar', label: 'Spend $', data: spendArr, backgroundColor: '#14141422', borderRadius: 3, yAxisID: 'y2' },
  ];
  else if (m === 'roas') datasets = [
    { type: 'line', label: 'ROAS', data: roasArr, borderColor: '#DC7BFF', backgroundColor: '#DC7BFF22', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0 },
  ];
  else if (m === 'pspw') datasets = [
    { type: 'line', label: '$PSPW', data: pspwArr, borderColor: '#FFC711', backgroundColor: '#FFC71133', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0 },
    { type: 'bar', label: 'Spend $', data: spendArr, backgroundColor: '#14141422', borderRadius: 3, yAxisID: 'y2' },
  ];

  const yIsRoas = m === 'roas';
  const yIsPSPW = m === 'pspw';
  renderChart('rd-exec-trend', {
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => {
        const v = ctx.parsed.y;
        if (ctx.dataset.label.includes('ROAS')) return `${ctx.dataset.label}: ${fmtMult(v)}`;
        if (ctx.dataset.label.includes('PSPW')) return `${ctx.dataset.label}: ${fmtPSPW(v)}`;
        return `${ctx.dataset.label}: ${fmt$(v)}`;
      }}}},
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { display: false }, ticks: { callback: v => yIsRoas ? v.toFixed(1) + 'x' : (yIsPSPW ? '$' + v.toFixed(0) : fmt$(v)) } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) }, display: ['spend', 'online', 'total', 'pspw'].includes(m) },
      },
    },
  });
}

// ---- Tab 2: Category Performance ----
function rdRenderCategory() {
  const w = selectedWeeks();
  const cats = rdCats();

  // Big stats
  let totalSupp = 0, totalUnsupp = 0, suppN = 0, unsuppN = 0;
  for (const c of cats) {
    for (const wk of w) {
      const v = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof v !== 'number') continue;
      if (rdIsSupported(c, wk)) { totalSupp += v; suppN++; }
      else { totalUnsupp += v; unsuppN++; }
    }
  }
  const avgSupp = suppN > 0 ? totalSupp / suppN : 0;
  const avgUnsupp = unsuppN > 0 ? totalUnsupp / unsuppN : 0;
  const liftPct = avgUnsupp > 0 ? (avgSupp - avgUnsupp) / avgUnsupp : null;

  // Best/worst category by lift
  const liftRows = cats.map(c => {
    const r = rdCategoryIncremental(c, w, state.rdMethod);
    return { c, ...r };
  }).filter(r => r.spend > 0);
  liftRows.sort((a, b) => (b.lift || 0) - (a.lift || 0));
  const topLift = liftRows[0];

  document.getElementById('rd-cat-bigstats').innerHTML = [
    { l: 'Avg weekly $ · supported', v: fmt$(avgSupp), m: `${suppN} cat-weeks` },
    { l: 'Avg weekly $ · unsupported', v: fmt$(avgUnsupp), m: `${unsuppN} cat-weeks` },
    { l: 'Avg lift · supported vs not', v: fmtPct(liftPct), m: 'directional · pre-causal' },
    { l: 'Top lift category', v: topLift?.c || '—', m: topLift ? `${fmtPct(topLift.lift)} vs baseline` : '' },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // Supported vs unsupported chart
  const labels = cats;
  const suppData = cats.map(c => {
    let s = 0, n = 0;
    for (const wk of w) {
      const v = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof v !== 'number') continue;
      if (rdIsSupported(c, wk)) { s += v; n++; }
    }
    return n > 0 ? s / n : 0;
  });
  const unsuppData = cats.map(c => {
    let s = 0, n = 0;
    for (const wk of w) {
      const v = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof v !== 'number') continue;
      if (!rdIsSupported(c, wk)) { s += v; n++; }
    }
    return n > 0 ? s / n : 0;
  });
  renderChart('rd-cat-supported', {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Supported wks', data: suppData, backgroundColor: LS_BLUE, borderRadius: 4 },
      { label: 'Unsupported wks', data: unsuppData, backgroundColor: '#9AA0A8AA', borderRadius: 4 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)} avg/wk` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });

  // Bubble chart: spend × lift × ROAS
  const bubData = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    let on = 0; for (const wk of w) on += rdOnlineWeek(c, wk);
    const r = rdCategoryIncremental(c, w, state.rdMethod);
    return {
      label: c, x: r.lift != null ? r.lift * 100 : 0, y: sp > 0 ? on / sp : 0,
      r: Math.max(6, Math.min(38, Math.sqrt(sp / 1000) * 2)),
      backgroundColor: CAT_COLORS[c] + 'CC', borderColor: CAT_COLORS[c],
    };
  }).filter(b => b.r > 6);
  renderChart('rd-cat-bubble', {
    type: 'bubble',
    data: { datasets: bubData.map(d => ({ label: d.label, data: [{ x: d.x, y: d.y, r: d.r, _spend: d.r }], backgroundColor: d.backgroundColor, borderColor: d.borderColor })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 8 } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: lift ${ctx.parsed.x.toFixed(1)}% · ROAS ${fmtMult(ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'Lift % vs baseline', color: '#9AA0A8' }, ticks: { callback: v => v + '%' } },
        y: { grid: { display: false }, title: { display: true, text: 'ROAS', color: '#9AA0A8' }, ticks: { callback: v => v + 'x' } },
      },
    },
  });

  // Scorecard
  const scoreRows = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    let on = 0; for (const wk of w) on += rdOnlineWeek(c, wk);
    const tot = sumMetric(c, 'Sales $ - Total', w);
    const u = sumMetric(c, 'Units - Total', w);
    const incr = rdCategoryIncremental(c, w, state.rdMethod);
    let promoSpend = 0, promoSpendW = 0;
    for (const wk of w) {
      if (rdSpendWeek(c, wk) > 0) {
        promoSpendW += rdSpendWeek(c, wk);
        if (rdIsPromoWeek(c, wk)) promoSpend += rdSpendWeek(c, wk);
      }
    }
    let pspw = 0, pn = 0;
    for (const dpci in D.itemData) {
      if (skuCategory(dpci) !== c) continue;
      for (const wk of w) {
        const v = D.itemData[dpci].metrics['Sales $ - Total per Store Per Week ($PSPW)']?.[wk];
        if (typeof v === 'number' && v > 0) { pspw += v; pn++; }
      }
    }
    return {
      c, sp, on, tot, u, pspw: pn > 0 ? pspw / pn : null,
      roas: sp > 0 ? on / sp : null, ...incr,
      promoOverlap: promoSpendW > 0 ? promoSpend / promoSpendW : 0,
    };
  });
  scoreRows.sort((a, b) => (b.roas || 0) - (a.roas || 0));

  document.querySelector('#rd-cat-scorecard tbody').innerHTML = scoreRows.map(r => {
    let flag = 'Maintain', flagCls = 'maintain';
    if ((r.roas || 0) >= 2 && (r.lift || 0) > 0.03) { flag = 'Efficient'; flagCls = 'scale'; }
    else if ((r.roas || 0) < 0.8) { flag = 'Inefficient'; flagCls = 'pause'; }
    else if ((r.roas || 0) < 1.5) { flag = 'Mixed'; flagCls = 'fix'; }
    // Supply-constrained: high OOS coupled with growing spend?
    let oosCount = 0, oosTotal = 0;
    for (const dpci in D.itemData) {
      if (skuCategory(dpci) !== r.c) continue;
      for (const wk of w) {
        const v = D.itemData[dpci].metrics['Out of Stock %']?.[wk];
        if (typeof v === 'number') { oosTotal++; if (v > 0.15) oosCount++; }
      }
    }
    if (oosTotal > 0 && oosCount / oosTotal > 0.3 && r.sp > 5000) { flag = 'Supply-risk'; flagCls = 'fix'; }
    const conf = rdConfidence(r.supportedWeeks, r.sp);
    // Pearson r between spend and online sales across all 52 weeks (uses live mapping)
    const xs = [], ys = [];
    for (const d of D.salesDates) {
      const sp = D.roundelByWeek?.[d]?.[r.c];
      const online = rdOnlineWeek(r.c, d);
      if (typeof sp === 'number' && online > 0) { xs.push(sp); ys.push(online); }
    }
    const corr = pearson(xs, ys);
    return `<tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.sp)}</td>
      <td class="table-num">${fmt$(r.on)}</td>
      <td class="table-num"><b>${fmtMult(r.roas)}</b></td>
      <td class="table-num">${fmt$(r.tot)}</td>
      <td class="table-num">${fmtNum(r.u)}</td>
      <td class="table-num">${fmtPSPW(r.pspw)}</td>
      <td class="table-num">${fmt$(r.baseline)}</td>
      <td class="table-num ${(r.lift || 0) >= 0 ? 'status-good' : 'status-bad'}">${fmtPct(r.lift)}</td>
      <td class="table-num">${fmtPct(r.promoOverlap)}</td>
      <td class="table-num ${corr != null && corr > 0.3 ? 'status-good' : corr != null && corr < -0.1 ? 'status-bad' : ''}">${corr != null ? corr.toFixed(2) : '–'}</td>
      <td><span class="rd-action rd-action-${flagCls}">${flag}</span></td>
      <td><span class="rd-conf rd-conf-${conf.level}">${conf.label}</span></td>
    </tr>`;
  }).join('');

  // Insights
  const insightArr = [];
  const sortedByLift = [...scoreRows].filter(r => r.spend > 0 && r.lift != null).sort((a, b) => b.lift - a.lift);
  if (sortedByLift[0]) {
    insightArr.push(`<strong>${sortedByLift[0].c}</strong> shows the strongest lift: actuals ran <strong>${fmtPct(sortedByLift[0].lift)}</strong> above baseline during supported weeks (${sortedByLift[0].supportedWeeks} weeks · ${rdMethodLabel(state.rdMethod).toLowerCase()}).`);
  }
  const negs = sortedByLift.filter(r => r.lift < -0.02 && r.sp > 5000);
  if (negs[0]) insightArr.push(`<strong>${negs[0].c}</strong> ran <strong>${fmtPct(negs[0].lift)}</strong> below baseline despite ${fmt$(negs[0].sp)} of spend — investigate creative/flighting or product availability before next flight.`);
  const promoHeavy = scoreRows.filter(r => r.promoOverlap > 0.5 && r.sp > 5000).sort((a, b) => b.promoOverlap - a.promoOverlap);
  if (promoHeavy[0]) insightArr.push(`<strong>${(promoHeavy[0].promoOverlap * 100).toFixed(0)}%</strong> of <strong>${promoHeavy[0].c}</strong> Roundel spend ran during promo weeks — Promo × Media view to isolate true media lift.`);
  const supplyRisk = scoreRows.filter(r => {
    let oosCount = 0, oosTotal = 0;
    for (const dpci in D.itemData) {
      if (skuCategory(dpci) !== r.c) continue;
      for (const wk of w) {
        const v = D.itemData[dpci].metrics['Out of Stock %']?.[wk];
        if (typeof v === 'number') { oosTotal++; if (v > 0.15) oosCount++; }
      }
    }
    return oosTotal > 0 && oosCount / oosTotal > 0.3 && r.sp > 5000;
  });
  if (supplyRisk[0]) insightArr.push(`<strong>${supplyRisk[0].c}</strong> shows >30% OOS rate on supported SKUs — pulling spend until inventory recovers will likely improve effective ROAS.`);

  document.getElementById('rd-cat-insights').innerHTML = insightArr.length
    ? insightArr.map(i => `<div class="insight"><div class="insight-label">Read</div><div class="insight-body">${i}</div></div>`).join('')
    : '<div class="muted" style="font-size: 13px;">Not enough signal in this window to flag clear category-level reads. Widen the window or check a single category.</div>';

  // Update method label
  document.getElementById('rd-method-current-cat').innerHTML = `${rdMethodLabel(state.rdMethod)} <small>${rdMethodHint(state.rdMethod)}</small>`;
  rdSyncMethodButtons('rd-method-cat');
}

// ---- Tab 3: SKU Performance ----
function rdRenderSku() {
  const rows = rdSkuRows();
  // Apply search + filter
  const search = (state.rdSkuSearch || '').toLowerCase();
  let filtered = rows.filter(r => {
    if (state.rdSkuActionFilter !== 'all' && r.action !== state.rdSkuActionFilter) return false;
    if (search && !(r.dpci.includes(search) || r.desc.toLowerCase().includes(search))) return false;
    return true;
  });
  // Sort
  const sk = state.rdSkuSort.key, sd = state.rdSkuSort.dir;
  filtered.sort((a, b) => {
    let av = a[sk], bv = b[sk];
    if (sk === 'desc' || sk === 'cat' || sk === 'action' || sk === 'dpci') {
      av = (av || ''); bv = (bv || '');
      return sd === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    }
    av = typeof av === 'number' ? av : -Infinity;
    bv = typeof bv === 'number' ? bv : -Infinity;
    return sd === 'asc' ? av - bv : bv - av;
  });

  // Big stats
  const totalSpend = filtered.reduce((a, r) => a + (r.spend || 0), 0);
  const totalAttr = filtered.reduce((a, r) => a + (r.attr || 0), 0);
  const counts = { Scale: 0, Maintain: 0, Fix: 0, Pause: 0, Test: 0 };
  for (const r of filtered) counts[r.action] = (counts[r.action] || 0) + 1;
  document.getElementById('rd-sku-bigstats').innerHTML = [
    { l: 'SKUs in view', v: filtered.length, m: 'after filters' },
    { l: 'Spend (allocated)', v: fmt$(totalSpend), m: 'category spend × SKU share' },
    { l: 'Attributed $', v: fmt$(totalAttr), m: totalSpend > 0 ? `${fmtMult(totalAttr/totalSpend)} blended ROAS` : '' },
    { l: 'Scale / Pause', v: `${counts.Scale} / ${counts.Pause}`, m: `Fix ${counts.Fix} · Test ${counts.Test}` },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // Table
  document.querySelector('#rd-sku-table tbody').innerHTML = filtered.slice(0, 500).map(r => {
    const liftCls = (r.lift || 0) >= 0 ? 'status-good' : 'status-bad';
    return `<tr data-dpci="${r.dpci}" style="cursor: pointer;">
      <td class="muted" style="font-size: 11px;">${r.dpci}</td>
      <td class="desc" title="${r.desc}">${r.desc}</td>
      <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
      <td class="table-num">${fmt$(r.spend)}</td>
      <td class="table-num">${fmt$(r.attr)}</td>
      <td class="table-num"><b>${fmtMult(r.roas)}</b></td>
      <td class="table-num">${fmt$(r.pos)}</td>
      <td class="table-num">${fmtNum(r.units)}</td>
      <td class="table-num">${fmtPSPW(r.pspw)}</td>
      <td class="table-num">${fmtPSPW(r.baseline)}</td>
      <td class="table-num ${liftCls}">${fmtPct(r.lift)}</td>
      <td><span class="rd-action rd-action-${r.action.toLowerCase()}">${r.action}</span></td>
    </tr>`;
  }).join('');

  // Row click -> select for trend
  document.querySelectorAll('#rd-sku-table tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      state.rdSkuSelected = tr.dataset.dpci;
      rdRenderSkuTrend();
    });
  });

  // Default selected: top-spend
  if (!state.rdSkuSelected && filtered[0]) state.rdSkuSelected = filtered[0].dpci;
  rdRenderSkuTrend();

  // Verdict mix doughnut
  const verdictCounts = {};
  const verdictSpend = {};
  for (const r of rows) {
    verdictCounts[r.action] = (verdictCounts[r.action] || 0) + 1;
    verdictSpend[r.action] = (verdictSpend[r.action] || 0) + (r.spend || 0);
  }
  const order = ['Scale', 'Maintain', 'Fix', 'Pause', 'Test'];
  const colors = { Scale: '#00CF92', Maintain: '#18A7FF', Fix: '#FFC711', Pause: '#FF8766', Test: '#FF8FF5' };
  renderChart('rd-sku-mix', {
    type: 'doughnut',
    data: {
      labels: order,
      datasets: [{
        data: order.map(o => verdictSpend[o] || 0),
        backgroundColor: order.map(o => colors[o]),
        borderColor: 'white',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt$(ctx.parsed)} · ${verdictCounts[ctx.label] || 0} SKUs` } } },
    },
  });

  document.getElementById('rd-sku-mix-legend').innerHTML = order.map(o => `<span class="rd-action rd-action-${o.toLowerCase()}" style="margin-right: 6px;">${o}</span> <b>${verdictCounts[o] || 0}</b> SKUs · ${fmt$(verdictSpend[o] || 0)} <span style="margin: 0 8px; color: var(--gray-300);">|</span>`).join(' ');
}

function rdRenderSkuTrend() {
  const dpci = state.rdSkuSelected;
  if (!dpci || !D.itemData[dpci]) {
    renderChart('rd-sku-trend', { type: 'line', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
    document.getElementById('rd-sku-trend-sub').textContent = 'Click a row above to plot';
    return;
  }
  const it = D.itemData[dpci];
  const cat = skuCategory(dpci);
  const w = D.salesDates.slice(-26);
  const labels = w.map(shortDate);
  const m = state.rdSkuTrendMetric;
  const key = pillTabFor(m);
  const data = w.map(d => it.metrics[key]?.[d] ?? null);
  const spendArr = w.map(d => rdSpendWeek(cat, d));

  document.getElementById('rd-sku-trend-sub').textContent = `${it.description} · last 26 wks`;

  renderChart('rd-sku-trend', {
    data: {
      labels,
      datasets: [
        { type: 'line', label: metricLabel(m), data, borderColor: CAT_COLORS[cat] || LS_BLUE, backgroundColor: (CAT_COLORS[cat] || LS_BLUE) + '33', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
        { type: 'bar', label: 'Spend $ (cat)', data: spendArr, backgroundColor: '#14141422', borderRadius: 3, yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${metricFmt(m, ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { display: false }, ticks: { callback: v => metricFmt(m, v) } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) } },
      },
    },
  });
}

// ---- Tab 4: Incrementality ----
function rdRenderIncr() {
  const w = selectedWeeks();
  const cats = rdCats();

  // Big stats
  let sp = 0, attr = 0, actual = 0, baseline = 0, suppW = 0;
  const perCat = [];
  for (const c of cats) {
    const r = rdCategoryIncremental(c, w, state.rdMethod);
    sp += r.spend;
    actual += r.actual;
    baseline += r.baseline;
    suppW += r.supportedWeeks;
    let on = 0; for (const wk of w) if (rdSpendWeek(c, wk) > 0) on += rdOnlineWeek(c, wk);
    attr += on;
    perCat.push({ c, ...r, online: on });
  }
  const incremental = actual - baseline;
  const incrRoas = sp > 0 ? incremental / sp : null;
  const conf = rdConfidence(suppW / Math.max(1, cats.length), sp);

  document.getElementById('rd-incr-bigstats').innerHTML = [
    { l: 'Total spend', v: fmt$(sp), m: `${suppW} supported cat-weeks` },
    { l: 'Attributed online $', v: fmt$(attr), m: 'during supported weeks' },
    { l: 'Estimated incremental POS', v: fmt$(incremental), m: rdMethodLabel(state.rdMethod) },
    { l: 'Incremental ROAS', v: fmtMult(incrRoas), m: `<span class="rd-conf rd-conf-${conf.level}">${conf.label} confidence</span>` },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // Warning banner
  const warns = [];
  if (suppW < 4) warns.push(`Only ${suppW} supported cat-weeks in this window — results are directional only.`);
  if (state.rdMethod === 'trailing4' && w.length < 8) warns.push('Trailing-4 baseline + short window = high noise. Try widening or switching to non-promo baseline.');
  document.getElementById('rd-incr-warn').innerHTML = warns.length
    ? warns.map(w => `<div class="rd-warn"><b>Heads up · </b>${w}</div>`).join('')
    : '';

  // Trend: actual vs baseline (summed across cats)
  const labels = w.map(shortDate);
  const actArr = w.map(d => cats.reduce((s, c) => s + (rdCatWeek(c, 'Sales $ - Total', d) || 0), 0));
  const baseArr = w.map(d => {
    let s = 0;
    for (const c of cats) {
      const b = rdBaselineForWeek(c, d, state.rdMethod);
      if (b != null) s += b;
    }
    return s;
  });
  const incrArr = actArr.map((a, i) => Math.max(0, a - baseArr[i]));

  renderChart('rd-incr-trend', {
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Actual POS $', data: actArr, borderColor: LS_BLACK, backgroundColor: 'transparent', borderWidth: 2.5, fill: false, tension: 0.3, pointRadius: 0 },
        { type: 'line', label: 'Baseline', data: baseArr, borderColor: '#9AA0A8', backgroundColor: 'transparent', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 0, borderDash: [5, 4] },
        { type: 'line', label: 'Incremental', data: incrArr.map((v, i) => baseArr[i] + v), borderColor: LS_BLUE, backgroundColor: LS_BLUE + '33', borderWidth: 0, fill: '-1', tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });

  // Per-cat incremental bar
  const perCatSorted = [...perCat].sort((a, b) => b.incremental - a.incremental);
  renderChart('rd-incr-cat', {
    type: 'bar',
    data: {
      labels: perCatSorted.map(p => p.c),
      datasets: [{
        data: perCatSorted.map(p => p.incremental),
        backgroundColor: perCatSorted.map(p => p.incremental >= 0 ? CAT_COLORS[p.c] : '#FF8766'),
        borderRadius: 4,
        datalabels: { display: true, anchor: 'end', align: 'end', offset: 3, color: '#141414', font: { weight: 700, size: 10 }, formatter: v => fmt$(v) },
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 56 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `Incremental: ${fmt$(ctx.parsed.x)}` } } },
      scales: { x: { grid: { display: false }, ticks: { callback: v => fmt$(v) } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
    },
  });

  // Table
  document.querySelector('#rd-incr-table tbody').innerHTML = perCatSorted.map(r => {
    const conf = rdConfidence(r.supportedWeeks, r.spend);
    return `<tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.spend)}</td>
      <td class="table-num">${fmt$(r.online)}</td>
      <td class="table-num">${fmt$(r.actual)}</td>
      <td class="table-num">${fmt$(r.baseline)}</td>
      <td class="table-num ${r.incremental >= 0 ? 'status-good' : 'status-bad'}"><b>${fmt$(r.incremental)}</b></td>
      <td class="table-num">${fmtMult(r.incrRoas)}</td>
      <td class="table-num"><span class="rd-conf rd-conf-${conf.level}">${conf.label}</span></td>
      <td style="font-size: 12px; color: var(--gray-500);">${rdMethodLabel(state.rdMethod)}</td>
    </tr>`;
  }).join('');

  // Methodology notes
  document.getElementById('rd-incr-notes').innerHTML = `
    <div class="insight"><div class="insight-label">Trailing 4w</div><div class="insight-body">Average of the 4 weeks before each supported week. <strong>Best when the brand is stable</strong>; sensitive to recent shocks (promo, OOS, weather). Use for tactical reads.</div></div>
    <div class="insight"><div class="insight-label">Trailing 13w</div><div class="insight-body">Average of the 13 weeks before each supported week. <strong>Smooths out noise</strong> but can over-credit Roundel during periods of overall growth. Default for executive views.</div></div>
    <div class="insight"><div class="insight-label">Non-promo, non-supported</div><div class="insight-body">Average of recent weeks where the category had <em>no Roundel spend AND no promo</em>. <strong>Cleanest causal signal</strong> for media-only impact, but requires enough qualifying weeks.</div></div>
    <div class="insight"><div class="insight-label">Comparable categories</div><div class="insight-body">Uses the current week's average sales of unsupported categories, scaled by the historical ratio. <strong>Controls for seasonality</strong> and market shifts but assumes correlated demand.</div></div>
    <div class="insight" style="background: linear-gradient(135deg, #FFE6DC 0%, #FFFEF8 100%); border-left-color: var(--guava);"><div class="insight-label" style="color: #C44A23;">Important caveat</div><div class="insight-body">All four methods are <strong>quasi-experimental</strong>. They isolate correlation more cleanly than naive ROAS, but only a holdout test (paused spend in a matched market) can prove true incrementality. Treat as decision-grade evidence, not proof.</div></div>
  `;

  // Update method label
  document.getElementById('rd-method-current-incr').innerHTML = `${rdMethodLabel(state.rdMethod)} <small>${rdMethodHint(state.rdMethod)}</small>`;
  rdSyncMethodButtons('rd-method-incr');
}

// ---- Tab 5: Promo × Media ----
function rdRenderPromo() {
  const w = selectedWeeks();
  const cats = rdCats();

  // Promo state buckets per cat-week
  const buckets = { promoOnly: [], mediaOnly: [], both: [], neither: [] };
  for (const c of cats) {
    for (const wk of w) {
      const sales = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof sales !== 'number') continue;
      const sp = rdSpendWeek(c, wk);
      const promo = rdIsPromoWeek(c, wk);
      const supp = sp >= state.rdSupportedThreshold;
      const online = rdOnlineWeek(c, wk);
      const baseline = rdBaselineForWeek(c, wk, state.rdMethod);
      const item = { c, wk, sales, spend: sp, online, baseline, lift: baseline > 0 ? (sales - baseline) / baseline : null };
      if (supp && promo) buckets.both.push(item);
      else if (supp) buckets.mediaOnly.push(item);
      else if (promo) buckets.promoOnly.push(item);
      else buckets.neither.push(item);
    }
  }

  const avg = arr => arr.length ? arr.reduce((a, b) => a + (b.sales || 0), 0) / arr.length : 0;
  const sumSpend = arr => arr.reduce((a, b) => a + (b.spend || 0), 0);
  const sumOnline = arr => arr.reduce((a, b) => a + (b.online || 0), 0);
  const avgLift = arr => {
    const filt = arr.filter(x => typeof x.lift === 'number');
    return filt.length ? filt.reduce((a, b) => a + b.lift, 0) / filt.length : null;
  };

  // Big stats
  document.getElementById('rd-promo-bigstats').innerHTML = [
    { l: 'Promo + Media weeks', v: buckets.both.length, m: `avg sales ${fmt$(avg(buckets.both))}/wk` },
    { l: 'Media only', v: buckets.mediaOnly.length, m: `avg sales ${fmt$(avg(buckets.mediaOnly))}/wk` },
    { l: 'Promo only', v: buckets.promoOnly.length, m: `avg sales ${fmt$(avg(buckets.promoOnly))}/wk` },
    { l: 'Quiet weeks', v: buckets.neither.length, m: `avg sales ${fmt$(avg(buckets.neither))}/wk` },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // ROAS by promo state chart
  const roasData = ['Media only', 'Promo + Media'].map(label => {
    const arr = label === 'Media only' ? buckets.mediaOnly : buckets.both;
    return sumSpend(arr) > 0 ? sumOnline(arr) / sumSpend(arr) : 0;
  });
  renderChart('rd-promo-roas', {
    type: 'bar',
    data: {
      labels: ['Media only', 'Promo + Media'],
      datasets: [{
        data: roasData,
        backgroundColor: [LS_BLUE, '#DC7BFF'],
        borderRadius: 6,
        datalabels: { display: true, anchor: 'end', align: 'end', offset: 3, color: '#141414', font: { weight: 700, size: 12 }, formatter: v => fmtMult(v) },
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMult(ctx.parsed.y) + ' attributed ROAS' } } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { callback: v => v + 'x' } } },
    },
  });

  // Lift chart
  const liftData = ['Media only', 'Promo + Media'].map(label => {
    const arr = label === 'Media only' ? buckets.mediaOnly : buckets.both;
    return (avgLift(arr) || 0) * 100;
  });
  renderChart('rd-promo-lift', {
    type: 'bar',
    data: {
      labels: ['Media only', 'Promo + Media'],
      datasets: [{
        data: liftData,
        backgroundColor: ['#00CF92', '#FFC711'],
        borderRadius: 6,
        datalabels: { display: true, anchor: 'end', align: 'end', offset: 3, color: '#141414', font: { weight: 700, size: 12 }, formatter: v => v.toFixed(1) + '%' },
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + '% avg lift vs. baseline' } } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { callback: v => v + '%' } } },
    },
  });

  // Per-category interaction table
  const tbl = cats.map(c => {
    const promoArr = []; const nonpromoArr = [];
    for (const wk of w) {
      const sales = rdCatWeek(c, 'Sales $ - Total', wk);
      const sp = rdSpendWeek(c, wk);
      if (typeof sales !== 'number' || sp < state.rdSupportedThreshold) continue;
      const online = rdOnlineWeek(c, wk);
      const baseline = rdBaselineForWeek(c, wk, state.rdMethod);
      const item = { sales, spend: sp, online, baseline, lift: baseline > 0 ? (sales - baseline) / baseline : null };
      if (rdIsPromoWeek(c, wk)) promoArr.push(item);
      else nonpromoArr.push(item);
    }
    const promoSpend = sumSpend(promoArr);
    const nonpromoSpend = sumSpend(nonpromoArr);
    const promoOnline = sumOnline(promoArr);
    const nonpromoOnline = sumOnline(nonpromoArr);
    const promoLift = avgLift(promoArr);
    const nonpromoLift = avgLift(nonpromoArr);
    let read = 'Mixed';
    if (promoLift != null && nonpromoLift != null) {
      if (nonpromoLift > 0.05 && nonpromoLift > promoLift * 0.7) read = 'Media works alone';
      else if (promoLift > nonpromoLift + 0.08 && promoSpend > nonpromoSpend) read = 'Promo amplifies';
      else if (promoLift < 0.02 && promoSpend > nonpromoSpend) read = 'Double-counting risk';
    }
    return { c, promoSpend, nonpromoSpend, promoOnline, nonpromoOnline, promoLift, nonpromoLift, read };
  }).filter(r => r.promoSpend + r.nonpromoSpend > 0);
  tbl.sort((a, b) => (b.promoSpend + b.nonpromoSpend) - (a.promoSpend + a.nonpromoSpend));

  document.querySelector('#rd-promo-table tbody').innerHTML = tbl.map(r => {
    const readCls = r.read === 'Media works alone' ? 'scale' : r.read === 'Promo amplifies' ? 'maintain' : r.read === 'Double-counting risk' ? 'pause' : 'fix';
    return `<tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.promoSpend)}</td>
      <td class="table-num">${fmt$(r.nonpromoSpend)}</td>
      <td class="table-num">${fmtMult(r.promoSpend > 0 ? r.promoOnline / r.promoSpend : null)}</td>
      <td class="table-num">${fmtMult(r.nonpromoSpend > 0 ? r.nonpromoOnline / r.nonpromoSpend : null)}</td>
      <td class="table-num ${(r.promoLift || 0) >= 0 ? 'status-good' : 'status-bad'}">${fmtPct(r.promoLift)}</td>
      <td class="table-num ${(r.nonpromoLift || 0) >= 0 ? 'status-good' : 'status-bad'}">${fmtPct(r.nonpromoLift)}</td>
      <td><span class="rd-action rd-action-${readCls}">${r.read}</span></td>
    </tr>`;
  }).join('');

  // Insights
  const insights = [];
  const promoAmplifiers = tbl.filter(r => r.read === 'Promo amplifies');
  const mediaSolo = tbl.filter(r => r.read === 'Media works alone');
  const dblCount = tbl.filter(r => r.read === 'Double-counting risk');
  if (promoAmplifiers[0]) insights.push(`<strong>${promoAmplifiers[0].c}</strong> performs best when Roundel layers with promo — keep flighting in promo windows.`);
  if (mediaSolo[0]) insights.push(`<strong>${mediaSolo[0].c}</strong> shows ${fmtPct(mediaSolo[0].nonpromoLift)} lift in non-promo weeks — Roundel can carry growth without TPC support.`);
  if (dblCount[0]) insights.push(`<strong>${dblCount[0].c}</strong>: most spend ran during promo with weak lift — risk of attributing promo lift to media. Consider a non-promo flight to isolate.`);
  if (buckets.both.length > 0 && buckets.mediaOnly.length > 0) {
    const bothROAS = sumSpend(buckets.both) > 0 ? sumOnline(buckets.both) / sumSpend(buckets.both) : 0;
    const mediaROAS = sumSpend(buckets.mediaOnly) > 0 ? sumOnline(buckets.mediaOnly) / sumSpend(buckets.mediaOnly) : 0;
    if (bothROAS > mediaROAS * 1.3) insights.push(`Roundel + promo wins at the aggregate: <strong>${fmtMult(bothROAS)}</strong> ROAS with promo vs. <strong>${fmtMult(mediaROAS)}</strong> media-only. But this is partly attribution — promo would have driven some of those orders without media.`);
  }
  document.getElementById('rd-promo-insights').innerHTML = insights.length
    ? insights.map(i => `<div class="insight"><div class="insight-label">Read</div><div class="insight-body">${i}</div></div>`).join('')
    : '<div class="muted" style="font-size: 13px;">Not enough overlap between promo and Roundel-supported weeks to call out interaction effects in this window.</div>';
}

// ---- Tab 6: Digital Penetration ----
function rdRenderDigital() {
  const w = selectedWeeks();
  const cats = rdCats();

  // Big stats
  let totSales = 0, totOnline = 0, suppSales = 0, suppOnline = 0, unsuppSales = 0, unsuppOnline = 0;
  for (const c of cats) {
    for (const wk of w) {
      const sales = rdCatWeek(c, 'Sales $ - Total', wk) || 0;
      const online = rdOnlineWeek(c, wk);
      totSales += sales; totOnline += online;
      if (rdIsSupported(c, wk)) { suppSales += sales; suppOnline += online; }
      else { unsuppSales += sales; unsuppOnline += online; }
    }
  }
  const totPen = totSales > 0 ? totOnline / totSales : null;
  const suppPen = suppSales > 0 ? suppOnline / suppSales : null;
  const unsuppPen = unsuppSales > 0 ? unsuppOnline / unsuppSales : null;
  const delta = (suppPen != null && unsuppPen != null) ? suppPen - unsuppPen : null;

  document.getElementById('rd-digital-bigstats').innerHTML = [
    { l: 'Total online %', v: fmtPct(totPen), m: 'all selected weeks' },
    { l: 'Supported weeks · online %', v: fmtPct(suppPen), m: 'Roundel ≥ $250' },
    { l: 'Unsupported · online %', v: fmtPct(unsuppPen), m: 'no Roundel support' },
    { l: 'Δ from Roundel', v: delta != null ? (delta * 100).toFixed(1) + 'pp' : '—', m: delta != null && delta > 0.005 ? 'meaningful digital pull' : 'limited digital pull' },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // Comparison chart
  const labels = cats;
  const suppPenArr = cats.map(c => {
    let s = 0, o = 0;
    for (const wk of w) {
      if (!rdIsSupported(c, wk)) continue;
      const v = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof v === 'number') { s += v; o += rdOnlineWeek(c, wk); }
    }
    return s > 0 ? (o / s) * 100 : null;
  });
  const unsuppPenArr = cats.map(c => {
    let s = 0, o = 0;
    for (const wk of w) {
      if (rdIsSupported(c, wk)) continue;
      const v = rdCatWeek(c, 'Sales $ - Total', wk);
      if (typeof v === 'number') { s += v; o += rdOnlineWeek(c, wk); }
    }
    return s > 0 ? (o / s) * 100 : null;
  });
  renderChart('rd-digital-comp', {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Supported wks', data: suppPenArr, backgroundColor: LS_BLUE, borderRadius: 4 },
      { label: 'Unsupported wks', data: unsuppPenArr, backgroundColor: '#9AA0A8AA', borderRadius: 4 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ctx.parsed.y.toFixed(1) + '%'}` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { callback: v => v + '%' } } },
    },
  });

  // Trend: online % vs spend
  const trendLabels = w.map(shortDate);
  const onlinePct = w.map(d => {
    let s = 0, o = 0;
    for (const c of cats) {
      const sv = rdCatWeek(c, 'Sales $ - Total', d);
      if (typeof sv === 'number') { s += sv; o += rdOnlineWeek(c, d); }
    }
    return s > 0 ? (o / s) * 100 : null;
  });
  const spendArr = w.map(d => cats.reduce((s, c) => s + rdSpendWeek(c, d), 0));
  renderChart('rd-digital-trend', {
    data: {
      labels: trendLabels,
      datasets: [
        { type: 'line', label: 'Online %', data: onlinePct, borderColor: '#18A7FF', backgroundColor: '#18A7FF22', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
        { type: 'bar', label: 'Spend $', data: spendArr, backgroundColor: '#14141422', borderRadius: 3, yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { display: false }, ticks: { callback: v => v + '%' } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt$(v) } },
      },
    },
  });

  // Table
  const tbl = cats.map(c => {
    let sp = 0, online = 0, store = 0;
    let sSupp = 0, oSupp = 0, sUnsupp = 0, oUnsupp = 0;
    for (const wk of w) {
      sp += rdSpendWeek(c, wk);
      const ts = rdCatWeek(c, 'Sales $ - Total', wk) || 0;
      const os = rdOnlineWeek(c, wk);
      online += os; store += (ts - os);
      if (rdIsSupported(c, wk)) { sSupp += ts; oSupp += os; }
      else { sUnsupp += ts; oUnsupp += os; }
    }
    const supPen = sSupp > 0 ? oSupp / sSupp : null;
    const unsupPen = sUnsupp > 0 ? oUnsupp / sUnsupp : null;
    const dPP = (supPen != null && unsupPen != null) ? (supPen - unsupPen) * 100 : null;
    let read = '—';
    if (dPP != null) {
      if (dPP > 1.5) read = 'Drives online discovery';
      else if (dPP < -0.5) read = 'Drives in-store conversion';
      else if (dPP >= -0.5 && dPP <= 1.5) read = 'Both/mixed';
    }
    return { c, sp, online, store, supPen, unsupPen, dPP, read };
  });
  tbl.sort((a, b) => b.sp - a.sp);
  document.querySelector('#rd-digital-table tbody').innerHTML = tbl.map(r => {
    const readCls = r.read === 'Drives online discovery' ? 'scale' : r.read === 'Drives in-store conversion' ? 'maintain' : 'fix';
    return `<tr>
      <td><span class="chip ${categoryClassName(r.c)}">${r.c}</span></td>
      <td class="table-num">${fmt$(r.sp)}</td>
      <td class="table-num">${fmt$(r.online)}</td>
      <td class="table-num">${fmt$(r.store)}</td>
      <td class="table-num">${fmtPct(r.supPen)}</td>
      <td class="table-num">${fmtPct(r.unsupPen)}</td>
      <td class="table-num ${(r.dPP || 0) > 0 ? 'status-good' : (r.dPP || 0) < 0 ? 'status-bad' : ''}">${r.dPP == null ? '—' : (r.dPP > 0 ? '+' : '') + r.dPP.toFixed(1) + 'pp'}</td>
      <td><span class="rd-action rd-action-${readCls}">${r.read}</span></td>
    </tr>`;
  }).join('');

  // SKU-level reads
  const skuRows = rdSkuRows().filter(r => r.spend > 100);
  // Compute online-pen per SKU
  const skuPenRows = skuRows.map(r => {
    const it = D.itemData[r.dpci];
    let sSupp = 0, oSupp = 0, sUnsupp = 0, oUnsupp = 0;
    for (const wk of w) {
      const sales = it.metrics['Sales $ - Total']?.[wk];
      if (typeof sales !== 'number') continue;
      const pen = it.metrics['Sales $ - Online Orig Penetration']?.[wk] || 0;
      const online = sales * pen;
      if (rdIsSupported(r.cat, wk)) { sSupp += sales; oSupp += online; }
      else { sUnsupp += sales; oUnsupp += online; }
    }
    const supPen = sSupp > 0 ? oSupp / sSupp : null;
    const unsupPen = sUnsupp > 0 ? oUnsupp / sUnsupp : null;
    const dPP = (supPen != null && unsupPen != null) ? (supPen - unsupPen) * 100 : null;
    return { ...r, supPen, unsupPen, dPP };
  }).filter(r => r.dPP != null).sort((a, b) => b.dPP - a.dPP).slice(0, 8);

  document.getElementById('rd-digital-skus').innerHTML = skuPenRows.length
    ? `<table class="table" style="margin-top: 8px;">
        <thead><tr><th>SKU</th><th>Category</th><th class="text-right">Spend</th><th class="text-right">Online % · supp.</th><th class="text-right">Online % · unsupp.</th><th class="text-right">Δ pp</th></tr></thead>
        <tbody>${skuPenRows.map(r => `<tr>
          <td>${r.desc}</td>
          <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
          <td class="table-num">${fmt$(r.spend)}</td>
          <td class="table-num">${fmtPct(r.supPen)}</td>
          <td class="table-num">${fmtPct(r.unsupPen)}</td>
          <td class="table-num ${(r.dPP || 0) > 0 ? 'status-good' : 'status-bad'}">${(r.dPP > 0 ? '+' : '') + r.dPP.toFixed(1)}pp</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '<div class="muted" style="font-size: 13px;">Not enough SKU coverage to surface digital reads.</div>';
}

// ---- Tab 7: Budget Simulator ----
function rdRenderBudget() {
  const cats = rdCats();
  const hist = rdHistoricalRoasByCat();

  // Compute scenario projections for each scenario
  const budget = state.rdSimBudget;
  const consAlloc = rdScenarioAllocation('conservative');
  const baseAlloc = rdScenarioAllocation('base');
  const aggrAlloc = rdScenarioAllocation('aggressive');

  const consProj = rdProjectOutcome(budget, consAlloc);
  const baseProj = rdProjectOutcome(budget, baseAlloc);
  const aggrProj = rdProjectOutcome(budget, aggrAlloc);

  document.getElementById('rd-sim-cons-roas').textContent = fmtMult(consProj.roas);
  document.getElementById('rd-sim-base-roas').textContent = fmtMult(baseProj.roas);
  document.getElementById('rd-sim-aggr-roas').textContent = fmtMult(aggrProj.roas);

  // Use the active scenario's allocation, unless user has overridden
  let alloc;
  if (state.rdSimAlloc) {
    alloc = state.rdSimAlloc;
    document.getElementById('rd-sim-alloc-sub').textContent = 'Custom allocation · drag sliders to override';
  } else {
    alloc = state.rdSimScenario === 'conservative' ? consAlloc : state.rdSimScenario === 'aggressive' ? aggrAlloc : baseAlloc;
    document.getElementById('rd-sim-alloc-sub').textContent = `${state.rdSimScenario.charAt(0).toUpperCase() + state.rdSimScenario.slice(1)} allocation · sliders to override`;
  }

  // Sliders
  const sliderHTML = cats.map(c => {
    const pct = (alloc[c] || 0) * 100;
    const dollars = budget * (alloc[c] || 0);
    return `<div class="rd-sim-input">
      <label><span class="chip ${categoryClassName(c)}">${c}</span></label>
      <input type="range" data-cat="${c}" min="0" max="100" step="1" value="${pct.toFixed(0)}" />
      <span class="rd-sim-val">${pct.toFixed(0)}% · ${fmt$(dollars)}</span>
    </div>`;
  }).join('');
  document.getElementById('rd-sim-sliders').innerHTML = sliderHTML;

  // Allocated total
  const totAlloc = Object.values(alloc).reduce((a, b) => a + b, 0);
  document.getElementById('rd-sim-alloc-total').innerHTML = `${fmt$(budget * totAlloc)} · ${(totAlloc * 100).toFixed(0)}%`;

  // Wire sliders
  document.querySelectorAll('#rd-sim-sliders input').forEach(el => {
    el.addEventListener('input', e => {
      const cat = e.target.dataset.cat;
      const newPct = parseFloat(e.target.value) / 100;
      // Build full alloc, normalize others
      const cur = state.rdSimAlloc || alloc;
      const newAlloc = {};
      const otherTotal = Object.entries(cur).filter(([k]) => k !== cat).reduce((a, [, v]) => a + v, 0) || 0.0001;
      const remaining = 1 - newPct;
      for (const c of cats) {
        if (c === cat) newAlloc[c] = newPct;
        else newAlloc[c] = ((cur[c] || 0) / otherTotal) * remaining;
      }
      state.rdSimAlloc = newAlloc;
      rdRenderBudget();
    });
  });

  // Project outcome with current alloc
  const proj = rdProjectOutcome(budget, alloc);
  document.getElementById('rd-sim-outcome').innerHTML = [
    { l: 'Expected attributed $', v: fmt$(proj.attributedTotal), m: `${fmtMult(proj.roas)} ROAS` },
    { l: 'Expected incremental POS', v: fmt$(proj.incrTotal), m: `${budget > 0 ? fmtMult(proj.incrTotal / budget) : '—'} incr ROAS` },
    { l: 'Total retail impact', v: fmt$(proj.attributedTotal + proj.incrTotal * 0.5), m: 'attributed online + ½ × incremental POS' },
    { l: 'Best cat in mix', v: proj.perCat.sort((a, b) => b.attributed - a.attributed)[0]?.cat || '—', m: proj.perCat.sort((a, b) => b.attributed - a.attributed)[0] ? `${fmt$(proj.perCat[0].attributed)} attributed` : '' },
  ].map(s => `<div class="rd-bigstat-item"><div class="rd-bigstat-label">${s.l}</div><div class="rd-bigstat-value">${s.v}</div><div class="rd-bigstat-meta">${s.m}</div></div>`).join('');

  // Stacked bar: dollars by cat with projected attributed and incremental
  const projData = proj.perCat.sort((a, b) => b.dollars - a.dollars);
  renderChart('rd-sim-chart', {
    type: 'bar',
    data: {
      labels: projData.map(p => p.cat),
      datasets: [
        { label: 'Allocated $', data: projData.map(p => p.dollars), backgroundColor: '#9AA0A8AA', borderRadius: 4 },
        { label: 'Expected attributed $', data: projData.map(p => p.attributed), backgroundColor: LS_BLUE, borderRadius: 4 },
        { label: 'Expected incremental POS', data: projData.map(p => p.incremental), backgroundColor: '#FFC711', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { callback: v => fmt$(v) } } },
    },
  });

  document.getElementById('rd-sim-notes').innerHTML = `<div class="muted" style="font-size: 11.5px; line-height: 1.5;">
    Projections use ${rdMethodLabel(state.rdMethod).toLowerCase()} ROAS as the basis. Diminishing-returns curve applied above 1.5× historical spend per category. Treat as a planning aid, not a guarantee.
  </div>`;
}

// ---- Tab 8: Buyer Readout ----
function rdRenderReadout() {
  const w = selectedWeeks();
  const cats = rdCats();
  const spend = sumRoundelSpend(w);
  const onlineSales = sumOnlineSales(w);
  const totalSales = sumAllSelected('Sales $ - Total', w);
  const roas = safeDiv(onlineSales, spend);

  // Top moves
  const catRows = cats.map(c => {
    const sp = sumRoundelSpend(w, [c]);
    let on = 0; for (const wk of w) on += rdOnlineWeek(c, wk);
    const incr = rdCategoryIncremental(c, w, state.rdMethod);
    return { c, sp, on, roas: sp > 0 ? on / sp : null, ...incr };
  });
  catRows.sort((a, b) => (b.roas || 0) - (a.roas || 0));
  const winners = catRows.filter(r => r.roas >= 1.5 && r.lift > 0);
  const losers = catRows.filter(r => r.roas != null && r.roas < 1 && r.spend > 1000);

  // Total incremental
  const incrTotal = catRows.reduce((a, r) => a + r.incremental, 0);

  const lwDate = D.salesDates[D.salesDates.length - 1];
  const winLabel = windowLabel();

  const html = `
    <div class="rd-readout-h">
      <h2>Little Spoon · Roundel Performance Readout</h2>
      <div class="meta">${winLabel} · prepared ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · last data ${lwDate}</div>
    </div>

    <h3>Top-line</h3>
    <p>Across the ${winLabel.toLowerCase()} window, Roundel investment of <strong>${fmt$(spend)}</strong> drove <strong>${fmt$(onlineSales)}</strong> in attributed online sales — a blended <strong>${fmtMult(roas)} ROAS</strong>. Estimated incremental POS impact above baseline: <strong>${fmt$(incrTotal)}</strong> (${rdMethodLabel(state.rdMethod).toLowerCase()}). Total Target sales across these categories were <strong>${fmt$(totalSales)}</strong>; Roundel represents <strong>${fmtPct(spend / totalSales)}</strong> of revenue.</p>

    <h3>Where it's working</h3>
    ${winners.length ? `<ul>${winners.slice(0, 4).map(r => `<li><strong>${r.c}</strong> — ${fmtMult(r.roas)} ROAS, ${fmtPct(r.lift)} lift vs. baseline. ${r.spend > 30000 ? 'Scale candidate' : 'Worth doubling down on'}.</li>`).join('')}</ul>` : '<p>No category cleared the 1.5× ROAS + positive lift threshold this window. Recommend tighter category-by-category review before next flight.</p>'}

    <h3>Where it's not</h3>
    ${losers.length ? `<ul>${losers.slice(0, 3).map(r => `<li><strong>${r.c}</strong> — ${fmtMult(r.roas)} ROAS on ${fmt$(r.sp)} spend. ${r.lift != null && r.lift < -0.05 ? 'Sales also ran below baseline; investigate creative, flighting, or product availability.' : 'Reallocate or test a different creative mix.'}</li>`).join('')}</ul>` : '<p>No category came in below 1× ROAS — encouraging baseline efficiency.</p>'}

    <h3>Recommended next steps</h3>
    <ul>
      ${winners[0] ? `<li><strong>Lean into ${winners[0].c}.</strong> Increase share of next flight by 20–30% and protect inventory ahead of the campaign.</li>` : ''}
      ${losers[0] ? `<li><strong>Pause or rework ${losers[0].c}.</strong> Hold spend until creative refresh or until OOS recovers.</li>` : ''}
      <li><strong>Run a holdout</strong> on one mid-volume category for the next 4-week flight to confirm the lift signal in this readout.</li>
      <li><strong>Re-balance to incrementality.</strong> Use the Budget Simulator (Base scenario) to allocate the next ${fmt$(spend)}: projected ${fmtMult(rdProjectOutcome(spend, rdScenarioAllocation('base')).roas)} ROAS.</li>
    </ul>

    <h3>How to read this</h3>
    <p style="font-size: 12px; color: var(--gray-500);">ROAS = attributed online sales ÷ Roundel spend (online drives the attribution; in-store is not credited). Lift estimates use ${rdMethodLabel(state.rdMethod).toLowerCase()} as the no-Roundel baseline and are quasi-experimental — they are decision-grade evidence, not causal proof. Holdout testing is recommended for any major budget shifts.</p>
  `;
  document.getElementById('rd-readout-print').innerHTML = html;
}
function rdRegenerateReadout() { rdRenderReadout(); }
window.rdRegenerateReadout = rdRegenerateReadout;

// ---- Sub-tab navigation ----
function rdSyncMethodButtons(groupId) {
  const grp = document.getElementById(groupId);
  if (!grp) return;
  grp.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.method === state.rdMethod);
  });
}

function rdRender() {
  rdClearCache();
  // Show/hide panels
  document.querySelectorAll('.rd-tab').forEach(t => t.classList.toggle('active', t.dataset.rd === state.rdTab));
  document.querySelectorAll('.rd-panel').forEach(p => p.classList.toggle('active', p.dataset.rdPanel === state.rdTab));

  if (state.rdTab === 'exec') rdRenderExec();
  else if (state.rdTab === 'category') rdRenderCategory();
  else if (state.rdTab === 'sku') rdRenderSku();
  else if (state.rdTab === 'incr') rdRenderIncr();
  else if (state.rdTab === 'promo') rdRenderPromo();
  else if (state.rdTab === 'digital') rdRenderDigital();
  else if (state.rdTab === 'budget') rdRenderBudget();
  else if (state.rdTab === 'readout') rdRenderReadout();
}

// ---------- LEGACY ROUNDEL: replaced by Roundel Intelligence (rdRender) — pearson() preserved for any other callers ----------
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, dx2=0, dy2=0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]-mx, dy = ys[i]-my;
    num += dx*dy; dx2 += dx*dx; dy2 += dy*dy;
  }
  const den = Math.sqrt(dx2*dy2);
  return den ? num/den : null;
}
// ---------- Explorer ----------
function renderExplorer() {
  const w = selectedWeeks();
  const grain = state.explorerGrain;
  const search = state.explorerSearch;
  const head = document.querySelector('#explorer-table thead');
  const body = document.querySelector('#explorer-table tbody');

  if (grain === 'sku') {
    head.innerHTML = `<tr><th>DPCI</th><th>SKU</th><th>Category</th><th class="text-right">Sales $</th><th class="text-right">Units</th><th class="text-right">Promo $</th><th class="text-right">Online %</th><th class="text-right">$ PSPW</th><th class="text-right">OOS %</th></tr>`;
    const rows = buildSKURows().filter(r => !search || r.description.toLowerCase().includes(search) || r.dpci.includes(search));
    body.innerHTML = rows.map(r => `
      <tr>
        <td class="muted" style="font-size: 11px;">${r.dpci}</td>
        <td>${r.description}</td>
        <td><span class="chip ${categoryClassName(r.category)}">${r.category}</span></td>
        <td class="table-num">${fmt$(r.sales)}</td>
        <td class="table-num">${fmtNum(r.units)}</td>
        <td class="table-num">${fmtPct(r.promoPct)}</td>
        <td class="table-num">${fmtPct(r.onlinePen)}</td>
        <td class="table-num">${fmtPSPW(r.velocity)}</td>
        <td class="table-num">${fmtPct(r.oos)}</td>
      </tr>
    `).join('');
  } else if (grain === 'category') {
    head.innerHTML = `<tr><th>Category</th><th class="text-right">Sales $</th><th class="text-right">Online $</th><th class="text-right">Units</th><th class="text-right">Promo $</th><th class="text-right">Online %</th><th class="text-right">Roundel $</th><th class="text-right">ROAS</th></tr>`;
    const rows = activeCats().map(cat => {
      const s = sumMetric(cat, 'Sales $ - Total', w);
      const u = sumMetric(cat, 'Units - Total', w);
      const p = sumMetric(cat, 'Sales $ - Promo', w);
      const sp = sumRoundelSpend(w, [cat]);
      const o = categoryOnlineSales(cat, w);
      return { cat, s, u, p, sp, o, pen: s > 0 ? o / s : null };
    }).filter(r => !search || r.cat.toLowerCase().includes(search));
    rows.sort((a,b)=>b.s-a.s);
    body.innerHTML = rows.map(r => `
      <tr>
        <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
        <td class="table-num">${fmt$(r.s)}</td>
        <td class="table-num">${fmt$(r.o)}</td>
        <td class="table-num">${fmtNum(r.u)}</td>
        <td class="table-num">${fmt$(r.p)}</td>
        <td class="table-num">${fmtPct(r.pen)}</td>
        <td class="table-num">${fmt$(r.sp)}</td>
        <td class="table-num"><b>${r.sp > 0 ? fmtMult(r.o / r.sp) : '–'}</b></td>
      </tr>
    `).join('');
  } else if (grain === 'week') {
    head.innerHTML = `<tr><th>Week</th><th class="text-right">Sales $</th><th class="text-right">Units</th><th class="text-right">Promo $</th><th class="text-right">Online $</th><th class="text-right">Roundel $</th><th class="text-right">ROAS</th></tr>`;
    const rows = D.salesDates.slice(-state.window).map(d => {
      const cats = activeCats();
      const s = cats.reduce((a, c) => a + (catWeekValue(c, 'Sales $ - Total', d) || 0), 0);
      const u = cats.reduce((a, c) => a + (catWeekValue(c, 'Units - Total', d) || 0), 0);
      const p = cats.reduce((a, c) => a + (catWeekValue(c, 'Sales $ - Promo', d) || 0), 0);
      const sp = cats.reduce((a, c) => a + (D.roundelByWeek[d]?.[c] || 0), 0);
      // online: sum item × pen
      let onl = 0;
      for (const dpci in D.itemData) {
        const cat = skuCategory(dpci);
        if (!cats.includes(cat)) continue;
        const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[d];
        const pv = D.itemData[dpci].metrics['Sales $ - Online Orig Penetration']?.[d];
        if (typeof sv === 'number' && typeof pv === 'number') onl += sv * pv;
      }
      return { d, s, u, p, sp, onl };
    }).filter(r => !search || r.d.includes(search));
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.d}</td>
        <td class="table-num">${fmt$(r.s)}</td>
        <td class="table-num">${fmtNum(r.u)}</td>
        <td class="table-num">${fmt$(r.p)}</td>
        <td class="table-num">${fmt$(r.onl)}</td>
        <td class="table-num">${fmt$(r.sp)}</td>
        <td class="table-num">${r.sp > 0 ? fmtMult(r.onl/r.sp) : '–'}</td>
      </tr>
    `).join('');
  }
}

// ---------- Weekly Snapshot ----------
const WEEKLY_PERIODS = [
  { key: 'lw',     n: 1,  label: 'LW' },
  { key: 'lw_prior', n: 1, offset: 1, label: 'Prior LW' },
  { key: 'l4w',    n: 4,  label: 'L4W' },
  { key: 'l13w',   n: 13, label: 'L13W' },
  { key: 'l26w',   n: 26, label: 'L26W' },
  { key: 'l52w',   n: 52, label: 'L52W' },
];
function periodWeeks(p) {
  const all = D.salesDates;
  const offset = p.offset || 0;
  const end = all.length - offset;
  const start = Math.max(0, end - p.n);
  return all.slice(start, end);
}

// Compute one metric on one period for one item, OR aggregated across items
function computeSKUMetric(dpci, weeks, metric) {
  const it = D.itemData[dpci];
  if (!it) return null;
  if (metric === 'sales' || metric === 'units') {
    const key = pillTabFor(metric);
    let s = 0, has = false;
    for (const w of weeks) {
      const v = it.metrics[key]?.[w];
      if (typeof v === 'number') { s += v; has = true; }
    }
    return has ? s : null;
  }
  if (metric === 'velocity') {
    // Average across weeks where data is non-null
    const key = pillTabFor(metric);
    let sum = 0, n = 0;
    for (const w of weeks) {
      const v = it.metrics[key]?.[w];
      if (typeof v === 'number' && v > 0) { sum += v; n++; }
    }
    return n ? sum / n : null;
  }
  if (metric === 'upspw') {
    const key = pillTabFor(metric);
    let sum = 0, n = 0;
    for (const w of weeks) {
      const v = it.metrics[key]?.[w];
      if (typeof v === 'number' && v > 0) { sum += v; n++; }
    }
    return n ? sum / n : null;
  }
  if (metric === 'oos' || metric === 'promoPct' || metric === 'onlinePen') {
    // Sales-weighted avg
    const valKey = pillTabFor(metric);
    const sales = it.metrics['Sales $ - Total'] || {};
    let valSum = 0, wSum = 0;
    for (const w of weeks) {
      const v = it.metrics[valKey]?.[w];
      const sv = sales[w];
      if (typeof v === 'number' && typeof sv === 'number' && sv > 0) {
        valSum += v * sv; wSum += sv;
      } else if (typeof v === 'number' && metric === 'oos') {
        // OOS: simple average if no sales weighting
        valSum += v; wSum += 1;
      }
    }
    return wSum > 0 ? valSum / wSum : null;
  }
  return null;
}
function fmtWeekly(metric, v) {
  if (v == null) return '–';
  if (metric === 'sales') return fmt$(v);
  if (metric === 'velocity') return fmtPSPW(v);
  if (metric === 'units') return fmtNum(v);
  if (metric === 'upspw') return v.toFixed(2);
  if (metric === 'oos' || metric === 'promoPct' || metric === 'onlinePen') return fmtPct(v);
  return fmtNum(v);
}

function renderWeekly() {
  const metric = state.weeklyMetric;
  const search = state.weeklySearch;

  // Update sub
  const periodList = WEEKLY_PERIODS.map(p => p.label).join(', ');
  document.getElementById('weekly-sub').textContent = `${metricLabel(metric)} across ${periodList} · anchored to LW = ${D.salesDates[D.salesDates.length-1]}`;

  // Compute per-SKU rows
  const rows = [];
  for (const dpci in D.itemData) {
    const cat = skuCategory(dpci);
    if (!state.categories.has(cat)) continue;
    const desc = D.itemData[dpci].description;
    if (search && !desc.toLowerCase().includes(search) && !dpci.includes(search)) continue;
    const row = { dpci, description: desc, category: cat };
    for (const p of WEEKLY_PERIODS) {
      row[p.key] = computeSKUMetric(dpci, periodWeeks(p), metric);
    }
    // WoW change
    if (typeof row.lw === 'number' && typeof row.lw_prior === 'number' && row.lw_prior !== 0) {
      row.lw_chg = (row.lw - row.lw_prior) / row.lw_prior;
    } else row.lw_chg = null;
    rows.push(row);
  }

  // Sort
  const k = state.weeklySort.key, dir = state.weeklySort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });

  // Render
  const tbody = document.querySelector('#weekly-table tbody');
  tbody.innerHTML = rows.map(r => {
    const wowCell = r.lw_chg == null ? '–' :
      `<span class="${r.lw_chg >= 0 ? 'status-good' : 'status-bad'}">${r.lw_chg >= 0 ? '+' : ''}${(r.lw_chg*100).toFixed(1)}%</span>`;
    return `
      <tr style="cursor: pointer;" onclick="openSKUDrawer('${r.dpci}')">
        <td>
          <div style="font-weight: 600;">${r.description.replace(/^Little Spoon /, '')}</div>
          <div class="muted" style="font-size: 11px;">${r.dpci}</div>
        </td>
        <td><span class="chip ${categoryClassName(r.category)}">${r.category}</span></td>
        <td class="table-num"><b>${fmtWeekly(metric, r.lw)}</b></td>
        <td class="table-num">${fmtWeekly(metric, r.lw_prior)}</td>
        <td class="table-num">${wowCell}</td>
        <td class="table-num">${fmtWeekly(metric, r.l4w)}</td>
        <td class="table-num">${fmtWeekly(metric, r.l13w)}</td>
        <td class="table-num">${fmtWeekly(metric, r.l26w)}</td>
        <td class="table-num">${fmtWeekly(metric, r.l52w)}</td>
      </tr>`;
  }).join('');

  // Sort headers
  document.querySelectorAll('#weekly-table th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === k) th.classList.add(state.weeklySort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  // Category roll-up — reuse computeSKUMetric per item then aggregate per category and period
  const cats = activeCats();
  const catTbody = document.querySelector('#weekly-cat-table tbody');
  const catRows = cats.map(cat => {
    const row = { cat };
    for (const p of WEEKLY_PERIODS) {
      const wks = periodWeeks(p);
      // Aggregation rule depends on metric:
      if (metric === 'sales' || metric === 'units') {
        let s = 0;
        for (const dpci in D.itemData) {
          if (skuCategory(dpci) !== cat) continue;
          const v = computeSKUMetric(dpci, wks, metric);
          if (typeof v === 'number') s += v;
        }
        row[p.key] = s;
      } else if (metric === 'velocity' || metric === 'upspw') {
        // Aggregate via sum sales / sum stores (true store-weighted)
        let sumS = 0, sumSt = 0;
        for (const dpci in D.itemData) {
          if (skuCategory(dpci) !== cat) continue;
          for (const w of wks) {
            const sv = D.itemData[dpci].metrics[metric === 'velocity' ? 'Sales $ - Total' : 'Units - Total']?.[w];
            const st = D.itemData[dpci].metrics['Stores Tracked']?.[w];
            if (typeof sv === 'number' && typeof st === 'number' && st > 0) { sumS += sv; sumSt += st; }
          }
        }
        row[p.key] = sumSt > 0 ? sumS / sumSt : null;
      } else {
        // %: sales-weighted across SKUs, summed across weeks
        let sumW = 0, sumV = 0;
        const valKey = pillTabFor(metric);
        for (const dpci in D.itemData) {
          if (skuCategory(dpci) !== cat) continue;
          for (const w of wks) {
            const v = D.itemData[dpci].metrics[valKey]?.[w];
            const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[w];
            if (typeof v === 'number' && typeof sv === 'number' && sv > 0) { sumV += v * sv; sumW += sv; }
          }
        }
        row[p.key] = sumW > 0 ? sumV / sumW : null;
      }
    }
    if (typeof row.lw === 'number' && typeof row.lw_prior === 'number' && row.lw_prior !== 0) {
      row.wow = (row.lw - row.lw_prior) / row.lw_prior;
    } else row.wow = null;
    return row;
  }).filter(r => r.l13w != null || r.l52w != null);
  catRows.sort((a, b) => (b.l13w || 0) - (a.l13w || 0));
  catTbody.innerHTML = catRows.map(r => `
    <tr>
      <td><span class="chip ${categoryClassName(r.cat)}">${r.cat}</span></td>
      <td class="table-num">${fmtWeekly(metric, r.lw)}</td>
      <td class="table-num">${fmtWeekly(metric, r.lw_prior)}</td>
      <td class="table-num">${r.wow == null ? '–' : `<span class="${r.wow >= 0 ? 'status-good' : 'status-bad'}">${r.wow>=0?'+':''}${(r.wow*100).toFixed(1)}%</span>`}</td>
      <td class="table-num">${fmtWeekly(metric, r.l4w)}</td>
      <td class="table-num">${fmtWeekly(metric, r.l13w)}</td>
      <td class="table-num">${fmtWeekly(metric, r.l26w)}</td>
      <td class="table-num">${fmtWeekly(metric, r.l52w)}</td>
    </tr>
  `).join('');

  // Total roll-up — show per-period values for "All active categories combined"
  const totals = {};
  for (const p of WEEKLY_PERIODS) {
    if (metric === 'sales' || metric === 'units') {
      totals[p.key] = catRows.reduce((s, r) => s + (typeof r[p.key] === 'number' ? r[p.key] : 0), 0);
    } else {
      // For ratio metrics, recompute weighted across all
      const wks = periodWeeks(p);
      let sumW = 0, sumV = 0;
      const valKey = pillTabFor(metric);
      for (const dpci in D.itemData) {
        const cat = skuCategory(dpci);
        if (!state.categories.has(cat)) continue;
        for (const w of wks) {
          const v = D.itemData[dpci].metrics[valKey]?.[w];
          const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[w];
          if (metric === 'velocity' || metric === 'upspw') {
            // Special: store-weighted
            const st = D.itemData[dpci].metrics['Stores Tracked']?.[w];
            const target = D.itemData[dpci].metrics[metric === 'velocity' ? 'Sales $ - Total' : 'Units - Total']?.[w];
            if (typeof target === 'number' && typeof st === 'number' && st > 0) { sumV += target; sumW += st; }
          } else if (typeof v === 'number' && typeof sv === 'number' && sv > 0) {
            sumV += v * sv; sumW += sv;
          }
        }
      }
      totals[p.key] = sumW > 0 ? sumV / sumW : null;
    }
  }
  const totalTbody = document.querySelector('#weekly-total-table tbody');
  const orderedPeriods = ['lw', 'lw_prior', 'l4w', 'l13w', 'l26w', 'l52w'];
  const periodLabels = { lw: 'Last Week', lw_prior: 'Prior Last Week', l4w: 'Last 4 Weeks', l13w: 'Last 13 Weeks', l26w: 'Last 26 Weeks', l52w: 'Last 52 Weeks' };
  totalTbody.innerHTML = orderedPeriods.map((k, i) => {
    const cur = totals[k];
    let prev = null;
    // For LW vs Prior LW comparison; for L4W vs prior L4W (need a virtual prior L4W)
    if (k === 'lw') prev = totals['lw_prior'];
    else if (k === 'lw_prior') prev = null;
    else {
      // Use virtual prior n weeks
      const cfg = WEEKLY_PERIODS.find(p => p.key === k);
      const wks = D.salesDates.slice(Math.max(0, D.salesDates.length - 2 * cfg.n), D.salesDates.length - cfg.n);
      if (metric === 'sales' || metric === 'units') {
        let s = 0;
        for (const dpci in D.itemData) {
          const cat = skuCategory(dpci);
          if (!state.categories.has(cat)) continue;
          const v = computeSKUMetric(dpci, wks, metric);
          if (typeof v === 'number') s += v;
        }
        prev = s;
      }
    }
    const chg = (typeof cur === 'number' && typeof prev === 'number' && prev !== 0) ? (cur - prev) / prev : null;
    return `<tr>
      <td>${periodLabels[k]}</td>
      <td class="table-num"><b>${fmtWeekly(metric, cur)}</b></td>
      <td class="table-num">${chg == null ? '–' : `<span class="${chg >= 0 ? 'status-good' : 'status-bad'}">${chg>=0?'+':''}${(chg*100).toFixed(1)}%</span>`}</td>
    </tr>`;
  }).join('');
}

// ============================================================
//   Mappings page
// ============================================================
function renderMappings() {
  const search = state.mappingsSearch;
  const tbody = document.querySelector('#mappings-table tbody');
  const cats = D.ROUNDEL_CATS;
  const items = Object.keys(D.itemData).map(dpci => ({
    dpci,
    desc: D.itemData[dpci].description,
    defaultCat: D.skuMap[dpci]?.roundelCategory || 'Other',
    currentCat: skuCategory(dpci),
    overridden: !!SKU_OVERRIDES[dpci],
  })).filter(i => !search || i.desc.toLowerCase().includes(search) || i.dpci.includes(search));
  items.sort((a, b) => (b.overridden - a.overridden) || a.desc.localeCompare(b.desc));
  tbody.innerHTML = items.map(i => {
    const opts = cats.map(c => `<option value="${c}" ${c === i.currentCat ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <tr ${i.overridden ? 'style="background: var(--ls-blue-soft);"' : ''}>
        <td>${i.desc.replace(/^Little Spoon /, '')}</td>
        <td class="muted" style="font-size: 11px;">${i.dpci}</td>
        <td><span class="chip ${categoryClassName(i.defaultCat)}">${i.defaultCat}</span></td>
        <td><select class="mapping-select" data-dpci="${i.dpci}">${opts}</select></td>
        <td>${i.overridden ? `<button class="btn btn-ghost mapping-reset" data-dpci="${i.dpci}" style="font-size: 11px; padding: 4px 8px;">Reset</button>` : ''}</td>
      </tr>`;
  }).join('');
  document.querySelectorAll('.mapping-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const dpci = sel.dataset.dpci;
      const newCat = sel.value;
      if (newCat === (D.skuMap[dpci]?.roundelCategory || 'Other')) clearSkuCategory(dpci);
      else setSkuCategory(dpci, newCat);
      renderMappings();
    });
  });
  document.querySelectorAll('.mapping-reset').forEach(b => {
    b.addEventListener('click', () => {
      clearSkuCategory(b.dataset.dpci);
      renderMappings();
    });
  });
  const overrideCount = Object.keys(SKU_OVERRIDES).length;
  document.getElementById('mappings-count').innerHTML = overrideCount > 0
    ? `<strong>${overrideCount} SKU${overrideCount === 1 ? '' : 's'} overridden</strong> (highlighted in blue)`
    : '<strong>No overrides yet</strong> — all SKUs using default mapping.';
}

// ============================================================
//   Compare module
// ============================================================
const COMPARE_METRICS = [
  { key: 'sales', label: 'Sales $', kind: 'dollar' },
  { key: 'online', label: 'Online $', kind: 'dollar' },
  { key: 'promoSales', label: 'Promo $', kind: 'dollar' },
  { key: 'units', label: 'Units', kind: 'count' },
  { key: 'velocity', label: '$ PSPW', kind: 'dollar' },
  { key: 'upspw', label: 'UPSPW', kind: 'count' },
  { key: 'promoPct', label: 'Promo %', kind: 'pct' },
  { key: 'onlinePen', label: 'Online %', kind: 'pct' },
  { key: 'oos', label: 'OOS %', kind: 'pct' },
  { key: 'price', label: 'Price', kind: 'dollar' },
];
function compareSeriesLabel(target, metric) {
  const m = COMPARE_METRICS.find(x => x.key === metric);
  return `${target} · ${m.label}`;
}
function computeWeekValue(weeks, scope, metric) {
  // scope: { type: 'sku', dpci } | { type: 'category', cat } | { type: 'total' }
  // Returns array of weekly values aligned to weeks[]
  const out = [];
  for (const week of weeks) out.push(_oneWeek(week, scope, metric));
  return out;
}
function _oneWeek(week, scope, metric) {
  if (scope.type === 'sku') {
    const it = D.itemData[scope.dpci];
    if (!it) return null;
    if (metric === 'online') return itemOnlineSales(scope.dpci, week);
    const key = pillTabFor(metric === 'promoSales' ? 'sales' : metric);
    if (metric === 'promoSales') return it.metrics['Sales $ - Promo']?.[week] ?? null;
    return it.metrics[key]?.[week] ?? null;
  }
  if (scope.type === 'category' || scope.type === 'total') {
    const inScope = (dpci) => {
      const cat = skuCategory(dpci);
      if (scope.type === 'total') return state.categories.has(cat);
      return cat === scope.cat;
    };
    if (metric === 'sales' || metric === 'units' || metric === 'promoSales') {
      const key = metric === 'sales' ? 'Sales $ - Total' : metric === 'units' ? 'Units - Total' : 'Sales $ - Promo';
      let s = 0, has = false;
      for (const dpci in D.itemData) {
        if (!inScope(dpci)) continue;
        const v = D.itemData[dpci].metrics[key]?.[week];
        if (typeof v === 'number') { s += v; has = true; }
      }
      return has ? s : null;
    }
    if (metric === 'online') {
      let s = 0, has = false;
      for (const dpci in D.itemData) {
        if (!inScope(dpci)) continue;
        const v = itemOnlineSales(dpci, week);
        if (typeof v === 'number') { s += v; has = true; }
      }
      return has ? s : null;
    }
    if (metric === 'velocity') {
      let sumS = 0, sumSt = 0;
      for (const dpci in D.itemData) {
        if (!inScope(dpci)) continue;
        const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[week];
        const st = D.itemData[dpci].metrics['Stores Tracked']?.[week];
        if (typeof sv === 'number' && typeof st === 'number' && st > 0) { sumS += sv; sumSt += st; }
      }
      return sumSt > 0 ? sumS / sumSt : null;
    }
    if (metric === 'upspw') {
      let sumU = 0, sumSt = 0;
      for (const dpci in D.itemData) {
        if (!inScope(dpci)) continue;
        const u = D.itemData[dpci].metrics['Units - Total']?.[week];
        const st = D.itemData[dpci].metrics['Stores Tracked']?.[week];
        if (typeof u === 'number' && typeof st === 'number' && st > 0) { sumU += u; sumSt += st; }
      }
      return sumSt > 0 ? sumU / sumSt : null;
    }
    if (metric === 'oos' || metric === 'promoPct' || metric === 'onlinePen' || metric === 'price') {
      const key = pillTabFor(metric);
      let sumW = 0, sumV = 0;
      for (const dpci in D.itemData) {
        if (!inScope(dpci)) continue;
        const v = D.itemData[dpci].metrics[key]?.[week];
        const sv = D.itemData[dpci].metrics['Sales $ - Total']?.[week];
        if (typeof v === 'number' && typeof sv === 'number' && sv > 0) {
          sumV += v * sv; sumW += sv;
        }
      }
      return sumW > 0 ? sumV / sumW : null;
    }
  }
  return null;
}

function renderComparePicker() {
  const wrap = document.getElementById('compare-picker');
  if (!wrap) return;
  if (state.compareMode === 'total') {
    wrap.innerHTML = `<div style="padding: 12px; text-align: center;"><label style="font-size: 13px; cursor: pointer;"><input type="checkbox" id="cmp-total-check" ${state.compareSelected.has('total') ? 'checked' : ''} /> Total of active categories</label></div>`;
    document.getElementById('cmp-total-check').addEventListener('change', e => {
      if (e.target.checked) state.compareSelected.add('total');
      else state.compareSelected.delete('total');
      renderCompareChart();
    });
    return;
  }
  if (state.compareMode === 'category') {
    wrap.innerHTML = D.ROUNDEL_CATS.map(c => `<label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'"><input type="checkbox" data-cat="${c}" ${state.compareSelected.has('cat:'+c) ? 'checked' : ''} /><span style="width: 8px; height: 8px; border-radius: 50%; background: ${CAT_COLORS[c]};"></span>${c}</label>`).join('');
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const k = 'cat:' + cb.dataset.cat;
        if (cb.checked) state.compareSelected.add(k); else state.compareSelected.delete(k);
        renderCompareChart();
      });
    });
    return;
  }
  // mode === 'sku'
  const search = state.compareSearch;
  const items = Object.keys(D.itemData)
    .filter(dpci => state.categories.has(skuCategory(dpci)))
    .filter(dpci => !search || D.itemData[dpci].description.toLowerCase().includes(search) || dpci.includes(search))
    .sort((a, b) => D.itemData[a].description.localeCompare(D.itemData[b].description));
  wrap.innerHTML = items.map(dpci => {
    const cat = skuCategory(dpci);
    return `<label style="display: flex; align-items: center; gap: 8px; padding: 4px 6px; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'">
      <input type="checkbox" data-dpci="${dpci}" ${state.compareSelected.has('sku:'+dpci) ? 'checked' : ''} />
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CAT_COLORS[cat]};"></span>
      <span style="font-size: 12.5px; flex: 1;">${D.itemData[dpci].description.replace(/^Little Spoon /, '').slice(0, 50)}</span>
    </label>`;
  }).join('');
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const k = 'sku:' + cb.dataset.dpci;
      if (cb.checked) state.compareSelected.add(k); else state.compareSelected.delete(k);
      renderCompareChart();
    });
  });
}

function renderCompareMetrics() {
  const wrap = document.getElementById('compare-metrics');
  if (!wrap) return;
  wrap.innerHTML = COMPARE_METRICS.map(m => {
    const active = state.compareMetrics.has(m.key);
    return `<span class="pill-cat ${active ? 'active' : ''}" data-metric="${m.key}">${m.label}</span>`;
  }).join('');
  wrap.querySelectorAll('.pill-cat').forEach(p => {
    p.addEventListener('click', () => {
      const k = p.dataset.metric;
      if (state.compareMetrics.has(k)) state.compareMetrics.delete(k);
      else if (state.compareMetrics.size < 4) state.compareMetrics.add(k);
      renderCompareMetrics();
      renderCompareChart();
    });
  });
}

function renderCompareChart() {
  const w = selectedWeeks();
  const labels = w.map(shortDate);

  // Resolve scopes
  const scopes = [];
  for (const sel of state.compareSelected) {
    if (sel === 'total') scopes.push({ type: 'total', label: 'Total' });
    else if (sel.startsWith('cat:')) {
      const cat = sel.slice(4);
      scopes.push({ type: 'category', cat, label: cat });
    } else if (sel.startsWith('sku:')) {
      const dpci = sel.slice(4);
      const desc = D.itemData[dpci]?.description?.replace(/^Little Spoon /, '') || dpci;
      scopes.push({ type: 'sku', dpci, label: desc.slice(0, 32) });
    }
  }

  const metrics = [...state.compareMetrics];

  // Build datasets — one per scope × metric
  const datasets = [];
  // Axis kinds: dollar(left), count(right), pct(far-right)
  const kindsUsed = new Set();
  scopes.forEach((scope, scopeIdx) => {
    metrics.forEach((metric, mIdx) => {
      const m = COMPARE_METRICS.find(x => x.key === metric);
      kindsUsed.add(m.kind);
      const data = computeWeekValue(w, scope, metric);
      const baseColor = scope.type === 'sku'
        ? (CAT_COLORS[skuCategory(scope.dpci)] || '#9AA0A8')
        : scope.type === 'category'
        ? CAT_COLORS[scope.cat]
        : LS_BLUE;
      const dashStyle = mIdx === 0 ? [] : mIdx === 1 ? [4, 3] : mIdx === 2 ? [2, 2] : [6, 3, 2, 3];
      datasets.push({
        label: scope.label + ' · ' + m.label,
        data,
        borderColor: baseColor,
        backgroundColor: baseColor + '22',
        borderWidth: 2,
        borderDash: dashStyle,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y_' + m.kind,
        _kind: m.kind,
        _metric: metric,
      });
    });
  });

  // Build axes config
  const scales = {
    x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
  };
  let nextSide = 'left';
  const axisConfig = [
    { kind: 'dollar', side: 'left' },
    { kind: 'count', side: 'right' },
    { kind: 'pct', side: 'right' },
  ];
  let pctOffset = 0;
  for (const a of axisConfig) {
    if (!kindsUsed.has(a.kind)) continue;
    const id = 'y_' + a.kind;
    scales[id] = {
      position: a.side,
      grid: { display: a.side === 'left' && id === 'y_dollar' },
      ticks: {
        callback: (v) => a.kind === 'dollar' ? fmt$(v) : a.kind === 'pct' ? (v*100).toFixed(0)+'%' : fmtNum(v),
      },
      title: { display: true, text: a.kind === 'dollar' ? '$' : a.kind === 'pct' ? '%' : '#', color: '#9AA0A8', font: { size: 11 } },
    };
    if (a.side === 'right' && a.kind === 'pct') {
      // Offset second right axis
      scales[id].position = 'right';
      scales[id].offset = true;
    }
  }

  renderChart('chart-compare', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const ds = ctx.dataset;
              const val = ctx.parsed.y;
              const m = COMPARE_METRICS.find(x => x.key === ds._metric);
              const fmt = m.kind === 'dollar' ? fmt$(val) : m.kind === 'pct' ? fmtPct(val) : fmtNum(val);
              return ds.label + ': ' + fmt;
            },
          },
        },
      },
      scales,
    },
  });

  // Summary chips
  const sum = document.getElementById('compare-summary');
  if (scopes.length === 0 || metrics.length === 0) {
    sum.innerHTML = '<div class="muted" style="text-align: center; padding: 16px;">Select at least one SKU/Category and one metric to render.</div>';
    return;
  }
  sum.innerHTML = '<div class="grid grid-2" style="gap: 12px;">' + scopes.map(scope => {
    const cards = metrics.map(metric => {
      const data = computeWeekValue(w, scope, metric);
      const m = COMPARE_METRICS.find(x => x.key === metric);
      let val, label;
      if (m.kind === 'pct' || m.key === 'velocity' || m.key === 'upspw' || m.key === 'price') {
        // Average — for pct & store-weighted, average across weeks where non-null
        const vs = data.filter(d => d != null);
        val = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        label = `Avg ${m.label}`;
      } else {
        val = data.reduce((a, b) => a + (b || 0), 0);
        label = `Total ${m.label}`;
      }
      const fmt = m.kind === 'dollar' ? fmt$(val) : m.kind === 'pct' ? fmtPct(val) : fmtNum(val);
      return `<span style="display: inline-block; padding: 4px 8px; background: var(--gray-50); border-radius: 999px; font-size: 11.5px; margin-right: 4px;"><span class="muted">${label}:</span> <b>${fmt}</b></span>`;
    }).join('');
    return `<div style="padding: 12px; background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-md);">
      <div style="font-weight: 700; margin-bottom: 8px; font-size: 13px;">${scope.label}</div>
      <div>${cards}</div>
    </div>`;
  }).join('') + '</div>';
}

function renderCompare() {
  // Re-render picker, metrics, and chart
  renderComparePicker();
  renderCompareMetrics();
  renderCompareChart();
}

function exportWeekly() {
  const tbl = document.getElementById('weekly-table');
  const rows = [...tbl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => `"${(td.innerText || '').replace(/"/g, '""')}"`).join(','));
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `little-spoon-weekly-${state.weeklyMetric}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
window.exportWeekly = exportWeekly;

function exportExplorer() {
  const tbl = document.getElementById('explorer-table');
  const rows = [...tbl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => `"${(td.innerText || '').replace(/"/g, '""')}"`).join(','));
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `little-spoon-export-${state.explorerGrain}-${state.window}w.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function exportCSV() { exportExplorer(); }
window.exportExplorer = exportExplorer;
window.exportCSV = exportCSV;

// ---------- Render Pipeline ----------
function renderChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(el, config);
}

function windowLabel() {
  if (state.window === 'custom') {
    const w = selectedWeeks();
    if (w.length === 0) return 'Custom range';
    return `${w[0]} – ${w[w.length - 1]} (${w.length} wk)`;
  }
  if (state.window === 1) return 'Last week';
  return `Last ${state.window} weeks`;
}
function setSubtitle(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderAll() {
  // Update window-aware subtitles
  setSubtitle('overview-trend-sub', `${windowLabel()} · stacked by category + Roundel overlay`);
  setSubtitle('cat-trend-sub', `${windowLabel()} · click categories above to filter`);

  // Update page title based on state.page
  const titles = {
    sop: ['S&OP Meeting', 'A one-page narrative of the business — open, present, decide'],
    overview: ['Executive Overview', 'Retail performance · Roundel media · Digital penetration'],
    sku: ['SKU Performance', 'Sales, units, velocity + ranking by SKU'],
    category: ['Category Performance', 'Trends, contribution, and Roundel impact by category'],
    promo: ['Promo Analysis', 'Lift, baseline, and pre / during / post effects'],
    digital: ['Digital Penetration', 'Online share + Roundel relationship'],
    roundel: ['Roundel Performance Intelligence', 'An operating system for where Roundel dollars should go next'],
    weekly: ['Weekly Snapshot', 'Every SKU × every time horizon — Excel "Weekly Sales" reimagined'],
    compare: ['Compare', 'Overlay any metrics across any SKUs or categories'],
    mappings: ['SKU Mappings', 'Edit SKU → category — flows through every metric live'],
    sources: ['Data Sources', 'Where every number on this dashboard comes from'],
    explorer: ['Data Explorer', 'Pivot, filter, and export the underlying dataset'],
  };
  const t = titles[state.page];
  if (t) {
    document.getElementById('page-title').textContent = t[0];
    document.getElementById('page-sub').textContent = t[1];
  }

  if (state.page === 'sop') {
    renderSopAll();
  } else if (state.page === 'overview') {
    renderOverviewKPIs();
    renderOverviewTrend();
    renderOverviewMix();
    renderOverviewTop();
    renderRoundelSnapshot();
    renderOverviewInsights();
  } else if (state.page === 'sku') {
    renderSKUKPIs();
    renderSkuPeriodTable();
    renderSKUTrend();
    renderSKUTable();
    renderSKUContrib();
  } else if (state.page === 'category') {
    renderCategoryKPIs();
    renderCategoryTrend();
    renderCategorySpend();
    renderCategoryMulti();
    renderCategoryScorecard();
  } else if (state.page === 'promo') {
    renderPromoKPIs();
    renderPromoStack();
    renderPromoLift();
    renderPromoInteraction();
    renderPromoPDP();
    renderPromoTable();
  } else if (state.page === 'digital') {
    renderDigitalKPIs();
    if (state.digitalPenView === 'enterprise') renderDigitalPenChart();
    else renderDigitalPenByCategory();
    renderDigitalCat();
    renderDigitalSpendByCategory();
    renderDigitalSpend();
    renderDigitalPromo();
    renderDigitalOnlineByCategory();
  } else if (state.page === 'roundel') {
    rdRender();
  } else if (state.page === 'weekly') {
    renderWeekly();
  } else if (state.page === 'compare') {
    renderCompare();
  } else if (state.page === 'graph') {
    renderGraphBuilder();
  } else if (state.page === 'mappings') {
    renderMappings();
  } else if (state.page === 'sources') {
    // static page, no dynamic content
  } else if (state.page === 'explorer') {
    renderExplorer();
  }
}

// ============================================================
//   Client-side rebuild — extract + compute on file upload
//   Mirrors extract.js + compute.js so the dashboard can rebuild
//   from a freshly-uploaded Target xlsx and/or Roundel csv.
// ============================================================
const _CR = {};

_CR.num = function(v) {
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
};

_CR.normalizeDate = function(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${parseInt(m[1])}/${parseInt(m[2])}/${m[3]}`;
};

_CR.mapToRoundelCategory = function(desc) {
  const d = (desc || '').toLowerCase();
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
};

_CR.extractFromXlsx = function(arrayBuffer) {
  if (typeof XLSX === 'undefined') throw new Error('XLSX library not loaded');
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const num = _CR.num;
  const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  function getRows(sheetName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  }

  // Subclass weekly trend
  const subclassRows = getRows('Last 52wks Subclass Trend');
  const subclassDateHeader = subclassRows[5] || [];
  const subclassDates = subclassDateHeader.slice(4).filter(d => d && dateRegex.test(String(d).trim()));
  const subclassData = {};
  for (let i = 6; i < subclassRows.length; i++) {
    const row = subclassRows[i];
    const className = (row[2] || '').toString().trim();
    const metric = (row[3] || '').toString().trim();
    if (!className || !metric) continue;
    if (!subclassData[className]) subclassData[className] = {};
    subclassData[className][metric] = {};
    for (let j = 0; j < subclassDates.length; j++) {
      subclassData[className][metric][subclassDates[j]] = num(row[4 + j]);
    }
  }

  // Item weekly trend
  const itemRows = getRows('Last 52wks Item Trends');
  const itemDateHeader = itemRows[5] || [];
  const itemDates = itemDateHeader.slice(3).filter(d => d && dateRegex.test(String(d).trim()));
  const itemData = {};
  for (let i = 6; i < itemRows.length; i++) {
    const row = itemRows[i];
    const dpci = (row[0] || '').toString().trim();
    const desc = (row[1] || '').toString().trim();
    const metric = (row[2] || '').toString().trim();
    if (!dpci || !metric) continue;
    if (!itemData[dpci]) itemData[dpci] = { description: desc, metrics: {} };
    itemData[dpci].metrics[metric] = {};
    for (let j = 0; j < itemDates.length; j++) {
      itemData[dpci].metrics[metric][itemDates[j]] = num(row[3 + j]);
    }
  }

  // Weekly Sales (item meta + class)
  const weeklyRows = getRows('Weekly Sales');
  const itemMeta = {};
  for (let i = 7; i < weeklyRows.length; i++) {
    const row = weeklyRows[i];
    const dpci = (row[3] || '').toString().trim();
    if (!dpci) continue;
    itemMeta[dpci] = {
      deptId: row[0],
      classId: row[1],
      className: (row[2] || '').toString().trim(),
      description: (row[4] || '').toString().trim(),
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

  // Channel breakout (LW/L4W/L13W)
  const channelRows = getRows('Sales $ Breakout by Channel');
  const channelData = {};
  for (let i = 8; i < channelRows.length; i++) {
    const row = channelRows[i];
    const dpci = (row[3] || '').toString().trim();
    if (!dpci) continue;
    channelData[dpci] = {
      description: (row[4] || '').toString().trim(),
      LW_total: num(row[5]), LW_online: num(row[6]), LW_onlinePen: num(row[7]),
      LW_storePickup: num(row[8]), LW_shipt: num(row[9]), LW_shipFromStore: num(row[10]),
      L4W_total: num(row[11]), L4W_online: num(row[12]), L4W_onlinePen: num(row[13]),
      L4W_storePickup: num(row[14]), L4W_shipt: num(row[15]), L4W_shipFromStore: num(row[16]),
      L13W_total: num(row[17]), L13W_online: num(row[18]), L13W_onlinePen: num(row[19]),
      L13W_storePickup: num(row[20]), L13W_shipt: num(row[21]), L13W_shipFromStore: num(row[22]),
    };
  }

  // Target.com by Week (enterprise online totals)
  const tweekRows = getRows('Target.com by Week');
  const targetWeekly = [];
  for (let i = 7; i < tweekRows.length; i++) {
    const row = tweekRows[i];
    const fw = (row[0] || '').toString().trim();
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

  // Promo Recap weekly
  const promoRows = getRows('Last 52wks Promo Recap');
  const promoData = [];
  for (let i = 7; i < promoRows.length; i++) {
    const row = promoRows[i];
    const wd = _CR.normalizeDate((row[0] || '').toString().trim());
    if (!wd) continue;
    promoData.push({
      weekDate: wd, deptId: row[1], classId: row[2], className: (row[3] || '').toString().trim(),
      baseUnits4W: num(row[4]), baseSales4W: num(row[5]),
      baseUnitsPSPW: num(row[6]), baseSalesPSPW: num(row[7]),
      basePrice: num(row[8]), priceTotal: num(row[9]),
      totalUnits: num(row[10]), promoUnits: num(row[11]),
      baseUnitsLift: num(row[12]), incrementalUnits: num(row[13]),
      UPSPW: num(row[14]),
      sales: num(row[15]), promoSales: num(row[16]),
      baseSalesLift: num(row[17]), incrementalSales: num(row[18]),
      $pspw: num(row[19]), mdD: num(row[20]), oos: num(row[21]),
    });
  }

  // Sales $ by Type (TY vs LY)
  const typeRows = getRows('Sales $ by Type');
  const typeData = {};
  for (let i = 8; i < typeRows.length; i++) {
    const row = typeRows[i];
    const dpci = (row[0] || '').toString().trim();
    if (!dpci) continue;
    typeData[dpci] = {
      description: (row[1] || '').toString().trim(),
      LW: { total: num(row[2]), totalLY: num(row[3]), regular: num(row[5]), regularLY: num(row[6]), promo: num(row[8]), promoLY: num(row[9]), clearance: num(row[11]), clearanceLY: num(row[12]) },
      L4W: { total: num(row[14]), totalLY: num(row[15]), regular: num(row[17]), regularLY: num(row[18]), promo: num(row[20]), promoLY: num(row[21]), clearance: num(row[23]), clearanceLY: num(row[24]) },
      L13W: { total: num(row[26]), totalLY: num(row[27]), regular: num(row[29]), regularLY: num(row[30]), promo: num(row[32]), promoLY: num(row[33]), clearance: num(row[35]), clearanceLY: num(row[36]) },
      L52W: { total: num(row[38]), totalLY: num(row[39]), regular: num(row[41]), regularLY: num(row[42]), promo: num(row[44]), promoLY: num(row[45]), clearance: num(row[47]), clearanceLY: num(row[48]) },
    };
  }

  // Inventory Analysis
  const invRows = getRows('Inventory Analysis');
  const inventoryData = {};
  for (let i = 7; i < invRows.length; i++) {
    const row = invRows[i];
    const dpci = (row[0] || '').toString().trim();
    if (!dpci) continue;
    inventoryData[dpci] = {
      description: (row[1] || '').toString().trim(),
      className: (row[2] || '').toString().trim(),
      oos: num(row[3]), oos1w: num(row[4]), oos2w: num(row[5]),
      oos3w: num(row[6]), oos4w: num(row[7]), oos5w: num(row[8]),
      storesTracked: num(row[9]), base4W: num(row[10]),
      inStoreEOH: num(row[11]), fdcEOH: num(row[12]), rdcEOH: num(row[13]),
      eohOW: num(row[14]), wos: num(row[15]),
      onOrder: num(row[16]), onOrderPastDue: num(row[17]),
      onOrderCurr: num(row[18]), onOrder2W: num(row[19]),
      onOrder3W: num(row[20]), onOrder48W: num(row[21]), onOrder9W: num(row[22]),
    };
  }

  return { subclassDates, subclassData, itemDates, itemData, itemMeta, channelData, targetWeekly, promoData, typeData, inventoryData };
};

_CR.extractFromCsv = function(text) {
  if (typeof XLSX === 'undefined') throw new Error('XLSX library not loaded');
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const header = rows[1] || [];
  const roundelDates = [];
  for (let j = 1; j < header.length; j++) {
    const h = String(header[j] || '').trim();
    const m = h.match(/(\d{2})-(\d{2})-(\d{2})/);
    if (m) {
      roundelDates.push(`${parseInt(m[1])}/${parseInt(m[2])}/20${m[3]}`);
    } else {
      roundelDates.push(null);
    }
  }
  const roundelData = {};
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const cat = String(row[0] || '').trim();
    if (!cat || cat === 'Total') continue;
    roundelData[cat] = {};
    for (let j = 1; j < row.length && j - 1 < roundelDates.length; j++) {
      const d = roundelDates[j - 1];
      if (!d) continue;
      roundelData[cat][d] = _CR.num(row[j]);
    }
  }
  return { roundelDates, roundelData };
};

_CR.alignRoundelToSalesWeek = function(roundelDate, salesDates) {
  const [m, d, y] = roundelDate.split('/').map(Number);
  const rd = new Date(Date.UTC(y, m - 1, d));
  const dow = rd.getUTCDay();
  const daysToSat = (6 - dow + 7) % 7;
  const target = new Date(rd.getTime() + daysToSat * 86400000);
  const targetKey = `${target.getUTCMonth() + 1}/${target.getUTCDate()}/${target.getUTCFullYear()}`;
  if (salesDates.includes(targetKey)) return targetKey;
  let best = null, bestDelta = 999;
  for (const sd of salesDates) {
    const [sm, sdd, sy] = sd.split('/').map(Number);
    const sdate = new Date(Date.UTC(sy, sm - 1, sdd));
    const delta = Math.abs((sdate - rd) / 86400000);
    if (delta < bestDelta) { bestDelta = delta; best = sd; }
  }
  return bestDelta <= 4 ? best : null;
};

_CR.compute = function(data) {
  const ROUNDEL_CATS = ['YOGOS', 'Puffs + Cereals', 'Smoothies', 'Frozen/Meals', 'Baked Bars', 'Fruit+Veggie Minis', 'Other'];
  const salesDates = data.subclassDates || [];
  const roundelToSalesDate = {};
  for (const rd of (data.roundelDates || [])) {
    if (!rd) continue;
    roundelToSalesDate[rd] = _CR.alignRoundelToSalesWeek(rd, salesDates);
  }
  const itemKeys = Object.keys(data.itemData || {});
  const sampleItem = itemKeys.length ? data.itemData[itemKeys[0]] : null;
  const availableMetrics = sampleItem ? Object.keys(sampleItem.metrics) : [];

  const categoryWeekly = {};
  for (const cat of ROUNDEL_CATS) categoryWeekly[cat] = {};
  for (const dpci in (data.itemData || {})) {
    const cat = data.skuMap?.[dpci]?.roundelCategory || 'Other';
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

  const roundelByWeek = {};
  for (const cat in (data.roundelData || {})) {
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

  const categoryChannel = {};
  for (const cat of ROUNDEL_CATS) categoryChannel[cat] = { LW_total: 0, LW_online: 0, L4W_total: 0, L4W_online: 0, L13W_total: 0, L13W_online: 0 };
  for (const dpci in (data.channelData || {})) {
    const cat = data.skuMap?.[dpci]?.roundelCategory || 'Other';
    const c = data.channelData[dpci];
    if (typeof c.LW_total === 'number') categoryChannel[cat].LW_total += c.LW_total;
    if (typeof c.LW_online === 'number') categoryChannel[cat].LW_online += c.LW_online;
    if (typeof c.L4W_total === 'number') categoryChannel[cat].L4W_total += c.L4W_total;
    if (typeof c.L4W_online === 'number') categoryChannel[cat].L4W_online += c.L4W_online;
    if (typeof c.L13W_total === 'number') categoryChannel[cat].L13W_total += c.L13W_total;
    if (typeof c.L13W_online === 'number') categoryChannel[cat].L13W_online += c.L13W_online;
  }
  for (const cat in categoryChannel) {
    const cc = categoryChannel[cat];
    cc.LW_pen = cc.LW_total > 0 ? cc.LW_online / cc.LW_total : null;
    cc.L4W_pen = cc.L4W_total > 0 ? cc.L4W_online / cc.L4W_total : null;
    cc.L13W_pen = cc.L13W_total > 0 ? cc.L13W_online / cc.L13W_total : null;
  }

  return {
    meta: data.meta || {},
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
};

// ---------- File Upload ----------
function initUpload() {
  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-input');
  const status = document.getElementById('upload-status');
  let pendingFiles = [];

  // Show whether we're currently running on a custom dataset
  if (_customData) {
    const meta = _customData.meta || {};
    const src = Array.isArray(meta.uploadedFrom) ? meta.uploadedFrom.join(', ') : '';
    const when = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : '';
    status.innerHTML = `<div class="muted">Currently using uploaded data${src ? ': ' + src : ''}${when ? ' (' + when + ')' : ''}.</div>`;
  }

  fi.addEventListener('change', e => handleFiles([...e.target.files]));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    handleFiles([...e.dataTransfer.files]);
  });

  function handleFiles(files) {
    pendingFiles = files;
    status.innerHTML = files.map(f => `<div>📎 ${f.name} <span class="muted">(${(f.size/1024).toFixed(0)}KB)</span></div>`).join('');
    document.getElementById('apply-upload').disabled = files.length === 0;
  }

  window.applyUploadedData = async function() {
    const btn = document.getElementById('apply-upload');
    btn.disabled = true;
    status.innerHTML += `<div class="muted">Parsing files...</div>`;
    try {
      let xlsxData = null;
      let csvData = null;
      for (const f of pendingFiles) {
        const ext = f.name.toLowerCase().split('.').pop();
        if (ext === 'xlsx') {
          const ab = await f.arrayBuffer();
          xlsxData = _CR.extractFromXlsx(ab);
        } else if (ext === 'csv') {
          const text = await f.text();
          csvData = _CR.extractFromCsv(text);
        }
      }
      if (!xlsxData && !csvData) {
        status.innerHTML += `<div style="color: var(--guava); margin-top: 8px;">No supported files (.xlsx or .csv) detected.</div>`;
        btn.disabled = false;
        return;
      }

      // Merge with existing data so a single-file upload still works.
      const merged = {
        meta: {
          generatedAt: new Date().toISOString(),
          uploadedFrom: pendingFiles.map(f => f.name),
        },
        subclassDates: xlsxData ? xlsxData.subclassDates : D.salesDates,
        subclassData: xlsxData ? xlsxData.subclassData : D.subclassData,
        itemDates: xlsxData ? xlsxData.itemDates : D.itemDates,
        itemData: xlsxData ? xlsxData.itemData : D.itemData,
        itemMeta: xlsxData ? xlsxData.itemMeta : D.itemMeta,
        channelData: xlsxData ? xlsxData.channelData : D.channelData,
        targetWeekly: xlsxData ? xlsxData.targetWeekly : D.targetWeekly,
        promoData: xlsxData ? xlsxData.promoData : D.promoData,
        typeData: xlsxData ? xlsxData.typeData : D.typeData,
        inventoryData: xlsxData ? xlsxData.inventoryData : D.inventoryData,
        roundelDates: csvData ? csvData.roundelDates : D.roundelDates,
        roundelData: csvData ? csvData.roundelData : D.rawRoundelData,
      };
      // Rebuild skuMap from item descriptions
      merged.skuMap = {};
      for (const dpci in (merged.itemData || {})) {
        const desc = merged.itemData[dpci].description;
        merged.skuMap[dpci] = { description: desc, roundelCategory: _CR.mapToRoundelCategory(desc) };
      }

      const unified = _CR.compute(merged);
      try {
        localStorage.setItem(CUSTOM_DATA_LS_KEY, JSON.stringify(unified));
      } catch (e) {
        status.innerHTML += `<div style="color: var(--guava); margin-top: 8px;">Couldn't persist to localStorage (${e.message}). Data is too large or storage is full.</div>`;
        btn.disabled = false;
        return;
      }
      status.innerHTML += `<div style="color: #2c8a4a; margin-top: 8px;">✓ Rebuilt — reloading dashboard...</div>`;
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      status.innerHTML += `<div style="color: var(--guava); margin-top: 8px;">Error: ${e.message}</div>`;
      console.error(e);
      btn.disabled = false;
    }
  };

  window.resetToBundledData = function() {
    if (!_customData) {
      status.innerHTML = `<div class="muted">Already using bundled data.</div>`;
      return;
    }
    if (!confirm('Reset to the bundled (built-in) dataset and discard the uploaded data?')) return;
    clearCustomData();
    location.reload();
  };
}

// ============================================================
//   GRAPH BUILDER · presentation-ready chart studio
// ============================================================
// Builds polished, brand-styled charts from any combination of
// categories / SKUs / metrics / dates. Exports as PNG (transparent
// or white), SVG, or copies to clipboard for direct paste into decks.
// ------------------------------------------------------------

const GB_METRICS = [
  { key: 'sales',     label: 'Sales $',          kind: 'dollar' },
  { key: 'units',     label: 'Units',            kind: 'count' },
  { key: 'velocity',  label: '$PSPW',            kind: 'dollar' },
  { key: 'upspw',     label: 'UPSPW',            kind: 'count' },
  { key: 'online',    label: 'Online $',         kind: 'dollar' },
  { key: 'onlinePen', label: 'Digital %',        kind: 'pct' },
  { key: 'promoSales',label: 'Promo $',          kind: 'dollar' },
  { key: 'promoPct',  label: 'Promo %',          kind: 'pct' },
  { key: 'oos',       label: 'OOS %',            kind: 'pct' },
  { key: 'price',     label: 'Avg price',        kind: 'dollar' },
  { key: 'spend',     label: 'Roundel spend $',  kind: 'dollar' },
  { key: 'roas',      label: 'ROAS (x)',         kind: 'mult' },
];

// Multi-series palette. First few are LS brand colors, in a deck-ready order.
const GB_PALETTE = [
  '#00B5A2', // LS blue (dark) — primary
  '#18A7FF', // Blueberry
  '#FF8766', // Guava
  '#FFC711', // Mango
  '#00CF92', // Spinach
  '#FF8FF5', // Pitaya
  '#DC7BFF', // Prune
  '#C2FF7F', // Lime
  '#141414', // Black
  '#9AA0A8', // Gray
];
function gbPickColor(idx, scope) {
  // For categories, prefer the canonical CAT_COLORS so the brand is consistent
  if (scope?.type === 'category' && CAT_COLORS[scope.cat]) return CAT_COLORS[scope.cat];
  if (scope?.type === 'sku') {
    const c = CAT_COLORS[skuCategory(scope.dpci)];
    if (c) {
      // Slightly modulate brightness so two SKUs in the same cat are distinguishable
      return _shadeHex(c, (idx % 3) * -0.18 + 0.18);
    }
  }
  return GB_PALETTE[idx % GB_PALETTE.length];
}
function _shadeHex(hex, pct) {
  // pct in [-1, 1] — negative darkens, positive lightens
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  const mix = (c) => Math.round((t - c) * p + c);
  const toHex = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return '#' + toHex(mix(r)) + toHex(mix(g)) + toHex(mix(b));
}
function _hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function _isLightHex(hex) {
  // YIQ luminance — returns true for colors that need dark text on top.
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return true;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
// Whole-number formatter shared across data labels, stack totals, axis ticks, and tooltips.
// "No decimals anywhere" — uses K/M/B suffixes with rounded integers for compactness.
function _gbRound(v, kind) {
  if (v == null || isNaN(v)) return '–';
  const abs = Math.abs(v);
  if (kind === 'pct') return Math.round(v * 100) + '%';
  if (kind === 'mult') return Math.round(v) + 'x';
  let body;
  if (abs >= 1e9) body = Math.round(v / 1e9) + 'B';
  else if (abs >= 1e6) body = Math.round(v / 1e6) + 'M';
  else if (abs >= 1e3) body = Math.round(v / 1e3) + 'K';
  else body = Math.round(v).toLocaleString('en-US');
  return kind === 'dollar' ? '$' + body : body;
}

// ---------- Data label legibility ----------
// Smart datalabels config that scales with how many data points are on the chart:
//   ≤14 points: every label
//   15–30:      every other
//   >30:        sparse, ~14 visible
// For stacked bars, segment labels go INSIDE each segment (contrast color),
// and a separate plugin (`_gbStackTotalPlugin`) draws the totals above.
function _gbDatalabelsConfig(g, isStacked) {
  return {
    display: function(ctx) {
      const total = ctx.chart.data.labels.length;
      let step = 1;
      if (total > 30) step = Math.ceil(total / 14);
      else if (total > 14) step = 2;
      if (ctx.dataIndex % step !== 0) return false;
      // For stacked bars, hide segment labels for tiny slivers — keeps the chart legible
      if (isStacked) {
        const v = ctx.dataset.data[ctx.dataIndex];
        if (typeof v !== 'number' || v <= 0) return false;
        let stackTotal = 0;
        for (const ds of ctx.chart.data.datasets) {
          const d = ds.data[ctx.dataIndex];
          if (typeof d === 'number') stackTotal += d;
        }
        if (stackTotal > 0 && v / stackTotal < 0.06) return false;
      }
      return true;
    },
    anchor: isStacked ? 'center' : 'end',
    align: isStacked ? 'center' : 'top',
    color: function(ctx) {
      if (!isStacked) return '#141414';
      // Segment label inside the bar — invert against the segment color.
      const bg = ctx.dataset.backgroundColor;
      const hex = typeof bg === 'string' ? bg : Array.isArray(bg) ? bg[ctx.dataIndex] : '#FFFFFF';
      return _isLightHex(hex) ? '#141414' : '#FFFFFF';
    },
    font: function(ctx) {
      const total = ctx.chart.data.labels.length;
      const size = total > 24 ? 9.5 : total > 14 ? 10.5 : 11.5;
      return { weight: '700', size, family: "'Mulish', sans-serif" };
    },
    padding: { top: 2, bottom: 2, left: 3, right: 3 },
    backgroundColor: null,
    formatter: function(v, ctx) {
      if (v == null || isNaN(v)) return '';
      const m = GB_METRICS.find(x => x.key === ctx.dataset._metric);
      const stackPctActive = g.stackPct && (g.chartType === 'stackedBar' || g.chartType === 'area');
      const kind = stackPctActive ? 'pct' : (m ? m.kind : 'count');
      return _gbRound(v, kind);
    },
  };
}
// Stacked-total plugin: groups bar datasets by `stack` id and draws the per-stack
// total above each x-bucket. Works for pure stacked-bar charts AND combo charts
// where only some metrics are stacked.
function _gbStackTotalPlugin(g) {
  return {
    id: 'gbStackTotal',
    afterDatasetsDraw(chart) {
      const { ctx, scales, data, chartArea } = chart;
      if (!data.datasets.length) return;
      const xScale = scales.x;
      if (!xScale) return;
      const stackPctActive = g.stackPct && g.chartType === 'stackedBar';
      if (stackPctActive) return; // every column would read 100% — skip
      // Group bar datasets by stack id (line datasets are skipped)
      const stacks = new Map();
      for (const ds of data.datasets) {
        if (!ds.stack) continue;
        if (ds.type === 'line') continue;
        if (!stacks.has(ds.stack)) stacks.set(ds.stack, []);
        stacks.get(ds.stack).push(ds);
      }
      if (!stacks.size) return;
      const colCount = data.labels.length;
      const step = colCount > 30 ? Math.ceil(colCount / 14) : colCount > 14 ? 2 : 1;
      ctx.save();
      ctx.font = '800 12px Mulish, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#141414';
      for (const [, dsList] of stacks) {
        const yId = dsList[0].yAxisID;
        const yScale = scales[yId];
        if (!yScale) continue;
        const m = GB_METRICS.find(x => x.key === dsList[0]._metric);
        const kind = m ? m.kind : 'count';
        for (let i = 0; i < colCount; i++) {
          if (i % step !== 0) continue;
          let total = 0, has = false;
          for (const ds of dsList) {
            const v = ds.data[i];
            if (typeof v === 'number') { total += v; has = true; }
          }
          if (!has) continue;
          const label = _gbRound(total, kind);
          const x = xScale.getPixelForValue(i);
          const y = Math.max(chartArea.top + 14, yScale.getPixelForValue(total) - 6);
          ctx.fillText(label, x, y - 1);
        }
      }
      ctx.restore();
    },
  };
}

// ---------- State ----------
state.gb = {
  scope: 'category',           // 'category' | 'sku' | 'mixed'
  selectedCats: new Set(D.ROUNDEL_CATS),
  selectedSkus: new Set(),
  shape: 'time',               // 'time' | 'periods' | 'snapshot'
  chartType: 'line',           // 'line' | 'bar' | 'stackedBar' | 'area' | 'combo'
  metrics: new Set(['sales']),
  windowKey: 'l13w',           // 'lw' | 'l4w' | 'l13w' | 'l26w' | 'l52w' | 'custom'
  customStart: null,
  customEnd: null,
  aggregation: 'weekly',       // 'weekly' | 'monthly' | 't4' | 't13'
  comparePeriods: new Set(['l4w', 'l13w', 'l52w']),
  title: '',
  subtitle: '',
  yLabel: '',
  legendPos: 'bottom',
  showLabels: false,
  smooth: true,
  stackPct: false,
  baseline: false,
  baselineValue: null,
  sortBy: 'value-desc',
  pickerSearch: '',
  bg: 'white',                 // preview background
  size: '16x9',                // 16x9 | 4x3 | 1x1 | wide
  mixed: 'both',               // both | rollup | individual
  // Combo chart per-metric styling: { metricKey: { type: 'bar'|'stackedBar'|'line', axis: 'left'|'right' } }
  // Falls back to gbDefaultComboStyle() when an entry is missing.
  comboMetricStyle: {},
  initialized: false,
};

// Smart default for combo: rate-style metrics (%, x) become lines on the right axis,
// stock-style metrics ($/units) become bars on the left axis. Users can override per-metric.
function gbDefaultComboStyle(metricKey) {
  const m = GB_METRICS.find(x => x.key === metricKey);
  if (!m) return { type: 'bar', axis: 'left' };
  if (m.kind === 'pct' || m.kind === 'mult') return { type: 'line', axis: 'right' };
  return { type: 'bar', axis: 'left' };
}
function gbStyleFor(metricKey) {
  return state.gb.comboMetricStyle[metricKey] || gbDefaultComboStyle(metricKey);
}
function gbHasStackedComboMetric() {
  if (state.gb.chartType !== 'combo') return false;
  for (const m of state.gb.metrics) if (gbStyleFor(m).type === 'stackedBar') return true;
  return false;
}

// ---------- Window resolution ----------
const GB_WINDOWS = { lw: 1, l4w: 4, l13w: 13, l26w: 26, l52w: 52 };
function gbResolveWeeks() {
  const all = D.salesDates;
  const g = state.gb;
  if (g.windowKey === 'custom' && g.customStart != null && g.customEnd != null) {
    const a = Math.min(g.customStart, g.customEnd);
    const b = Math.max(g.customStart, g.customEnd);
    return all.slice(a, b + 1);
  }
  const n = GB_WINDOWS[g.windowKey] || 13;
  return all.slice(-n);
}
function gbWindowLabel() {
  const g = state.gb;
  if (g.windowKey === 'custom') {
    const w = gbResolveWeeks();
    if (!w.length) return 'Custom';
    return `${w[0]} → ${w[w.length - 1]}`;
  }
  if (g.windowKey === 'lw') return 'Last week';
  return 'Last ' + GB_WINDOWS[g.windowKey] + ' weeks';
}

// ---------- Aggregation (weekly / monthly / trailing) ----------
function gbAggregateSeries(weeks, values, agg, metricKind) {
  // weeks[i] is a string like "5/3/2025"; values[i] aligned.
  if (agg === 'weekly') return { labels: weeks.map(shortDate), values };
  if (agg === 'monthly') {
    const buckets = new Map(); // key "5/2025" -> {sum, count, label}
    for (let i = 0; i < weeks.length; i++) {
      const [m, , y] = weeks[i].split('/');
      const key = `${m}/${y}`;
      if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, label: _monthLabel(m, y) });
      const v = values[i];
      if (typeof v === 'number') {
        const b = buckets.get(key);
        b.sum += v; b.count += 1;
      }
    }
    const labels = [], out = [];
    for (const [, b] of buckets) {
      labels.push(b.label);
      // Average for rate-style metrics (pct, velocity, price, ROAS); sum otherwise
      out.push(_isRateKind(metricKind) ? (b.count ? b.sum / b.count : null) : (b.count ? b.sum : null));
    }
    return { labels, values: out };
  }
  if (agg === 't4' || agg === 't13') {
    const win = agg === 't4' ? 4 : 13;
    const out = values.map((_, i) => {
      const start = Math.max(0, i - win + 1);
      const slice = values.slice(start, i + 1).filter(v => typeof v === 'number');
      if (!slice.length) return null;
      return _isRateKind(metricKind) ? slice.reduce((a, b) => a + b, 0) / slice.length : slice.reduce((a, b) => a + b, 0);
    });
    return { labels: weeks.map(shortDate), values: out };
  }
  return { labels: weeks.map(shortDate), values };
}
function _isRateKind(kind) { return kind === 'pct' || kind === 'mult'; }
function _monthLabel(m, y) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(m) - 1] + " '" + String(y).slice(-2);
}

// ---------- Computing values for any (scope × metric × week) ----------
// Reuses computeWeekValue for sku/category/total. Adds 'spend' and 'roas'.
function gbValue(scope, metric, week) {
  if (metric === 'spend') {
    if (scope.type === 'category') {
      return D.roundelByWeek?.[week]?.[scope.cat] ?? null;
    }
    if (scope.type === 'sku') {
      // SKU-level Roundel spend not available — return null (chart will skip)
      return null;
    }
    if (scope.type === 'total') {
      const wk = D.roundelByWeek?.[week];
      if (!wk) return null;
      let s = 0, has = false;
      for (const c of state.gb.selectedCats) {
        const v = wk[c];
        if (typeof v === 'number') { s += v; has = true; }
      }
      return has ? s : null;
    }
  }
  if (metric === 'roas') {
    if (scope.type === 'category') {
      const onl = _oneWeek(week, scope, 'online');
      const sp = D.roundelByWeek?.[week]?.[scope.cat];
      if (typeof onl !== 'number' || typeof sp !== 'number' || sp <= 0) return null;
      return onl / sp;
    }
    if (scope.type === 'sku') {
      // No SKU-level Roundel; skip
      return null;
    }
    if (scope.type === 'total') {
      const wk = D.roundelByWeek?.[week];
      let onlSum = 0, spSum = 0, has = false;
      for (const c of state.gb.selectedCats) {
        const sp = wk?.[c];
        const onl = _oneWeek(week, { type: 'category', cat: c }, 'online');
        if (typeof onl === 'number' && typeof sp === 'number') { onlSum += onl; spSum += sp; has = true; }
      }
      return has && spSum > 0 ? onlSum / spSum : null;
    }
  }
  return _oneWeek(week, scope, metric);
}
function gbWindowAggregate(scope, metric, weeks) {
  // For period-compare and snapshot: collapse weeks to a single number using the
  // metric's natural aggregation (sum for stocks, mean for rates).
  const m = GB_METRICS.find(x => x.key === metric);
  const kind = m ? m.kind : 'count';
  const vals = weeks.map(w => gbValue(scope, metric, w)).filter(v => typeof v === 'number');
  if (!vals.length) return null;
  if (_isRateKind(kind)) return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (metric === 'velocity' || metric === 'upspw' || metric === 'price') {
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return vals.reduce((a, b) => a + b, 0);
}

// ---------- Resolve current scopes (the things being plotted) ----------
function gbScopes() {
  const g = state.gb;
  const scopes = [];
  const includeCats = (g.scope === 'category') || (g.scope === 'mixed' && g.mixed !== 'individual');
  const includeSkus = (g.scope === 'sku') || (g.scope === 'mixed' && g.mixed !== 'rollup');
  if (includeCats) {
    for (const c of g.selectedCats) scopes.push({ type: 'category', cat: c, label: c });
  }
  if (includeSkus) {
    for (const dpci of g.selectedSkus) {
      const desc = D.itemData[dpci]?.description?.replace(/^Little Spoon /, '') || dpci;
      scopes.push({ type: 'sku', dpci, label: desc.slice(0, 40), cat: skuCategory(dpci) });
    }
  }
  return scopes;
}

// ---------- Auto title / source ----------
function gbAutoTitle() {
  const g = state.gb;
  const scopes = gbScopes();
  const metrics = [...g.metrics].map(k => GB_METRICS.find(m => m.key === k)?.label || k);
  if (!scopes.length || !metrics.length) return 'Build your chart';
  const metricStr = metrics.length > 2 ? metrics.slice(0, 2).join(', ') + ' + ' + (metrics.length - 2) + ' more' : metrics.join(' & ');
  if (scopes.length === 1) return `${scopes[0].label} · ${metricStr}`;
  if (scopes.every(s => s.type === 'category')) return `${metricStr} by category`;
  if (scopes.every(s => s.type === 'sku')) return `${metricStr} · ${scopes.length} SKUs`;
  return `${metricStr} · ${scopes.length} items`;
}
function gbAutoSubtitle() {
  const g = state.gb;
  if (g.shape === 'time') {
    const aggLabel = g.aggregation === 'weekly' ? 'weekly' : g.aggregation === 'monthly' ? 'monthly' : g.aggregation === 't4' ? 'trailing 4-week' : 'trailing 13-week';
    return `${gbWindowLabel()} · ${aggLabel}`;
  }
  if (g.shape === 'periods') {
    return `Period comparison · ${[...g.comparePeriods].map(p => p.toUpperCase()).join(' vs. ')}`;
  }
  return `Snapshot · ${gbWindowLabel()}`;
}

// ---------- Build Chart.js config ----------
function gbBuildChartConfig() {
  const g = state.gb;
  const scopes = gbScopes();
  const metrics = [...g.metrics];
  if (!scopes.length || !metrics.length) {
    return null; // empty
  }

  const isStacked = g.chartType === 'stackedBar';
  const isArea = g.chartType === 'area';
  const isCombo = g.chartType === 'combo';
  const baseType = (g.chartType === 'bar' || isStacked || isCombo) ? 'bar' : 'line';

  let labels = [];
  const datasets = [];
  const kindsUsed = new Set();
  const anyMetricForAxis = (m) => GB_METRICS.find(x => x.key === m);

  // ============== TIME SERIES ==============
  if (g.shape === 'time') {
    const weeks = gbResolveWeeks();
    let labelsSet = false;
    scopes.forEach((scope, sIdx) => {
      metrics.forEach((metric, mIdx) => {
        const m = anyMetricForAxis(metric);
        if (!m) return;
        // ---- Per-dataset rendering decisions ----
        // For combo charts, look up the per-metric style; for others, derive from chart type.
        let dsType, dsStack, dsAxis, isLineDataset;
        if (isCombo) {
          const style = gbStyleFor(metric);
          isLineDataset = style.type === 'line';
          dsType = isLineDataset ? 'line' : 'bar';
          dsStack = style.type === 'stackedBar' ? ('stk_' + style.axis) : undefined;
          dsAxis = 'y_combo_' + style.axis;
        } else {
          isLineDataset = baseType === 'line';
          dsAxis = 'y_' + m.kind;
          dsStack = isStacked ? 'stk' : undefined;
          kindsUsed.add(m.kind);
        }
        const rawValues = weeks.map(w => gbValue(scope, metric, w));
        const agg = gbAggregateSeries(weeks, rawValues, g.aggregation, m.kind);
        if (!labelsSet) { labels = agg.labels; labelsSet = true; }
        const color = gbPickColor(sIdx, scope);
        const ds = {
          label: scopes.length === 1 ? m.label : (metrics.length === 1 ? scope.label : `${scope.label} · ${m.label}`),
          data: agg.values,
          backgroundColor: isArea ? _hexToRgba(color, 0.2) : (!isLineDataset ? color : _hexToRgba(color, 0.18)),
          borderColor: color,
          borderWidth: isLineDataset ? 2.4 : (baseType === 'bar' ? 0 : 2),
          tension: g.smooth ? 0.32 : 0,
          pointRadius: isLineDataset ? 0 : 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: 'white',
          pointHoverBorderWidth: 2,
          fill: isArea ? 'origin' : false,
          yAxisID: dsAxis,
          stack: dsStack,
          borderRadius: !isLineDataset && baseType === 'bar' ? 4 : 0,
          // Lines render on top of bars in combo (lower order = drawn first / behind in Chart.js)
          order: isCombo ? (isLineDataset ? 0 : 1) : undefined,
          _kind: m.kind,
          _metric: metric,
          _scope: scope,
        };
        if (dsType) ds.type = dsType;
        datasets.push(ds);
      });
    });
    // Stack-as-percent: convert each bucket to share-of-total
    if ((isStacked || isArea) && g.stackPct) {
      const colCount = labels.length;
      for (let i = 0; i < colCount; i++) {
        let total = 0;
        for (const ds of datasets) {
          const v = ds.data[i];
          if (typeof v === 'number') total += v;
        }
        if (total > 0) {
          for (const ds of datasets) {
            const v = ds.data[i];
            ds.data[i] = typeof v === 'number' ? v / total : null;
          }
        }
      }
      // Force percent axis
      kindsUsed.clear(); kindsUsed.add('pct');
      for (const ds of datasets) { ds._kind = 'pct'; ds.yAxisID = 'y_pct'; }
    }
  }

  // ============== PERIOD COMPARE ==============
  if (g.shape === 'periods') {
    const periods = [...g.comparePeriods];
    labels = periods.map(p => p.toUpperCase());
    const useScopesAsBars = scopes.length > 1;
    if (useScopesAsBars) {
      // x-axis = periods, one dataset per scope (each scope is a series across periods)
      // pick the first selected metric (period compare = single metric)
      const metric = metrics[0];
      const m = anyMetricForAxis(metric);
      kindsUsed.add(m.kind);
      scopes.forEach((scope, sIdx) => {
        const color = gbPickColor(sIdx, scope);
        const data = periods.map(p => {
          const n = GB_WINDOWS[p];
          const wkSlice = D.salesDates.slice(-n);
          return gbWindowAggregate(scope, metric, wkSlice);
        });
        datasets.push({
          type: 'bar',
          label: scope.label,
          data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 0,
          borderRadius: 6,
          yAxisID: 'y_' + m.kind,
          _kind: m.kind,
          _metric: metric,
          _scope: scope,
        });
      });
    } else {
      // Single scope, multiple metrics — one bar per metric per period
      const scope = scopes[0];
      metrics.forEach((metric, mIdx) => {
        const m = anyMetricForAxis(metric);
        kindsUsed.add(m.kind);
        const color = GB_PALETTE[mIdx % GB_PALETTE.length];
        const data = periods.map(p => {
          const n = GB_WINDOWS[p];
          const wkSlice = D.salesDates.slice(-n);
          return gbWindowAggregate(scope, metric, wkSlice);
        });
        datasets.push({
          type: 'bar',
          label: m.label,
          data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 0,
          borderRadius: 6,
          yAxisID: 'y_' + m.kind,
          _kind: m.kind,
          _metric: metric,
          _scope: scope,
        });
      });
    }
  }

  // ============== SNAPSHOT ==============
  if (g.shape === 'snapshot') {
    // x-axis = scopes, one dataset per metric
    let plotScopes = scopes.slice();
    // sort
    if (g.sortBy === 'name') plotScopes.sort((a, b) => a.label.localeCompare(b.label));
    if (g.sortBy === 'category') plotScopes.sort((a, b) => (a.cat || '').localeCompare(b.cat || ''));
    if (g.sortBy === 'value-desc' || g.sortBy === 'value-asc') {
      const weeks = gbResolveWeeks();
      const primary = metrics[0];
      const ranks = plotScopes.map(s => ({ s, v: gbWindowAggregate(s, primary, weeks) ?? -Infinity }));
      ranks.sort((a, b) => g.sortBy === 'value-desc' ? b.v - a.v : a.v - b.v);
      plotScopes = ranks.map(r => r.s);
    }
    labels = plotScopes.map(s => s.label);
    const weeks = gbResolveWeeks();
    metrics.forEach((metric, mIdx) => {
      const m = anyMetricForAxis(metric);
      kindsUsed.add(m.kind);
      const data = plotScopes.map(s => gbWindowAggregate(s, metric, weeks));
      // Color: per-scope coloring when single metric, brand palette when multi-metric
      const colors = plotScopes.map((s, i) => metrics.length === 1 ? gbPickColor(i, s) : GB_PALETTE[mIdx % GB_PALETTE.length]);
      datasets.push({
        type: 'bar',
        label: m.label,
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        yAxisID: 'y_' + m.kind,
        _kind: m.kind,
        _metric: metric,
        _scope: null,
      });
    });
  }

  // -------- Axes --------
  const scales = { x: { grid: { display: false, drawBorder: false }, ticks: { color: '#6E7480', font: { size: 11, weight: '500' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } } };
  if (isCombo) {
    // Two-axis layout. Each side picks its tick formatting from its first metric's kind,
    // and is `stacked` if any metric on that side is configured as a stacked bar.
    const sidesUsed = new Set();
    for (const m of metrics) sidesUsed.add(gbStyleFor(m).axis);
    const sides = ['left', 'right'].filter(s => sidesUsed.has(s));
    sides.forEach((side, i) => {
      const id = 'y_combo_' + side;
      const firstMetric = metrics.find(m => gbStyleFor(m).axis === side);
      const kind = anyMetricForAxis(firstMetric)?.kind || 'count';
      const stacked = metrics.some(m => {
        const s = gbStyleFor(m);
        return s.axis === side && s.type === 'stackedBar';
      });
      scales[id] = {
        position: side,
        stacked,
        beginAtZero: true,
        grid: { display: i === 0, color: '#F1F3F6', drawBorder: false },
        ticks: { color: '#9AA0A8', font: { size: 11 }, callback: (v) => _gbRound(v, kind) },
        title: g.yLabel && i === 0 ? { display: true, text: g.yLabel, color: '#6E7480', font: { size: 11, weight: '700' } } : { display: false },
      };
    });
    // X axis stacks if either side has a stacked bar (so bar widths align)
    if (sides.some(s => scales['y_combo_' + s].stacked)) scales.x.stacked = true;
  } else {
    const axisOrder = [ { kind: 'dollar', side: 'left' }, { kind: 'count', side: 'right' }, { kind: 'pct', side: 'right' }, { kind: 'mult', side: 'right' } ];
    for (const a of axisOrder) {
      if (!kindsUsed.has(a.kind)) continue;
      const id = 'y_' + a.kind;
      scales[id] = {
        position: a.side,
        stacked: isStacked,
        beginAtZero: true,
        grid: { display: a.kind === axisOrder.find(x => kindsUsed.has(x.kind)).kind, color: '#F1F3F6', drawBorder: false },
        ticks: {
          color: '#9AA0A8',
          font: { size: 11 },
          callback: (v) => _gbRound(v, a.kind),
        },
        title: g.yLabel ? { display: true, text: g.yLabel, color: '#6E7480', font: { size: 11, weight: '700' } } : { display: false },
      };
    }
    if (isStacked && (state.gb.stackPct || state.gb.shape === 'time')) {
      scales.x.stacked = true;
    }
  }

  // -------- Plugins --------
  const plugins = {
    legend: g.legendPos === 'off' ? { display: false } : {
      position: g.legendPos,
      labels: {
        color: '#2E323D',
        font: { size: 12, weight: '600' },
        usePointStyle: true,
        boxWidth: 8,
        boxHeight: 8,
        padding: 16,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(20, 20, 20, 0.95)',
      titleColor: 'white',
      bodyColor: 'white',
      titleFont: { weight: 700, size: 12 },
      bodyFont: { size: 12 },
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      callbacks: {
        label: (ctx) => {
          const ds = ctx.dataset;
          const v = ctx.parsed.y;
          if (v == null || isNaN(v)) return ds.label + ': –';
          const m = GB_METRICS.find(x => x.key === ds._metric);
          const kind = (g.stackPct && (g.chartType === 'stackedBar' || g.chartType === 'area')) ? 'pct' : (m ? m.kind : 'count');
          return ds.label + ': ' + _gbRound(v, kind);
        },
      },
    },
    datalabels: g.showLabels ? _gbDatalabelsConfig(g, isStacked) : { display: false },
  };
  // Annotation-style baseline — drawn via a lightweight inline plugin
  const baselineVal = g.baseline && g.baselineValue != null && !isNaN(g.baselineValue) ? Number(g.baselineValue) : null;

  return {
    type: baseType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins,
      scales,
      layout: { padding: { top: (g.showLabels || (g.chartType === 'stackedBar' && !g.stackPct) || gbHasStackedComboMetric()) ? 26 : 8, left: 4, right: 12, bottom: 4 } },
    },
    _baseline: baselineVal,
  };
}

// ---------- Render ----------
function gbRenderChart() {
  const cfg = gbBuildChartConfig();
  const canvas = document.getElementById('gb-canvas');
  if (!canvas) return;
  if (state.charts['gb-canvas']) state.charts['gb-canvas'].destroy();

  // Header / footer overlay updates (always update so the frame is in sync)
  const g = state.gb;
  const titleText = g.title || gbAutoTitle();
  const subtitleText = g.subtitle || gbAutoSubtitle();
  document.getElementById('gb-frame-title').textContent = titleText;
  document.getElementById('gb-frame-subtitle').textContent = subtitleText;

  if (!cfg) {
    // Empty state — clear canvas and bail
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('gb-export-meta').textContent = 'Select at least one item and one metric to render.';
    return;
  }

  // Inline baseline plugin (per-chart)
  const baselineVal = cfg._baseline;
  const baselinePlugin = baselineVal != null ? {
    id: 'gbBaseline',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const yId = Object.keys(scales).find(k => k.startsWith('y_'));
      if (!yId) return;
      const y = scales[yId].getPixelForValue(baselineVal);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.strokeStyle = '#141414';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.fillStyle = '#141414';
      ctx.font = '700 11px Mulish, sans-serif';
      ctx.fillText('Target: ' + baselineVal, chartArea.left + 8, y - 6);
      ctx.restore();
    },
  } : null;
  // Stacked-total plugin — fires for pure stacked-bar charts AND combo charts that
  // include a stacked-bar metric, so the headline number is always visible.
  const stackTotalPlugin = (g.chartType === 'stackedBar' || gbHasStackedComboMetric()) ? _gbStackTotalPlugin(g) : null;
  cfg.plugins = [baselinePlugin, stackTotalPlugin].filter(Boolean);

  state.charts['gb-canvas'] = new Chart(canvas, cfg);
  document.getElementById('gb-export-meta').textContent = `Ready to export · ${cfg.data.datasets.length} series · ${cfg.data.labels.length} ${g.shape === 'snapshot' ? 'items' : 'data points'}`;
}

// ---------- Picker / metric / control wiring ----------
function gbRenderPicker() {
  const g = state.gb;
  const wrap = document.getElementById('gb-picker');
  const titleEl = document.getElementById('gb-picker-title');
  const searchEl = document.getElementById('gb-search');
  const helpEl = document.getElementById('gb-scope-help');
  const countEl = document.getElementById('gb-picker-count');
  if (!wrap) return;

  if (g.scope === 'category') {
    titleEl.textContent = 'Categories';
    helpEl.textContent = 'Compare one or more categories. Each becomes its own series.';
    searchEl.style.display = 'none';
    wrap.innerHTML = D.ROUNDEL_CATS.map(c => `
      <label class="gb-pick">
        <input type="checkbox" data-cat="${c}" ${g.selectedCats.has(c) ? 'checked' : ''} />
        <span class="gb-pick-dot" style="background:${CAT_COLORS[c] || '#9AA0A8'}"></span>
        <span class="gb-pick-name">${c}</span>
      </label>`).join('');
    wrap.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) g.selectedCats.add(cb.dataset.cat); else g.selectedCats.delete(cb.dataset.cat);
      gbUpdateCount();
      gbRenderChart();
    }));
  } else if (g.scope === 'sku') {
    titleEl.textContent = 'SKUs';
    helpEl.textContent = 'Each selected SKU is plotted individually — no rollup unless you switch to Mixed.';
    searchEl.style.display = 'block';
    const q = g.pickerSearch.toLowerCase();
    const items = Object.keys(D.itemData)
      .filter(dpci => !q || (D.itemData[dpci].description || '').toLowerCase().includes(q) || dpci.includes(q))
      .sort((a, b) => (D.itemData[a].description || '').localeCompare(D.itemData[b].description || ''));
    wrap.innerHTML = items.map(dpci => {
      const cat = skuCategory(dpci);
      const desc = D.itemData[dpci].description?.replace(/^Little Spoon /, '') || dpci;
      return `<label class="gb-pick">
        <input type="checkbox" data-dpci="${dpci}" ${g.selectedSkus.has(dpci) ? 'checked' : ''} />
        <span class="gb-pick-dot" style="background:${CAT_COLORS[cat] || '#9AA0A8'}"></span>
        <span class="gb-pick-name" title="${desc}">${desc}</span>
        <span class="gb-pick-tag">${cat.split(' ')[0].slice(0, 6)}</span>
      </label>`;
    }).join('') || '<div class="muted" style="padding:12px;text-align:center;font-size:12px;">No matches.</div>';
    wrap.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) g.selectedSkus.add(cb.dataset.dpci); else g.selectedSkus.delete(cb.dataset.dpci);
      gbUpdateCount();
      gbRenderChart();
    }));
  } else { // mixed
    titleEl.textContent = 'Categories + SKUs';
    helpEl.textContent = 'Pick categories AND specific SKUs. Use the "Show" toggle below to control rollup vs detail.';
    searchEl.style.display = 'block';
    const q = g.pickerSearch.toLowerCase();
    const catBlock = `<div style="padding:6px 4px 2px; font-size:10.5px; font-weight:800; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.06em;">Categories</div>` +
      D.ROUNDEL_CATS.map(c => `<label class="gb-pick">
        <input type="checkbox" data-cat="${c}" ${g.selectedCats.has(c) ? 'checked' : ''} />
        <span class="gb-pick-dot" style="background:${CAT_COLORS[c] || '#9AA0A8'}"></span>
        <span class="gb-pick-name"><b>${c}</b></span>
      </label>`).join('');
    const items = Object.keys(D.itemData)
      .filter(dpci => !q || (D.itemData[dpci].description || '').toLowerCase().includes(q) || dpci.includes(q))
      .sort((a, b) => (D.itemData[a].description || '').localeCompare(D.itemData[b].description || ''))
      .slice(0, 80);
    const skuBlock = `<div style="padding:8px 4px 2px; font-size:10.5px; font-weight:800; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.06em;">SKUs ${q ? '· filtered' : '· first 80'}</div>` +
      items.map(dpci => {
        const cat = skuCategory(dpci);
        const desc = D.itemData[dpci].description?.replace(/^Little Spoon /, '') || dpci;
        return `<label class="gb-pick">
          <input type="checkbox" data-dpci="${dpci}" ${g.selectedSkus.has(dpci) ? 'checked' : ''} />
          <span class="gb-pick-dot" style="background:${CAT_COLORS[cat] || '#9AA0A8'}"></span>
          <span class="gb-pick-name">${desc}</span>
        </label>`;
      }).join('');
    wrap.innerHTML = catBlock + skuBlock;
    wrap.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      if (cb.dataset.cat) {
        if (cb.checked) g.selectedCats.add(cb.dataset.cat); else g.selectedCats.delete(cb.dataset.cat);
      } else {
        if (cb.checked) g.selectedSkus.add(cb.dataset.dpci); else g.selectedSkus.delete(cb.dataset.dpci);
      }
      gbUpdateCount();
      gbRenderChart();
    }));
  }
  gbUpdateCount();
}
function gbUpdateCount() {
  const g = state.gb;
  const c = g.scope === 'category' ? g.selectedCats.size
          : g.scope === 'sku' ? g.selectedSkus.size
          : (g.selectedCats.size + g.selectedSkus.size);
  const el = document.getElementById('gb-picker-count');
  if (el) el.textContent = `${c} selected`;
}
function gbRenderMetrics() {
  const wrap = document.getElementById('gb-metrics');
  const g = state.gb;
  if (!wrap) return;
  wrap.innerHTML = GB_METRICS.map(m => `
    <span class="pill-cat ${g.metrics.has(m.key) ? 'active' : ''}" data-metric="${m.key}">${m.label}</span>
  `).join('');
  wrap.querySelectorAll('.pill-cat').forEach(p => p.addEventListener('click', () => {
    const k = p.dataset.metric;
    if (g.metrics.has(k)) g.metrics.delete(k);
    else if (g.metrics.size < 4) g.metrics.add(k);
    gbRenderMetrics();
    gbRenderComboPanel();   // metric set changed — re-render combo rows
    gbRenderChart();
  }));
}
// Combo styling rows — one row per selected metric. Visible only when chart type = combo.
function gbRenderComboPanel() {
  const section = document.getElementById('gb-combo-section');
  const wrap = document.getElementById('gb-combo-panel');
  if (!section || !wrap) return;
  const g = state.gb;
  if (g.chartType !== 'combo') {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  const metrics = [...g.metrics];
  if (!metrics.length) {
    wrap.innerHTML = '<div class="gb-combo-empty">Pick a metric above to configure how it renders.</div>';
    return;
  }
  wrap.innerHTML = metrics.map(metricKey => {
    const m = GB_METRICS.find(x => x.key === metricKey);
    const style = gbStyleFor(metricKey);
    return `
      <div class="gb-combo-row" data-metric="${metricKey}">
        <div class="gb-combo-label" title="${m.label}">${m.label}</div>
        <div class="seg seg-mini gb-combo-type">
          <button data-type="bar" class="${style.type === 'bar' ? 'active' : ''}">Bar</button>
          <button data-type="stackedBar" class="${style.type === 'stackedBar' ? 'active' : ''}">Stack</button>
          <button data-type="line" class="${style.type === 'line' ? 'active' : ''}">Line</button>
        </div>
        <div class="seg seg-mini gb-combo-axis">
          <button data-axis="left" class="${style.axis === 'left' ? 'active' : ''}">L</button>
          <button data-axis="right" class="${style.axis === 'right' ? 'active' : ''}">R</button>
        </div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.gb-combo-row').forEach(row => {
    const metricKey = row.dataset.metric;
    if (!g.comboMetricStyle[metricKey]) g.comboMetricStyle[metricKey] = gbDefaultComboStyle(metricKey);
    row.querySelectorAll('.gb-combo-type button').forEach(b => b.addEventListener('click', () => {
      g.comboMetricStyle[metricKey].type = b.dataset.type;
      gbRenderComboPanel();
      gbRenderChart();
    }));
    row.querySelectorAll('.gb-combo-axis button').forEach(b => b.addEventListener('click', () => {
      g.comboMetricStyle[metricKey].axis = b.dataset.axis;
      gbRenderComboPanel();
      gbRenderChart();
    }));
  });
}
function gbRenderPeriodsPills() {
  const wrap = document.getElementById('gb-periods-pills');
  const g = state.gb;
  if (!wrap) return;
  const periods = [
    { k: 'lw', l: 'LW' },
    { k: 'l4w', l: 'L4W' },
    { k: 'l13w', l: 'L13W' },
    { k: 'l26w', l: 'L26W' },
    { k: 'l52w', l: 'L52W' },
  ];
  wrap.innerHTML = periods.map(p => `<span class="pill-cat ${g.comparePeriods.has(p.k) ? 'active' : ''}" data-p="${p.k}">${p.l}</span>`).join('');
  wrap.querySelectorAll('.pill-cat').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.p;
    if (g.comparePeriods.has(k)) {
      if (g.comparePeriods.size > 1) g.comparePeriods.delete(k);
    } else g.comparePeriods.add(k);
    gbRenderPeriodsPills();
    gbRenderChart();
  }));
}
function gbApplyShape() {
  const g = state.gb;
  document.getElementById('gb-periods-section').style.display = g.shape === 'periods' ? 'block' : 'none';
  const help = document.getElementById('gb-shape-help');
  if (g.shape === 'time') help.textContent = 'Plot the metric over each week / month in the selected window.';
  if (g.shape === 'periods') help.textContent = 'Compare LW, L4W, L13W, L26W, L52W side-by-side.';
  if (g.shape === 'snapshot') help.textContent = 'Single bar per item — great for ranking categories or SKUs.';
}
function gbApplyScopeAffordance() {
  const g = state.gb;
  document.getElementById('gb-mixed-section').style.display = g.scope === 'mixed' ? 'block' : 'none';
}
function gbApplyAspect() {
  const f = document.getElementById('gb-export-frame');
  if (!f) return;
  f.classList.remove('ratio-4x3', 'ratio-1x1', 'ratio-wide');
  if (state.gb.size === '4x3') f.classList.add('ratio-4x3');
  if (state.gb.size === '1x1') f.classList.add('ratio-1x1');
  if (state.gb.size === 'wide') f.classList.add('ratio-wide');
}
function gbApplyBg() {
  const bg = document.getElementById('gb-stage-bg');
  const frame = document.getElementById('gb-export-frame');
  if (!bg || !frame) return;
  bg.classList.remove('bg-cream', 'bg-dark', 'bg-checker');
  frame.classList.remove('theme-dark');
  if (state.gb.bg === 'cream') bg.classList.add('bg-cream');
  if (state.gb.bg === 'dark') { bg.classList.add('bg-dark'); frame.classList.add('theme-dark'); }
  if (state.gb.bg === 'checker') bg.classList.add('bg-checker');
}

function gbInitControls() {
  if (state.gb.initialized) return;
  state.gb.initialized = true;
  const g = state.gb;

  // Scope
  document.querySelectorAll('#gb-scope button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-scope button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.scope = b.dataset.scope;
    gbApplyScopeAffordance();
    gbRenderPicker();
    gbRenderChart();
  }));

  // Picker actions
  document.getElementById('gb-pick-all').addEventListener('click', () => {
    if (g.scope === 'category' || g.scope === 'mixed') D.ROUNDEL_CATS.forEach(c => g.selectedCats.add(c));
    if (g.scope === 'sku') Object.keys(D.itemData).slice(0, 50).forEach(d => g.selectedSkus.add(d));
    gbRenderPicker(); gbRenderChart();
  });
  document.getElementById('gb-pick-none').addEventListener('click', () => {
    if (g.scope === 'category' || g.scope === 'mixed') g.selectedCats.clear();
    if (g.scope === 'sku' || g.scope === 'mixed') g.selectedSkus.clear();
    gbRenderPicker(); gbRenderChart();
  });
  document.getElementById('gb-pick-top5').addEventListener('click', () => {
    if (g.scope === 'category' || g.scope === 'mixed') {
      g.selectedCats.clear();
      D.ROUNDEL_CATS.forEach(c => g.selectedCats.add(c));
    }
    if (g.scope === 'sku' || g.scope === 'mixed') {
      const weeks = D.salesDates.slice(-13);
      const ranked = Object.keys(D.itemData).map(d => {
        let s = 0;
        for (const w of weeks) { const v = D.itemData[d].metrics['Sales $ - Total']?.[w]; if (typeof v === 'number') s += v; }
        return { d, s };
      }).sort((a, b) => b.s - a.s).slice(0, 5);
      g.selectedSkus.clear();
      ranked.forEach(r => g.selectedSkus.add(r.d));
    }
    gbRenderPicker(); gbRenderChart();
  });

  // Search
  document.getElementById('gb-search').addEventListener('input', e => {
    g.pickerSearch = e.target.value;
    gbRenderPicker();
  });

  // Shape
  document.querySelectorAll('#gb-shape button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-shape button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.shape = b.dataset.shape;
    gbApplyShape();
    gbRenderChart();
  }));

  // Chart type
  document.querySelectorAll('#gb-chart-types .gb-type-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-chart-types .gb-type-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.chartType = b.dataset.type;
    gbRenderComboPanel();   // show/hide + populate when entering/leaving combo
    gbRenderChart();
  }));

  // Window
  document.querySelectorAll('#gb-window button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-window button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.windowKey = b.dataset.w;
    document.getElementById('gb-custom-range').style.display = g.windowKey === 'custom' ? 'flex' : 'none';
    gbRenderChart();
  }));
  // Populate custom range selects
  const cs = document.getElementById('gb-custom-start');
  const ce = document.getElementById('gb-custom-end');
  cs.innerHTML = D.salesDates.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  ce.innerHTML = D.salesDates.map((d, i) => `<option value="${i}" ${i === D.salesDates.length - 1 ? 'selected' : ''}>${d}</option>`).join('');
  cs.addEventListener('change', () => { g.customStart = parseInt(cs.value); gbRenderChart(); });
  ce.addEventListener('change', () => { g.customEnd = parseInt(ce.value); gbRenderChart(); });

  // Aggregation
  document.querySelectorAll('#gb-agg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-agg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.aggregation = b.dataset.agg;
    gbRenderChart();
  }));

  // Mixed
  document.querySelectorAll('#gb-mixed button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-mixed button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.mixed = b.dataset.mixed;
    gbRenderChart();
  }));

  // Customize inputs
  ['gb-title', 'gb-subtitle', 'gb-ylabel'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      const k = id === 'gb-title' ? 'title' : id === 'gb-subtitle' ? 'subtitle' : 'yLabel';
      g[k] = e.target.value;
      gbRenderChart();
    });
  });
  document.querySelectorAll('#gb-legend button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-legend button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.legendPos = b.dataset.legend;
    gbRenderChart();
  }));
  document.getElementById('gb-sort').addEventListener('change', e => { g.sortBy = e.target.value; gbRenderChart(); });
  document.getElementById('gb-show-labels').addEventListener('change', e => { g.showLabels = e.target.checked; gbRenderChart(); });
  document.getElementById('gb-smooth').addEventListener('change', e => { g.smooth = e.target.checked; gbRenderChart(); });
  document.getElementById('gb-stack-pct').addEventListener('change', e => { g.stackPct = e.target.checked; gbRenderChart(); });
  document.getElementById('gb-baseline').addEventListener('change', e => {
    g.baseline = e.target.checked;
    document.getElementById('gb-baseline-row').style.display = e.target.checked ? 'block' : 'none';
    gbRenderChart();
  });
  document.getElementById('gb-baseline-value').addEventListener('input', e => {
    g.baselineValue = e.target.value === '' ? null : parseFloat(e.target.value);
    gbRenderChart();
  });

  // Stage / preview chrome
  document.querySelectorAll('#gb-bg-toggle button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-bg-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.bg = b.dataset.bg;
    gbApplyBg();
  }));
  document.querySelectorAll('#gb-size-toggle button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#gb-size-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    g.size = b.dataset.size;
    gbApplyAspect();
    // Resize chart
    if (state.charts['gb-canvas']) {
      requestAnimationFrame(() => state.charts['gb-canvas'].resize());
    }
  }));

  // Render the metrics + period pills + combo panel the first time
  gbRenderMetrics();
  gbRenderPeriodsPills();
  gbRenderComboPanel();
  gbApplyShape();
  gbApplyScopeAffordance();
  gbApplyBg();
  gbApplyAspect();
}

function renderGraphBuilder() {
  gbInitControls();
  gbRenderPicker();
  gbRenderChart();
}

// ---------- Export ----------
// Renders the current chart at high resolution onto an off-screen canvas
// along with the brand header, footer, and chosen background. PNG/SVG/clipboard.
async function gbExport(mode) {
  const chart = state.charts['gb-canvas'];
  if (!chart) { alert('Render a chart first.'); return; }

  const g = state.gb;
  const titleText = g.title || gbAutoTitle();
  const subtitleText = g.subtitle || gbAutoSubtitle();

  // Output dimensions
  const sizeMap = { '16x9': [1920, 1080], '4x3': [1600, 1200], '1x1': [1200, 1200], 'wide': [2100, 900] };
  const [W, H] = sizeMap[g.size] || sizeMap['16x9'];

  // Background per export mode
  let bg = null;
  let textColor = '#141414';
  let mutedColor = '#6E7480';
  if (mode === 'png-white') { bg = '#FFFFFF'; }
  else if (mode === 'png-dark') { bg = '#141414'; textColor = '#FFFFFF'; mutedColor = 'rgba(255,255,255,0.65)'; }
  else if (mode === 'svg') { bg = null; /* SVG path below */ }
  else if (mode === 'clipboard') { bg = '#FFFFFF'; }
  // else 'png-transparent' → bg stays null

  // ---------- Build the layout on an off-screen canvas at high DPI ----------
  const padX = 60, padY = 50;
  const headerH = 110;

  // Off-screen canvas at the target resolution (no DPR scaling — produced at exactly W×H)
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');

  // Background
  if (bg) {
    octx.fillStyle = bg;
    octx.fillRect(0, 0, W, H);
  }

  // -- Brand mark + title / subtitle (hand-drawn, not from DOM, for sharpness)
  const markX = padX, markY = padY;
  const markSize = 56;
  // Gradient mark (LS blue → mint)
  const grad = octx.createLinearGradient(markX, markY, markX + markSize, markY + markSize);
  grad.addColorStop(0, '#00E3CD');
  grad.addColorStop(1, '#00F9B8');
  _roundedRect(octx, markX, markY, markSize, markSize, 14);
  octx.fillStyle = grad; octx.fill();
  octx.fillStyle = '#141414';
  octx.font = '900 22px Mulish, sans-serif';
  octx.textBaseline = 'middle'; octx.textAlign = 'center';
  octx.fillText('LS', markX + markSize / 2, markY + markSize / 2 + 1);

  // Title + subtitle text
  octx.textAlign = 'left'; octx.textBaseline = 'top';
  octx.fillStyle = textColor;
  octx.font = '800 30px Mulish, sans-serif';
  octx.fillText(titleText, markX + markSize + 18, markY + 4);
  octx.fillStyle = mutedColor;
  octx.font = '500 17px Mulish, sans-serif';
  octx.fillText(subtitleText, markX + markSize + 18, markY + 40);

  // Render the Chart.js canvas at high DPI by temporarily upscaling, then drawing onto out.
  // Chart.js doesn't support direct print scaling, so we use a hidden host and resize.
  const chartW = W - padX * 2;
  const chartH = H - padY * 2 - headerH;
  const scratch = document.createElement('canvas');
  scratch.width = chartW; scratch.height = chartH;
  scratch.style.width = chartW + 'px'; scratch.style.height = chartH + 'px';
  // Hidden container so Chart.js can lay out properly
  const host = document.createElement('div');
  host.style.cssText = `position:fixed; left:-9999px; top:0; width:${chartW}px; height:${chartH}px; background:transparent;`;
  host.appendChild(scratch);
  document.body.appendChild(host);
  // Build a fresh config so we don't mutate the live chart
  const cfg = gbBuildChartConfig();
  if (!cfg) { document.body.removeChild(host); alert('Nothing to export.'); return; }
  // Color overrides for dark export
  if (mode === 'png-dark') {
    cfg.options.plugins.legend = { ...(cfg.options.plugins.legend || {}), labels: { ...(cfg.options.plugins.legend?.labels || {}), color: '#FFFFFF' } };
    if (cfg.options.scales.x?.ticks) cfg.options.scales.x.ticks.color = 'rgba(255,255,255,0.7)';
    Object.keys(cfg.options.scales).forEach(k => {
      if (k.startsWith('y_') && cfg.options.scales[k].ticks) cfg.options.scales[k].ticks.color = 'rgba(255,255,255,0.55)';
      if (k.startsWith('y_') && cfg.options.scales[k].grid) cfg.options.scales[k].grid.color = 'rgba(255,255,255,0.08)';
    });
  }
  cfg.options.animation = false;
  cfg.options.responsive = false;
  cfg.options.maintainAspectRatio = false;
  // Force device pixel ratio so the bitmap is sharp
  cfg.options.devicePixelRatio = 2;
  // Attach baseline + stack-total plugins so exports look like the preview
  const exportBaseline = cfg._baseline != null ? {
    id: 'gbBaseline',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const yId = Object.keys(scales).find(k => k.startsWith('y_'));
      if (!yId) return;
      const y = scales[yId].getPixelForValue(cfg._baseline);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.strokeStyle = mode === 'png-dark' ? 'rgba(255,255,255,0.85)' : '#141414';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.fillStyle = mode === 'png-dark' ? '#FFFFFF' : '#141414';
      ctx.font = '700 12px Mulish, sans-serif';
      ctx.fillText('Target: ' + cfg._baseline, chartArea.left + 8, y - 6);
      ctx.restore();
    },
  } : null;
  const exportStackTotal = (g.chartType === 'stackedBar' || gbHasStackedComboMetric()) ? _gbStackTotalPlugin(g) : null;
  cfg.plugins = [exportBaseline, exportStackTotal].filter(Boolean);

  const tmpChart = new Chart(scratch, cfg);
  // Wait one frame for Chart.js to render
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (mode === 'svg') {
    // Build a vector SVG: header text + chart bitmap embedded, no full-vector chart
    // (Chart.js draws raster; we wrap it so the result still pastes cleanly into Figma/Slides.)
    const chartDataUrl = scratch.toDataURL('image/png');
    const svg = _gbBuildSvg({ W, H, padX, padY, markSize, markX, markY, titleText, subtitleText, chartDataUrl, bg, textColor, mutedColor, headerH });
    _gbDownloadBlob(new Blob([svg], { type: 'image/svg+xml' }), _gbFilename('svg'));
    tmpChart.destroy();
    document.body.removeChild(host);
    return;
  }

  // Composite chart onto out
  octx.drawImage(scratch, padX, padY + headerH);

  tmpChart.destroy();
  document.body.removeChild(host);

  if (mode === 'clipboard') {
    out.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        const meta = document.getElementById('gb-export-meta');
        if (meta) { const old = meta.textContent; meta.textContent = '✓ Copied to clipboard — paste into your slide.'; setTimeout(() => meta.textContent = old, 2400); }
      } catch (e) {
        // Clipboard API can fail; fall back to download
        _gbDownloadBlob(blob, _gbFilename('png'));
      }
    });
    return;
  }

  out.toBlob((blob) => {
    _gbDownloadBlob(blob, _gbFilename('png', mode));
  }, 'image/png');
}

function _roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function _gbDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function _gbFilename(ext, mode) {
  const g = state.gb;
  const base = (g.title || gbAutoTitle())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'little-spoon-chart';
  const tag = mode === 'png-transparent' ? '-transparent' : mode === 'png-white' ? '-white' : mode === 'png-dark' ? '-dark' : '';
  const stamp = new Date().toISOString().slice(0, 10);
  return `little-spoon-${base}${tag}-${stamp}.${ext}`;
}
function _gbBuildSvg({ W, H, padX, padY, markSize, markX, markY, titleText, subtitleText, chartDataUrl, bg, textColor, mutedColor, headerH }) {
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const bgRect = bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : '';
  const chartW = W - padX * 2;
  const chartH = H - padY * 2 - headerH;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Mulish, -apple-system, BlinkMacSystemFont, sans-serif">
  ${bgRect}
  <defs>
    <linearGradient id="lsmark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E3CD"/>
      <stop offset="100%" stop-color="#00F9B8"/>
    </linearGradient>
  </defs>
  <rect x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" rx="14" fill="url(#lsmark)"/>
  <text x="${markX + markSize / 2}" y="${markY + markSize / 2 + 8}" font-size="22" font-weight="900" fill="#141414" text-anchor="middle">LS</text>
  <text x="${markX + markSize + 18}" y="${markY + 30}" font-size="30" font-weight="800" fill="${textColor}">${escape(titleText)}</text>
  <text x="${markX + markSize + 18}" y="${markY + 56}" font-size="17" font-weight="500" fill="${mutedColor}">${escape(subtitleText)}</text>
  <image href="${chartDataUrl}" x="${padX}" y="${padY + headerH}" width="${chartW}" height="${chartH}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}
window.gbExport = gbExport;

// ---------- Init ----------
function syncDataDates() {
  const lw = D?.salesDates?.[D.salesDates.length - 1];
  if (!lw) return;
  const badge = document.getElementById('data-badge');
  if (badge) badge.textContent = 'Last week: ' + lw;
  // Keep the rd-hero-lw and any other anchors fresh from the data
  const heroLW = document.getElementById('rd-hero-lw');
  if (heroLW) heroLW.textContent = lw;
  // Weekly Snapshot anchor text
  const wkAnchor = document.getElementById('weekly-anchor-date');
  if (wkAnchor) wkAnchor.textContent = lw;
  // Compact data-source freshness chip on Data Sources page
  const srcLW = document.getElementById('sources-lw');
  if (srcLW) srcLW.textContent = lw;
  const srcLW2 = document.getElementById('sources-lw-2');
  if (srcLW2) srcLW2.textContent = lw;
  const srcFW = document.getElementById('sources-fw');
  if (srcFW) srcFW.textContent = D.salesDates[0] || '';
  const srcCount = document.getElementById('sources-wkcount');
  if (srcCount) srcCount.textContent = D.salesDates.length;
  const srcUploadedAt = document.getElementById('sources-uploaded-at');
  if (srcUploadedAt) {
    const t = D.meta?.generatedAt;
    srcUploadedAt.textContent = t ? new Date(t).toLocaleString() : 'bundled';
  }
}
SKU_OVERRIDES = loadSkuOverrides();
syncDataDates();
initFilters();
renderAll();
