'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import DoughnutChart from '@/components/charts/DoughnutChart';
import {
  DATA_DP, DATA_INV, DATA_PROMO, DATA_OMNI, DATA_AVF, DATA_SHIP,
  FCAST_REV_52WK, PROMO_WKS,
} from '@/data/index';
import { fmt, fmtP, fmtDol, sf } from '@/lib/formatters';

/* ── Blended UPC ──────────────────────────────────────────────────── */
function computeBlendedUPC(): number {
  try {
    const tot = DATA_SHIP.skus.reduce((a, s) => {
      const cases = Object.entries(s.weeks).filter(([k]) =>
        !['13-wk PO Cases', '13-wk Plan Cases', 'Gap Cases', 'Gap Units', 'Coverage %', '13-wk Fcast Cases'].includes(k)
        && (k.includes("'25") || k.includes('1/') || k.includes('2/') || k.includes('3/1') || k.includes('3/8'))
      ).reduce((t, [, v]) => t + (v || 0), 0);
      return { cases: a.cases + cases, units: a.units + cases * s.units_per_case };
    }, { cases: 0, units: 0 });
    return tot.cases > 0 ? tot.units / tot.cases : 14;
  } catch { return 14; }
}

const BLENDED_UPC = computeBlendedUPC();

const UNIT_OPTS = [
  { value: 'units', label: 'Units' },
  { value: 'cases', label: 'Cases' },
];

export default function OverviewPage() {
  const [unit, setUnit] = useState('units');

  /* ── Omni summaries ────────────────────────────────────────────── */
  const lw = DATA_OMNI.lw_summary;
  const wts = DATA_OMNI.weekly_totals;
  const lwPrev = wts[wts.length - 2] || lw;
  const cw = (DATA_OMNI as any).cw_summary || { units: 0, sales: 0 };

  const revWoW = (lw.sales - (lwPrev as any).sales) / ((lwPrev as any).sales || 1);
  const unitsWoW = (lw.units - (lwPrev as any).units) / ((lwPrev as any).units || 1);

  /* ── AVF aggregation ───────────────────────────────────────────── */
  const totalA = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.lw_units), 0), []);
  const totalF = useMemo(() => DATA_AVF.reduce((a, s) => a + sf(s.fcast_units), 0), []);
  const avfP = totalF ? (totalA - totalF) / totalF : 0;

  /* ── Revenue chart data ────────────────────────────────────────── */
  const revChart = useMemo(() => {
    const labels = [...DATA_OMNI.weeks, ...DATA_DP.fcast_weeks];
    const actualData = [...wts.map(w => (w as any).sales), ...Array(52).fill(null)];
    const fcastData = [
      ...Array(DATA_OMNI.weeks.length - 1).fill(null),
      (wts[wts.length - 1] as any).sales,
      ...FCAST_REV_52WK,
    ];
    return { labels, actualData, fcastData };
  }, [wts]);

  const fcast52Total = useMemo(() => (FCAST_REV_52WK as number[]).reduce((a, b) => a + b, 0), []);

  /* ── Units trend ───────────────────────────────────────────────── */
  const trendData = useMemo(() =>
    wts.map(w => unit === 'cases' ? Math.round(w.units / (BLENDED_UPC || 14)) : w.units),
    [unit, wts],
  );

  /* ── AVF by category ───────────────────────────────────────────── */
  const catAVF = useMemo(() => {
    const cats: Record<string, { a: number; f: number }> = {};
    DATA_AVF.forEach(s => {
      if (!cats[s.category]) cats[s.category] = { a: 0, f: 0 };
      cats[s.category].a += sf(s.lw_units);
      cats[s.category].f += sf(s.fcast_units);
    });
    return cats;
  }, []);
  const catKeys = Object.keys(catAVF);

  /* ── Inventory donut ───────────────────────────────────────────── */
  const invDonut = useMemo(() => {
    const oos = DATA_INV.skus.filter(s => (s.risk_flag || '').includes('OOS')).length;
    const wat = DATA_INV.skus.filter(s => (s.risk_flag || '').includes('Watch')).length;
    const ok = DATA_INV.skus.length - oos - wat;
    return { labels: ['OOS Alert', 'Supply Watch', 'OK'], data: [oos, wat, ok] };
  }, []);

  /* ── Promo list ────────────────────────────────────────────────── */
  const promoList = useMemo(() => DATA_PROMO.slice(0, 8), []);

  return (
    <PageShell
      title="Brand Overview"
      subtitle="Omni actuals + demand plan forecast · LS → Target"
      extra={
        <ButtonGroup options={UNIT_OPTS} active={unit} onChange={setUnit} />
      }
    >
      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="💰" label="LW Revenue (Mar 16)" style="--cc:var(--ac)"
          value={fmtDol(lw.sales)}
          delta={`${revWoW >= 0 ? '↑' : '↓'} ${Math.abs(revWoW * 100).toFixed(1)}% WoW`}
          deltaClass={revWoW >= 0 ? 'up' : 'dn'}
          sub={`${fmtDol(cw.sales)} CW to date (2 days)`}
        />
        <KpiCard
          icon="📦" label={unit === 'cases' ? 'LW Cases (Mar 16)' : 'LW Units (Mar 16)'}
          style="--cc:var(--gr)"
          value={unit === 'cases' ? fmt(Math.round(lw.units / (BLENDED_UPC || 14))) : fmt(lw.units)}
          delta={`${unitsWoW >= 0 ? '↑' : '↓'} ${Math.abs(unitsWoW * 100).toFixed(1)}% WoW`}
          deltaClass={unitsWoW >= 0 ? 'up' : 'dn'}
          sub={`${unit === 'cases' ? fmt(Math.round(cw.units / (BLENDED_UPC || 14))) + ' cases' : fmt(cw.units) + ' units'} CW to date`}
        />
        <KpiCard
          icon="🎯" label="LW vs Locked Fcast (Mar 16)"
          style={`--cc:${avfP < 0 ? 'var(--rd)' : 'var(--gr)'}`}
          value={fmtP(avfP)}
          delta={`${avfP >= 0 ? '↑' : '↓'} ${fmt(totalA - totalF)} units`}
          deltaClass={avfP >= 0 ? 'up' : 'dn'}
          sub={`${fmt(totalA)} actual vs ${fmt(totalF)} model`}
        />
        <KpiCard
          icon="⚠️" label="OOS Alerts" style="--cc:var(--rd)"
          value={DATA_INV.summary.oos_alerts}
          delta={`↓ ${fmtDol(DATA_INV.summary.lost_per_week)}/wk lost`}
          deltaClass="dn"
          sub={`Annualized: ${fmtDol(DATA_INV.summary.annualized_loss)}`}
        />
      </KpiGrid>

      {/* ── Revenue Chart ────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">{'💰'} Revenue: Actuals + 52-Wk Forecast</div>
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>52-wk fcast: {fmtDol(fcast52Total)}</span>
        </div>
        <LineChart
          labels={revChart.labels}
          datasets={[
            { label: 'Actual Revenue', data: revChart.actualData, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,0.07)', fill: true },
            { label: 'Forecast Revenue', data: revChart.fcastData, borderColor: '#00CF92', backgroundColor: 'rgba(0,207,146,0.05)', fill: true, borderDash: [5, 4] },
          ]}
        />
      </div>

      {/* ── Units Trend ──────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{'📦'} Weekly {unit === 'cases' ? 'Cases' : 'Units'} Trend (Omni Actuals)</div>
        <LineChart
          labels={DATA_OMNI.weeks}
          datasets={[{ label: unit === 'cases' ? 'Weekly Cases' : 'Weekly Units', data: trendData, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,0.08)', fill: true }]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* ── AVF by Category ────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">{'🎯'} Actuals vs Forecast by Category</div>
          <BarChart
            labels={catKeys}
            datasets={[
              { label: 'Actual (LW)', data: catKeys.map(c => catAVF[c].a), backgroundColor: 'rgba(0,227,205,0.75)' },
              { label: 'Forecast', data: catKeys.map(c => catAVF[c].f), backgroundColor: 'rgba(255,199,17,0.45)', borderColor: '#FFC711', borderWidth: 1 },
            ]}
          />
        </div>

        {/* ── Inventory Donut ────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">{'⚠️'} Inventory Health</div>
          <DoughnutChart
            labels={invDonut.labels}
            data={invDonut.data}
            colors={['rgba(239,68,68,.8)', 'rgba(255,199,17,.8)', 'rgba(0,207,146,.8)']}
          />
        </div>
      </div>

      {/* ── Promo Calendar ───────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{'📅'} Upcoming Promo Events</div>
        {promoList.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)', minWidth: 52 }}>Wk{p.wk}&middot;{p.date}</span>
            <span style={{ fontSize: 12, flex: 1, color: 'var(--tx)' }}>{p.event}</span>
            <span className={`ch ${p.status.toLowerCase().includes('confirm') || p.status.includes('✓') ? 'cg' : 'cy2'}`} style={{ fontSize: 10 }}>
              {p.status.toLowerCase().includes('confirm') ? '✓' : '⏳'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yw)', minWidth: 36, textAlign: 'right' }}>{p.lift_pct}</span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
