// ─── Chart.js Utilities · Little Spoon Retail OS ──────────────────
// Brand defaults + helpers for react-chartjs-2 / Chart.js.

import type { ChartOptions, ChartData } from 'chart.js';
import { LS } from './colors';

// ─── Brand Font Config ────────────────────────────────────────────
const FAMILY_UI = "'Mulish', -apple-system, BlinkMacSystemFont, sans-serif";

const COLORS = {
  text: LS.gray700,        // body text
  tickText: LS.gray400,    // axis ticks
  axisLabel: LS.gray500,   // axis labels
  gridLine: LS.gray100,    // chart gridlines
  tooltipBg: 'rgba(20,20,20,0.95)',
  borderColor: LS.gray200,
} as const;

// ─── Number formatting (chart-internal) ───────────────────────────
/** Compact number — no decimals, K/M/B suffix per brief. */
export function fmtCompact(n: number): string {
  if (n == null || isNaN(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return Math.round(n / 1_000_000_000) + 'B';
  if (abs >= 1_000_000) return Math.round(n / 1_000_000) + 'M';
  if (abs >= 1_000) return Math.round(n / 1_000) + 'K';
  return Math.round(n).toLocaleString();
}
/** Compact dollar — adds $ prefix. */
export function fmtDollarCompact(n: number): string {
  if (n == null || isNaN(n)) return '';
  return '$' + fmtCompact(n);
}
/** Rounded percent — value already as fraction (0.12 → "12%"). */
export function fmtPercentRound(v: number): string {
  if (v == null || isNaN(v)) return '';
  return Math.round(v * 100) + '%';
}
/** Rounded multiplier — "2x", "5x". */
export function fmtMultiplier(v: number): string {
  if (v == null || isNaN(v)) return '';
  return Math.round(v) + 'x';
}

// ─── Chart.js Global Defaults ─────────────────────────────────────

export function initChartDefaults(): void {
  let Chart: typeof import('chart.js')['Chart'] | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Chart = require('chart.js').Chart;
  } catch {
    return;
  }
  if (!Chart) return;

  Chart.defaults.font.family = FAMILY_UI;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COLORS.text;
  Chart.defaults.borderColor = COLORS.borderColor;

  // Legend
  Chart.defaults.plugins.legend.labels.font = {
    family: FAMILY_UI,
    size: 12,
    weight: 600,
  };
  Chart.defaults.plugins.legend.labels.color = LS.gray700;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.legend.labels.padding = 16;

  // Tooltip
  Chart.defaults.plugins.tooltip.titleFont = {
    family: FAMILY_UI,
    size: 12,
    weight: 700,
  };
  Chart.defaults.plugins.tooltip.bodyFont = {
    family: FAMILY_UI,
    size: 12,
    weight: 400,
  };
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = '#fff';
  Chart.defaults.plugins.tooltip.backgroundColor = COLORS.tooltipBg;
  Chart.defaults.plugins.tooltip.borderColor = 'transparent';
  Chart.defaults.plugins.tooltip.borderWidth = 0;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.boxPadding = 4;

  // Scales
  Chart.defaults.scale.grid.color = COLORS.gridLine;
  Chart.defaults.scale.grid.lineWidth = 1;
  Chart.defaults.scale.border.display = false;

  // Element defaults
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.bar.borderWidth = 0;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.line.tension = 0.32;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hoverBorderWidth = 2;
  Chart.defaults.elements.point.hoverBorderColor = '#fff';
}

// ─── Standard scale presets ────────────────────────────────────────

export function brandXScale() {
  return {
    grid: { display: false },
    border: { display: false },
    ticks: {
      color: LS.gray500,
      font: { family: FAMILY_UI, size: 11, weight: 500 },
      maxTicksLimit: 14,
      autoSkip: true,
    },
  };
}

export function brandYScale(opts?: { format?: (v: number) => string; gridDisplay?: boolean }) {
  return {
    grid: {
      display: opts?.gridDisplay ?? true,
      color: LS.gray100,
      drawTicks: false,
    },
    border: { display: false },
    ticks: {
      color: LS.gray400,
      font: { family: FAMILY_UI, size: 11 },
      callback: (v: string | number) => (opts?.format ? opts.format(Number(v)) : fmtCompact(Number(v))),
    },
  };
}

// ─── Brand Line Chart Options Builder (legacy compatibility) ──────

export interface LineDatasetConfig {
  label: string;
  data: (number | null)[];
  bc: string;
  bg?: string;
  dash?: number[];
}

export function brandLineChartOptions(config: {
  labels: string[];
  datasets: LineDatasetConfig[];
  yTickFormat?: (v: number) => string;
}): {
  data: ChartData<'line'>;
  options: ChartOptions<'line'>;
} {
  const { labels, datasets, yTickFormat } = config;

  const data: ChartData<'line'> = {
    labels,
    datasets: datasets.map((d) => ({
      label: d.label,
      data: d.data,
      borderColor: d.bc,
      backgroundColor: d.bg || d.bc + '33', // ~20% alpha per brief
      fill: !!d.bg,
      tension: 0.32,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      pointBackgroundColor: d.bc,
      borderWidth: 2,
      borderDash: d.dash || [],
      spanGaps: false,
    })),
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'bottom',
        labels: {
          color: LS.gray700,
          font: { family: FAMILY_UI, size: 12, weight: 600 },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
        },
      },
    },
    scales: {
      x: brandXScale(),
      y: brandYScale({ format: yTickFormat }),
    },
  };

  return { data, options };
}

// ─── Brand Bar Chart Options Builder ───────────────────────────────

export interface BarDatasetConfig {
  label: string;
  data: number[];
  color: string;
  stack?: string;
}

export function brandBarChartOptions(config: {
  labels: string[];
  datasets: BarDatasetConfig[];
  yFormat?: (v: number) => string;
  stacked?: boolean;
  horizontal?: boolean;
}): { data: ChartData<'bar'>; options: ChartOptions<'bar'> } {
  const { labels, datasets, yFormat, stacked, horizontal } = config;

  const data: ChartData<'bar'> = {
    labels,
    datasets: datasets.map((d) => ({
      label: d.label,
      data: d.data,
      backgroundColor: d.color,
      borderColor: d.color,
      borderWidth: 0,
      borderRadius: stacked ? 0 : 4,
      stack: d.stack,
    })),
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'bottom',
        labels: {
          color: LS.gray700,
          font: { family: FAMILY_UI, size: 12, weight: 600 },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
        },
      },
    },
    scales: stacked
      ? {
          x: { ...brandXScale(), stacked: true },
          y: { ...brandYScale({ format: yFormat }), stacked: true },
        }
      : {
          x: brandXScale(),
          y: brandYScale({ format: yFormat }),
        },
  };

  return { data, options };
}
