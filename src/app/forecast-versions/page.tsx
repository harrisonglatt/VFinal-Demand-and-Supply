'use client';

import { useState, useMemo, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import ButtonGroup from '@/components/ui/ButtonGroup';
import DataTable from '@/components/ui/DataTable';
import { DATA_DP, FCAST_REV_52WK } from '@/data/index';
import { usePromo } from '@/context/PromoContext';
import { fmt, fmtDol } from '@/lib/formatters';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';

const VIEW_OPTS = [
  { value: 'versions', label: 'Versions' },
  { value: 'compare', label: 'Compare' },
  { value: 'export', label: 'Export' },
];

const dpciToCaseCode: Record<string, string> = {};
for (const [code, meta] of Object.entries(CASE_CODE_MAP)) {
  if (meta.dpci) dpciToCaseCode[meta.dpci] = code;
}

interface ForecastVersion {
  id: string;
  name: string;
  created: string;
  locked: boolean;
  active: boolean;
  scenario: string;
  totalUnits: number;
  totalRevenue: number;
  description: string;
}

export default function ForecastVersionsPage() {
  const [view, setView] = useState('versions');
  const [compareA, setCompareA] = useState('locked-plan');
  const [compareB, setCompareB] = useState('promo-adjusted');
  const [lockedMult, setLockedMult] = useState(1.0);
  const [lockedAt, setLockedAt] = useState('Mar 22, 2026');
  const [lockedSource, setLockedSource] = useState('Base Plan');
  const [isEditingLocked, setIsEditingLocked] = useState(false);
  const [pendingMult, setPendingMult] = useState(1.0);
  // When "Lock Live Plan" is used, we store the promo-adjusted snapshot
  const [lockedSnapshotUnits, setLockedSnapshotUnits] = useState<number | null>(null);
  const [lockedSnapshotRev, setLockedSnapshotRev] = useState<number | null>(null);
  const promo = usePromo();

  /* ── Compute version data ───────────────────────────────────────── */
  const baseUnits = useMemo(() => DATA_DP.skus.reduce((a, s) => a + s.fcast.reduce((x, y) => x + y, 0), 0), []);
  const baseRev = useMemo(() => FCAST_REV_52WK.reduce((a, b) => a + b, 0), []);
  // If we have a snapshot (from "Lock Live Plan"), use that. Otherwise use multiplier.
  const lockedUnits = lockedSnapshotUnits ?? Math.round(baseUnits * lockedMult);
  const lockedRev = lockedSnapshotRev ?? Math.round(baseRev * lockedMult);

  const promoAdjUnits = useMemo(() => {
    let total = 0;
    DATA_DP.skus.forEach(s => {
      for (let w = 0; w < 52; w++) {
        const lift = promo.getLift(w, s.category);
        total += s.fcast[w] * (1 + lift / 100);
      }
    });
    return Math.round(total);
  }, [promo]);

  const now = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const lockPlan = useCallback(() => {
    setLockedMult(pendingMult);
    setLockedSnapshotUnits(null); // Clear snapshot, use multiplier
    setLockedSnapshotRev(null);
    setLockedAt(now());
    setLockedSource(`Base ×${pendingMult.toFixed(2)}`);
    setIsEditingLocked(false);
  }, [pendingMult]);

  // Lock the current live promo-adjusted plan as the new baseline
  const lockLivePlan = useCallback(() => {
    setLockedSnapshotUnits(promoAdjUnits);
    setLockedSnapshotRev(Math.round(baseRev * (promoAdjUnits / baseUnits)));
    setLockedMult(promoAdjUnits / baseUnits); // Approximate multiplier for display
    setLockedAt(now());
    setLockedSource('Live Promo-Adjusted Snapshot');
    setIsEditingLocked(false);
  }, [promoAdjUnits, baseRev, baseUnits]);

  const versions: ForecastVersion[] = useMemo(() => [
    { id: 'locked-plan', name: `Locked Plan`, created: lockedAt, locked: !isEditingLocked, active: false, scenario: lockedSource, totalUnits: lockedUnits, totalRevenue: lockedRev, description: `Source: ${lockedSource}. This is the official plan actuals are measured against.` },
    { id: 'promo-adjusted', name: 'Promo-Adjusted (Live)', created: 'Current', locked: false, active: true, scenario: 'Base + Promo Lifts', totalUnits: promoAdjUnits, totalRevenue: Math.round(baseRev * (promoAdjUnits / baseUnits)), description: 'Base forecast with live promo calendar lifts applied. Updates in real-time when promos change.' },
    { id: 'bear', name: 'Bear Case', created: lockedAt, locked: false, active: false, scenario: 'Base ×0.80', totalUnits: Math.round(baseUnits * 0.80), totalRevenue: Math.round(baseRev * 0.80), description: '20% downside scenario.' },
    { id: 'bull', name: 'Bull Case', created: lockedAt, locked: false, active: false, scenario: 'Base ×1.20', totalUnits: Math.round(baseUnits * 1.20), totalRevenue: Math.round(baseRev * 1.20), description: '20% upside scenario.' },
  ], [baseUnits, baseRev, promoAdjUnits, lockedMult, lockedUnits, lockedRev, lockedAt, isEditingLocked]);

  const activeVersion = versions.find(v => v.active);

  /* ── Version comparison ─────────────────────────────────────────── */
  const comparison = useMemo(() => {
    const vA = versions.find(v => v.id === compareA);
    const vB = versions.find(v => v.id === compareB);
    if (!vA || !vB) return null;

    const deltaUnits = vB.totalUnits - vA.totalUnits;
    const deltaRev = vB.totalRevenue - vA.totalRevenue;
    const deltaPct = vA.totalUnits > 0 ? deltaUnits / vA.totalUnits : 0;

    return { vA, vB, deltaUnits, deltaRev, deltaPct };
  }, [versions, compareA, compareB]);

  /* ── Export to CSV ───────────────────────────────────────────────── */
  const exportForecast = useCallback((versionId: string) => {
    const version = versions.find(v => v.id === versionId);
    if (!version) return;

    const mult = versionId === 'bear' ? 0.80 : versionId === 'bull' ? 1.20 : 1.00;
    const isPromoAdj = versionId === 'promo-adjusted';

    const headers = ['Case Code', 'Product', 'DPCI', 'Category', 'UPC', ...DATA_DP.fcast_weeks];
    const rows = DATA_DP.skus.map(s => {
      const code = dpciToCaseCode[s.dpci] || '';
      const upc = s.ucase || 12;
      const weekCases = DATA_DP.fcast_weeks.map((_, i) => {
        const lift = isPromoAdj ? promo.getLift(i, s.category) : 0;
        return Math.ceil(s.fcast[i] * mult * (1 + lift / 100) / upc);
      });
      return [code, s.name, s.dpci, s.category, upc, ...weekCases];
    });

    const csv = [headers, ...rows].map(r => r.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `forecast-${version.name.replace(/\s+/g, '-').toLowerCase()}-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [versions, promo]);

  return (
    <PageShell
      title="Forecast Versions"
      subtitle={`${versions.length} versions · Active: ${activeVersion?.name ?? '—'}`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      <KpiGrid columns={4}>
        <KpiCard icon="🔒" label="Locked Plan" style="--cc:var(--yw)" value={`${(lockedUnits / 1e6).toFixed(2)}M`} delta={`Locked ${lockedAt}`} deltaClass="neu" sub={`${lockedSource} · $${(lockedRev / 1e6).toFixed(1)}M`} />
        <KpiCard icon="⚡" label="Active (Promo-Adj)" style="--cc:var(--gr)" value={`${(promoAdjUnits / 1e6).toFixed(2)}M`} delta={`${promoAdjUnits > lockedUnits ? '+' : ''}${fmt(promoAdjUnits - lockedUnits)} vs locked`} deltaClass={promoAdjUnits >= lockedUnits ? 'up' : 'dn'} sub="Live, promo-adjusted" />
        <KpiCard icon="📉" label="Bear Case" style="--cc:var(--rd)" value={`${(baseUnits * 0.80 / 1e6).toFixed(2)}M`} delta="×0.80 downside" deltaClass="dn" sub="" />
        <KpiCard icon="📈" label="Bull Case" style="--cc:#DC7BFF" value={`${(baseUnits * 1.20 / 1e6).toFixed(2)}M`} delta="×1.20 upside" deltaClass="up" sub="" />
      </KpiGrid>

      {/* ── Locked Plan Adjustment ──────────────────────────────────── */}
      <div style={{ marginTop: 12, padding: '12px 16px', background: isEditingLocked ? 'rgba(255,199,17,.06)' : 'var(--s2)', border: `1px solid ${isEditingLocked ? 'rgba(255,199,17,.3)' : 'var(--bd)'}`, borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yw)' }}>🔒 Locked Plan</span>
          {!isEditingLocked ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{lockedSource} · {(lockedUnits / 1e6).toFixed(2)}M units · Locked {lockedAt}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={lockLivePlan} style={{ background: 'rgba(0,207,146,.1)', border: '1px solid rgba(0,207,146,.3)', borderRadius: 6, padding: '4px 12px', color: '#00CF92', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  ⚡ Lock Live Plan ({(promoAdjUnits / 1e6).toFixed(2)}M)
                </button>
                <button onClick={() => { setIsEditingLocked(true); setPendingMult(lockedMult); }} style={{ background: 'rgba(255,199,17,.1)', border: '1px solid rgba(255,199,17,.3)', borderRadius: 6, padding: '4px 12px', color: '#FFC711', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Adjust Multiplier
                </button>
              </div>
            </>
          ) : (
            <>
              <input type="range" min="0.7" max="1.3" step="0.01" value={pendingMult} onChange={e => setPendingMult(parseFloat(e.target.value))} style={{ flex: 1, accentColor: '#FFC711' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FFC711', minWidth: 50 }}>×{pendingMult.toFixed(2)}</span>
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{(Math.round(baseUnits * pendingMult) / 1e6).toFixed(2)}M units</span>
              <button onClick={lockPlan} style={{ background: '#FFC711', border: 'none', borderRadius: 6, padding: '6px 16px', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                🔒 Lock at ×{pendingMult.toFixed(2)}
              </button>
              <button onClick={() => setIsEditingLocked(false)} style={{ background: 'var(--s3)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 12px', color: 'var(--tx)', fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Versions View ─────────────────────────────────────────── */}
      {view === 'versions' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
          {versions.map(v => (
            <div key={v.id} style={{ background: v.active ? 'rgba(0,207,146,.06)' : 'var(--s2)', border: `1px solid ${v.active ? 'rgba(0,207,146,.3)' : v.locked ? 'rgba(255,199,17,.2)' : 'var(--bd)'}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{v.name}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {v.locked && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,199,17,.12)', color: '#FFC711' }}>🔒 Locked</span>}
                  {v.active && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,207,146,.12)', color: '#00CF92' }}>⚡ Active</span>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8 }}>{v.description}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--tx3)' }}>UNITS</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{(v.totalUnits / 1e6).toFixed(2)}M</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--tx3)' }}>REVENUE</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>${(v.totalRevenue / 1e6).toFixed(1)}M</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{v.scenario} · {v.created}</div>
              </div>
              <button
                onClick={() => exportForecast(v.id)}
                style={{ marginTop: 10, width: '100%', background: 'var(--s3)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px', color: 'var(--tx)', fontSize: 11, cursor: 'pointer' }}
              >
                📥 Export Cases (CSV)
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Compare View ──────────────────────────────────────────── */}
      {view === 'compare' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <select value={compareA} onChange={e => setCompareA(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12 }}>
              {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <span style={{ fontWeight: 700, color: 'var(--tx3)' }}>vs</span>
            <select value={compareB} onChange={e => setCompareB(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12 }}>
              {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {comparison && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>{comparison.vA.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{(comparison.vA.totalUnits / 1e6).toFixed(2)}M</div>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>${(comparison.vA.totalRevenue / 1e6).toFixed(1)}M revenue</div>
              </div>
              <div style={{ background: comparison.deltaPct >= 0 ? 'rgba(0,207,146,.06)' : 'rgba(239,68,68,.06)', border: `1px solid ${comparison.deltaPct >= 0 ? 'rgba(0,207,146,.2)' : 'rgba(239,68,68,.2)'}`, borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>DELTA</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: comparison.deltaPct >= 0 ? '#00CF92' : '#ef4444' }}>
                  {comparison.deltaPct >= 0 ? '+' : ''}{(comparison.deltaPct * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                  {comparison.deltaUnits >= 0 ? '+' : ''}{fmt(comparison.deltaUnits)} units
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                  {comparison.deltaRev >= 0 ? '+' : ''}${fmt(comparison.deltaRev)} revenue
                </div>
              </div>
              <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>{comparison.vB.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{(comparison.vB.totalUnits / 1e6).toFixed(2)}M</div>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>${(comparison.vB.totalRevenue / 1e6).toFixed(1)}M revenue</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Export View ───────────────────────────────────────────── */}
      {view === 'export' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 16 }}>
            Export any forecast version as CSV at the <b>case level by SKU × week</b>. Includes case codes, DPCIs, categories, and 52 weekly columns.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {versions.map(v => (
              <button key={v.id} onClick={() => exportForecast(v.id)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10, padding: '20px', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>📥 {v.name}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{v.scenario} · {(v.totalUnits / 1e6).toFixed(2)}M units</div>
                <div style={{ fontSize: 10, color: 'var(--ac)', marginTop: 4 }}>Click to download CSV (cases by SKU × week)</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
