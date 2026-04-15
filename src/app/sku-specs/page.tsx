'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import FilterBar from '@/components/ui/FilterBar';
import SelectFilter from '@/components/ui/SelectFilter';
import DataTable from '@/components/ui/DataTable';
import { DATA_SKU_SPECS } from '@/data/index';

// ─── Types ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sku-spec-overrides';

/** Every editable field. Values are user overrides; null = use JSON default. */
export interface SpecOverride {
  coPacker?: string;
  storageTransit?: string;
  unitsPerCase?: number;
  shelfLifeDays?: number;
  stopShipDays?: number;
  moqCases?: number;
  unitWeightLbs?: number;
  caseWeightLbs?: number;
  casesPerPallet?: number;
  prodLead?: number;
  transitLead?: number;
}

type AllOverrides = Record<string, SpecOverride>;

function loadOverrides(): AllOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Migrate from old key if present
    if (!raw) {
      const old = localStorage.getItem('sku-lead-times');
      if (old) {
        localStorage.setItem(STORAGE_KEY, old);
        return JSON.parse(old);
      }
    }
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOverrides(overrides: AllOverrides) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  // Keep legacy key in sync for engine
  localStorage.setItem('sku-lead-times', JSON.stringify(overrides));
}

/** Resolve a field: override if set, otherwise JSON default */
function val<T>(override: T | undefined, base: T): T {
  return override !== undefined && override !== null ? override : base;
}

// ─── Editable cell components ───────────────────────────────────────────────

function NumCell({ value, placeholder, onChange, warn, width, max }: {
  value: number | null | undefined; placeholder: string;
  onChange: (v: number | null) => void; warn?: boolean; width?: number; max?: number;
}) {
  return (
    <input
      type="number" min={0} max={max ?? 999999} step={1}
      value={value ?? ''} placeholder={placeholder}
      onChange={e => {
        const v = e.target.value;
        onChange(v === '' ? null : Math.max(0, parseFloat(v)));
      }}
      style={{
        width: width ?? 64, padding: '4px 6px', borderRadius: 4, textAlign: 'center',
        fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
        background: warn ? 'rgba(255,199,17,.1)' : 'var(--bg2)',
        border: warn ? '1px solid rgba(255,199,17,.4)' : '1px solid rgba(255,255,255,.1)',
        color: value != null ? 'var(--tx)' : 'var(--tx3)',
      }}
    />
  );
}

function TextCell({ value, placeholder, onChange, width }: {
  value: string; placeholder?: string;
  onChange: (v: string) => void; width?: number;
}) {
  return (
    <input
      type="text" value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: width ?? 100, padding: '4px 6px', borderRadius: 4,
        fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
        background: 'var(--bg2)', border: '1px solid rgba(255,255,255,.1)',
        color: 'var(--tx)',
      }}
    />
  );
}

function SelectCell({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: '4px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
        background: 'var(--bg2)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--tx)',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SkuSpecsPage() {
  const [catFilter, setCatFilter] = useState('');
  const [coPackerFilter, setCoPackerFilter] = useState('');
  const [storageFilter, setStorageFilter] = useState('');
  const [overrides, setOverrides] = useState<AllOverrides>({});

  // Hydrate from localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);

  const specs = DATA_SKU_SPECS;

  // Build effective rows (JSON + overrides merged)
  const rows = useMemo(() => specs.map(s => {
    const o = overrides[s.itemNumber] || {};
    return {
      spec: s,
      o,
      coPacker: val(o.coPacker, s.coPacker),
      storageTransit: val(o.storageTransit, s.storageTransit),
      unitsPerCase: val(o.unitsPerCase, s.unitsPerCase),
      shelfLifeDays: val(o.shelfLifeDays, s.shelfLifeDays),
      stopShipDays: val(o.stopShipDays, s.stopShipDays),
      moqCases: val(o.moqCases, s.moqCases ?? 0),
      unitWeightLbs: val(o.unitWeightLbs, s.unitWeightLbs),
      caseWeightLbs: val(o.caseWeightLbs, s.caseWeightLbs),
      casesPerPallet: val(o.casesPerPallet, s.casesPerPallet),
      prodLead: o.prodLead ?? null,
      transitLead: o.transitLead ?? null,
    };
  }), [specs, overrides]);

  // Derive filter options from effective values
  const categories = useMemo(() => [...new Set(rows.map(r => r.spec.category))].sort(), [rows]);
  const coPackers = useMemo(() => [...new Set(rows.map(r => r.coPacker))].sort(), [rows]);
  const storageTypes = useMemo(() => [...new Set(rows.map(r => r.storageTransit))].sort(), [rows]);

  const filtered = useMemo(() =>
    rows.filter(r =>
      (!catFilter || r.spec.category === catFilter) &&
      (!coPackerFilter || r.coPacker === coPackerFilter) &&
      (!storageFilter || r.storageTransit === storageFilter)
    ), [rows, catFilter, coPackerFilter, storageFilter]);

  const missingLeadTimes = rows.filter(r => !r.prodLead || !r.transitLead).length;

  const handleChange = useCallback((itemNumber: string, field: keyof SpecOverride, value: string | number | null) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (!next[itemNumber]) next[itemNumber] = {};
      if (value === null || value === '') {
        delete (next[itemNumber] as Record<string, unknown>)[field];
        if (Object.keys(next[itemNumber]).length === 0) delete next[itemNumber];
      } else {
        (next[itemNumber] as Record<string, unknown>)[field] = value;
      }
      saveOverrides(next);
      return next;
    });
  }, []);

  return (
    <PageShell
      title="SKU Specs & Lead Times"
      subtitle="Editable operational specs — all changes flow through the supply planning model in real time"
    >

      {/* KPI Row */}
      <KpiGrid columns={4}>
        <KpiCard icon="📦" label="Total SKUs" value={specs.length}
          delta={`${categories.length} categories`} deltaClass="neu" sub="Across all co-packers" />
        <KpiCard icon="🏭" label="Co-Packers" value={coPackers.length}
          delta={`${storageTypes.length} storage types`} deltaClass="neu" sub="Active manufacturing partners" />
        <KpiCard icon="⏱" label="Missing Lead Times"
          style={`--cc:${missingLeadTimes > 0 ? 'var(--yw)' : 'var(--gr)'}`}
          value={missingLeadTimes}
          delta={`${specs.length - missingLeadTimes} configured`}
          deltaClass={missingLeadTimes === 0 ? 'up' : 'dn'}
          sub="SKUs needing lead time inputs" />
        <KpiCard icon="📋" label="Avg Shelf Life"
          value={`${Math.round(rows.reduce((a, r) => a + r.shelfLifeDays, 0) / rows.length)} days`}
          delta={`${Math.round(rows.reduce((a, r) => a + r.shelfLifeDays, 0) / rows.length / 7)} wks`}
          deltaClass="neu" sub="Across all SKUs" />
      </KpiGrid>

      <FilterBar meta={`${filtered.length} of ${specs.length} SKUs`}>
        <SelectFilter id="spec-cat" options={categories} value={catFilter} onChange={setCatFilter} allLabel="All Categories" />
        <SelectFilter id="spec-cp" options={coPackers} value={coPackerFilter} onChange={setCoPackerFilter} allLabel="All Co-Packers" />
        <SelectFilter id="spec-st" options={storageTypes} value={storageFilter} onChange={setStorageFilter} allLabel="All Storage" />
      </FilterBar>

      <DataTable>
        <table>
          <thead>
            <tr>
              <th>Item #</th>
              <th>Prod SKU</th>
              <th style={{ minWidth: 140 }}>Description</th>
              <th>Category</th>
              <th style={{ minWidth: 110 }}>Co-Packer</th>
              <th>Storage</th>
              <th className="tr">Units/Case</th>
              <th className="tr" style={{ minWidth: 80 }}>Shelf Life (days)</th>
              <th className="tr" style={{ minWidth: 80 }}>Stop Ship (days)</th>
              <th className="tr" style={{ minWidth: 70 }}>MOQ (cases)</th>
              <th className="tr" style={{ minWidth: 64 }}>Unit Wt (lbs)</th>
              <th className="tr" style={{ minWidth: 64 }}>Case Wt (lbs)</th>
              <th className="tr" style={{ minWidth: 64 }}>Cases/Pallet</th>
              <th className="tr" style={{ minWidth: 70 }}>Prod Lead (wks)</th>
              <th className="tr" style={{ minWidth: 70 }}>Transit (wks)</th>
              <th className="tr" style={{ minWidth: 80 }}>Total Lead</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const missingLead = !r.prodLead || !r.transitLead;
              const totalLead = (r.prodLead ?? 0) + (r.transitLead ?? 0);
              const id = r.spec.itemNumber;
              return (
                <tr key={id} style={{ background: missingLead ? 'rgba(255,199,17,.04)' : undefined }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--tx3)' }}>{r.spec.productionSku}</td>
                  <td style={{ fontSize: 12 }}>{r.spec.description}</td>
                  <td style={{ fontSize: 12 }}>{r.spec.category}</td>
                  <td>
                    <TextCell value={r.coPacker} onChange={v => handleChange(id, 'coPacker', v)} width={100} />
                  </td>
                  <td>
                    <SelectCell value={r.storageTransit} options={['Frozen', 'Refrigerated', 'Ambient']}
                      onChange={v => handleChange(id, 'storageTransit', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.unitsPerCase} placeholder="—" width={50}
                      onChange={v => handleChange(id, 'unitsPerCase', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.shelfLifeDays} placeholder="—" width={60}
                      onChange={v => handleChange(id, 'shelfLifeDays', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.stopShipDays} placeholder="—" width={60}
                      onChange={v => handleChange(id, 'stopShipDays', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.moqCases || null} placeholder="—" width={70}
                      onChange={v => handleChange(id, 'moqCases', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.unitWeightLbs} placeholder="—" width={58}
                      onChange={v => handleChange(id, 'unitWeightLbs', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.caseWeightLbs} placeholder="—" width={58}
                      onChange={v => handleChange(id, 'caseWeightLbs', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.casesPerPallet} placeholder="—" width={58}
                      onChange={v => handleChange(id, 'casesPerPallet', v)} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.prodLead} placeholder="—" width={56} max={52}
                      onChange={v => handleChange(id, 'prodLead', v)} warn={!r.prodLead} />
                  </td>
                  <td className="tr">
                    <NumCell value={r.transitLead} placeholder="—" width={56} max={52}
                      onChange={v => handleChange(id, 'transitLead', v)} warn={!r.transitLead} />
                  </td>
                  <td className="tr" style={{
                    fontWeight: 700, fontSize: 13,
                    color: totalLead > 0 ? '#00CF92' : 'var(--tx3)',
                  }}>
                    {totalLead > 0 ? `${totalLead} wks` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>

      {/* Legend */}
      <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', fontSize: 11, color: 'var(--tx3)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--tx)' }}>All fields are editable</strong> and flow through the supply planning model.
        <strong> Production Lead</strong> (order to product ready) + <strong>Transit</strong> (ship to warehouse) = <strong>Total Lead Time</strong> used for WOC, reorder points, and PO timing.
        Changes to shelf life, stop ship, MOQ, co-packer, and units/case update inventory risk calculations, lot expiry detection, and manufacturer assignment.
        All changes save automatically and persist across sessions.
      </div>

    </PageShell>
  );
}
