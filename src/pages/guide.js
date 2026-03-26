// ─── MODEL GUIDE ─────────────────────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html (lines 2405–2444)

import { chip } from '../utils/dom.js';

export function schedRow(ic, time, desc) {
  return '<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--bd)">' +
    '<span style="font-size:16px;padding-top:1px">' + ic + '</span>' +
    '<div><div style="font-size:12.5px;font-weight:600;color:var(--tx)">' + time + '</div>' +
    '<div style="font-size:11.5px;color:var(--tx2);margin-top:2px">' + desc + '</div></div></div>';
}

export function initGUIDE() {
  document.getElementById('guide-sources').innerHTML =
    '<table style="font-size:12px"><thead><tr><th>Source</th><th>Data</th><th>Frequency</th><th>Coverage</th><th>Status</th></tr></thead><tbody>' +
    '<tr><td><span class="omni-tag">\u{1F535} Omni Analytics</span></td><td>POS Sales \u00B7 Units \u00B7 Revenue \u00B7 Stores \u00B7 UPSPW by SKU</td><td>Daily (1\u20132 day lag)</td><td>All 28 active SKUs at Target</td><td><span class="ch cg">\u2713 Live</span></td></tr>' +
    '<tr><td>' + chip('cy2', '\u{1F4CA} Demand Plan Excel') + '</td><td>Forecast \u00B7 Promo Calendar \u00B7 Inventory \u00B7 Shipments \u00B7 Launch Ramp</td><td>Weekly (manual upload)</td><td>52-week forward plan</td><td><span class="ch cg">\u2713 Current</span></td></tr>' +
    '<tr><td>' + chip('cgr', 'Monday.com') + '</td><td>Workflow tasks \u00B7 Weekly refresh reminders</td><td>Weekly</td><td>Team workflow</td><td><span class="ch cy2">\u23f3 Setup Pending</span></td></tr>' +
    '</tbody></table>';
  document.getElementById('guide-sched').innerHTML =
    schedRow('\u{1F535}', 'Daily ~9am', 'Omni data refreshes automatically \u00B7 CW units &amp; revenue updated') +
    schedRow('\u{1F4CA}', 'Monday AM', 'Upload new Demand Plan Excel \u2192 rebuild data \u2192 refresh dashboard') +
    schedRow('\u{1F3AF}', 'Weekly', 'Review AVF module \u00B7 Flag SKUs &gt;\u00B120% \u00B7 Adjust W1 forecast if needed') +
    schedRow('\u{1F52E}', 'Monthly', 'Scenario review \u00B7 Calibrate Bear/Bull multipliers \u00B7 Promo lift validation');
  document.getElementById('guide-kpis').innerHTML =
    '<table style="font-size:12px"><thead><tr><th>KPI</th><th>Definition</th><th>Source</th><th>Notes</th></tr></thead><tbody>' +
    '<tr><td><strong>LW Revenue</strong></td><td>Total $ sales at Target for most recent complete week (ending Saturday)</td><td>Omni</td><td>Week of Mar 16, 2026</td></tr>' +
    '<tr><td><strong>UPSPW</strong></td><td>Units Per Store Per Week = Units sold \u00F7 Stores scanning that week</td><td>Omni</td><td>Primary velocity metric</td></tr>' +
    '<tr><td><strong>vs Model Fcast</strong></td><td>(LW Actual \u2212 W1 Model Forecast) \u00F7 W1 Model Forecast</td><td>Omni + DP</td><td>\u22128% = tracking below model</td></tr>' +
    '<tr><td><strong>WoS</strong></td><td>Weeks of Supply = On-Hand Inventory \u00F7 LW Weekly Velocity</td><td>DP Excel</td><td>&lt;4 WoS = Watch; 0 = OOS</td></tr>' +
    '<tr><td><strong>OOS Alert</strong></td><td>SKU has \u22655% stores with zero inventory or WoS = 0</td><td>DP Excel</td><td>12 SKUs flagged LW</td></tr>' +
    '<tr><td><strong>Scenario Rev</strong></td><td>Base forecast \u00D7 multiplier: Bear \u00D70.80, Base \u00D71.00, Bull \u00D71.20</td><td>Computed</td><td>Applied to full 52-wk demand plan</td></tr>' +
    '<tr><td><strong>Endcap Lift</strong></td><td>Incremental units = Baseline velocity \u00D7 Promo Calendar lift %</td><td>Computed</td><td>Green = confirmed, Yellow = proposed</td></tr>' +
    '</tbody></table>';
  document.getElementById('guide-method').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:14px;font-size:12.5px;color:var(--tx2);line-height:1.7">' +
    '<div><strong style="color:var(--tx)">Revenue Forecast</strong><br>52-wk revenue = \u03A3(SKU LW $/PSPW \u00D7 Stores) from Demand Plan model. Promo weeks apply lift multipliers from the Promo Calendar. Window: Mar 22, 2026 \u2013 Mar 14, 2027 (52 weeks).</div>' +
    '<div><strong style="color:var(--tx)">Actuals vs Forecast</strong><br>LW Omni actuals compared to the W1 row of the demand plan model. Variance = (Actual \u2212 Forecast) \u00F7 Forecast. Current: 157,099 actual vs 170,760 model = \u22128%.</div>' +
    '<div><strong style="color:var(--tx)">Endcap Lift Modeling</strong><br>Incremental units = Baseline weekly velocity \u00D7 Lift % from Promo Calendar. Confidence tiers driven by event status (Confirmed / Submitted / Proposed). Revenue uplift = Incremental units \u00D7 avg category price.</div>' +
    '<div><strong style="color:var(--tx)">Scenario Analysis</strong><br>Bear/Base/Bull multipliers applied uniformly across all forecast weeks and SKUs. Future roadmap: category-level multipliers, promo sensitivity toggles, and WoC impact modeling.</div>' +
    '<div><strong style="color:var(--tx)">Inventory Intelligence</strong><br>WoS = On-Hand \u00F7 LW velocity per SKU from Excel. OOS threshold: WoS = 0 or flagged in plan. Lost revenue = OOS velocity \u00D7 avg price \u00D7 weeks at risk.</div>' +
    '</div>';
}
