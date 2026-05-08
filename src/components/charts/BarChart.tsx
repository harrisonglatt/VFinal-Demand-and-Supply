'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { LS } from '@/lib/colors';
import { fmtCompact } from '@/lib/charts';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface DatasetDef {
  label: string;
  data: number[];
  backgroundColor: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

interface BarChartProps {
  labels: string[];
  datasets: DatasetDef[];
  horizontal?: boolean;
  height?: number;
}

export default function BarChart({ labels, datasets, horizontal = false, height }: BarChartProps) {
  const data: ChartData<'bar'> = {
    labels,
    datasets: datasets.map((d) => ({
      label: d.label,
      data: d.data,
      backgroundColor: d.backgroundColor,
      borderColor: d.borderColor || d.backgroundColor,
      borderWidth: d.borderWidth ?? 0,
      borderRadius: 4,
    })),
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: !height,
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'bottom',
        labels: {
          color: LS.gray700,
          font: { size: 12, weight: 600 },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: LS.gray500,
          font: { size: 11, weight: 500 },
          maxTicksLimit: 14,
          autoSkip: true,
        },
      },
      y: {
        grid: { color: LS.gray100, drawTicks: false },
        border: { display: false },
        ticks: {
          color: LS.gray400,
          font: { size: 11 },
          callback: (v) => fmtCompact(Number(v)),
        },
      },
    },
  };

  return <Bar data={data} options={options} height={height} />;
}
