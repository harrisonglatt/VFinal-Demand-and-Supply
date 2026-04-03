'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import LineChart from '@/components/charts/LineChart';
import { DATA_OMNI } from '@/data/index';
import { fmt } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'trends', label: 'Trends' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'insights', label: 'Insights' },
];

const LEVEL_OPTS = [
  { value: 'total', label: 'Total' },
  { value: 'category', label: 'Category' },
  { value: 'sku', label: 'SKU' },
];

/* ── Anomaly detection ─────────────────────────────────────────────── */
function calcAnomaly(values: number[]): { scores: number[]; avg: number; stdDev: number } {
  if (values.length < 3) return { scores: values.map(() => 0), avg: 0, stdDev: 0 };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const scores = values.map(v => stdDev > 0 ? (v - avg) / stdDev : 0);
  return { scores, avg, stdDev };
}

/* ── Map SKU to category ──────────────────────────────────────────── */
function skuCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('curl') || n.includes('ring') || n.includes('carrot') || n.includes('cereal') || n.includes('mini') || n.includes('stellar')) return 'Baby/Kids';
  if (n.includes('smoothie') || n.includes('shake') || n.includes('dream') || n.includes('blast') && !n.includes('yogo') || n.includes('avocado') || n.includes('guava') || n.includes('punch')) return 'Smoothies';
  if (n.includes('yogo') || n.includes('mango twist') || n.includes('bananza') || n.includes('berry blast yogo')) return 'YoGos';
  if (n.includes('turkey') || n.includes('chicken') || n.includes('slider') || n.includes('dipper')) return 'Frozen';
  if (n.includes('oat') || n.includes('chip oat') || n.includes('muffin') || n.includes('pie oat') || n.includes('loop') || n.includes('pizza') || n.includes('mac')) return 'Kids Snacks';
  return 'Other';
}

/* ── Heatmap color ────────────────────────────────────────────────── */
function heatColor(zScore: number): string {
  if (zScore > 1.5) return 'rgba(0,207,146,.4)';
  if (zScore > 0.5) return 'rgba(0,207,146,.15)';
  if (zScore < -1.5) return 'rgba(239,68,68,.4)';
  if (zScore < -0.5) return 'rgba(239,68,68,.15)';
  return 'transparent';
}

interface SkuTrend {
  code: string;
  name: string;
  category: string;
  weeklyUnits: number[];
  weeklyLabels: string[];
  lw: number;
  l4w: number;
  l8w: number;
  wow: number;
  vsTrail: number;
  anomalyScores: number[];
  lastAnomaly: number;
  volatility: number;
  trendDir: 'up' | 'down' | 'flat';
  momentum: number;
}

export default function HistoricalPage() {
  const [view, setView] = useState('trends');
  const [level, setLevel] = useState('total');
  const [catFilter, setCatFilter] = useState('');
  const [query, setQuery] = useState('');

  const weeks = DATA_OMNI.weeks;
  const weekLabels = weeks.map(w => w.replace(/,?\s*\d{4}/, '').trim());

  /* ── Build SKU-level trend data ─────────────────────────────────── */
  const skuTrends = useMemo(() => {
    const trends: SkuTrend[] = [];

    for (const [code, sku] of Object.entries(DATA_OMNI.skus)) {
      const weeklyUnits = weeks.map(w => sku.weeks[w]?.units ?? 0);
      const cat = skuCategory(sku.name);
      const nonZero = weeklyUnits.filter(v => v > 0);
      if (nonZero.length < 2) continue;

      const lw = weeklyUnits[weeklyUnits.length - 1];
      const llw = weeklyUnits[weeklyUnits.length - 2] || lw;
      const l4w = weeklyUnits.slice(-4).reduce((a, b) => a + b, 0);
      const l8w = weeklyUnits.slice(-8).reduce((a, b) => a + b, 0);
      const trailAvg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
      const wow = llw > 0 ? (lw - llw) / llw : 0;
      const vsTrail = trailAvg > 0 ? (lw - trailAvg) / trailAvg : 0;

      const { scores } = calcAnomaly(weeklyUnits);
      const lastAnomaly = scores[scores.length - 1] ?? 0;

      // Volatility (CV)
      const variance = nonZero.reduce((a, b) => a + (b - trailAvg) ** 2, 0) / nonZero.length;
      const volatility = trailAvg > 0 ? Math.sqrt(variance) / trailAvg : 0;

      // Trend direction (linear regression slope on last 6 weeks)
      const recent = weeklyUnits.slice(-6);
      let momentum = 0;
      if (recent.length >= 3) {
        const n = recent.length;
        const xMean = (n - 1) / 2;
        const yMean = recent.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        recent.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
        const slope = den > 0 ? num / den : 0;
        momentum = yMean > 0 ? slope / yMean : 0; // normalized slope
      }
      const trendDir = momentum > 0.02 ? 'up' : momentum < -0.02 ? 'down' : 'flat';

      trends.push({
        code, name: sku.name, category: cat,
        weeklyUnits, weeklyLabels: weekLabels,
        lw, l4w, l8w, wow, vsTrail,
        anomalyScores: scores, lastAnomaly, volatility, trendDir, momentum,
      });
    }

    return trends.sort((a, b) => b.lw - a.lw);
  }, [weeks, weekLabels]);

  /* ── Category aggregates ────────────────────────────────────────── */
  const catTrends = useMemo(() => {
    const catMap: Record<string, number[]> = {};
    for (const s of skuTrends) {
      if (!catMap[s.category]) catMap[s.category] = new Array(weeks.length).fill(0);
      s.weeklyUnits.forEach((v, i) => catMap[s.category][i] += v);
    }
    return Object.entries(catMap).map(([cat, units]) => {
      const { scores } = calcAnomaly(units);
      const lw = units[units.length - 1];
      const llw = units[units.length - 2] || lw;
      return { category: cat, weeklyUnits: units, anomalyScores: scores, lw, wow: llw > 0 ? (lw - llw) / llw : 0 };
    }).sort((a, b) => b.lw - a.lw);
  }, [skuTrends, weeks]);

  /* ── Total ──────────────────────────────────────────────────────── */
  const totalUnits = useMemo(() => weeks.map((_, i) => skuTrends.reduce((a, s) => a + s.weeklyUnits[i], 0)), [skuTrends, weeks]);
  const totalAnomaly = calcAnomaly(totalUnits);

  /* ── Filtered SKUs ──────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return skuTrends.filter(s =>
      (!catFilter || s.category === catFilter) &&
      (!q || s.name.toLowerCase().includes(q))
    );
  }, [skuTrends, catFilter, query]);

  /* ── Auto-generated insights ────────────────────────────────────── */
  const insights = useMemo(() => {
    const items: { icon: string; label: string; detail: string; color: string }[] = [];
    const sorted = [...skuTrends];

    // Biggest positive anomaly (last 4 weeks)
    const topSpike = sorted.sort((a, b) => b.lastAnomaly - a.lastAnomaly)[0];
    if (topSpike && topSpike.lastAnomaly > 1.0) {
      items.push({ icon: '📈', label: 'Biggest Spike', detail: `${topSpike.name} — z-score ${topSpike.lastAnomaly.toFixed(1)} this week (${fmt(topSpike.lw)} units, ${(topSpike.wow * 100).toFixed(0)}% WoW)`, color: '#00CF92' });
    }

    // Biggest negative anomaly
    const topDip = sorted.sort((a, b) => a.lastAnomaly - b.lastAnomaly)[0];
    if (topDip && topDip.lastAnomaly < -1.0) {
      items.push({ icon: '📉', label: 'Biggest Drop', detail: `${topDip.name} — z-score ${topDip.lastAnomaly.toFixed(1)} this week (${fmt(topDip.lw)} units, ${(topDip.wow * 100).toFixed(0)}% WoW)`, color: '#ef4444' });
    }

    // Fastest growing
    const fastGrow = [...skuTrends].sort((a, b) => b.momentum - a.momentum)[0];
    if (fastGrow) {
      items.push({ icon: '🚀', label: 'Strongest Momentum', detail: `${fastGrow.name} — ${(fastGrow.momentum * 100).toFixed(1)}% weekly growth rate, ${fmt(fastGrow.lw)} units LW`, color: '#00CF92' });
    }

    // Largest slowdown
    const slowDown = [...skuTrends].sort((a, b) => a.momentum - b.momentum)[0];
    if (slowDown && slowDown.momentum < -0.02) {
      items.push({ icon: '⚠️', label: 'Biggest Slowdown', detail: `${slowDown.name} — ${(slowDown.momentum * 100).toFixed(1)}% weekly decline, ${fmt(slowDown.lw)} units LW`, color: '#FFC711' });
    }

    // Most volatile
    const mostVol = [...skuTrends].sort((a, b) => b.volatility - a.volatility)[0];
    if (mostVol && mostVol.volatility > 0.3) {
      items.push({ icon: '🎢', label: 'Most Volatile', detail: `${mostVol.name} — CV ${(mostVol.volatility * 100).toFixed(0)}%, highly inconsistent weekly performance`, color: '#818cf8' });
    }

    // Category momentum
    const catMomentum = catTrends.map(c => ({ cat: c.category, wow: c.wow })).sort((a, b) => b.wow - a.wow);
    if (catMomentum.length > 0) {
      items.push({ icon: '💪', label: 'Category Momentum', detail: `Strongest: ${catMomentum[0].cat} (${(catMomentum[0].wow * 100).toFixed(1)}% WoW) · Weakest: ${catMomentum[catMomentum.length - 1].cat} (${(catMomentum[catMomentum.length - 1].wow * 100).toFixed(1)}% WoW)`, color: 'var(--ac)' });
    }

    return items;
  }, [skuTrends, catTrends]);

  const categories = useMemo(() => [...new Set(skuTrends.map(s => s.category))], [skuTrends]);

  return (
    <PageShell
      title="Historical Sell-Through"
      subtitle={`${weeks.length}-week trend intelligence · ${skuTrends.length} SKUs · Anomaly detection active`}
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonGroup options={LEVEL_OPTS} active={level} onChange={setLevel} />
          <ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />
        </div>
      }
    >
      {/* ── Auto Insights Banner ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8, marginBottom: 16 }}>
        {insights.slice(0, 6).map((ins, i) => (
          <div key={i} style={{ padding: '10px 14px', background: `${ins.color}08`, border: `1px solid ${ins.color}20`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ins.color }}>{ins.icon} {ins.label}</div>
            <div style={{ fontSize: 10.5, color: 'var(--tx2)', lineHeight: 1.5, marginTop: 2 }}>{ins.detail}</div>
          </div>
        ))}
      </div>

      {/* ── Trend View ────────────────────────────────────────────── */}
      {view === 'trends' && (
        <>
          {level === 'total' && (
            <div className="card">
              <div className="card-title">Total Portfolio Sell-Through (Weekly Units)</div>
              <div style={{ padding: '0 12px 12px' }}>
                <LineChart
                  labels={weekLabels}
                  datasets={[{
                    label: 'Total Units',
                    data: totalUnits,
                    borderColor: '#00E3CD',
                    backgroundColor: 'rgba(0,227,205,.1)',
                    fill: true,
                  }]}
                  height={300}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px', flexWrap: 'wrap' }}>
                {totalUnits.map((v, i) => {
                  const z = totalAnomaly.scores[i];
                  if (Math.abs(z) < 1.2) return null;
                  return (
                    <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: z > 0 ? 'rgba(0,207,146,.15)' : 'rgba(239,68,68,.15)', color: z > 0 ? '#00CF92' : '#ef4444' }}>
                      {weekLabels[i]}: {z > 0 ? '↑' : '↓'} z={z.toFixed(1)} ({fmt(v)})
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {level === 'category' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {catTrends.map(c => (
                <div className="card" key={c.category}>
                  <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.category}</span>
                    <span style={{ fontSize: 11, color: c.wow > 0.02 ? 'var(--gr)' : c.wow < -0.02 ? 'var(--rd)' : 'var(--tx3)' }}>
                      {c.wow > 0 ? '+' : ''}{(c.wow * 100).toFixed(1)}% WoW
                    </span>
                  </div>
                  <div style={{ padding: '0 12px 8px' }}>
                    <LineChart labels={weekLabels} datasets={[{ label: c.category, data: c.weeklyUnits, borderColor: '#00E3CD', backgroundColor: 'rgba(0,227,205,.08)', fill: true }]} height={160} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {level === 'sku' && (
            <>
              <FilterBar meta={`${filtered.length} SKUs`}>
                <SelectFilter id="hist-cat" options={categories} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
                <input type="text" placeholder="Search SKU..." value={query} onChange={e => setQuery(e.target.value)} style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
              </FilterBar>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                {filtered.slice(0, 12).map(s => (
                  <div key={s.code} style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${s.trendDir === 'up' ? '#00CF92' : s.trendDir === 'down' ? '#ef4444' : 'var(--bd)'}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{s.name}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>
                      <span>LW: <b style={{ color: 'var(--tx)' }}>{fmt(s.lw)}</b></span>
                      <span style={{ color: s.wow > 0.03 ? 'var(--gr)' : s.wow < -0.03 ? 'var(--rd)' : 'var(--tx3)' }}>{s.wow > 0 ? '+' : ''}{(s.wow * 100).toFixed(0)}% WoW</span>
                      {Math.abs(s.lastAnomaly) > 1.2 && <span style={{ color: s.lastAnomaly > 0 ? '#00CF92' : '#ef4444', fontWeight: 700 }}>⚡ z={s.lastAnomaly.toFixed(1)}</span>}
                    </div>
                    {/* Sparkline as a mini bar sequence */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 28 }}>
                      {s.weeklyUnits.map((v, i) => {
                        const max = Math.max(...s.weeklyUnits, 1);
                        const h = Math.round(v / max * 24);
                        const z = s.anomalyScores[i];
                        return <div key={i} style={{ width: '100%', height: h, borderRadius: 1, background: z > 1.2 ? '#00CF92' : z < -1.2 ? '#ef4444' : 'var(--ac)40' }} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Heatmap View ──────────────────────────────────────────── */}
      {view === 'heatmap' && (
        <DataTable>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th className="st" style={{ minWidth: 160 }}>SKU</th>
                  <th>Cat</th>
                  {weekLabels.map((w, i) => <th key={i} style={{ minWidth: 55, fontSize: 9, textAlign: 'center' }}>{w}</th>)}
                  <th className="tr">Trend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 30).map(s => (
                  <tr key={s.code}>
                    <td className="st tn" style={{ fontSize: 11 }}>{s.name}</td>
                    <td style={{ fontSize: 9, color: 'var(--tx3)' }}>{s.category}</td>
                    {s.weeklyUnits.map((v, i) => {
                      const z = s.anomalyScores[i];
                      return (
                        <td key={i} style={{ textAlign: 'center', fontSize: 10, background: heatColor(z), fontWeight: Math.abs(z) > 1.2 ? 700 : 400, color: z > 1.2 ? '#00CF92' : z < -1.2 ? '#ef4444' : 'var(--tx2)' }} title={`${weekLabels[i]}: ${fmt(v)} units (z=${z.toFixed(1)})`}>
                          {v > 0 ? fmt(v) : ''}
                        </td>
                      );
                    })}
                    <td className="tr" style={{ fontSize: 11, fontWeight: 600, color: s.trendDir === 'up' ? 'var(--gr)' : s.trendDir === 'down' ? 'var(--rd)' : 'var(--tx3)' }}>
                      {s.trendDir === 'up' ? '📈' : s.trendDir === 'down' ? '📉' : '➡️'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      )}

      {/* ── Rankings View ─────────────────────────────────────────── */}
      {view === 'rankings' && (
        <>
          <FilterBar meta={`${filtered.length} SKUs · Ranked by LW units`}>
            <SelectFilter id="hist-cat2" options={categories} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
            <input type="text" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
          </FilterBar>
          <DataTable>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>SKU</th>
                  <th>Category</th>
                  <th className="tr">LW</th>
                  <th className="tr">L4W</th>
                  <th className="tr">L8W</th>
                  <th className="tr">WoW %</th>
                  <th className="tr">vs Trail Avg</th>
                  <th className="tr">Anomaly</th>
                  <th className="tr">Volatility</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.code}>
                    <td className="tn"><b>{s.name}</b></td>
                    <td style={{ fontSize: 10 }}>{s.category}</td>
                    <td className="tr" style={{ fontWeight: 600 }}>{fmt(s.lw)}</td>
                    <td className="tr">{fmt(s.l4w)}</td>
                    <td className="tr" style={{ color: 'var(--tx3)' }}>{fmt(s.l8w)}</td>
                    <td className="tr" style={{ color: s.wow > 0.03 ? 'var(--gr)' : s.wow < -0.03 ? 'var(--rd)' : 'var(--tx2)', fontWeight: 600 }}>
                      {s.wow > 0 ? '+' : ''}{(s.wow * 100).toFixed(1)}%
                    </td>
                    <td className="tr" style={{ color: s.vsTrail > 0.05 ? 'var(--gr)' : s.vsTrail < -0.05 ? 'var(--rd)' : 'var(--tx2)' }}>
                      {s.vsTrail > 0 ? '+' : ''}{(s.vsTrail * 100).toFixed(1)}%
                    </td>
                    <td className="tr">
                      {Math.abs(s.lastAnomaly) > 1.5 ? (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: s.lastAnomaly > 0 ? 'rgba(0,207,146,.15)' : 'rgba(239,68,68,.15)', color: s.lastAnomaly > 0 ? '#00CF92' : '#ef4444', fontWeight: 700 }}>
                          ⚡ {s.lastAnomaly.toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--tx3)', fontSize: 10 }}>{s.lastAnomaly.toFixed(1)}</span>
                      )}
                    </td>
                    <td className="tr" style={{ color: s.volatility > 0.4 ? 'var(--rd)' : s.volatility > 0.25 ? 'var(--yw)' : 'var(--gr)', fontWeight: 600 }}>
                      {(s.volatility * 100).toFixed(0)}%
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {s.trendDir === 'up' ? '📈' : s.trendDir === 'down' ? '📉' : '➡️'}
                      <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--tx3)' }}>{(s.momentum * 100).toFixed(1)}%/wk</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </>
      )}

      {/* ── Insights View ─────────────────────────────────────────── */}
      {view === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: `${ins.color}06`, border: `1px solid ${ins.color}20`, borderRadius: 10 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{ins.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ins.color }}>{ins.label}</div>
                <div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.6 }}>{ins.detail}</div>
              </div>
            </div>
          ))}

          {/* Top 5 movers table */}
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-title">Top 5 Movers This Week</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 16px 16px' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gr)', marginBottom: 8 }}>Biggest Gainers</div>
                {[...skuTrends].sort((a, b) => b.wow - a.wow).slice(0, 5).map((s, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--gr)', fontWeight: 700 }}>+{(s.wow * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rd)', marginBottom: 8 }}>Biggest Decliners</div>
                {[...skuTrends].sort((a, b) => a.wow - b.wow).slice(0, 5).map((s, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--rd)', fontWeight: 700 }}>{(s.wow * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
