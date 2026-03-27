// ─── Chart.js Utilities ───────────────────────────────────────────────
// Adapted for react-chartjs-2. Provides brand defaults and config builders.

import type { ChartOptions, ChartData } from 'chart.js';

// ─── Brand Font Config ────────────────────────────────────────────────

const BRAND_FONT_FAMILY = "'Roboto', sans-serif";

const BRAND_COLORS = {
  text: '#7b97c8',
  tickText: '#44608a',
  gridLine: 'rgba(30,45,80,.4)',
  tooltipBg: 'rgba(13,22,38,0.95)',
  tooltipBorder: '#00E3CD',
  borderColor: 'rgba(30,48,84,0.5)',
} as const;

// ─── Chart.js Global Defaults ─────────────────────────────────────────

/**
 * Apply Little Spoon brand defaults to Chart.js global config.
 * Call once after Chart.js is registered (e.g. in _app.tsx or layout).
 *
 * In Next.js with react-chartjs-2, import Chart from 'chart.js/auto'
 * and call this before rendering any chart components.
 */
export function initChartDefaults(): void {
  // Dynamic import to avoid SSR issues
  let Chart: typeof import('chart.js')['Chart'] | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Chart = require('chart.js').Chart;
  } catch {
    return;
  }
  if (!Chart) return;

  Chart.defaults.font.family = BRAND_FONT_FAMILY;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = BRAND_COLORS.text;
  Chart.defaults.borderColor = BRAND_COLORS.borderColor;

  Chart.defaults.plugins.legend.labels.font = {
    family: BRAND_FONT_FAMILY,
    size: 11,
    weight: 500,
  };
  Chart.defaults.plugins.tooltip.titleFont = {
    family: BRAND_FONT_FAMILY,
    size: 12,
    weight: 'bold' as const,
  };
  Chart.defaults.plugins.tooltip.bodyFont = {
    family: BRAND_FONT_FAMILY,
    size: 11,
  };
  Chart.defaults.plugins.tooltip.backgroundColor = BRAND_COLORS.tooltipBg;
  Chart.defaults.plugins.tooltip.borderColor = BRAND_COLORS.tooltipBorder;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;

  Chart.defaults.scale.grid.color = BRAND_COLORS.gridLine;
  Chart.defaults.scale.grid.lineWidth = 1;
}

// ─── Dataset Config Interface ─────────────────────────────────────────

export interface LineDatasetConfig {
  label: string;
  data: (number | null)[];
  bc: string;
  bg?: string;
  dash?: number[];
}

// ─── Brand Line Chart Options Builder ─────────────────────────────────

/**
 * Returns a react-chartjs-2 compatible config object for a branded line chart.
 * Use with <Line data={data} options={options} /> from react-chartjs-2.
 */
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
      backgroundColor: d.bg || d.bc + '18',
      fill: !!d.bg,
      tension: 0.4,
      pointRadius: 3,
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
        labels: { color: BRAND_COLORS.text, font: { size: 11 } },
      },
    },
    scales: {
      x: { ticks: { color: BRAND_COLORS.tickText, font: { size: 10 } } },
      y: {
        ticks: {
          color: BRAND_COLORS.tickText,
          font: { size: 10 },
          callback: yTickFormat
            ? (v) => yTickFormat(v as number)
            : (v) =>
                (v as number) >= 1000
                  ? ((v as number) / 1000).toFixed(0) + 'k'
                  : String(v),
        },
      },
    },
  };

  return { data, options };
}
