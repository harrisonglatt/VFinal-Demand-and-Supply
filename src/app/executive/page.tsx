'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import ButtonGroup from '@/components/ui/ButtonGroup';
import {
  DATA_DP, DATA_SHIP, DATA_PROMO, DATA_ACCURACY, DATA_STOPSHIP, DATA_AVF,
} from '@/data/index';
import { useOverrides } from '@/hooks/useOverrides';
import { fmt, fmtP, sf } from '@/lib/formatters';
import {
  aggregateExec, detectRiskSkus, calcCV,
  type RiskSku,
} from '@/lib/computations/executive';
import type { ScenarioKey } from '@/data/types';

/* ── Blended UPC constant ─────────────────────────────────────────── */
const BLENDED_UPC = 13.4;

/* ── Scenario options ─────────────────────────────────────────────── */
const SCENARIO_OPTS = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

const SCENARIO_MULT: Record<ScenarioKey, number> = { bear: 0.80, base: 1.00, bull: 1.20 };

/* ── Event type colors ────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  TPC: 'var(--ac2)', 'Launch TPC': '#00F9B8', DWA: 'var(--yw)',
  'Co-space': 'var(--pu)', Circle: 'var(--rd)', CSTI: 'var(--cy)',
};

/* ── Category meta for snapshot bars ──────────────────────────────── */
const CAT_META: Record<string, { col: string; em: string }> = {
  'Baby Snacks': { col: '#00E3CD', em: '👶' },
  'Kids Snacks': { col: '#00CF92', em: '🧒' },
  Frozen: { col: '#DC7BFF', em: '🧊' },
  Smoothies: { col: '#FFC711', em: '🥤' },
  YoGos: { col: '#18A7FF', em: '🍓' },
};

export default function ExecutivePage() {
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const { velFor, state } = useOverrides();
  const mult = SCENARIO_MULT[scenario];

  /* ── Build velocity-override map for aggregation ───────────────── */
  const velOverrides = state.velOverrides;

  /* ── Aggregate exec data ───────────────────────────────────────── */
  const agg = useMemo(
    () => aggregateExec(DATA_DP.skus, velOverrides),
    [velOverrides],
  );

  const { tot13Base, tot13Bear, tot13Bull, lwTotal, llwTotal, wow } = agg;
  const tot13 = scenario === 'bear' ? tot13Bear : scenario === 'bull' ? tot13Bull : tot13Base;

  /* ── Ship plan aggregates ──────────────────────────────────────── */
  const shipAgg = useMemo(() => {
    let planCases = 0, poCases = 0, fcastCases = 0;
    if (DATA_SHIP?.skus) {
      DATA_SHIP.skus.forEach(s => {
        planCases += sf(s.weeks['13-wk Plan Cases']);
        poCases += sf(s.weeks['13-wk PO Cases']);
        fcastCases += sf(s.weeks['13-wk Fcast Cases'] || 0);
      });
    }
    const planUnits = Math.round(planCases * BLENDED_UPC);
    const covPct = planCases > 0 ? (poCases + fcastCases) / planCases : 0;
    const gapUnits = tot13Base - planUnits;
    return { planCases, poCases, fcastCases, planUnits, covPct, gapUnits };
  }, [tot13Base]);

  const { planCases, poCases, covPct, gapUnits, planUnits } = shipAgg;

  /* ── Risk watchlist ────────────────────────────────────────────── */
  const risks: RiskSku[] = useMemo(() => detectRiskSkus(DATA_DP.skus), []);

  /* ── Next 4 events ─────────────────────────────────────────────── */
  const next4 = useMemo(() => DATA_PROMO.filter(e => e.wk >= 1 && e.wk <= 4), []);

  /* ── Promo counts ──────────────────────────────────────────────── */
  const promoCount = useMemo(() => DATA_PROMO.filter(e => e.wk >= 1 && e.wk <= 13).length, []);
  const confirmedCount = useMemo(
    () => DATA_PROMO.filter(e => e.wk <= 13 && e.status === '✓ Confirmed').length, [],
  );

  /* ── Auto callouts ─────────────────────────────────────────────── */
  const callouts = useMemo(() => {
    const calls: { cls: string; ic: string; txt: string }[] = [];

    if (covPct >= 0.90)
      calls.push({ cls: 'ci-grn', ic: '✅', txt: `<strong>Forecast on track:</strong> PO + modeled forecast covers <strong>${Math.round(covPct * 100)}%</strong> of the 13-week plan target (${fmt(planCases)} cs).` });
    else if (covPct >= 0.70)
      calls.push({ cls: 'ci-yel', ic: '⚠️', txt: `<strong>Coverage gap:</strong> At ${Math.round(covPct * 100)}%, ~<strong>${fmt(Math.round(planCases * (1 - covPct)))} cs</strong> unplanned. Consider additional PO submissions.` });
    else if (covPct > 0)
      calls.push({ cls: 'ci-red', ic: '🚨', txt: `<strong>Significant shortfall:</strong> Forecast covers only ${Math.round(covPct * 100)}% of plan. Velocity or PO cadence needs immediate review.` });

    const frozenEndcap = DATA_PROMO.find(e => e.category === 'Frozen' && e.type === 'Co-space' && e.wk <= 6);
    if (frozenEndcap)
      calls.push({ cls: 'ci-pur', ic: '🧊', txt: `<strong>Frozen P4 co-space Wk ${frozenEndcap.wk} (${frozenEndcap.date}):</strong> 4-wk endcap at 1,531 stores. Modeled at <strong>1.50x</strong> base velocity — corrected from previous 2.0x (old model double-counted BOGO).` });

    const dwa = DATA_PROMO.find(e => e.type === 'DWA' && e.wk >= 1 && e.wk <= 13 && e.category === 'Brand-Wide');
    if (dwa)
      calls.push({ cls: 'ci-yel', ic: '⭐', txt: `<strong>DWA BOGO 25% Wk ${dwa.wk} (${dwa.date}):</strong> Brand-wide chain event. Largest single demand driver — models at <strong>1.50–1.60x</strong> base velocity depending on category.` });

    if (Math.abs(wow) > 0.04)
      calls.push({
        cls: wow > 0 ? 'ci-grn' : 'ci-red',
        ic: wow > 0 ? '📈' : '📉',
        txt: `<strong>${wow > 0 ? 'Positive' : 'Negative'} WoW signal:</strong> LW actuals <strong>${fmtP(wow)}</strong> vs prior week. ${wow > 0 ? 'Early TPC activation likely.' : 'Monitor for TPC lapse or OOS.'}`,
      });

    const kidsNote = DATA_PROMO.find(e => e.type === 'DWA' && e.wk >= 1 && e.wk <= 13 && (e.category || '').includes('Kids'));
    if (kidsNote)
      calls.push({ cls: 'ci-pur', ic: '🧸', txt: `<strong>Kids DWA Wk ${kidsNote.wk}:</strong> Model uses <strong>1.45x</strong> (corrected from 2.0x). Old assumption required elasticity of −5x — structurally incorrect. New: 20%-off event at elasticity −2.5 → 1.50x, adjusted to 1.45x.` });

    if (scenario !== 'base')
      calls.push({ cls: 'ci-blu', ic: '🔮', txt: `<strong>Viewing ${scenario.toUpperCase()} scenario (×${mult.toFixed(2)}):</strong> All forward units scaled ${scenario === 'bear' ? 'down' : 'up'} by ${Math.round(Math.abs(mult - 1) * 100)}%. Switch to Base for model-default.` });

    if (!calls.length)
      calls.push({ cls: 'ci-grn', ic: '✓', txt: '<strong>Model running normally.</strong> No anomalies detected. All 14 pages initializing, forecast propagating, scenarios active.' });

    return calls;
  }, [covPct, planCases, wow, scenario, mult]);

  /* ── Category snapshot ─────────────────────────────────────────── */
  const catSnap = useMemo(() => {
    const catPlan: Record<string, { plan: number; po: number; fcast: number }> = {};
    if (DATA_SHIP?.skus) {
      DATA_SHIP.skus.forEach(sh => {
        const dpSku = DATA_DP.skus.find(d => d.dpci === sh.dpci);
        const cat = (dpSku?.category || 'Other').replace(' Multiserve', '');
        if (!catPlan[cat]) catPlan[cat] = { plan: 0, po: 0, fcast: 0 };
        catPlan[cat].plan += sf(sh.weeks['13-wk Plan Cases'] || 0) * BLENDED_UPC;
        catPlan[cat].po += sf(sh.weeks['13-wk PO Cases'] || 0) * BLENDED_UPC;
        catPlan[cat].fcast += sf(sh.weeks['13-wk Fcast Cases'] || 0) * BLENDED_UPC;
      });
    }
    return catPlan;
  }, []);

  const catEntries = useMemo(() => {
    return Object.entries(catSnap).filter(([, v]) => v.plan > 0);
  }, [catSnap]);
  const maxPlan = useMemo(() => Math.max(...catEntries.map(([, v]) => v.plan), 1), [catEntries]);

  /* ── Risk summary data ─────────────────────────────────────────── */
  const riskSummary = useMemo(() => {
    const highRisk = DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH');
    const totalBear = DATA_STOPSHIP.total_bear_exposure_usd;
    const modelMAPE = DATA_ACCURACY.model_mape_l4w;
    const behind = DATA_AVF.filter(s => s.vs_fcast_pct <= -0.15).length;
    return { highRisk, totalBear, modelMAPE, behind };
  }, []);

  /* ── KPI card derivations ──────────────────────────────────────── */
  const scCol = { bear: 'var(--rd)', base: 'var(--ac)', bull: 'var(--gr)' }[scenario];
  const scLbl = { bear: 'Bear', base: 'Base', bull: 'Bull' }[scenario];

  return (
    <PageShell
      title="Executive Summary"
      subtitle="Decision Dashboard · Week of Mar 22, 2026 · Omni actuals through Mar 24"
      extra={
        <ButtonGroup options={SCENARIO_OPTS} active={scenario} onChange={v => setScenario(v as ScenarioKey)} />
      }
    >
      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="📦" label={`13-Wk Forecast (${scLbl})`}
          style={`--cc:${scCol}`} value={fmt(tot13)}
          delta={wow > 0.01 ? `${fmtP(wow)} WoW (actuals)` : wow < -0.01 ? `${fmtP(wow)} WoW decel` : 'Flat WoW'}
          deltaClass={wow > 0.01 ? 'up' : wow < -0.05 ? 'dn' : 'neu'}
          sub={`${fmt(tot13Base)} base · ${fmt(tot13Bear)} bear · ${fmt(tot13Bull)} bull`}
        />
        <KpiCard
          icon="🎯" label="Coverage vs Plan"
          style={`--cc:${covPct >= 0.90 ? 'var(--gr)' : covPct >= 0.70 ? 'var(--yw)' : 'var(--rd)'}`}
          value={covPct > 0 ? `${Math.round(covPct * 100)}%` : '—'}
          delta={covPct >= 0.90 ? '✓ On track' : covPct >= 0.70 ? '⚠ Gap detected' : '⚠ Behind plan'}
          deltaClass={covPct >= 0.90 ? 'up' : covPct >= 0.70 ? 'neu' : 'dn'}
          sub={`Plan: ${fmt(planCases)} cs · PO committed: ${fmt(poCases)} cs`}
        />
        <KpiCard
          icon="📉" label="Forecast Gap"
          style={`--cc:${gapUnits >= 0 ? 'var(--gr)' : 'var(--rd)'}`}
          value={`${gapUnits >= 0 ? '+' : ''}${fmt(gapUnits)} units`}
          delta={gapUnits >= 0 ? 'Ahead of plan' : 'Behind plan'}
          deltaClass={gapUnits >= 0 ? 'up' : 'dn'}
          sub={`vs plan of ${fmt(planUnits)} units`}
        />
        <KpiCard
          icon="📈" label="LW Actuals (Mar 8)"
          style="--cc:var(--cy)" value={fmt(lwTotal)}
          delta={`${fmtP(wow)} vs prior week`}
          deltaClass={wow > 0.02 ? 'up' : wow < -0.05 ? 'dn' : 'neu'}
          sub={`${DATA_DP.skus.length} SKUs · LW = week ending Mar 8, 2026`}
        />
      </KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* ── Scenario Bars ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Scenario Range (13-Wk Units)</div>
          <ScenarioBars bear={tot13Bear} base={tot13Base} bull={tot13Bull} />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--tx3)', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--tx)' }}>Range:</b> {fmt(tot13Bear)}&ndash;{fmt(tot13Bull)} units ({fmt(tot13Bull - tot13Bear)} spread) &nbsp;&middot;&nbsp;
            <b style={{ color: 'var(--tx)' }}>Promo events:</b> {promoCount} in 13 wks &nbsp;&middot;&nbsp;
            <b style={{ color: 'var(--tx)' }}>Confirmed:</b> {confirmedCount} events &nbsp;&middot;&nbsp;
            <b style={{ color: 'var(--tx)' }}>Model MAPE:</b> {DATA_ACCURACY.model_mape_l4w.toFixed(1)}% (use per-SKU bands for precision) &nbsp;&middot;&nbsp;
            <span style={{ color: 'rgba(239,68,68,.8)' }}>Bear/Bull &plusmn;20% = illustrative scenarios, not model confidence intervals</span>
          </div>
        </div>

        {/* ── Next 4 Events ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Next 4 Weeks Events</div>
          {next4.length === 0 ? (
            <div style={{ color: 'var(--tx3)', fontSize: 12, padding: 20, textAlign: 'center' }}>No events in next 4 weeks</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {next4.map((e, i) => {
                const col = TYPE_COLORS[e.type] || 'var(--tx2)';
                const conf = e.status === '✓ Confirmed';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--s2)', borderRadius: 8, borderLeft: `3px solid ${col}` }}>
                    <div style={{ minWidth: 38, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Wk {e.wk}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{e.date}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.event}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{e.mechanic} &middot; {e.stores} stores</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{e.lift_pct}</div>
                      <div style={{ fontSize: 10, color: conf ? 'var(--gr)' : 'var(--tx3)' }}>{conf ? '✓ Confirmed' : '⏳ Pending'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* ── Risk Watchlist ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Risk Watchlist{risks.length > 0 && ` — ${risks.length} SKUs`}</div>
          {risks.length === 0 ? (
            <div style={{ color: 'var(--gr)', fontSize: 12.5, padding: 20, textAlign: 'center', lineHeight: 1.8 }}>
              &#10003; No active risk flags<br />
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>All SKUs within normal velocity range</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {risks.slice(0, 6).map((r, i) => {
                const col = r.type === 'declining' ? 'var(--rd)' : 'var(--yw)';
                const ic = r.type === 'declining' ? '📉' : '⚠️';
                const lbl = r.type === 'declining' ? `${fmtP(r.trend)} 4-wk` : `CV: ${(r.cv * 100).toFixed(0)}%`;
                return (
                  <div key={i} className="risk-item">
                    <div style={{ fontSize: 16 }}>{ic}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{r.cat}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: col }}>{lbl}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>LW: {fmt(r.lw)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Auto Callouts ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Auto-Generated Callouts</div>
          {callouts.map((c, i) => (
            <div key={i} className={`callout-item ${c.cls}`}>
              <div className="ci-icon">{c.ic}</div>
              <div className="ci-text" dangerouslySetInnerHTML={{ __html: c.txt }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk Summary (Inventory at Risk + Forecast Accuracy) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{'⚠️'} Inventory at Risk</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444', marginBottom: 4 }}>
            ${Math.round(riskSummary.totalBear / 1000)}K <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>bear case</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 8 }}>
            {riskSummary.highRisk.length} HIGH risk SKU{riskSummary.highRisk.length !== 1 ? 's' : ''} &middot; stop-ship constraints active
          </div>
          {riskSummary.highRisk.slice(0, 2).map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--tx3)', padding: '3px 0', borderTop: '1px solid rgba(239,68,68,.15)' }}>
              {'🔴'} {s.name.substring(0, 30)} &mdash; ${Math.round(s.risk_usd_bear / 1000)}K
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(255,199,17,.06)', border: '1px solid rgba(255,199,17,.2)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{'📊'} Forecast Accuracy Signal</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: riskSummary.modelMAPE < 15 ? 'var(--gr)' : riskSummary.modelMAPE < 25 ? 'var(--yw)' : 'var(--rd)', marginBottom: 4 }}>
            {riskSummary.modelMAPE.toFixed(1)}% <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>MAPE L4W</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 8 }}>
            Model bias: {DATA_ACCURACY.model_bias_l4w > 0 ? '+' : ''}{DATA_ACCURACY.model_bias_l4w.toFixed(1)}% &middot; {riskSummary.behind} SKUs pacing &ge;15% below
          </div>
          {Object.entries(DATA_ACCURACY.cat_mape).slice(0, 3).map(([cat, mape], i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--tx3)', padding: '3px 0', borderTop: '1px solid rgba(255,199,17,.15)' }}>
              {mape > 22 ? '🔴' : mape > 15 ? '🟡' : '✅'} {cat}: {mape.toFixed(1)}%
            </div>
          ))}
        </div>
      </div>

      {/* ── Category Forecast Coverage ────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Category Forecast Coverage vs Plan</div>
        {catEntries.length === 0 ? (
          <div style={{ color: 'var(--tx3)', padding: 20, textAlign: 'center', fontSize: 12 }}>Loading category coverage data&hellip;</div>
        ) : (
          catEntries.map(([cat, v]) => {
            const m = CAT_META[cat] || { col: 'var(--ac)', em: '📦' };
            const cov = v.plan > 0 ? (v.po + v.fcast) / v.plan : 0;
            const pct = Math.round(cov * 100);
            const barCol = cov >= 0.90 ? '#00CF92' : cov >= 0.70 ? '#FFC711' : '#ef4444';
            const planW = Math.round(v.plan / maxPlan * 100);
            const fillW = Math.round(Math.min(cov, 1) * planW);
            return (
              <div key={cat} className="cat-snap-row">
                <div className="cat-snap-name">{m.em} <b>{cat}</b></div>
                <div className="cat-snap-bar-wrap">
                  <div className="cat-snap-bar-bg" style={{ width: `${planW}%`, position: 'relative' }}>
                    <div className="cat-snap-bar-fg" style={{ width: `${fillW > 0 ? Math.round(fillW / planW * 100) : 0}%`, background: `${barCol}30`, borderRight: `2px solid ${barCol}` }} />
                  </div>
                  <div className="cat-snap-bar-sub">
                    <span>PO+Fcst: {fmt(Math.round(v.po + v.fcast))}</span>
                    <span>Plan: {fmt(Math.round(v.plan))}</span>
                  </div>
                </div>
                <div className="cat-snap-pct" style={{ color: barCol }}>{pct}%</div>
              </div>
            );
          })
        )}
      </div>
    </PageShell>
  );
}

/* ── Scenario Bars sub-component ─────────────────────────────────── */

function ScenarioBars({ bear, base, bull }: { bear: number; base: number; bull: number }) {
  const maxV = Math.max(bear, base, bull) || 1;
  const bars = [
    { lbl: 'Bear', v: bear, col: '#ef4444', mult: 0.80 },
    { lbl: 'Base', v: base, col: '#00E3CD', mult: 1.00 },
    { lbl: 'Bull', v: bull, col: '#00CF92', mult: 1.20 },
  ];
  return (
    <div>
      {bars.map(b => (
        <div key={b.lbl} className="scen-bar-row">
          <div className="scen-bar-lbl" style={{ color: b.col }}>{b.lbl}</div>
          <div className="scen-bar-track">
            <div className="scen-bar-fill" style={{ width: `${Math.round(b.v / maxV * 100)}%`, background: `${b.col}22`, borderRight: `2px solid ${b.col}80` }}>
              <span style={{ color: b.col, fontSize: 12 }}>{fmt(b.v)}</span>
            </div>
          </div>
          <div className="scen-bar-val" style={{ color: b.col }}>&times;{b.mult.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
