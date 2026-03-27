'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import { DATA_DP } from '@/data/index';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { fmt, fmtP, sf } from '@/lib/formatters';

const LS_DAILY_ACT_KEY = 'ls_ti_daily_act_v1';

type Tab = 'wtd' | 'daily' | 'pace';
type DailyActuals = Record<string, Record<string, { units: number; revenue: number }>>;

function getWeekStart(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function getWeekIdxFromDate(weekStart: string) {
  const planStart = new Date('2026-03-22T00:00:00');
  const ws = new Date(weekStart + 'T00:00:00');
  return Math.max(0, Math.floor((ws.getTime() - planStart.getTime()) / (7 * 24 * 3600 * 1000)));
}

function computeWTD(act: DailyActuals, weekStart: string) {
  const result: Record<string, { units: number; revenue: number; days: number }> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    if (!act[ds]) continue;
    Object.entries(act[ds]).forEach(([skuName, v]) => {
      if (!result[skuName]) result[skuName] = { units: 0, revenue: 0, days: 0 };
      result[skuName].units += v.units || 0;
      result[skuName].revenue += v.revenue || 0;
      result[skuName].days += 1;
    });
  }
  return result;
}

export default function ActualsTrackingPage() {
  const [actuals, setActuals] = useLocalStorage<DailyActuals>(LS_DAILY_ACT_KEY, {});
  const [tab, setTab] = useState<Tab>('wtd');
  const [selectedWeek, setSelectedWeek] = useState('2026-03-22');

  /* ── Form state ─────────────────────────────────────────────────── */
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0]);
  const [actSkuName, setActSkuName] = useState('');
  const [actUnits, setActUnits] = useState('');
  const [actRev, setActRev] = useState('');

  /* ── Week selector options ──────────────────────────────────────── */
  const weekOptions = useMemo(() => {
    const actualsWeeks = new Set(Object.keys(actuals).map(d => getWeekStart(d)));
    const planWeeks: string[] = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date('2026-03-22T00:00:00'); d.setDate(d.getDate() + i * 7);
      planWeeks.push(d.toISOString().split('T')[0]);
    }
    return [...new Set([...actualsWeeks, ...planWeeks])].sort();
  }, [actuals]);

  /* ── WTD data ───────────────────────────────────────────────────── */
  const wkIdx = getWeekIdxFromDate(selectedWeek);
  const wtd = useMemo(() => computeWTD(actuals, selectedWeek), [actuals, selectedWeek]);
  const allSkus = DATA_DP.skus;
  const totalWTD = Object.values(wtd).reduce((a, v) => a + v.units, 0);
  const totalFcast = allSkus.reduce((a, s) => a + sf(s.fcast[wkIdx]), 0);
  const skusWithData = Object.keys(wtd).length;
  const daysIn = Math.max(...Object.values(wtd).map(v => v.days), 0);
  const paceTotal = daysIn > 0 ? Math.round(totalWTD / daysIn * 7) : 0;
  const paceVsFcast = totalFcast > 0 ? (paceTotal - totalFcast) / totalFcast : null;

  /* ── Ingest handler ─────────────────────────────────────────────── */
  const handleIngest = useCallback(() => {
    if (!actDate || !actSkuName) { alert('Date and SKU are required.'); return; }
    const units = parseFloat(actUnits) || 0;
    const rev = parseFloat(actRev) || 0;
    setActuals(prev => {
      const next = { ...prev };
      if (!next[actDate]) next[actDate] = {};
      if (!next[actDate][actSkuName]) next[actDate][actSkuName] = { units: 0, revenue: 0 };
      next[actDate][actSkuName] = { units: next[actDate][actSkuName].units + units, revenue: next[actDate][actSkuName].revenue + rev };
      return next;
    });
    setActUnits(''); setActRev('');
  }, [actDate, actSkuName, actUnits, actRev, setActuals]);

  const handleClearAll = useCallback(() => {
    if (confirm('Clear ALL daily actuals? This cannot be undone.')) setActuals({});
  }, [setActuals]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(actuals, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ls-daily-actuals-' + new Date().toISOString().split('T')[0] + '.json'; a.click();
  }, [actuals]);

  /* ── Seed demo actuals ──────────────────────────────────────────── */
  const handleSeedDemo = useCallback(() => {
    const act: DailyActuals = { ...actuals };
    const LW_START = '2026-03-15';
    allSkus.forEach(s => {
      const lw7 = s.hist[11] || 0;
      const perDay = Math.round(lw7 / 7);
      for (let i = 0; i < 7; i++) {
        const d = new Date(LW_START + 'T00:00:00'); d.setDate(d.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        if (!act[ds]) act[ds] = {};
        const variation = 0.92 + Math.random() * 0.16;
        act[ds][s.name] = { units: Math.round(perDay * variation), revenue: Math.round(perDay * variation * s.price) };
      }
    });
    const CW_DAYS = ['2026-03-22', '2026-03-23', '2026-03-24'];
    allSkus.forEach(s => {
      const cw3 = s.hist[12] || 0;
      const perDayCW = cw3 > 0 ? Math.round(cw3 / 3) : Math.round((s.hist[11] || 0) / 7);
      CW_DAYS.forEach((ds, i) => {
        if (!act[ds]) act[ds] = {};
        const variation = 0.90 + Math.random() * 0.20;
        const dayMult = [0.90, 1.08, 1.05][i] || 1.0;
        act[ds][s.name] = { units: Math.round(perDayCW * variation * dayMult), revenue: Math.round(perDayCW * variation * dayMult * s.price) };
      });
    });
    setActuals(act);
    alert('Demo actuals loaded: last week (7 days) + current week (3 days).');
  }, [actuals, allSkus, setActuals]);

  /* ── Daily table data ───────────────────────────────────────────── */
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(selectedWeek + 'T00:00:00'); d.setDate(d.getDate() + i); arr.push(d.toISOString().split('T')[0]); }
    return arr;
  }, [selectedWeek]);

  /* ── Model feedback ─────────────────────────────────────────────── */
  const feedbackInsights = useMemo(() => {
    const insights: { name: string; cat: string; pct: number; proj: number; fcast: number; action: string }[] = [];
    allSkus.forEach(s => {
      const d = wtd[s.name]; if (!d || !d.days) return;
      const fcast = sf(s.fcast[wkIdx]);
      const proj = Math.round(d.units / d.days * 7);
      const pct = fcast > 0 ? (proj - fcast) / fcast : null;
      if (pct === null || Math.abs(pct) < 0.10) return;
      insights.push({
        name: s.name, cat: s.category, pct, proj, fcast,
        action: pct > 0 ? 'Consider bumping short-term forecast upward.' : 'Check promo execution, distribution, or competitive pricing.',
      });
    });
    return insights;
  }, [wtd, wkIdx, allSkus]);

  return (
    <PageShell
      title="Actuals Tracking"
      subtitle="WTD summary · Daily detail · Run-rate/pace · Model feedback"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12 }}>
            {weekOptions.map(w => {
              const d = new Date(w + 'T00:00:00');
              return <option key={w} value={w}>Wk of {d.getMonth() + 1}/{d.getDate()}/{String(d.getFullYear()).slice(2)}</option>;
            })}
          </select>
          <ButtonGroup
            options={[{ value: 'wtd', label: 'WTD Summary' }, { value: 'daily', label: 'Daily Detail' }, { value: 'pace', label: 'Run-Rate / Pace' }]}
            active={tab} onChange={v => setTab(v as Tab)}
          />
        </div>
      }
    >
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <KpiGrid columns={4}>
          <KpiCard icon="&#128197;" label="Days In (CW)" style="--cc:var(--cy)" value={daysIn || '0'} delta="Days of actuals available" deltaClass="neu" sub={selectedWeek} />
          <KpiCard icon="&#128230;" label="WTD Units" style="--cc:var(--ac)" value={fmt(totalWTD) || '—'}
            delta={daysIn + ' day actual vs ' + fmt(totalFcast) + ' wk fcast'} deltaClass="neu" sub={skusWithData + ' SKUs with data'} />
          <KpiCard icon="&#128200;" label="Run-Rate Projection" style={`--cc:${paceVsFcast === null ? 'var(--cy)' : paceVsFcast >= -0.02 ? 'var(--gr)' : paceVsFcast >= -0.10 ? 'var(--yw)' : 'var(--rd)'}`}
            value={paceTotal ? fmt(paceTotal) : '—'} delta="Projected EOW at current pace"
            deltaClass={paceVsFcast === null ? 'neu' : paceVsFcast >= 0 ? 'up' : 'dn'}
            sub={paceVsFcast !== null ? (paceVsFcast >= 0 ? '+' : '') + Math.round(paceVsFcast * 100) + '% vs forecast' : '—'} />
          <KpiCard icon="&#128994;" label="SKUs w/ Actuals" style="--cc:var(--gr)" value={skusWithData} delta="With at least 1 day of data" deltaClass="neu" sub={allSkus.length + ' total active SKUs'} />
        </KpiGrid>

        {/* ── WTD Tab ─────────────────────────────────────────────────── */}
        {tab === 'wtd' && (
          <div className="cc">
            <div className="ct">Week-to-Date Summary</div>
            <DataTable>
              <table className="dt">
                <thead><tr>
                  <th>SKU</th><th>Category</th><th>State</th><th className="tr">Fcast (Week)</th><th className="tr">WTD Actual</th>
                  <th className="tr">Days In</th><th className="tr">Daily Pace</th><th className="tr">Proj EOW</th><th className="tr">EOW vs Fcast</th>
                </tr></thead>
                <tbody>
                  {allSkus.map(s => {
                    const fcast = sf(s.fcast[wkIdx]);
                    const d = wtd[s.name];
                    const state = d ? (d.days >= 7 ? 'complete' : 'partial') : 'no_data';
                    const pace = d && d.days ? Math.round(d.units / d.days) : null;
                    const proj = pace ? Math.round(pace * 7) : null;
                    const vsF = proj && fcast ? (proj - fcast) / fcast : null;
                    return (
                      <tr key={s.dpci}>
                        <td style={{ maxWidth: 180 }} title={s.name}>{s.name}</td>
                        <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.category}</td>
                        <td>{state === 'complete' ? '● Complete' : state === 'partial' ? '◑ Partial' : '○ No Data'}</td>
                        <td className="tr">{fmt(fcast) || '—'}</td>
                        <td className="tr"><b>{d ? fmt(d.units) : '—'}</b></td>
                        <td className="tr">{d ? d.days : '—'}</td>
                        <td className="tr">{pace ? fmt(pace) : '—'}</td>
                        <td className="tr" style={proj && fcast ? { fontWeight: 600 } : { color: 'var(--tx3)' }}>{proj ? fmt(proj) : '—'}</td>
                        <td className={`tr ${vsF === null ? '' : vsF >= 0.05 ? 'cg' : vsF <= -0.05 ? 'cr' : 'cy2'}`}>{vsF !== null ? fmtP(vsF) : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
                    <td>TOTAL</td><td></td><td></td>
                    <td className="tr">{fmt(totalFcast)}</td><td className="tr"><b>{fmt(totalWTD) || '—'}</b></td>
                    <td className="tr">{daysIn || '—'}</td>
                    <td className="tr">{daysIn > 0 ? fmt(Math.round(totalWTD / daysIn)) : '—'}</td>
                    <td className="tr">{paceTotal ? fmt(paceTotal) : '—'}</td>
                    <td className={`tr ${paceVsFcast === null ? '' : paceVsFcast >= 0.05 ? 'cg' : paceVsFcast <= -0.05 ? 'cr' : 'cy2'}`}>{paceVsFcast !== null ? fmtP(paceVsFcast) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Daily Tab ───────────────────────────────────────────────── */}
        {tab === 'daily' && (
          <div className="cc">
            <div className="ct">Daily Detail</div>
            <DataTable>
              <table className="dt">
                <thead><tr>
                  <th>SKU</th>
                  {days.map((d, i) => <th key={d} className="tr">{dayLabels[i]}<br /><span style={{ fontSize: 9, color: 'var(--tx3)' }}>{d.slice(5)}</span></th>)}
                  <th className="tr">WTD</th>
                </tr></thead>
                <tbody>
                  {allSkus.filter(s => {
                    return days.some(d => actuals[d] && actuals[d][s.name]);
                  }).map(s => {
                    const dayVals = days.map(d => (actuals[d] && actuals[d][s.name]) ? actuals[d][s.name].units : null);
                    const wtdTotal = dayVals.reduce((a: number, v) => a + (v || 0), 0);
                    return (
                      <tr key={s.dpci}>
                        <td style={{ maxWidth: 180 }} title={s.name}>{s.name}</td>
                        {dayVals.map((v, i) => <td key={i} className="tr" style={v != null ? undefined : { color: 'var(--tx3)' }}>{v != null ? fmt(v) : '—'}</td>)}
                        <td className="tr"><b>{fmt(wtdTotal)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Pace Tab ────────────────────────────────────────────────── */}
        {tab === 'pace' && (
          <div className="cc">
            <div className="ct">Run-Rate / Pace</div>
            {Object.keys(wtd).length === 0 ? (
              <div style={{ color: 'var(--tx3)', padding: 20, textAlign: 'center' }}>No actuals for this week. Load demo data or ingest actuals first.</div>
            ) : (
              <DataTable>
                <table className="dt">
                  <thead><tr>
                    <th>SKU</th><th>Category</th><th className="tr">Fcast</th><th className="tr">WTD</th><th className="tr">Days In</th>
                    <th className="tr">Daily Avg</th><th className="tr">Proj EOW</th><th className="tr">Delta</th><th>Pace Signal</th>
                  </tr></thead>
                  <tbody>
                    {allSkus.filter(s => wtd[s.name]).map(s => {
                      const fcast = sf(s.fcast[wkIdx]);
                      const d = wtd[s.name];
                      const pace = d.days ? Math.round(d.units / d.days) : 0;
                      const proj = Math.round(pace * 7);
                      const delta = proj - fcast;
                      const pct = fcast > 0 ? (proj - fcast) / fcast : null;
                      const signal = pct === null ? '—' : pct > 0.10 ? 'Running hot' : pct > 0.02 ? 'Pacing ahead' : pct >= -0.02 ? 'On track' : pct >= -0.10 ? 'Slightly behind' : 'Tracking low';
                      return (
                        <tr key={s.dpci}>
                          <td title={s.name}>{s.name}</td>
                          <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.category}</td>
                          <td className="tr">{fmt(fcast)}</td><td className="tr">{fmt(d.units)}</td>
                          <td className="tr">{d.days}</td><td className="tr">{fmt(pace)}</td>
                          <td className="tr"><b>{fmt(proj)}</b></td>
                          <td className={`tr ${delta >= 0 ? 'cg' : 'cr'}`}>{delta >= 0 ? '+' : ''}{fmt(delta)}</td>
                          <td>{signal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTable>
            )}
          </div>
        )}

        {/* ── Actuals Ingestion Form ──────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Ingest Daily Actuals</div>
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 10, alignItems: 'end', fontSize: 12 }}>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={actDate} onChange={e => setActDate(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>SKU</label>
              <select value={actSkuName} onChange={e => setActSkuName(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
                <option value="">Select...</option>{allSkus.map(s => <option key={s.dpci} value={s.name}>{s.name.substring(0, 55)}</option>)}
              </select></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Units</label>
              <input type="number" value={actUnits} onChange={e => setActUnits(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <div><label style={{ color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Revenue</label>
              <input type="number" value={actRev} onChange={e => setActRev(e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} /></div>
            <button onClick={handleIngest} style={{ background: 'var(--ac)', color: '#000', border: 'none', borderRadius: 6, padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Add</button>
          </div>
          <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
            <button onClick={handleSeedDemo} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '5px 13px', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11.5 }}>Load Demo Actuals</button>
            <button onClick={handleExport} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '5px 13px', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11.5 }}>Export</button>
            <button onClick={handleClearAll} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 5, padding: '5px 13px', color: 'var(--rd)', cursor: 'pointer', fontSize: 11.5 }}>Clear All</button>
          </div>
        </div>

        {/* ── Model Feedback ───────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Model Feedback — Pace Deviations</div>
          {feedbackInsights.length === 0 ? (
            <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 30 }}>No significant pace deviations this week — all SKUs within +/-10% of forecast.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10, padding: 12 }}>
              {feedbackInsights.map((ins, i) => (
                <div key={i} className="cc" style={{ borderLeft: `3px solid ${ins.pct > 0 ? 'var(--gr)' : 'var(--rd)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div><b style={{ fontSize: 13 }}>{ins.name}</b><span style={{ fontSize: 10.5, color: 'var(--tx3)', marginLeft: 8 }}>{ins.cat}</span></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ins.pct >= 0 ? 'var(--gr)' : 'var(--rd)' }}>{ins.pct >= 0 ? '+' : ''}{Math.round(ins.pct * 100)}% vs fcast</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Proj EOW: <b style={{ color: 'var(--tx)' }}>{fmt(ins.proj)}</b> vs Fcast: {fmt(ins.fcast)}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 5, borderTop: '1px solid var(--s3)', paddingTop: 5 }}>
                    <b>Suggested action:</b> {ins.action}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
