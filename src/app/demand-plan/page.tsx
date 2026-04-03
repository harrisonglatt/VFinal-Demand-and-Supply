'use client';

import { useMemo, useState, useCallback } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import SelectFilter from '@/components/ui/SelectFilter';
import FilterBar from '@/components/ui/FilterBar';
import DataTable from '@/components/ui/DataTable';
import { DATA_DP } from '@/data/index';
import { fmt, sf } from '@/lib/formatters';
import { CASE_CODE_MAP } from '@/lib/owlery/transform';
import { usePromo } from '@/context/PromoContext';
import { useNewSkus } from '@/context/NewSkuContext';
import { useCalibration } from '@/context/CalibrationContext';
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

/* ── DPCI → Case Code reverse lookup ──────────────────────────────── */
const dpciToCaseCode: Record<string, string> = {};
for (const [code, meta] of Object.entries(CASE_CODE_MAP)) {
  if (meta.dpci) dpciToCaseCode[meta.dpci] = code;
}

export default function DemandPlanPage() {
  const [unit, setUnit] = useState('units');
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');

  const mult = MULT[scenario];
  const hWks = DATA_DP.hist_weeks;
  const fWks = DATA_DP.fcast_weeks; // Full 52 weeks
  const promo = usePromo();
  const { getAsDPSkus } = useNewSkus();
  const calibration = useCalibration();

  // Combine existing + new SKUs
  const allSkus = useMemo(() => [...DATA_DP.skus, ...getAsDPSkus()], [getAsDPSkus]);
  const categories = useMemo(() => allSkus.map(s => s.category), [allSkus]);

  const skus = useMemo(() => {
    const q = query.toLowerCase();
    return allSkus.filter(s =>
      (!cat || s.category === cat) &&
      (!q || s.name.toLowerCase().includes(q) || (s.dpci || '').includes(q) || (dpciToCaseCode[s.dpci] || '').toLowerCase().includes(q))
    );
  }, [allSkus, cat, query]);

  const hTot = useMemo(() => hWks.map((_, i) => skus.reduce((a, s) => a + sf(s.hist[i]), 0)), [skus, hWks]);

  // Apply promo lift + calibration to forecast totals
  // Chain: base × scenario × promoLift × calibrationFactor
  const fTot = useMemo(() => fWks.map((_, i) => skus.reduce((a, s) => {
    const lift = promo.getLift(i, s.category);
    const cal = calibration.getCalibrationFactor(s.dpci, s.category);
    return a + sf(s.fcast[i]) * mult * (1 + lift / 100) * cal;
  }, 0)), [skus, fWks, mult, promo, calibration]);

  const convert = (v: number, ucase?: number) => unit === 'units' ? v : Math.round(v / (ucase || 12));
  const calLabel = calibration.autoCalibrate && calibration.adjustmentCount > 0 ? ` · 🧠 ${calibration.adjustmentCount} auto-calibrated` : '';
  const meta = `W1: ${fmt(fTot[0])} ${unit} · ${skus.length} SKUs · ${hWks.length} hist + ${fWks.length} fcast weeks${calLabel}`;

  /* ── CSV Download ───────────────────────────────────────────────── */
  const downloadCSV = useCallback(() => {
    const headers = ['Case Code', 'Product', 'DPCI', 'Category', 'Stores', 'UPC', ...hWks, ...fWks];
    const rows = skus.map(s => {
      const caseCode = dpciToCaseCode[s.dpci] || '';
      const ucase = s.ucase || 12;
      const histVals = s.hist.map(v => convert(sf(v), ucase));
      const fcastVals = fWks.map((_, i) => convert(Math.round(sf(s.fcast[i]) * mult), ucase));
      return [caseCode, s.name, s.dpci, s.category, s.stores, ucase, ...histVals, ...fcastVals];
    });

    // Add totals row
    const totHistVals = hTot.map(v => convert(v));
    const totFcastVals = fTot.map(v => convert(v));
    const totRow = ['', 'TOTAL', '', '', '', '', ...totHistVals, ...totFcastVals];

    const csvContent = [headers, totRow, ...rows]
      .map(r => r.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demand-plan-${scenario}-${unit}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [skus, hWks, fWks, hTot, fTot, unit, mult, scenario, convert]);

  return (
    <PageShell
      title="52-Week Demand Plan"
      subtitle="Historical actuals + forward forecast by SKU"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={downloadCSV}
            style={{
              background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6,
              padding: '6px 12px', color: 'var(--tx)', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {'📥'} CSV
          </button>
          <ButtonGroup options={UNIT_OPTS} active={unit} onChange={setUnit} />
          <ButtonGroup options={SCENARIO_OPTS} active={scenario} onChange={v => setScenario(v as ScenarioKey)} />
        </div>
      }
    >
      <FilterBar meta={meta}>
        <SelectFilter id="dp-cat" options={categories} value={cat} onChange={setCat} allLabel="All Categories" />
        <input
          type="text" placeholder="Search SKU or case code..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}
        />
      </FilterBar>

      <DataTable>
        <table>
          <thead>
            <tr>
              <th className="st" style={{ minWidth: 170 }}>SKU</th>
              <th style={{ minWidth: 75 }}>Case Code</th>
              <th style={{ minWidth: 60 }}>Stores</th>
              {hWks.map(w => <th key={w} style={{ minWidth: 70 }}>{w}</th>)}
              <th className="dp-div" />
              {fWks.map((w) => (
                <th key={w} style={{ minWidth: 70, background: 'rgba(0,227,205,.07)' }}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Total row */}
            <tr style={{ background: 'var(--s3)', fontWeight: 700 }}>
              <td className="st" style={{ background: 'var(--s3)' }}>TOTAL ({skus.length})</td>
              <td />
              <td />
              {hTot.map((v, i) => <td key={i} className="tr">{fmt(convert(v))}</td>)}
              <td className="dp-div" />
              {fTot.map((v, i) => {
                const hasPromo = skus.some(s => promo.isOnPromo(i, s.category));
                return (
                  <td key={i} className="tr" style={{ background: hasPromo ? 'rgba(245,158,11,.1)' : 'rgba(0,227,205,.05)' }}>
                    {fmt(convert(v))}
                  </td>
                );
              })}
            </tr>
            {/* SKU rows */}
            {skus.map(s => {
              const caseCode = dpciToCaseCode[s.dpci] || '';
              return (
                <tr key={s.dpci}>
                  <td className="st tn" title={s.name}>{s.name}</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ac)', whiteSpace: 'nowrap' }}>{caseCode}</td>
                  <td className="tr">{fmt(s.stores)}</td>
                  {s.hist.map((v, i) => <td key={i} className="tr">{fmt(convert(sf(v), s.ucase))}</td>)}
                  <td className="dp-div" />
                  {fWks.map((_, i) => {
                    const lift = promo.getLift(i, s.category);
                    const cal = calibration.getCalibrationFactor(s.dpci, s.category);
                    const v = convert(Math.round(sf(s.fcast[i]) * mult * (1 + lift / 100) * cal), s.ucase);
                    const isP = lift > 0;
                    return (
                      <td key={i} className="tr" style={{ background: isP ? 'rgba(245,158,11,.1)' : 'rgba(0,227,205,.04)' }} title={isP ? `+${lift}% promo lift` : undefined}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
