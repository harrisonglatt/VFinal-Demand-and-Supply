'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import Chip from '@/components/ui/Chip';
import { DATA_SHIP } from '@/data/index';
import { fmt, sf } from '@/lib/formatters';

const VIEW_OPTS = [
  { value: 'all', label: 'All Weeks' },
  { value: 'act', label: 'Actuals Only' },
  { value: 'fct', label: 'Forecast Only' },
];

const META_KEYS = ['13-wk PO Cases', '13-wk Plan Cases', 'Gap Cases', 'Gap Units', 'Coverage %', '13-wk Fcast Cases'];

export default function ShipmentPage() {
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [, forceUpdate] = useState(0);

  const categories = useMemo(() => DATA_SHIP.skus.map(s => s.category), []);

  /* ── Determine actual vs forecast weeks ────────────────────────── */
  const allWks = useMemo(
    () => DATA_SHIP.week_labels.filter(w => !META_KEYS.includes(w)),
    [],
  );
  const actWks = useMemo(
    () => allWks.filter(w => w.includes("'25") || w.includes("1/") || w.includes("2/") || (w.includes("3/") && !w.includes("3/22") && !w.includes("3/29"))),
    [allWks],
  );
  const fctWks = useMemo(() => allWks.filter(w => !actWks.includes(w)), [allWks, actWks]);
  const show = viewFilter === 'act' ? actWks : viewFilter === 'fct' ? fctWks : allWks;

  /* ── KPI computation ───────────────────────────────────────────── */
  const kpiData = useMemo(() => {
    const po13 = DATA_SHIP.skus.reduce((a, s) => a + sf(s.weeks['13-wk PO Cases']), 0);
    const pl13 = DATA_SHIP.skus.reduce((a, s) => a + sf(s.weeks['13-wk Plan Cases']), 0);
    const fc13 = DATA_SHIP.skus.reduce((a, s) => a + sf(s.weeks['13-wk Fcast Cases'] || 0), 0);
    return { po13, pl13, fc13, gap: po13 - pl13 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceUpdate]);

  /* ── Filtered SKUs ─────────────────────────────────────────────── */
  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return DATA_SHIP.skus.filter(s =>
      (!cat || s.category === cat) &&
      (!q || s.description.toLowerCase().includes(q))
    );
  }, [cat, query]);

  /* ── Inline edit handler ───────────────────────────────────────── */
  const handleCellSave = useCallback((dpci: string, week: string, value: number) => {
    const sku = DATA_SHIP.skus.find(s => s.dpci === dpci);
    if (sku) {
      sku.weeks[week] = value;
      if (!sku.fcast_weeks) sku.fcast_weeks = {} as Record<string, boolean>;
      sku.fcast_weeks[week] = true;
    }
    forceUpdate(n => n + 1);
  }, []);

  return (
    <PageShell
      title="Shipment Plan"
      subtitle="Weekly PO + forecast shipment cases by SKU"
    >
      <KpiGrid columns={3}>
        <KpiCard
          icon="📦" label="Committed PO Cases" style="--cc:var(--ac)"
          value={fmt(kpiData.po13)} delta="Cases on open POs (excl. projected)" deltaClass="neu" sub=""
        />
        <KpiCard
          icon="📊" label="Demand Plan Cases" style="--cc:var(--yw)"
          value={fmt(kpiData.pl13)} delta="Cases needed per plan" deltaClass="neu" sub=""
        />
        <KpiCard
          icon="⚡" label="Coverage Gap" style="--cc:var(--rd)"
          value={fmt(kpiData.gap)} delta="Committed PO minus Plan" deltaClass="dn" sub=""
        />
      </KpiGrid>

      <FilterBar>
        <SelectFilter id="sh-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <input
          type="text" placeholder="Search SKU..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
        <select value={viewFilter} onChange={e => setViewFilter(e.target.value)}>
          {VIEW_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FilterBar>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 11, color: 'var(--tx2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(0,227,205,.15)', borderRadius: 2, display: 'inline-block' }} />
          Committed PO
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(139,92,246,.15)', borderRadius: 2, display: 'inline-block' }} />
          Projected (POFC) &mdash; click to edit
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(255,255,255,.04)', borderRadius: 2, border: '1px solid rgba(255,255,255,.08)', display: 'inline-block' }} />
          Actualized
        </span>
      </div>

      <DataTable>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 175 }}>SKU</th>
                <th>Cat</th>
                <th className="tr">U/Cs</th>
                {show.map(w => {
                  const isA = actWks.includes(w);
                  return (
                    <th key={w} className="tr" style={{ fontSize: 10, background: isA ? '' : 'rgba(0,227,205,.07)', whiteSpace: 'nowrap' }}>{w}</th>
                  );
                })}
                <th className="tr" style={{ background: 'rgba(0,227,205,.12)', whiteSpace: 'nowrap' }}>PO Cs</th>
                <th className="tr" style={{ background: 'rgba(139,92,246,.12)', whiteSpace: 'nowrap' }}>Fcast Cs</th>
                <th className="tr" style={{ background: 'rgba(239,68,68,.08)', whiteSpace: 'nowrap' }}>Plan Cs</th>
                <th className="tr" style={{ background: 'rgba(239,68,68,.08)', whiteSpace: 'nowrap' }}>Gap</th>
                <th className="tr" style={{ background: 'rgba(239,68,68,.08)', whiteSpace: 'nowrap' }}>Cov%</th>
              </tr>
            </thead>
            <tbody>
              {skus.map(s => {
                const fw = s.fcast_weeks || {};
                const po = sf(s.weeks['13-wk PO Cases']);
                const fc = sf(s.weeks['13-wk Fcast Cases'] || 0);
                const pl = sf(s.weeks['13-wk Plan Cases']);
                const gap = sf(s.weeks['Gap Cases']);
                const totalCov = po + fc;
                const cov = pl ? Math.round(totalCov / pl * 100) : 0;
                return (
                  <tr key={s.dpci}>
                    <td className="tn" title={s.description}>{s.description.replace('Little Spoon ', '').replace('Baby Puffs, ', '')}</td>
                    <td><Chip className="cb">{s.category}</Chip></td>
                    <td className="tr">{s.units_per_case}</td>
                    {show.map(w => {
                      const v = s.weeks[w] || 0;
                      const isA = actWks.includes(w);
                      const isFcast = fw[w] === true;
                      if (isA) {
                        return <td key={w} className="tr" style={{ color: v ? 'var(--tx)' : 'var(--tx3)' }}>{v ? fmt(v) : '—'}</td>;
                      }
                      if (isFcast) {
                        return (
                          <EditableCell
                            key={w}
                            value={v}
                            dpci={s.dpci}
                            week={w}
                            onSave={handleCellSave}
                          />
                        );
                      }
                      return (
                        <td key={w} className="tr" style={{ background: 'rgba(0,227,205,.08)', color: v ? 'var(--ac2)' : 'var(--tx3)' }}>
                          {v ? fmt(v) : '—'}
                        </td>
                      );
                    })}
                    <td className="tr" style={{ background: 'rgba(0,227,205,.08)', color: 'var(--ac2)', fontWeight: 500 }}>{po ? fmt(po) : '—'}</td>
                    <td className="tr" style={{ background: 'rgba(139,92,246,.08)', color: '#c4b5fd', fontWeight: 500 }}>{fc ? fmt(fc) : '—'}</td>
                    <td className="tr" style={{ background: 'rgba(239,68,68,.05)', color: 'var(--tx2)' }}>{pl ? fmt(pl) : '—'}</td>
                    <td className={`tr ${gap < 0 ? 'dn' : 'up'}`} style={{ fontWeight: 500 }}>{pl ? `${gap < 0 ? '' : '+'}${fmt(gap)}` : '—'}</td>
                    <td className="tr" style={{ color: cov >= 100 ? 'var(--gr)' : cov >= 75 ? 'var(--yw)' : 'var(--rd)', fontWeight: 500 }}>{pl ? `${cov}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataTable>
    </PageShell>
  );
}

/* ── Editable Cell ─────────────────────────────────────────────────── */
function EditableCell({ value, dpci, week, onSave }: { value: number; dpci: string; week: string; onSave: (dpci: string, week: string, value: number) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    const val = Math.round(parseFloat(inputRef.current?.value || '0') || 0);
    onSave(dpci, week, val);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <td className="tr" style={{ background: 'rgba(139,92,246,.12)' }}>
        <input
          ref={inputRef}
          type="number" min="0" step="1" defaultValue={value}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          style={{
            width: 54, fontSize: 11, background: 'rgba(139,92,246,.18)',
            border: '1px solid rgba(139,92,246,.6)', borderRadius: 4,
            color: '#c4b5fd', textAlign: 'right', padding: '2px 4px',
          }}
        />
      </td>
    );
  }

  return (
    <td
      className="tr"
      onClick={handleClick}
      title="Projected (POFC) — click to edit"
      style={{ cursor: 'pointer', background: 'rgba(139,92,246,.12)', color: '#c4b5fd', fontWeight: 500 }}
    >
      {value ? fmt(value) : '—'}
    </td>
  );
}
