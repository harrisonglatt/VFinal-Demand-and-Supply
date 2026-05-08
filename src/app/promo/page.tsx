'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import KpiGrid from '@/components/ui/KpiGrid';
import KpiCard from '@/components/ui/KpiCard';
import { DATA_PROMO_CAL } from '@/data/index';
import { fmt } from '@/lib/formatters';
import { usePromo, computeLift, type PromoEvent } from '@/context/PromoContext';
import { useMeasuredLifts } from '@/context/MeasuredLiftsContext';

/* ── Lift benchmarks now come from PromoContext (computeLift function) ─ */

/* ── Status colors ─────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  confirmed: { bg: 'rgba(0,207,146,.12)', color: '#00CF92', label: 'Confirmed' },
  approved: { bg: 'rgba(0,207,146,.12)', color: '#00CF92', label: 'Approved' },
  submitted: { bg: 'rgba(99,102,241,.12)', color: '#818cf8', label: 'Submitted' },
  proposed: { bg: 'rgba(255,199,17,.12)', color: '#FFC711', label: 'Proposed' },
  rejected: { bg: 'rgba(239,68,68,.08)', color: '#ef4444', label: 'Rejected' },
  blocked: { bg: 'rgba(239,68,68,.08)', color: '#ef4444', label: 'Blocked' },
  info: { bg: 'rgba(148,163,184,.08)', color: '#94a3b8', label: 'Info' },
};

const VIEW_OPTS = [
  { value: 'calendar', label: 'Calendar Grid' },
  { value: 'list', label: 'Event List' },
  { value: 'add', label: '+ Add Promo' },
];

const PROMO_TYPES = ['Co-Space', 'TPC', 'DWA', 'Circle', 'BOGO', 'Other'];

export default function PromoCalendarPage() {
  const [view, setView] = useState('calendar');
  const [catFilter, setCatFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Global promo state — changes here flow to demand plan, shipments, executive
  const promoCtx = usePromo();
  const events = promoCtx.events;
  const measured = useMeasuredLifts();
  const lastSyncedAtLabel = measured.state.syncedAt
    ? new Date(measured.state.syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  // New promo form state
  const [newPromo, setNewPromo] = useState({
    week: DATA_PROMO_CAL.weeks[0] || '',
    category: DATA_PROMO_CAL.categories[0]?.label || '',
    promoType: 'TPC',
    subCategory: '',
    description: '',
    status: 'proposed',
  });

  const categories = DATA_PROMO_CAL.categories.map(c => c.label);
  const weeks = DATA_PROMO_CAL.weeks;

  /* ── Filtered events ────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    return events.filter(e =>
      e.status !== 'info' && e.status !== 'blocked' &&
      (!catFilter || e.category === catFilter) &&
      (!typeFilter || e.promoType.toLowerCase().includes(typeFilter.toLowerCase())) &&
      (!statusFilter || e.status === statusFilter)
    );
  }, [events, catFilter, typeFilter, statusFilter]);

  /* ── KPI aggregates ─────────────────────────────────────────────── */
  const confirmed = filtered.filter(e => e.status === 'confirmed' || e.status === 'approved').length;
  const submitted = filtered.filter(e => e.status === 'submitted').length;
  const proposed = filtered.filter(e => e.status === 'proposed').length;
  const rejected = filtered.filter(e => e.status === 'rejected').length;

  /* ── Calendar grid: rows = category × promoType, cols = weeks ───── */
  const calendarRows = useMemo(() => {
    const rows: { key: string; category: string; promoType: string; byWeek: Record<number, PromoEvent[]> }[] = [];
    const keyMap = new Map<string, typeof rows[0]>();

    for (const e of filtered) {
      const key = `${e.category}|${e.promoType}`;
      let row = keyMap.get(key);
      if (!row) {
        row = { key, category: e.category, promoType: e.promoType, byWeek: {} };
        keyMap.set(key, row);
        rows.push(row);
      }
      if (!row.byWeek[e.weekIdx]) row.byWeek[e.weekIdx] = [];
      row.byWeek[e.weekIdx].push(e);
    }

    // Sort: by category then promo type
    rows.sort((a, b) => a.category.localeCompare(b.category) || a.promoType.localeCompare(b.promoType));
    return rows;
  }, [filtered]);

  /* ── Add new promo ──────────────────────────────────────────────── */
  /* ── Add promo via global context (flows to demand + shipments) ── */
  const handleAddPromo = () => {
    if (!newPromo.description.trim()) return;
    const weekIdx = weeks.indexOf(newPromo.week);
    const catObj = DATA_PROMO_CAL.categories.find(c => c.label === newPromo.category);
    promoCtx.addPromo({
      weekIdx,
      week: newPromo.week,
      category: newPromo.category,
      categoryId: catObj?.id || '',
      subCategory: newPromo.subCategory,
      promoType: newPromo.promoType,
      mechanic: newPromo.description,
      description: newPromo.description,
      status: newPromo.status,
      duration: 1,
      stores: '',
    });
    setNewPromo(p => ({ ...p, description: '' }));
    setView('calendar');
  };

  /* ── Delete + Update via global context ─────────────────────────── */
  const deleteEvent = (id: string) => promoCtx.deletePromo(id);
  const updateEvent = (id: string, field: string, value: string | number) => {
    promoCtx.updatePromo(id, { [field]: value });
  };

  return (
    <PageShell
      title="Promo Calendar"
      subtitle={`${events.length} events · ${weeks.length} weeks · Feb 2026 → Jan 2027`}
      extra={<ButtonGroup options={VIEW_OPTS} active={view} onChange={setView} />}
    >
      {/* ── Module callout — link to Promo Intel + measured-lift sync state ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 16px',
          marginBottom: 16,
          borderRadius: 12,
          background: measured.hasMeasured ? 'rgba(0,207,146,.08)' : 'var(--ac-soft)',
          border: `1px solid ${measured.hasMeasured ? 'rgba(0,207,146,.28)' : 'rgba(0,181,162,.25)'}`,
        }}
      >
        <span style={{ fontSize: 18 }}>{measured.hasMeasured ? '✅' : '🎯'}</span>
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.55 }}>
          <strong style={{ color: measured.hasMeasured ? '#067A56' : 'var(--ls-blue-dark)' }}>
            {measured.hasMeasured
              ? `Demand plan using ${measured.state.categoryCount} measured lifts from Promo Intel`
              : 'This calendar drives the demand plan.'}
          </strong>{' '}
          {measured.hasMeasured ? (
            <>
              Synced {lastSyncedAtLabel} from {measured.state.weeksCovered} weeks of sales data.
              Other (type × category) combos still use the lift matrix.{' '}
              <a href="/promo-tracker" style={{ color: '#067A56', fontWeight: 700 }}>Re-sync →</a>
            </>
          ) : (
            <>
              Events here flow into <em>Demand Plan, Shipments, Supply Planning, Executive Summary</em> via the lift matrix.
              For <strong>measured</strong> lift / ROI / incrementality / cannibalization on actual sales, open{' '}
              <a href="/promo-tracker" style={{ color: 'var(--ls-blue-dark)', fontWeight: 700 }}>Promo Intel →</a>
            </>
          )}
        </div>
      </div>

      <KpiGrid columns={4}>
        <KpiCard icon="✅" label="Confirmed / Approved" style="--cc:var(--gr)" value={String(confirmed)} delta={`${Math.round(confirmed / (filtered.length || 1) * 100)}% of events`} deltaClass="up" sub="" />
        <KpiCard icon="📩" label="Submitted" style="--cc:#818cf8" value={String(submitted)} delta="Awaiting approval" deltaClass="neu" sub="" />
        <KpiCard icon="💡" label="Proposed" style="--cc:var(--yw)" value={String(proposed)} delta="Not yet submitted" deltaClass="neu" sub="" />
        <KpiCard icon="❌" label="Rejected / Canceled" style="--cc:var(--rd)" value={String(rejected)} delta="" deltaClass="dn" sub="" />
      </KpiGrid>

      {/* ── Lift Benchmarks ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--tx3)' }}>
        <span style={{ fontWeight: 700 }}>Historical Lift Benchmarks:</span>
        {Object.entries(promoCtx.liftBenchmarks).map(([type, data]) => (
          <span key={type} style={{ padding: '2px 8px', background: 'var(--s2)', borderRadius: 4 }}>
            {type}: <b style={{ color: 'var(--ac)' }}>+{data.avgLift}%</b> <span style={{ color: 'var(--tx3)' }}>({data.count} events)</span>
          </span>
        ))}
      </div>

      <FilterBar meta={`${filtered.length} active events`}>
        <SelectFilter id="pc-cat" options={categories} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '4px 8px', color: 'var(--tx)', fontSize: 12 }}>
          <option value="">All Types</option>
          {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '4px 8px', color: 'var(--tx)', fontSize: 12 }}>
          <option value="">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="submitted">Submitted</option>
          <option value="proposed">Proposed</option>
          <option value="rejected">Rejected</option>
        </select>
      </FilterBar>

      {/* ── Calendar Grid View ────────────────────────────────────── */}
      {view === 'calendar' && (
        <DataTable>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th className="st" style={{ minWidth: 140 }}>Category</th>
                  <th style={{ minWidth: 80 }}>Type</th>
                  {weeks.map((w, i) => {
                    const d = new Date(w);
                    const mo = d.toLocaleDateString('en-US', { month: 'short' });
                    const day = d.getDate();
                    return (
                      <th key={i} style={{ minWidth: 55, fontSize: 9, textAlign: 'center', padding: '4px 2px' }}>
                        <div>{mo}</div>
                        <div style={{ fontWeight: 800 }}>{day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {calendarRows.map(row => (
                  <tr key={row.key}>
                    <td className="st" style={{ fontSize: 11, fontWeight: 600, background: 'var(--s1)' }}>{row.category}</td>
                    <td style={{ fontSize: 10, color: 'var(--tx3)' }}>{row.promoType}</td>
                    {weeks.map((_, wi) => {
                      const evts = row.byWeek[wi];
                      if (!evts || evts.length === 0) return <td key={wi} />;
                      const e = evts[0];
                      const sc = STATUS_COLORS[e.status] || STATUS_COLORS.proposed;
                      return (
                        <td key={wi} style={{ padding: '2px', position: 'relative' }}>
                          <div
                            title={`${e.description}\nLift: +${e.liftPct}% | Status: ${sc.label}\nClick to edit`}
                            style={{
                              fontSize: 8, padding: '3px 4px', borderRadius: 3,
                              background: sc.bg, color: sc.color, lineHeight: 1.2,
                              cursor: 'pointer', overflow: 'hidden', maxHeight: 32,
                              border: e.isNew ? '1px dashed var(--ac)' : undefined,
                            }}
                          >
                            {e.description.substring(0, 18)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      )}

      {/* ── Event List View ────────────────────────────────────────── */}
      {view === 'list' && (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 70 }}>Week</th>
                <th style={{ minWidth: 100 }}>Category</th>
                <th style={{ minWidth: 80 }}>Type</th>
                <th style={{ minWidth: 250 }}>Description</th>
                <th className="tr">Exp. Lift</th>
                <th>Status</th>
                <th style={{ minWidth: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .sort((a, b) => a.weekIdx - b.weekIdx)
                .map(e => {
                  const sc = STATUS_COLORS[e.status] || STATUS_COLORS.proposed;
                  return (
                    <tr key={e.id} style={{ background: e.isNew ? 'rgba(0,227,205,.04)' : undefined }}>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>{e.week}</td>
                      <td style={{ fontSize: 11 }}>{e.category}</td>
                      <td>
                        <select
                          value={e.promoType}
                          onChange={ev => updateEvent(e.id, 'promoType', ev.target.value)}
                          style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 4px', color: 'var(--tx)', fontSize: 11, width: '100%' }}
                        >
                          {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text" value={e.description}
                          onChange={ev => updateEvent(e.id, 'description', ev.target.value)}
                          style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '3px 6px', color: 'var(--tx)', fontSize: 11, width: '100%' }}
                        />
                      </td>
                      <td className="tr" style={{ fontWeight: 700, color: 'var(--ac)' }}>+{e.liftPct}%</td>
                      <td>
                        <select
                          value={e.status}
                          onChange={ev => updateEvent(e.id, 'status', ev.target.value)}
                          style={{ background: sc.bg, border: `1px solid ${sc.color}30`, borderRadius: 4, padding: '2px 4px', color: sc.color, fontSize: 10, fontWeight: 600 }}
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="submitted">Submitted</option>
                          <option value="proposed">Proposed</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => deleteEvent(e.id)} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 4, padding: '2px 8px', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </DataTable>
      )}

      {/* ── Add Promo View ─────────────────────────────────────────── */}
      {view === 'add' && (
        <div style={{ maxWidth: 600, margin: '16px auto' }}>
          <div className="card" style={{ padding: 24 }}>
            <div className="card-title">Add New Promo Event</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Week</label>
                <select value={newPromo.week} onChange={e => setNewPromo(p => ({ ...p, week: e.target.value }))} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  {weeks.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Category</label>
                <select value={newPromo.category} onChange={e => setNewPromo(p => ({ ...p, category: e.target.value }))} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Promo Type</label>
                <select value={newPromo.promoType} onChange={e => setNewPromo(p => ({ ...p, promoType: e.target.value }))} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Status</label>
                <select value={newPromo.status} onChange={e => setNewPromo(p => ({ ...p, status: e.target.value }))} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px', color: 'var(--tx)', fontSize: 12 }}>
                  <option value="proposed">Proposed</option>
                  <option value="submitted">Submitted</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Description / Mechanic</label>
              <input
                type="text" value={newPromo.description}
                onChange={e => setNewPromo(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g., 2/$6 MM TPC, BOGO 25% Circle, $8.99 Co-space..."
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px', color: 'var(--tx)', fontSize: 13 }}
              />
            </div>

            {/* Auto-populated lift preview */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,227,205,.06)', border: '1px solid rgba(0,227,205,.15)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Expected Lift (auto-populated from historical data)</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ac)' }}>
                +{computeLift(newPromo.promoType, newPromo.category).liftPct}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                Based on {promoCtx.liftBenchmarks[newPromo.promoType.includes('Co') ? 'Co-space' : newPromo.promoType]?.count || 0} historical {newPromo.promoType} events
              </div>
            </div>

            <button
              onClick={handleAddPromo}
              disabled={!newPromo.description.trim()}
              style={{
                marginTop: 16, width: '100%', padding: '12px',
                background: newPromo.description.trim() ? 'var(--ac)' : 'var(--s3)',
                border: 'none', borderRadius: 8, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: newPromo.description.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add Promo Event
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
