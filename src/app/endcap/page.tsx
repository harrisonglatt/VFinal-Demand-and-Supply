'use client';

import { useMemo, Fragment } from 'react';
import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/ui/KpiCard';
import KpiGrid from '@/components/ui/KpiGrid';
import DataTable from '@/components/ui/DataTable';
import BarChart from '@/components/charts/BarChart';
import DoughnutChart from '@/components/charts/DoughnutChart';
import { DATA_DP, DATA_PROMO, DATA_ENDCAP_HISTORY, FCAST_REV_52WK } from '@/data/index';
import { fmt, fmtDol, sf } from '@/lib/formatters';

/* ── Processed endcap event type ─────────────────────────────────────── */

interface ProcEvent {
  wk: number;
  date: string;
  event: string;
  category: string;
  status: string;
  type: string;
  stores: string;
  mechanic: string;
  lift_pct: string;
  actual_lift?: number;
  baseUnits: number;
  baseRev: number;
  liftPct: number;
  inclUnits: number;
  inclRev: number;
  isHist: boolean;
}

/* ── Page Component ──────────────────────────────────────────────────── */

export default function EndcapPage() {
  /* Merge historical + future endcap events, compute lift metrics */
  const proc = useMemo<ProcEvent[]>(() => {
    const histEvents = DATA_ENDCAP_HISTORY ?? [];
    const futureEvents = DATA_PROMO.filter(
      (p) =>
        (p.type && p.type.toLowerCase().includes('co-space')) ||
        (p.mechanic && p.mechanic.toLowerCase().includes('endcap')),
    );
    const endcaps = [...histEvents, ...futureEvents].sort((a, b) => a.wk - b.wk);

    return endcaps.map((p) => {
      const isHist = p.wk <= 0;
      let bU: number, bR: number, lf: number, iU: number, iR: number;

      if (isHist) {
        const histBase = 13751;
        const histAvgPrice = 8.25;
        const actualLift = ('actual_lift' in p ? (p as { actual_lift: number }).actual_lift : null) || 1;
        bU = histBase;
        bR = Math.round(histBase * histAvgPrice);
        lf = actualLift - 1;
        iU = Math.round(bU * lf);
        iR = bR * lf;
      } else {
        const wi = p.wk - 1;
        bU = DATA_DP.skus.reduce((a, s) => a + sf(s.fcast[Math.min(wi, 51)]), 0);
        bR = FCAST_REV_52WK[Math.max(0, wi)] || bU * 5.5;
        const rawL = (p.lift_pct || '0%').replace('%', '').replace('+', '').replace('~', '').trim();
        const numMatch = rawL.match(/(\d+(?:\.\d+)?)/);
        const lp = numMatch ? parseFloat(numMatch[0]) : 0;
        lf = lp / 100;
        iU = Math.round(bU * lf);
        iR = bR * lf;
      }

      return {
        ...p,
        actual_lift: 'actual_lift' in p ? (p as { actual_lift: number }).actual_lift : undefined,
        baseUnits: bU,
        baseRev: bR,
        liftPct: lf,
        inclUnits: iU,
        inclRev: iR,
        isHist,
      };
    });
  }, []);

  /* Derived KPI values */
  const kpis = useMemo(() => {
    const totIncl = proc.reduce((a, p) => a + p.inclRev, 0);
    const totInclU = proc.reduce((a, p) => a + p.inclUnits, 0);
    const histProc = proc.filter((p) => p.isHist);
    const histTotalIncr = histProc.reduce((a, p) => a + p.inclRev, 0);
    const futureProc = proc.filter((p) => p.wk > 0);
    const futureTotalIncr = futureProc.reduce((a, p) => a + p.inclRev, 0);
    const conf = proc.filter(
      (p) => p.status && (p.status.includes('✓') || p.status.toLowerCase().includes('confirm')),
    );
    const confR = conf.reduce((a, p) => a + p.inclRev, 0);
    const futureWithLift = futureProc.filter((p) => p.liftPct > 0);
    const avgLift = futureWithLift.length
      ? futureWithLift.reduce((a, p) => a + p.liftPct, 0) / futureWithLift.length
      : 0;
    const peakLift = futureProc.reduce((mx, p) => Math.max(mx, p.liftPct), 0);
    const futureConf = conf.filter((p) => !p.isHist).length;

    return {
      total: proc.length,
      histCount: histProc.length,
      futureCount: futureProc.length,
      totIncl,
      totInclU,
      histTotalIncr,
      futureTotalIncr,
      confR,
      avgLift,
      peakLift,
      futureConf,
      futureProposed: futureProc.length - futureConf,
      histInclU: histProc.reduce((a, p) => a + p.inclUnits, 0),
      futureInclU: futureProc.reduce((a, p) => a + p.inclUnits, 0),
    };
  }, [proc]);

  /* Chart data: bar chart labels, values, colors */
  const barData = useMemo(() => {
    const labels = proc.map((p) =>
      p.isHist ? `↩ ${p.date}` : `Wk${p.wk} ${p.category.substring(0, 7)}`,
    );
    const data = proc.map((p) => p.inclRev);
    const colors = proc.map((p) => {
      if (p.isHist) return 'rgba(24,167,255,.55)';
      const ok = p.status && (p.status.includes('✓') || p.status.toLowerCase().includes('confirm'));
      return ok ? 'rgba(0,207,146,.8)' : 'rgba(255,199,17,.6)';
    });
    return { labels, data, colors };
  }, [proc]);

  return (
    <PageShell title="Endcap Lift" subtitle="Incremental revenue from endcap & co-space placements">
      {/* ── KPI Row ────────────────────────────────────────── */}
      <KpiGrid columns={4}>
        <KpiCard
          icon="📐"
          label="Endcap Placements"
          style="--cc:var(--cy)"
          value={kpis.total}
          delta={`${kpis.futureConf} future confirmed · ${kpis.futureProposed} proposed`}
          deltaClass="neu"
          sub={`${kpis.histCount} historical · ${kpis.futureCount} upcoming`}
        />
        <KpiCard
          icon="📦"
          label="Total Incr. Units"
          style="--cc:var(--gr)"
          value={fmt(kpis.totInclU)}
          delta={`${fmt(kpis.histInclU)} actual hist · ${fmt(kpis.futureInclU)} fcast`}
          deltaClass="up"
          sub="vs stable baseline velocity"
        />
        <KpiCard
          icon="💰"
          label="Total Incr. Revenue"
          style="--cc:var(--yw)"
          value={fmtDol(kpis.futureTotalIncr)}
          delta={`${fmtDol(kpis.histTotalIncr)} hist actuals (realized)`}
          deltaClass="up"
          sub="Forward-looking only (upcoming)"
        />
        <KpiCard
          icon="📍"
          label="Avg Lift %"
          style="--cc:var(--pu)"
          value={`${(kpis.avgLift * 100).toFixed(0)}%`}
          delta={`${(kpis.peakLift * 100).toFixed(0)}% peak · excl. co-space-only`}
          deltaClass="neu"
          sub="Future events with deal mechanic"
        />
      </KpiGrid>

      {/* ── Charts Row ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="cc">
          <div className="ct">Incremental Revenue by Event</div>
          <BarChart
            labels={barData.labels}
            datasets={[
              {
                label: 'Incr. Revenue',
                data: barData.data,
                backgroundColor: barData.colors as unknown as string,
              },
            ]}
          />
        </div>
        <div className="cc">
          <div className="ct">Confirmed vs Proposed</div>
          <DoughnutChart
            labels={['Confirmed', 'Proposed']}
            data={[kpis.confR, kpis.totIncl - kpis.confR]}
            colors={['rgba(0,207,146,.8)', 'rgba(255,199,17,.6)']}
          />
        </div>
      </div>

      {/* ── Detail Table ───────────────────────────────────── */}
      <DataTable>
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Event</th>
              <th>Category</th>
              <th>Type</th>
              <th>Stores</th>
              <th className="tr">Lift %</th>
              <th className="tr">Base Units</th>
              <th className="tr">Incr. Units</th>
              <th className="tr">Base Rev</th>
              <th className="tr">Incr. Rev</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Historical header */}
            <tr>
              <td
                colSpan={11}
                style={{
                  background: 'rgba(24,167,255,.06)',
                  color: 'var(--cy)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.04em',
                  padding: '5px 12px',
                  borderBottom: '1px solid rgba(24,167,255,.18)',
                }}
              >
                ↩ HISTORICAL EVENTS — Jan–Feb 2026 · Realized actuals vs stable
                baseline ({fmt(13751)} units/wk)
              </td>
            </tr>
            {proc.map((p, i) => {
              const ok =
                p.status &&
                (p.status.includes('✓') || p.status.toLowerCase().includes('confirm'));
              const liftDisplay = p.isHist
                ? p.actual_lift
                  ? `${((p.actual_lift - 1) * 100).toFixed(0)}% actual`
                  : '—'
                : `${(p.liftPct * 100).toFixed(0)}%`;

              /* Insert separator before first future event */
              const showSeparator =
                !p.isHist && (i === 0 || proc[i - 1].isHist);

              return (
                <Fragment key={`${p.wk}-${i}`}>
                  {showSeparator && (
                    <tr>
                      <td
                        colSpan={11}
                        style={{
                          background: 'rgba(0,227,205,.05)',
                          color: 'var(--tx3)',
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '.05em',
                          padding: '6px 12px',
                          borderTop: '1px solid rgba(0,227,205,.2)',
                          borderBottom: '1px solid rgba(0,227,205,.2)',
                        }}
                      >
                        ▶ UPCOMING EVENTS
                      </td>
                    </tr>
                  )}
                  <tr
                    style={
                      p.isHist
                        ? { opacity: 0.82, background: 'rgba(24,167,255,.04)' }
                        : undefined
                    }
                  >
                    <td>
                      <span className={`ch ${p.isHist ? 'cy2' : 'cb'}`}>
                        {p.isHist ? `↩ ${p.date}` : `Wk${p.wk} ${p.date}`}
                      </span>
                    </td>
                    <td className="tn" title={p.event} style={{ maxWidth: 200 }}>
                      {p.event}
                    </td>
                    <td>
                      <span className="ch cgr">{p.category.substring(0, 12)}</span>
                    </td>
                    <td>
                      <span className="ch cp">{p.type}</span>
                    </td>
                    <td style={{ fontSize: 11.5 }}>{p.stores}</td>
                    <td className="tr up" style={p.isHist ? { color: 'var(--cy)' } : undefined}>
                      {liftDisplay}
                    </td>
                    <td className="tr">{fmt(p.baseUnits)}</td>
                    <td className="tr up">{fmt(p.inclUnits)}</td>
                    <td className="tr">{fmtDol(p.baseRev)}</td>
                    <td className="tr up">{fmtDol(p.inclRev)}</td>
                    <td>
                      {p.isHist ? (
                        <span
                          className="ch"
                          style={{
                            background: 'rgba(24,167,255,.15)',
                            color: 'var(--cy)',
                          }}
                        >
                          {'📋'} Historical
                        </span>
                      ) : ok ? (
                        <span className="ch cg">✓ Confirmed</span>
                      ) : (
                        <span className="ch cy2">⏳ Proposed</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  );
}
