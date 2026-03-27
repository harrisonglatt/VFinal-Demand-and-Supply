'use client';

import { useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import ButtonGroup from '@/components/ui/ButtonGroup';
import LineChart from '@/components/charts/LineChart';
import { DATA_LAUNCH } from '@/data/index';
import type { ScenarioKey } from '@/data/types';
import { fmt, sf } from '@/lib/formatters';

/* ── Constants ───────────────────────────────────────────────────────── */

const RAMP = [0.15, 0.28, 0.40, 0.52, 0.63, 0.72, 0.80, 0.86, 0.91, 0.95, 0.97, 0.99, 1.0];
const RAMP_WKS = [
  'W1 3/22', 'W2 3/29', 'W3 4/5', 'W4 4/12', 'W5 4/19', 'W6 4/26',
  'W7 5/3', 'W8 5/10', 'W9 5/17', 'W10 5/24', 'W11 5/31', 'W12 6/7', 'W13 6/14',
];
const LA_COLS = ['#00E3CD', '#00CF92', '#FFC711', '#DC7BFF'];
const SCEN_OPTS = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

/* ── Page Component ──────────────────────────────────────────────────── */

export default function LaunchPage() {
  const [scenario, setScenario] = useState<ScenarioKey>('base');

  /* Compute ramp data for all SKUs under current scenario */
  const skuData = useMemo(() => {
    return DATA_LAUNCH.skus.map((sku, i) => {
      const vel = sf(sku[scenario]);
      const units = RAMP.map((r) => Math.round(r * vel * sku.stores));
      const tot = units.reduce((a, b) => a + b, 0);
      const shortLabel = sku.name
        .replace('Stellar Puffs, ', 'SP ')
        .replace('Fruit+Veggie Minis, ', 'FVM ');
      return { sku, units, tot, shortLabel, color: LA_COLS[i] };
    });
  }, [scenario]);

  /* Chart datasets */
  const chartDatasets = useMemo(
    () =>
      skuData.map((d) => ({
        label: d.shortLabel,
        data: d.units,
        borderColor: d.color,
        backgroundColor: d.color + '12',
        fill: true,
      })),
    [skuData],
  );

  return (
    <PageShell
      title="Launch Tracker"
      subtitle={`4-SKU launch ramp · ${DATA_LAUNCH.launch_date}`}
      extra={
        <ButtonGroup
          options={SCEN_OPTS}
          active={scenario}
          onChange={(v) => setScenario(v as ScenarioKey)}
        />
      }
    >
      {/* ── SKU Cards ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {skuData.map((d) => (
          <div className="lc" key={d.sku.dpci}>
            <div className="ln">{d.sku.name}</div>
            <div className="sr">
              {(['bear', 'base', 'bull'] as const).map((s) => (
                <div key={s} className={`sp ${s}${scenario === s ? ' on' : ''}`}>
                  <div className="sl">{s.charAt(0).toUpperCase() + s.slice(1)}</div>
                  <div className="sv">{d.sku[s]}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)' }}>UPSPW</div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--tx2)',
              }}
            >
              <span>
                Wk1: <strong style={{ color: 'var(--tx)' }}>{fmt(d.units[0])}</strong>
              </span>
              <span>
                Wk13: <strong style={{ color: 'var(--tx)' }}>{fmt(d.units[12])}</strong>
              </span>
              <span>
                13-Wk: <strong style={{ color: 'var(--ac2)' }}>{fmt(d.tot)}</strong>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Ramp Chart ─────────────────────────────────────── */}
      <div className="cc" style={{ marginTop: 20 }}>
        <div className="ct">13-Week Launch Ramp</div>
        <LineChart labels={RAMP_WKS} datasets={chartDatasets} />
      </div>
    </PageShell>
  );
}
