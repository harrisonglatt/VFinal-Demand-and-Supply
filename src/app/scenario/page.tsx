'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP, DATA_OMNI, FCAST_REV_52WK } from '@/data/index';
import { usePromo } from '@/context/PromoContext';
import { fmt, fmtDol, sf } from '@/lib/formatters';
import { calcCV } from '@/lib/computations/executive';
import type { ScenarioKey } from '@/data/types';

const VIEW_OPTS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sensitivity', label: 'Sensitivity' },
  { value: 'weekly', label: 'Weekly Plan' },
  { value: 'sku', label: 'By SKU' },
];

const MULT: Record<ScenarioKey, number> = { bear: 0.80, base: 1.00, bull: 1.20 };

export default function ScenarioPage() {
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [view, setView] = useState('overview');
  const [customMult, setCustomMult] = useState(1.0);
  const [useCustom, setUseCustom] = useState(false);
  const promo = usePromo();

  const mult = useCustom ? customMult : MULT[scenario];
  const fWks = DATA_DP.fcast_weeks;

  /* ── 52-Week Projections with promo lifts ────────────────────────── */
  const projections = useMemo(() => {
    const weeklyRev = { bear: [] as number[], base: [] as number[], bull: [] as number[], custom: [] as number[] };
    const weeklyUnits = { bear: [] as number[], base: [] as number[], bull: [] as number[], custom: [] as number[] };

    for (let w = 0; w < 52; w++) {
      let baseUnits = 0;
      DATA_DP.skus.forEach(s => {
        const lift = promo.getLift(w, s.category);
        baseUnits += sf(s.fcast[w]) * (1 + lift / 100);
      });

      weeklyUnits.bear.push(Math.round(baseUnits * 0.80));
      weeklyUnits.base.push(Math.round(baseUnits));
      weeklyUnits.bull.push(Math.round(baseUnits * 1.20));
      weeklyUnits.custom.push(Math.round(baseUnits * customMult));

      const baseRev = (FCAST_REV_52WK[w] ?? 0);
      weeklyRev.bear.push(Math.round(baseRev * 0.80));
      weeklyRev.base.push(Math.round(baseRev));
      weeklyRev.bull.push(Math.round(baseRev * 1.20));
      weeklyRev.custom.push(Math.round(baseRev * customMult));
    }

    return { weeklyRev, weeklyUnits };
  }, [promo, customMult]);

  const p = projections;
  const activeUnits = useCustom ? p.weeklyUnits.custom : p.weeklyUnits[scenario];
  const activeRev = useCustom ? p.weeklyRev.custom : p.weeklyRev[scenario];
  const totalRev = activeRev.reduce((a, b) => a + b, 0);
  const totalUnits = activeUnits.reduce((a, b) => a + b, 0);
  const avgWeeklyRev = Math.round(totalRev / 52);
  const peakRevIdx = activeRev.indexOf(Math.max(...activeRev));
  const peakRev = activeRev[peakRevIdx];

  const omniLw = DATA_OMNI.weekly_totals[DATA_OMNI.weekly_totals.length - 1];
  const omniAnnualized = (omniLw?.sales ?? 0) * 52;
  const vsOmni = omniAnnualized > 0 ? (totalRev - omniAnnualized) / omniAnnualized : 0;

  const actualWeeks = DATA_OMNI.weekly_totals.slice(-6);
  const actualLabels = actualWeeks.map(w => w.week.replace(/,?\s*\d{4}/, '').trim());

  /* ── Sensitivity analysis ───────────────────────────────────────── */
  const sensitivities = useMemo(() => {
    const scenarios = [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30];
    return scenarios.map(m => {
      const rev = FCAST_REV_52WK.reduce((a, b) => a + b * m, 0);
      const units = DATA_DP.skus.reduce((a, s) => a + s.fcast.reduce((x, y) => x + y, 0) * m, 0);
      return { mult: m, label: `×${m.toFixed(2)}`, rev: Math.round(rev), units: Math.round(units) };
    });
  }, []);

  /* ── SKU breakdown ──────────────────────────────────────────────── */
  const skuRows = useMemo(() => {
    return DATA_DP.skus.map(s => {
      const f52 = s.fcast.reduce((a, b) => a + b, 0);
      const cv = calcCV(s.hist);
      const promoWeeks = fWks.filter((_, i) => promo.isOnPromo(i, s.category)).length;
      return {
        name: s.name.replace(/,\s+[\d.]+\s+oz.*/, '').substring(0, 30),
        category: s.category,
        bear52: Math.round(f52 * 0.80), base52: Math.round(f52), bull52: Math.round(f52 * 1.20),
        range52: Math.round(f52 * 0.40), cv: Math.round(cv * 100), promoWeeks,
      };
    }).sort((a, b) => b.base52 - a.base52);
  }, [fWks, promo]);

  return (
    <PageShell
      title="Scenario Analysis"
      subtitle={`52-week what-if modeling · ${useCustom ? `Custom ×${customMult.toFixed(2)}` : `${scenario.charAt(0).toUpperCase() + scenario.slice(1)} ×${mult.toFixed(2)}`} · Promo-adjusted`}
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />
          <ButtonGroup
            options={[{ value: 'bear', label: 'Bear' }, { value: 'base', label: 'Base' }, { value: 'bull', label: 'Bull' }]}
            active={useCustom ? '' : scenario}
            onChange={v => { setScenario(v as ScenarioKey); setUseCustom(false); }}
          />
        </div>
      }
    >
      {/* ── Custom Scenario Slider ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--s2)', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--tx3)' }}>Custom:</span>
        <input type="range" min="0.5" max="1.5" step="0.01" value={customMult} onChange={e => { setCustomMult(parseFloat(e.target.value)); setUseCustom(true); }} style={{ flex: 1, accentColor: 'var(--ac)' }} />
        <span style={{ fontWeight: 800, color: useCustom ? 'var(--ac)' : 'var(--tx3)', minWidth: 50 }}>×{customMult.toFixed(2)}</span>
        {useCustom && <button onClick={() => setUseCustom(false)} style={{ background: 'var(--s3)', border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 8px', color: 'var(--tx)', fontSize: 10, cursor: 'pointer' }}>Reset</button>}
      </div>

      <KpiGrid columns={4}>
        <KpiCard icon="💰" label="52-Wk Revenue" style={`--cc:${mult >= 1 ? 'var(--gr)' : 'var(--rd)'}`} value={`$${(totalRev / 1_000_000).toFixed(1)}M`} delta={`×${mult.toFixed(2)} scenario`} deltaClass={mult >= 1 ? 'up' : 'dn'} sub={`Avg $${fmt(avgWeeklyRev)}/wk`} />
        <KpiCard icon="📦" label="52-Wk Units" style="--cc:var(--cy)" value={`${(totalUnits / 1_000_000).toFixed(2)}M`} delta={`${fmt(Math.round(totalUnits / 52))}/wk`} deltaClass="neu" sub={`${DATA_DP.skus.length} SKUs`} />
        <KpiCard icon="📈" label="Peak Week" style="--cc:var(--gr)" value={`$${fmt(peakRev)}`} delta={fWks[peakRevIdx] || ''} deltaClass="up" sub={`${Math.round(peakRev / avgWeeklyRev * 100)}% of avg`} />
        <KpiCard icon="🔮" label="vs Omni Run Rate" style={`--cc:${vsOmni >= 0 ? 'var(--gr)' : 'var(--rd)'}`} value={`${vsOmni >= 0 ? '+' : ''}${(vsOmni * 100).toFixed(1)}%`} delta={`Omni: $${(omniAnnualized / 1_000_000).toFixed(1)}M ann.`} deltaClass={vsOmni >= 0 ? 'up' : 'dn'} sub="" />
      </KpiGrid>

      {view === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <div className="card-title">52-Week Revenue Forecast</div>
              <div style={{ padding: '0 12px 12px' }}>
                <LineChart labels={[...actualLabels, ...fWks]} datasets={[
                  { label: 'Actuals', data: [...actualWeeks.map(w => Math.round(w.sales)), ...new Array(52).fill(null)], borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.15)', fill: true },
                  { label: 'Bear', data: [...new Array(actualWeeks.length).fill(null), ...p.weeklyRev.bear], borderColor: '#ef4444', borderDash: [4, 3], backgroundColor: 'transparent' },
                  { label: 'Base', data: [...new Array(actualWeeks.length).fill(null), ...p.weeklyRev.base], borderColor: '#00CF92', backgroundColor: 'rgba(0,207,146,.05)', fill: true },
                  { label: 'Bull', data: [...new Array(actualWeeks.length).fill(null), ...p.weeklyRev.bull], borderColor: '#DC7BFF', borderDash: [4, 3], backgroundColor: 'transparent' },
                ]} height={280} />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Unit Confidence Bands</div>
              <div style={{ padding: '0 12px 12px' }}>
                <LineChart labels={fWks} datasets={[
                  { label: 'Bear', data: p.weeklyUnits.bear, borderColor: 'rgba(239,68,68,.5)', borderDash: [4, 3], backgroundColor: 'transparent' },
                  { label: 'Base', data: p.weeklyUnits.base, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.08)', fill: true },
                  { label: 'Bull', data: p.weeklyUnits.bull, borderColor: 'rgba(220,123,255,.5)', borderDash: [4, 3], backgroundColor: 'transparent' },
                ]} height={280} />
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
            {(['bear', 'base', 'bull'] as const).map(s => {
              const rev = p.weeklyRev[s].reduce((a, b) => a + b, 0);
              const units = p.weeklyUnits[s].reduce((a, b) => a + b, 0);
              const col = s === 'bear' ? '#ef4444' : s === 'bull' ? '#DC7BFF' : '#00CF92';
              return (
                <div key={s} style={{ background: `${col}08`, border: `1px solid ${col}20`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setScenario(s); setUseCustom(false); }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: col, textTransform: 'uppercase' }}>{s} (×{MULT[s].toFixed(2)})</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>${(rev / 1_000_000).toFixed(1)}M</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{(units / 1_000_000).toFixed(2)}M units · ${fmt(Math.round(rev / 52))}/wk</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'sensitivity' && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Revenue Sensitivity (×0.70 → ×1.30)</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart labels={sensitivities.map(s => s.label)} datasets={[{ label: '52-Wk Revenue ($M)', data: sensitivities.map(s => Math.round(s.rev / 1_000_000 * 10) / 10), backgroundColor: sensitivities.map(s => s.mult < 0.9 ? 'rgba(239,68,68,.7)' : s.mult > 1.1 ? 'rgba(220,123,255,.7)' : 'rgba(0,207,146,.7)') }]} height={280} />
            </div>
          </div>
          <DataTable>
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Scenario</th><th className="tr">52-Wk Revenue</th><th className="tr">52-Wk Units</th><th className="tr">$/Wk</th><th className="tr">vs Base</th></tr></thead>
              <tbody>
                {sensitivities.map(s => {
                  const baseRev = sensitivities.find(x => x.mult === 1.0)?.rev ?? s.rev;
                  const vsBase = baseRev > 0 ? (s.rev - baseRev) / baseRev : 0;
                  return (
                    <tr key={s.mult} style={{ background: s.mult === 1.0 ? 'rgba(0,207,146,.06)' : undefined, cursor: 'pointer' }} onClick={() => { setCustomMult(s.mult); setUseCustom(true); }}>
                      <td style={{ fontWeight: s.mult === 1.0 ? 700 : 400 }}>{s.label}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>${(s.rev / 1_000_000).toFixed(1)}M</td>
                      <td className="tr">{(s.units / 1_000_000).toFixed(2)}M</td>
                      <td className="tr">${fmt(Math.round(s.rev / 52))}</td>
                      <td className="tr" style={{ color: vsBase >= 0 ? 'var(--gr)' : 'var(--rd)', fontWeight: 600 }}>{vsBase >= 0 ? '+' : ''}{(vsBase * 100).toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {view === 'weekly' && (
        <DataTable>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Week</th><th className="tr">Bear Rev</th><th className="tr">Base Rev</th><th className="tr">Bull Rev</th><th className="tr">Base Units</th><th>Promos</th></tr></thead>
            <tbody>
              {fWks.map((w, i) => {
                const hasPromo = DATA_DP.skus.some(s => promo.isOnPromo(i, s.category));
                return (
                  <tr key={i} style={{ background: hasPromo ? 'rgba(245,158,11,.06)' : undefined }}>
                    <td style={{ fontWeight: 600, fontSize: 11 }}>{w}</td>
                    <td className="tr" style={{ color: 'rgba(239,68,68,.7)' }}>{fmtDol(p.weeklyRev.bear[i])}</td>
                    <td className="tr" style={{ fontWeight: 600 }}>{fmtDol(p.weeklyRev.base[i])}</td>
                    <td className="tr" style={{ color: 'rgba(220,123,255,.7)' }}>{fmtDol(p.weeklyRev.bull[i])}</td>
                    <td className="tr">{fmt(p.weeklyUnits.base[i])}</td>
                    <td style={{ fontSize: 10, color: hasPromo ? 'var(--yw)' : 'var(--tx3)' }}>{hasPromo ? '🟡 Promo' : '—'}</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                <td>TOTAL</td>
                <td className="tr">${(p.weeklyRev.bear.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)}M</td>
                <td className="tr">${(p.weeklyRev.base.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)}M</td>
                <td className="tr">${(p.weeklyRev.bull.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)}M</td>
                <td className="tr">{(p.weeklyUnits.base.reduce((a, b) => a + b, 0) / 1e6).toFixed(2)}M</td>
                <td />
              </tr>
            </tbody>
          </table>
        </DataTable>
      )}

      {view === 'sku' && (
        <DataTable>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th style={{ minWidth: 180 }}>SKU</th><th>Cat</th><th className="tr">Bear</th><th className="tr">Base</th><th className="tr">Bull</th><th className="tr">Range</th><th className="tr">CV%</th><th className="tr">Promo Wks</th></tr></thead>
            <tbody>
              {skuRows.map((s, i) => (
                <tr key={i}>
                  <td className="tn"><b>{s.name}</b></td>
                  <td style={{ fontSize: 10 }}>{s.category}</td>
                  <td className="tr" style={{ color: 'rgba(239,68,68,.7)' }}>{fmt(s.bear52)}</td>
                  <td className="tr" style={{ fontWeight: 600 }}>{fmt(s.base52)}</td>
                  <td className="tr" style={{ color: 'rgba(220,123,255,.7)' }}>{fmt(s.bull52)}</td>
                  <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(s.range52)}</td>
                  <td className="tr" style={{ color: s.cv > 30 ? 'var(--rd)' : s.cv > 18 ? 'var(--yw)' : 'var(--gr)', fontWeight: 600 }}>{s.cv}%</td>
                  <td className="tr" style={{ color: s.promoWeeks > 0 ? 'var(--yw)' : 'var(--tx3)' }}>{s.promoWeeks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
    </PageShell>
  );
}
