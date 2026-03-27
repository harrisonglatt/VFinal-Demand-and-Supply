'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import { DATA_DAILY, DATA_DP, DATA_PROMO, FCAST_REV_52WK, PROMO_WKS } from '@/data/index';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { fmt, fmtDol, sf, fmtP } from '@/lib/formatters';

const LS_LOCK_KEY = 'ls_ti_fc_locks_v2';

interface LockSnap {
  id: number; name: string; note: string; ts: string; scenario: string;
  fcast_weeks: string[];
  skus: { dpci: string; name: string; cat: string; price: number; ucase: number; fcast: number[]; hist: number[] }[];
  rev52: number[]; totalUnits52: number; totalRev52: number; totalCases52: number;
  liftTable: Record<string, { tpc: number; bogo: number; dwa: number; endcap: number }>;
  auditLog: { timestamp: string; dataAsOf: string; forecastWindow: string; totalPromoEvents: number; stackingRule: string; generatedBy: string };
}

function escH(s: string) { return (s || '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m] || m)); }

export default function ForecastVersionsPage() {
  const [locks, setLocks] = useLocalStorage<LockSnap[]>(LS_LOCK_KEY, []);
  const [activeLockId, setActiveLockId] = useState<number | null>(null);
  const [lockName, setLockName] = useState('');
  const [lockNote, setLockNote] = useState('');

  const activeLock = useMemo(() => activeLockId ? locks.find(l => l.id === activeLockId) || null : null, [locks, activeLockId]);
  const liveTotU = useMemo(() => DATA_DP.skus.reduce((a, s) => a + s.fcast.reduce((b: number, v: number) => b + (v || 0), 0), 0), []);
  const liveTotR = useMemo(() => FCAST_REV_52WK.reduce((a, b) => a + b, 0), []);

  const handleLock = useCallback(() => {
    const now = new Date();
    const liftTable = {
      'Baby Snacks': { tpc: 1.20, bogo: 1.55, dwa: 1.60, endcap: 1.25 },
      'Kids Snacks': { tpc: 1.25, bogo: 1.55, dwa: 1.45, endcap: 1.25 },
      'Frozen Multiserve': { tpc: 1.10, bogo: 1.60, dwa: 1.60, endcap: 1.50 },
      'Smoothies': { tpc: 1.35, bogo: 1.45, dwa: 1.45, endcap: 1.15 },
      'YoGos': { tpc: 1.25, bogo: 1.45, dwa: 1.50, endcap: 1.20 },
    };
    const snap: LockSnap = {
      id: now.getTime(),
      name: lockName || ('Lock ' + (locks.length + 1) + ' — ' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
      note: lockNote, ts: now.toISOString(), scenario: 'base',
      fcast_weeks: [...DATA_DP.fcast_weeks],
      skus: DATA_DP.skus.map(s => ({ dpci: s.dpci, name: s.name, cat: s.category, price: s.price, ucase: s.ucase, fcast: [...s.fcast], hist: [...s.hist] })),
      rev52: [...FCAST_REV_52WK],
      totalUnits52: liveTotU, totalRev52: liveTotR,
      totalCases52: DATA_DP.skus.reduce((a, s) => a + s.fcast.reduce((b: number, v: number) => b + Math.ceil((v || 0) / s.ucase), 0), 0),
      liftTable,
      auditLog: {
        timestamp: now.toISOString(), dataAsOf: DATA_DAILY.as_of,
        forecastWindow: (DATA_DP.fcast_weeks[0] || '') + '–' + (DATA_DP.fcast_weeks[51] || ''),
        totalPromoEvents: DATA_PROMO.filter(p => p.wk > 0).length,
        stackingRule: 'max(DWA,BOGO); endcap+BOGO=base*endcap*1.35x incremental',
        generatedBy: 'LS Target Demand Intelligence v2.0',
      },
    };
    setLocks(prev => [snap, ...prev].slice(0, 25));
    setLockName(''); setLockNote('');
  }, [lockName, lockNote, locks, liveTotU, liveTotR, setLocks]);

  const handleDelete = useCallback((id: number) => {
    if (confirm('Delete this lock?')) {
      setLocks(prev => prev.filter(l => l.id !== id));
      if (activeLockId === id) setActiveLockId(null);
    }
  }, [activeLockId, setLocks]);

  const handleToggleBaseline = useCallback((id: number) => {
    setActiveLockId(prev => prev === id ? null : id);
  }, []);

  const handleExport = useCallback(() => {
    if (!locks.length) { alert('No locks to export.'); return; }
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), locks }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'LS-forecast-locks-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  }, [locks]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const arr = Array.isArray(parsed) ? parsed : (parsed.locks || []);
        if (!arr.length) throw new Error('Empty');
        setLocks(arr);
        alert('Imported ' + arr.length + ' lock(s).');
      } catch (err: any) { alert('Import failed: ' + err.message); }
    };
    rd.readAsText(file);
  }, [setLocks]);

  return (
    <PageShell title="Forecast Versions" subtitle="Lock · Compare · Audit Trail">
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── KPIs ────────────────────────────────────────────────────── */}
        <KpiGrid columns={4}>
          {activeLock && (
            <>
              <KpiCard icon="&#128274;" label="Active Baseline" style="--cc:var(--ac)" value={activeLock.name.substring(0, 22)}
                delta={new Date(activeLock.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} deltaClass="neu" sub={activeLock.scenario.toUpperCase() + ' scenario'} />
              <KpiCard icon="&#128230;" label="52-Wk Units Delta" style={`--cc:${Math.abs((liveTotU - activeLock.totalUnits52) / activeLock.totalUnits52) < 0.02 ? 'var(--gr)' : 'var(--yw)'}`}
                value={((liveTotU - activeLock.totalUnits52) / activeLock.totalUnits52 * 100).toFixed(1) + '%'}
                delta={fmt(liveTotU) + ' live vs ' + fmt(activeLock.totalUnits52) + ' locked'} deltaClass="neu"
                sub={fmt(Math.abs(Math.round(liveTotU - activeLock.totalUnits52))) + ' unit delta'} />
              <KpiCard icon="&#128176;" label="52-Wk Revenue Delta" style="--cc:var(--yw)"
                value={((liveTotR - activeLock.totalRev52) / activeLock.totalRev52 * 100).toFixed(1) + '%'}
                delta={fmtDol(liveTotR) + ' live vs ' + fmtDol(activeLock.totalRev52) + ' locked'} deltaClass="neu"
                sub={fmtDol(Math.abs(Math.round(liveTotR - activeLock.totalRev52))) + ' rev delta'} />
            </>
          )}
          <KpiCard icon="&#128203;" label="Saved Versions" style="--cc:var(--cy)" value={locks.length}
            delta={activeLock ? 'Baseline: ' + activeLock.name.substring(0, 18) : 'No baseline selected'} deltaClass="neu"
            sub="Click any version to set as baseline" />
        </KpiGrid>

        {/* ── Lock creation form ──────────────────────────────────────── */}
        <div className="cc">
          <div className="ct">Lock Current Forecast</div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12, lineHeight: 1.6 }}>
              Creates an immutable snapshot of the current 52-week forecast. Locked forecasts <strong>do not change</strong> when live assumptions are edited.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 10 }}>
              <input type="text" placeholder="Version name" value={lockName} onChange={e => setLockName(e.target.value)}
                style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13 }} />
              <input type="text" placeholder="Note (optional)" value={lockNote} onChange={e => setLockNote(e.target.value)}
                style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13 }} />
              <button onClick={handleLock}
                style={{ background: 'var(--ac)', color: '#000', border: 'none', borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                Lock Now
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={handleExport} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '5px 13px', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11.5 }}>Export (.json)</button>
              <label style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '5px 13px', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11.5 }}>
                Import (.json)
                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </div>

        {/* ── Versions table ──────────────────────────────────────────── */}
        {!locks.length ? (
          <div className="cc" style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)', fontSize: 13.5 }}>
            No forecast locks yet. Lock your current forecast above to start tracking.
          </div>
        ) : (
          <div className="cc">
            <div className="ct">Saved Forecast Versions</div>
            <DataTable>
              <table className="dt">
                <thead><tr>
                  <th>Version</th><th>Locked</th><th>Scenario</th>
                  <th className="tr">52-wk Units</th><th className="tr">52-wk Cases</th><th className="tr">52-wk Revenue</th>
                  <th>Note</th><th style={{ textAlign: 'center' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {locks.map(lk => {
                    const isActive = activeLockId === lk.id;
                    const dt = new Date(lk.ts);
                    const dU = lk.totalUnits52 ? (liveTotU - lk.totalUnits52) / lk.totalUnits52 : 0;
                    return (
                      <tr key={lk.id} style={isActive ? { background: 'rgba(0,227,205,.05)', outline: '1px solid rgba(0,227,205,.25)' } : undefined}>
                        <td><b style={{ color: isActive ? 'var(--ac)' : 'var(--tx)' }}>{isActive ? '✓ ' : ''}{lk.name}</b></td>
                        <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td>{lk.scenario || 'base'}</td>
                        <td className="tr">{fmt(lk.totalUnits52)}<div style={{ fontSize: 9.5, color: Math.abs(dU) < 0.01 ? 'var(--tx3)' : dU > 0 ? 'var(--gr)' : 'var(--rd)' }}>{dU >= 0 ? '↑' : '↓'}{(Math.abs(dU) * 100).toFixed(1)}% vs live</div></td>
                        <td className="tr">{fmt(lk.totalCases52 || 0)}</td>
                        <td className="tr">{fmtDol(lk.totalRev52)}</td>
                        <td style={{ fontSize: 11, color: 'var(--tx3)', maxWidth: 200 }}>{lk.note || '—'}</td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button onClick={() => handleToggleBaseline(lk.id)}
                            style={{ background: isActive ? 'rgba(0,227,205,.15)' : 'var(--s2)', border: `1px solid ${isActive ? 'rgba(0,227,205,.4)' : 'var(--bd)'}`, borderRadius: 5, padding: '4px 10px', color: isActive ? 'var(--ac)' : 'var(--tx3)', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>
                            {isActive ? '✓ Active' : 'Set Baseline'}
                          </button>
                          <button onClick={() => handleDelete(lk.id)}
                            style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 5, padding: '4px 8px', color: 'var(--rd)', cursor: 'pointer', fontSize: 11 }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Weekly Variance Table (if baseline selected) ─────────────── */}
        {activeLock && (
          <div className="cc">
            <div className="ct">Week-by-Week: Live vs Locked</div>
            <DataTable>
              <table className="dt">
                <thead><tr>
                  <th>Week</th><th className="tr">Locked Units</th><th className="tr">Live Units</th>
                  <th className="tr">Delta Units</th><th className="tr">Delta %</th>
                  <th className="tr">Locked Rev</th><th className="tr">Live Rev</th><th className="tr">Delta Rev</th><th>Promo</th>
                </tr></thead>
                <tbody>
                  {(() => {
                    let cumLockU = 0, cumLiveU = 0, cumLockR = 0, cumLiveR = 0;
                    const rows = DATA_DP.fcast_weeks.map((wk, i) => {
                      const lockU = activeLock.skus.reduce((a, s) => a + (sf(s.fcast[i]) || 0), 0);
                      const liveU = DATA_DP.skus.reduce((a, s) => a + (sf(s.fcast[i]) || 0), 0);
                      const lockR = sf(activeLock.rev52[i]);
                      const liveR = sf(FCAST_REV_52WK[i]);
                      const dU = liveU - lockU, dR = liveR - lockR;
                      const dPct = lockU ? (dU / lockU) : 0;
                      cumLockU += lockU; cumLiveU += liveU; cumLockR += lockR; cumLiveR += liveR;
                      const isPromo = PROMO_WKS && PROMO_WKS.has(i + 1);
                      return (
                        <tr key={wk} style={isPromo ? { background: 'rgba(255,199,17,.04)' } : undefined}>
                          <td style={{ fontSize: 11.5, color: isPromo ? 'var(--yw)' : 'var(--tx)' }}>{wk}</td>
                          <td className="tr">{fmt(lockU)}</td><td className="tr">{fmt(liveU)}</td>
                          <td className={`tr ${Math.abs(dPct) < 0.02 ? '' : dU > 0 ? 'up' : 'dn'}`}>{dU >= 0 ? '+' : ''}{fmt(Math.round(dU))}</td>
                          <td className={`tr ${Math.abs(dPct) < 0.02 ? '' : dU > 0 ? 'up' : 'dn'}`}>{dU >= 0 ? '+' : ''}{(dPct * 100).toFixed(1)}%</td>
                          <td className="tr">{fmtDol(lockR)}</td><td className="tr">{fmtDol(liveR)}</td>
                          <td className={`tr ${dR >= 0 ? 'up' : 'dn'}`}>{dR >= 0 ? '+' : '−'}{fmtDol(Math.abs(dR))}</td>
                          <td style={{ fontSize: 10, color: 'var(--yw)' }}>{isPromo ? '⭐' : '—'}</td>
                        </tr>
                      );
                    });
                    const totDU = cumLiveU - cumLockU, totDR = cumLiveR - cumLockR;
                    return (
                      <>
                        {rows}
                        <tr style={{ background: 'var(--s3)', fontWeight: 700, borderTop: '2px solid var(--bd)' }}>
                          <td>TOTAL 52WK</td>
                          <td className="tr">{fmt(cumLockU)}</td><td className="tr">{fmt(cumLiveU)}</td>
                          <td className={`tr ${totDU >= 0 ? 'up' : 'dn'}`}>{totDU >= 0 ? '+' : ''}{fmt(Math.round(totDU))}</td>
                          <td className={`tr ${totDU >= 0 ? 'up' : 'dn'}`}>{totDU >= 0 ? '+' : ''}{(cumLockU ? (totDU / cumLockU) * 100 : 0).toFixed(1)}%</td>
                          <td className="tr">{fmtDol(cumLockR)}</td><td className="tr">{fmtDol(cumLiveR)}</td>
                          <td className={`tr ${totDR >= 0 ? 'up' : 'dn'}`}>{totDR >= 0 ? '+' : '−'}{fmtDol(Math.abs(totDR))}</td>
                          <td></td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </DataTable>
          </div>
        )}

        {/* ── Audit Trail ─────────────────────────────────────────────── */}
        {activeLock && (
          <div className="cc">
            <div className="ct">Forecast Audit Trail — {activeLock.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, lineHeight: 1.7, padding: 12 }}>
              <div>
                <div style={{ color: 'var(--tx3)' }}>Locked</div>
                <div style={{ color: 'var(--tx)' }}>{new Date(activeLock.ts).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</div>
                <div style={{ color: 'var(--tx3)', marginTop: 8 }}>Scenario</div>
                <div style={{ color: 'var(--tx)' }}>{activeLock.scenario || 'base'}</div>
                <div style={{ color: 'var(--tx3)', marginTop: 8 }}>Forecast Window</div>
                <div style={{ color: 'var(--tx)' }}>{activeLock.auditLog?.forecastWindow || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--tx3)' }}>Promo Events</div>
                <div style={{ color: 'var(--tx)' }}>{activeLock.auditLog?.totalPromoEvents || 0} events</div>
                <div style={{ color: 'var(--tx3)', marginTop: 8 }}>Stacking Rule</div>
                <div style={{ color: 'var(--tx)', fontSize: 11 }}>{activeLock.auditLog?.stackingRule || '—'}</div>
                <div style={{ color: 'var(--tx3)', marginTop: 8 }}>Total SKUs</div>
                <div style={{ color: 'var(--tx)' }}>{activeLock.skus?.length || 0} SKUs</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
