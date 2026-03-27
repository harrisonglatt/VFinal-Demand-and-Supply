'use client';

import PageShell from '@/components/layout/PageShell';
import DataTable from '@/components/ui/DataTable';

/* ── Static data arrays ─────────────────────────────────────────────── */

const SOURCES = [
  { tag: 'omni-tag', tagLabel: '🔵 Omni Analytics', data: 'POS Sales · Units · Revenue · Stores · UPSPW by SKU', freq: 'Daily (1–2 day lag)', coverage: 'All 28 active SKUs at Target', status: '✓ Live', statusCls: 'cg' },
  { tag: 'cy2', tagLabel: '📊 Demand Plan Excel', data: 'Forecast · Promo Calendar · Inventory · Shipments · Launch Ramp', freq: 'Weekly (manual upload)', coverage: '52-week forward plan', status: '✓ Current', statusCls: 'cg' },
  { tag: 'cgr', tagLabel: 'Monday.com', data: 'Workflow tasks · Weekly refresh reminders', freq: 'Weekly', coverage: 'Team workflow', status: '⏳ Setup Pending', statusCls: 'cy2' },
];

const SCHEDULE = [
  { icon: '🔵', time: 'Daily ~9am', desc: 'Omni data refreshes automatically · CW units & revenue updated' },
  { icon: '📊', time: 'Monday AM', desc: 'Upload new Demand Plan Excel → rebuild data → refresh dashboard' },
  { icon: '🎯', time: 'Weekly', desc: 'Review AVF module · Flag SKUs >±20% · Adjust W1 forecast if needed' },
  { icon: '🔮', time: 'Monthly', desc: 'Scenario review · Calibrate Bear/Bull multipliers · Promo lift validation' },
];

const KPIS = [
  { kpi: 'LW Revenue', def: 'Total $ sales at Target for most recent complete week (ending Saturday)', source: 'Omni', notes: 'Week of Mar 16, 2026' },
  { kpi: 'UPSPW', def: 'Units Per Store Per Week = Units sold ÷ Stores scanning that week', source: 'Omni', notes: 'Primary velocity metric' },
  { kpi: 'vs Model Fcast', def: '(LW Actual − W1 Model Forecast) ÷ W1 Model Forecast', source: 'Omni + DP', notes: '−8% = tracking below model' },
  { kpi: 'WoS', def: 'Weeks of Supply = On-Hand Inventory ÷ LW Weekly Velocity', source: 'DP Excel', notes: '<4 WoS = Watch; 0 = OOS' },
  { kpi: 'OOS Alert', def: 'SKU has ≥5% stores with zero inventory or WoS = 0', source: 'DP Excel', notes: '12 SKUs flagged LW' },
  { kpi: 'Scenario Rev', def: 'Base forecast × multiplier: Bear ×0.80, Base ×1.00, Bull ×1.20', source: 'Computed', notes: 'Applied to full 52-wk demand plan' },
  { kpi: 'Endcap Lift', def: 'Incremental units = Baseline velocity × Promo Calendar lift %', source: 'Computed', notes: 'Green = confirmed, Yellow = proposed' },
];

const METHODOLOGY = [
  { title: 'Revenue Forecast', body: '52-wk revenue = Σ(SKU LW $/PSPW × Stores) from Demand Plan model. Promo weeks apply lift multipliers from the Promo Calendar. Window: Mar 22, 2026 – Mar 14, 2027 (52 weeks).' },
  { title: 'Actuals vs Forecast', body: 'LW Omni actuals compared to the W1 row of the demand plan model. Variance = (Actual − Forecast) ÷ Forecast. Current: 157,099 actual vs 170,760 model = −8%.' },
  { title: 'Endcap Lift Modeling', body: 'Incremental units = Baseline weekly velocity × Lift % from Promo Calendar. Confidence tiers driven by event status (Confirmed / Submitted / Proposed). Revenue uplift = Incremental units × avg category price.' },
  { title: 'Scenario Analysis', body: 'Bear/Base/Bull multipliers applied uniformly across all forecast weeks and SKUs. Future roadmap: category-level multipliers, promo sensitivity toggles, and WoC impact modeling.' },
  { title: 'Inventory Intelligence', body: 'WoS = On-Hand ÷ LW velocity per SKU from Excel. OOS threshold: WoS = 0 or flagged in plan. Lost revenue = OOS velocity × avg price × weeks at risk.' },
];

/* ── Page Component ─────────────────────────────────────────────────── */

export default function GuidePage() {
  return (
    <PageShell title="Model Guide" subtitle="Data sources, refresh cadence, KPI definitions & methodology">
      {/* ── Data Sources ────────────────────────────────────── */}
      <div className="cc">
        <div className="ct">Data Sources</div>
        <DataTable>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Data</th>
                <th>Frequency</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.tagLabel}>
                  <td>
                    <span className={`ch ${s.tag}`}>{s.tagLabel}</span>
                  </td>
                  <td>{s.data}</td>
                  <td>{s.freq}</td>
                  <td>{s.coverage}</td>
                  <td>
                    <span className={`ch ${s.statusCls}`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      {/* ── Refresh Schedule ────────────────────────────────── */}
      <div className="cc">
        <div className="ct">Refresh Schedule</div>
        {SCHEDULE.map((s) => (
          <div
            key={s.time}
            style={{
              display: 'flex',
              gap: 12,
              padding: '9px 0',
              borderBottom: '1px solid var(--bd)',
            }}
          >
            <span style={{ fontSize: 16, paddingTop: 1 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>{s.time}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 2 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── KPI Definitions ─────────────────────────────────── */}
      <div className="cc">
        <div className="ct">KPI Definitions</div>
        <DataTable>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>KPI</th>
                <th>Definition</th>
                <th>Source</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {KPIS.map((k) => (
                <tr key={k.kpi}>
                  <td><strong>{k.kpi}</strong></td>
                  <td>{k.def}</td>
                  <td>{k.source}</td>
                  <td>{k.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      {/* ── Methodology ─────────────────────────────────────── */}
      <div className="cc">
        <div className="ct">Methodology</div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontSize: 12.5,
            color: 'var(--tx2)',
            lineHeight: 1.7,
          }}
        >
          {METHODOLOGY.map((m) => (
            <div key={m.title}>
              <strong style={{ color: 'var(--tx)' }}>{m.title}</strong>
              <br />
              {m.body}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
