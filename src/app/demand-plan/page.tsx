'use client';

import { useMemo, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { DATA_DP, PROMO_WKS, isOnPromo } from '@/data/index';
import { fmt, sf } from '@/lib/formatters';
import type { ScenarioKey } from '@/data/types';

const UNIT_OPTS = [
  { value: 'units', label: 'Units' },
  { value: 'cases', label: 'Cases' },
];

const SCENARIO_OPTS = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

const MULT: Record<ScenarioKey, number> = { bear: 0.80, base: 1, bull: 1.20 };

export default function DemandPlanPage() {
  const [unit, setUnit] = useState('units');
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');

  const mult = MULT[scenario];
  const hWks = DATA_DP.hist_weeks;
  const fWks = DATA_DP.fcast_weeks.slice(0, 13);

  const categories = useMemo(() => DATA_DP.skus.map(s => s.category), []);

  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return DATA_DP.skus.filter(s =>
      (!cat || s.category === cat) &&
      (!q || s.name.toLowerCase().includes(q) || (s.dpci || '').includes(q))
    );
  }, [cat, query]);

  const hTot = useMemo(() => hWks.map((_, i) => skus.reduce((a, s) => a + sf(s.hist[i]), 0)), [skus, hWks]);
  const fTot = useMemo(() => fWks.map((_, i) => skus.reduce((a, s) => a + sf(s.fcast[i]) * mult, 0)), [skus, fWks, mult]);

  const convert = (v: number) => unit === 'units' ? v : Math.round(v / 12);
  const meta = `W1: ${fmt(fTot[0])} ${unit} · ${skus.length} SKUs`;

  return (
    <PageShell
      title="52-Week Demand Plan"
      subtitle="Historical actuals + forward forecast by SKU"
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonGroup options={UNIT_OPTS} active={unit} onChange={setUnit} />
          <ButtonGroup options={SCENARIO_OPTS} active={scenario} onChange={v => setScenario(v as ScenarioKey)} />
        </div>
      }
    >
      <FilterBar meta={meta}>
        <SelectFilter id="dp-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <input
          type="text" placeholder="Search SKU..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
      </FilterBar>

      <DataTable>
        <table>
          <thead>
            <tr>
              <th className="st" style={{ minWidth: 170 }}>SKU</th>
              <th style={{ minWidth: 60 }}>Stores</th>
              {hWks.map(w => <th key={w} style={{ minWidth: 70 }}>{w}</th>)}
              <th className="dp-div" />
              {fWks.map((w, i) => (
                <th key={w} style={{ minWidth: 70, background: 'rgba(0,227,205,.07)' }}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Total row */}
            <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
              <td className="st" style={{ background: 'var(--s3)' }}>TOTAL ({skus.length})</td>
              <td />
              {hTot.map((v, i) => <td key={i} className="tr">{fmt(convert(v))}</td>)}
              <td className="dp-div" />
              {fTot.map((v, i) => {
                const isP = PROMO_WKS.has(i + 1);
                return (
                  <td key={i} className="tr" style={{ background: isP ? 'rgba(245,158,11,.1)' : 'rgba(0,227,205,.05)' }}>
                    {fmt(convert(v))}
                  </td>
                );
              })}
            </tr>
            {/* SKU rows */}
            {skus.map(s => (
              <tr key={s.dpci}>
                <td className="st tn" title={s.name}>{s.name}</td>
                <td className="tr">{fmt(s.stores)}</td>
                {s.hist.map((v, i) => <td key={i} className="tr">{fmt(convert(sf(v)))}</td>)}
                <td className="dp-div" />
                {fWks.map((_, i) => {
                  const v = convert(Math.round(sf(s.fcast[i]) * mult));
                  const isP = isOnPromo(i + 1, s.category);
                  return (
                    <td key={i} className="tr" style={{ background: isP ? 'rgba(245,158,11,.1)' : 'rgba(0,227,205,.04)' }}>
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
