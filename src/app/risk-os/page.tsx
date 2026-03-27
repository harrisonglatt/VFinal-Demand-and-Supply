'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import { DATA_DP, DATA_ACCURACY, DATA_STOPSHIP, DATA_AVF } from '@/data/index';
import { fmt, fmtP, sf } from '@/lib/formatters';

type RiskFilter = 'all' | 'high' | 'medium';

/* ── Helper: trust signal ─────────────────────────────────────────── */
function TrustSignal({ level, score }: { level: string; score: number }) {
  const cfg: Record<string, { icon: string; col: string; bg: string }> = {
    High: { icon: '✅', col: 'var(--gr)', bg: 'rgba(0,207,146,.1)' },
    Medium: { icon: '⚠️', col: 'var(--yw)', bg: 'rgba(255,199,17,.1)' },
    Low: { icon: '🔴', col: 'var(--rd)', bg: 'rgba(239,68,68,.1)' },
  };
  const c = cfg[level] || cfg.Medium;
  return (
    <span title={`Trust score ${score}/100`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.col, fontSize: 11, fontWeight: 700, cursor: 'help' }}>
      {c.icon} {level}
    </span>
  );
}

/* ── Helper: risk chip ────────────────────────────────────────────── */
function RiskChipOS({ level }: { level: string }) {
  if (level === 'HIGH') return <span style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{'🔴'} HIGH</span>;
  if (level === 'MEDIUM') return <span style={{ background: 'rgba(255,199,17,.12)', color: '#fbbf24', border: '1px solid rgba(255,199,17,.3)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{'🟡'} MED</span>;
  return <span style={{ background: 'rgba(0,207,146,.1)', color: 'var(--gr)', border: '1px solid rgba(0,207,146,.2)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{'🟢'} LOW</span>;
}

/* ── Helper: sell-through bar ─────────────────────────────────────── */
function STBar({ pct }: { pct: number }) {
  const col = pct >= 0.90 ? 'var(--gr)' : pct >= 0.75 ? 'var(--yw)' : 'var(--rd)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: col, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontWeight: 700, minWidth: 34 }}>{Math.round(pct * 100)}%</span>
    </div>
  );
}

export default function RiskOSPage() {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [catFilter, setCatFilter] = useState('');
  const [trustFilter, setTrustFilter] = useState('');

  const getAcc = (dpci: string) => DATA_ACCURACY.skus.find(s => s.dpci === dpci) || null;
  const getSS = (dpci: string) => DATA_STOPSHIP.skus.find(s => s.dpci === dpci) || null;

  /* ── KPI values ─────────────────────────────────────────────────── */
  const totalBearUSD = DATA_STOPSHIP.total_bear_exposure_usd;
  const totalBaseUSD = DATA_STOPSHIP.total_base_exposure_usd;
  const highCt = DATA_STOPSHIP.high_risk_count;
  const medCt = DATA_STOPSHIP.medium_risk_count;
  const modelMAPE = DATA_ACCURACY.model_mape_l4w;
  const modelBias = DATA_ACCURACY.model_bias_l4w;
  const behind = DATA_AVF.filter(s => s.vs_fcast_pct <= -0.15).length;
  const ahead = DATA_AVF.filter(s => s.vs_fcast_pct >= 0.10).length;

  /* ── Stop-ship table data ───────────────────────────────────────── */
  const ssSkus = useMemo(() => {
    let skus = [...DATA_STOPSHIP.skus];
    if (riskFilter === 'high') skus = skus.filter(s => s.risk_level === 'HIGH');
    if (riskFilter === 'medium') skus = skus.filter(s => s.risk_level === 'MEDIUM');
    const rlOrd: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    skus.sort((a, b) => (rlOrd[a.risk_level] || 2) - (rlOrd[b.risk_level] || 2) || b.risk_usd_bear - a.risk_usd_bear);
    return skus;
  }, [riskFilter]);

  /* ── Accuracy summary ───────────────────────────────────────────── */
  const catMape = DATA_ACCURACY.cat_mape;
  const catBias = DATA_ACCURACY.cat_bias;

  /* ── Category risk map ──────────────────────────────────────────── */
  const catRiskData = useMemo(() => {
    const avfByCat: Record<string, { acts: number; fcasts: number }> = {};
    DATA_AVF.forEach(s => {
      const cat = s.category || (s as any).cat;
      if (!avfByCat[cat]) avfByCat[cat] = { acts: 0, fcasts: 0 };
      avfByCat[cat].acts += sf(s.lw_units);
      avfByCat[cat].fcasts += sf(s.fcast_units);
    });
    const ssRiskByCat: Record<string, number> = {};
    DATA_STOPSHIP.skus.forEach(s => { ssRiskByCat[s.category] = (ssRiskByCat[s.category] || 0) + s.risk_usd_bear; });
    return { avfByCat, ssRiskByCat };
  }, []);

  /* ── Decision cards ─────────────────────────────────────────────── */
  const actionSkus = useMemo(() =>
    DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH' || s.risk_level === 'MEDIUM')
      .sort((a, b) => b.risk_usd_bear - a.risk_usd_bear),
  []);

  /* ── MAPE chart ─────────────────────────────────────────────────── */
  const mapeChartCats = Object.keys(catMape);
  const mapeChartVals = mapeChartCats.map(c => catMape[c]);
  const mapeColors = mapeChartVals.map(v => v < 12 ? 'rgba(0,207,146,0.7)' : v < 22 ? 'rgba(255,199,17,0.7)' : 'rgba(239,68,68,0.7)');

  /* ── Exposure chart ─────────────────────────────────────────────── */
  const expSkus = DATA_STOPSHIP.skus.filter(s => s.risk_level !== 'LOW');
  const expNames = expSkus.map(s => s.name.substring(0, 18) + '…');

  /* ── Integrated SKU table ───────────────────────────────────────── */
  const integratedSkus = useMemo(() => {
    const avfMap: Record<string, typeof DATA_AVF[0]> = {};
    DATA_AVF.forEach(s => { avfMap[s.dpci] = s; });
    let skus = DATA_DP.skus.filter(s => {
      if (catFilter && s.category !== catFilter) return false;
      if (trustFilter) {
        const acc = getAcc(s.dpci);
        if (!acc || acc.trust_level !== trustFilter) return false;
      }
      return true;
    });
    const rlOrd: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    skus.sort((a, b) => {
      const ssA = getSS(a.dpci); const ssB = getSS(b.dpci);
      const rlA = ssA ? ssA.risk_level : 'LOW'; const rlB = ssB ? ssB.risk_level : 'LOW';
      if (rlOrd[rlA] !== rlOrd[rlB]) return (rlOrd[rlA] || 2) - (rlOrd[rlB] || 2);
      return (ssB ? ssB.risk_usd_bear : 0) - (ssA ? ssA.risk_usd_bear : 0);
    });
    return { skus, avfMap };
  }, [catFilter, trustFilter]);

  return (
    <PageShell title="Risk OS" subtitle="Integrated risk assessment · Accuracy · Stop-ship exposure">
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── KPIs ────────────────────────────────────────────────────── */}
        <KpiGrid columns={4}>
          <KpiCard icon="&#128176;" label="$ At Risk (Bear Case)" style="--cc:var(--rd)"
            value={'$' + Math.round(totalBearUSD / 1000) + 'K'}
            delta={`Base: $${Math.round(totalBaseUSD / 1000)}K`} deltaClass="dn"
            sub={`${highCt} HIGH · ${medCt} MED risk SKUs`} />
          <KpiCard icon="&#128308;" label="High Risk Stop-Ships" style="--cc:var(--rd)"
            value={highCt + ' SKUs'} delta={`${highCt} require immediate action`} deltaClass="dn"
            sub={[...new Set(DATA_STOPSHIP.skus.filter(s => s.risk_level === 'HIGH').map(s => s.category))].join(', ') + ' at risk'} />
          <KpiCard icon="&#128202;" label="Model Accuracy — L4W" style="--cc:var(--cy)"
            value={modelMAPE.toFixed(1) + '% MAPE'}
            delta={`Bias: ${modelBias >= 0 ? '+' : ''}${modelBias.toFixed(1)}% ${Math.abs(modelBias) < 3 ? '(well-calibrated)' : modelBias > 3 ? '(over-forecasting)' : '(under-forecasting)'}`}
            deltaClass={Math.abs(modelBias) < 3 ? 'neu' : 'dn'}
            sub={`${behind} SKUs below fcast · ${ahead} beating`} />
          <KpiCard icon="&#128201;" label="SKUs Pacing Below Fcast" style="--cc:var(--yw)"
            value={`${behind} of ${DATA_AVF.length}`}
            delta={behind === 0 ? 'All on or ahead of pace' : behind <= 3 ? 'Monitor' : 'Review demand'}
            deltaClass={behind === 0 ? 'up' : behind > 5 ? 'dn' : 'neu'}
            sub="LW actuals vs model · threshold >=15% miss" />
        </KpiGrid>

        {/* ── Accuracy Summary ────────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Accuracy Summary — Category MAPE & Bias</div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th className="tr">MAPE L4W</th>
                  <th className="tr">Bias (+ = over)</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(catMape).map(cat => {
                  const mape = catMape[cat];
                  const bias = catBias[cat] || 0;
                  const mapeCol = mape < 12 ? 'var(--gr)' : mape < 22 ? 'var(--yw)' : 'var(--rd)';
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ fontWeight: 600 }}>{cat}</td>
                      <td className="tr" style={{ color: mapeCol, fontWeight: 700 }}>{mape.toFixed(1)}%</td>
                      <td className="tr" style={{ color: Math.abs(bias) > 10 ? 'var(--rd)' : Math.abs(bias) > 5 ? 'var(--yw)' : 'var(--gr)' }}>
                        {bias > 5 ? '↑ over' : bias < -5 ? '↓ under' : '≈ flat'} ({bias > 0 ? '+' : ''}{bias.toFixed(1)}%)
                      </td>
                      <td>{mape < 12 ? '✅ Good' : mape < 22 ? '⚠️ Monitor' : '🔴 High error'}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '2px solid var(--bd)', background: 'var(--s2)' }}>
                  <td style={{ fontWeight: 800 }}>Total Model</td>
                  <td className="tr" style={{ fontWeight: 800, color: modelMAPE < 15 ? 'var(--yw)' : 'var(--rd)' }}>{modelMAPE.toFixed(1)}%</td>
                  <td className="tr">{modelBias > 0 ? '↑ over' : '↓ under'} ({modelBias > 0 ? '+' : ''}{modelBias.toFixed(1)}%)</td>
                  <td style={{ fontSize: 11, color: Math.abs(modelBias) > 5 ? 'var(--rd)' : 'var(--tx3)' }}>{Math.abs(modelBias) > 5 ? '⚠️ Systemic bias' : '✓ Calibrated'}</td>
                </tr>
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Category Risk Map ───────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Category Risk Map</div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th className="tr">LW vs Fcast</th>
                  <th className="tr">$ Exposure</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(catRiskData.avfByCat).map(([cat, d]) => {
                  const avfPct = (d.acts - d.fcasts) / (d.fcasts || 1);
                  const exp = catRiskData.ssRiskByCat[cat] || 0;
                  const riskLvl = exp > 150000 ? 'HIGH' : exp > 30000 ? 'MEDIUM' : 'LOW';
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ fontWeight: 600 }}>{cat}</td>
                      <td className="tr" style={{ color: avfPct >= 0 ? 'var(--gr)' : avfPct >= -0.10 ? 'var(--yw)' : 'var(--rd)', fontWeight: 700 }}>
                        {avfPct >= 0 ? '+' : ''}{(avfPct * 100).toFixed(1)}%
                      </td>
                      <td className="tr" style={{ fontWeight: 700, color: exp > 50000 ? 'var(--rd)' : exp > 0 ? 'var(--yw)' : 'var(--gr)' }}>
                        {exp > 0 ? '$' + Math.round(exp / 1000) + 'K' : '—'}
                      </td>
                      <td><RiskChipOS level={riskLvl} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>

        {/* ── Stop-Ship Filter + Table ─────────────────────────────────── */}
        <div className="cc">
          <div className="ct" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Stop-Ship Exposure</span>
            <ButtonGroup
              options={[{ value: 'all', label: 'All' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }]}
              active={riskFilter}
              onChange={v => setRiskFilter(v as RiskFilter)}
            />
          </div>
          {ssSkus.length === 0 ? (
            <div style={{ color: 'var(--tx3)', padding: 20, textAlign: 'center', fontSize: 12 }}>No SKUs match filter</div>
          ) : (
            <DataTable>
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>SKU — Stop-Ship Reason</th>
                    <th className="tr">Urgency</th>
                    <th className="tr">DC Available</th>
                    <th className="tr">Worst-Case ST%</th>
                    <th className="tr">Base ST%</th>
                    <th className="tr">Bear Leftover</th>
                    <th className="tr" style={{ color: 'var(--rd)' }}>$ At Risk</th>
                    <th>Fcast Trust</th>
                    <th>Risk</th>
                    <th style={{ minWidth: 220 }}>Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  {ssSkus.map(s => {
                    const wksLeft = s.stop_ship_wk - 1;
                    const urgCol = wksLeft <= 3 ? 'var(--rd)' : wksLeft <= 6 ? 'var(--yw)' : 'var(--tx2)';
                    const urgIcon = wksLeft <= 3 ? '🔥' : wksLeft <= 6 ? '⏰' : '📅';
                    const acc = getAcc(s.dpci);
                    return (
                      <tr key={s.dpci} style={{
                        background: s.risk_level === 'HIGH' ? 'rgba(239,68,68,.05)' : s.risk_level === 'MEDIUM' ? 'rgba(255,199,17,.04)' : undefined,
                        borderLeft: s.risk_level === 'HIGH' ? '3px solid rgba(239,68,68,.5)' : s.risk_level === 'MEDIUM' ? '3px solid rgba(255,199,17,.4)' : '3px solid transparent',
                      }}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{s.name.substring(0, 36)}</div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.reason}</div>
                        </td>
                        <td className="tr">
                          <div style={{ fontWeight: 800, color: urgCol, fontSize: 13 }}>{urgIcon} {wksLeft} wks</div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Stop {s.stop_ship_date}</div>
                        </td>
                        <td className="tr">
                          <div style={{ fontWeight: 600 }}>{s.total_available.toLocaleString()} units</div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.dc_on_hand.toLocaleString()} OH{s.dc_inbound > 0 ? ` + ${s.dc_inbound.toLocaleString()} IB` : ''}</div>
                        </td>
                        <td className="tr"><STBar pct={s.st_pct_bear} /></td>
                        <td className="tr" style={{ color: 'var(--ac)', fontWeight: 700 }}>{Math.round(s.st_pct_base * 100)}%</td>
                        <td className="tr">
                          <div style={{ fontWeight: 700, color: s.leftover_bear > 10000 ? 'var(--rd)' : s.leftover_bear > 3000 ? 'var(--yw)' : 'var(--gr)' }}>{s.leftover_bear.toLocaleString()}</div>
                        </td>
                        <td className="tr" style={{ fontWeight: 900, fontSize: 14, color: s.risk_usd_bear > 100000 ? 'var(--rd)' : s.risk_usd_bear > 25000 ? 'var(--yw)' : 'var(--gr)' }}>
                          ${Math.round(s.risk_usd_bear / 1000)}K
                        </td>
                        <td>{acc ? <TrustSignal level={acc.trust_level} score={acc.trust_score} /> : '—'}</td>
                        <td><RiskChipOS level={s.risk_level} /></td>
                        <td>
                          <div style={{ fontSize: 11, color: 'var(--tx)', fontWeight: 600, lineHeight: 1.4 }}>{s.action}</div>
                          {s.risk_level === 'HIGH' && <div style={{ fontSize: 10, color: 'var(--rd)', marginTop: 3, fontWeight: 700 }}>IMMEDIATE ACTION</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          )}
        </div>

        {/* ── Decision Cards ───────────────────────────────────────────── */}
        {actionSkus.length > 0 && (
          <div className="cc">
            <div className="ct">Decision Cards — Action Required</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, padding: 12 }}>
              {actionSkus.map(s => {
                const wksLeft = s.stop_ship_wk - 1;
                const rlCol = s.risk_level === 'HIGH' ? 'rgba(239,68,68,.12)' : 'rgba(255,199,17,.08)';
                const rlBorder = s.risk_level === 'HIGH' ? 'rgba(239,68,68,.35)' : 'rgba(255,199,17,.3)';
                const rlTextCol = s.risk_level === 'HIGH' ? '#ef4444' : '#fbbf24';
                return (
                  <div key={s.dpci} style={{ background: rlCol, border: `1px solid ${rlBorder}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--tx)' }}>{s.name}</div>
                      <RiskChipOS level={s.risk_level} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}><b style={{ color: 'var(--tx)' }}>Why:</b> {s.reason}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10, textAlign: 'center' }}>
                      <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '6px 4px' }}>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Bear $Risk</div>
                        <div style={{ fontWeight: 800, color: rlTextCol, fontSize: 14 }}>${Math.round(s.risk_usd_bear / 1000)}K</div>
                      </div>
                      <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '6px 4px' }}>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Worst-Case ST</div>
                        <div style={{ fontWeight: 800, color: s.st_pct_bear < 0.65 ? 'var(--rd)' : 'var(--yw)', fontSize: 14 }}>{Math.round(s.st_pct_bear * 100)}%</div>
                      </div>
                      <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '6px 4px' }}>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Wks Remaining</div>
                        <div style={{ fontWeight: 800, color: wksLeft <= 3 ? 'var(--rd)' : wksLeft <= 6 ? 'var(--yw)' : 'var(--tx2)', fontSize: 14 }}>{wksLeft}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, background: 'var(--s3)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, color: rlTextCol, marginBottom: 3 }}>Recommended Action</div>
                      <div style={{ color: 'var(--tx2)' }}>{s.action}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MAPE Chart ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="cc">
            <div className="ct">MAPE by Category</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={mapeChartCats}
                datasets={[{ label: 'MAPE L4W (%)', data: mapeChartVals, backgroundColor: mapeColors[0] || 'rgba(99,102,241,.7)' }]}
                height={200}
              />
            </div>
          </div>
          <div className="cc">
            <div className="ct">Exposure by SKU (Bear / Base / Bull)</div>
            <div style={{ padding: '0 12px 12px' }}>
              <BarChart
                labels={expNames}
                datasets={[
                  { label: 'Bull ($)', data: expSkus.map(s => s.risk_usd_bull), backgroundColor: 'rgba(0,207,146,0.5)' },
                  { label: 'Base ($)', data: expSkus.map(s => s.risk_usd_base), backgroundColor: 'rgba(0,227,205,0.6)' },
                  { label: 'Bear ($)', data: expSkus.map(s => s.risk_usd_bear), backgroundColor: 'rgba(239,68,68,0.65)' },
                ]}
                height={200}
              />
            </div>
          </div>
        </div>

        {/* ── Integrated SKU Table ─────────────────────────────────────── */}
        <div className="cc">
          <div className="ct" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Integrated SKU Table</span>
            <FilterBar>
              <SelectFilter id="ros-cat-filter" options={DATA_DP.skus.map(s => s.category)} value={catFilter} onChange={setCatFilter} />
              <SelectFilter id="ros-trust-filter" options={['High', 'Medium', 'Low']} value={trustFilter} onChange={setTrustFilter} allLabel="All Trust" />
            </FilterBar>
          </div>
          <DataTable>
            <table className="dt">
              <thead>
                <tr>
                  <th>SKU</th><th>Category</th>
                  <th className="tr">Wk1 Fcast</th>
                  <th className="tr" style={{ color: 'var(--rd)' }}>Bear</th>
                  <th className="tr" style={{ color: 'var(--gr)' }}>Bull</th>
                  <th className="tr">LW Actual</th>
                  <th className="tr">LW vs Fcast</th>
                  <th className="tr">MAPE L4W</th>
                  <th>Fcast Trust</th>
                  <th>Stop Ship</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {integratedSkus.skus.map(s => {
                  const acc = getAcc(s.dpci);
                  const avf = integratedSkus.avfMap[s.dpci];
                  const ss = getSS(s.dpci);
                  const lwActual = sf(avf?.lw_units, 0);
                  const lwFcast = sf(avf?.fcast_units, 0);
                  const vsPct = lwFcast > 0 ? (lwActual - lwFcast) / lwFcast : 0;
                  const vsCol = vsPct >= 0.05 ? 'var(--gr)' : vsPct <= -0.15 ? 'var(--rd)' : 'var(--yw)';
                  const rl = ss ? ss.risk_level : (vsPct <= -0.20 ? 'HIGH' : vsPct <= -0.10 ? 'MEDIUM' : 'LOW');
                  const mape = acc ? acc.mape_l4w : 0.20;
                  const base = s.fcast[0] || 0;
                  const bearVal = Math.round(base * Math.max(0.65, 1 - mape / 100 * 1.10));
                  const bullVal = Math.round(base * Math.min(1.35, 1 + mape / 100 * 0.90));
                  return (
                    <tr key={s.dpci} style={{ background: rl === 'HIGH' ? 'rgba(239,68,68,.04)' : rl === 'MEDIUM' ? 'rgba(255,199,17,.03)' : undefined }}>
                      <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 180 }}>{s.name.substring(0, 35)}</td>
                      <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.category}</td>
                      <td className="tr" style={{ fontWeight: 700 }}>{fmt(base)}</td>
                      <td className="tr" style={{ color: 'var(--rd)', fontSize: 11 }}>{fmt(bearVal)}</td>
                      <td className="tr" style={{ color: 'var(--gr)', fontSize: 11 }}>{fmt(bullVal)}</td>
                      <td className="tr" style={{ fontWeight: 600 }}>{lwActual > 0 ? fmt(lwActual) : '—'}</td>
                      <td className="tr" style={{ color: vsCol, fontWeight: 700 }}>{lwFcast === 0 ? '—' : fmtP(vsPct)}</td>
                      <td className="tr" style={{ color: acc && acc.mape_l4w < 15 ? 'var(--gr)' : acc && acc.mape_l4w < 25 ? 'var(--yw)' : 'var(--rd)', fontWeight: 600 }}>
                        {acc ? acc.mape_l4w.toFixed(1) + '%' : '—'}
                      </td>
                      <td>{acc ? <TrustSignal level={acc.trust_level} score={acc.trust_score} /> : '—'}</td>
                      <td>{ss ? <div style={{ fontWeight: 700, color: ss.stop_ship_wk <= 6 ? 'var(--rd)' : 'var(--yw)', fontSize: 11 }}>Wk{ss.stop_ship_wk} · {ss.stop_ship_date}</div> : <span style={{ color: 'var(--tx3)', fontSize: 11 }}>None</span>}</td>
                      <td><RiskChipOS level={rl} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        </div>
      </div>
    </PageShell>
  );
}
