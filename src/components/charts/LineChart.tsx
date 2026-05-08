'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { LS } from '@/lib/colors';
import { fmtCompact } from '@/lib/charts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface DatasetDef {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor?: string;
  borderDash?: number[];
  fill?: boolean;
}

interface LineChartProps {
  labels: string[];
  datasets: DatasetDef[];
  height?: number;
}

export default function LineChart({ labels, datasets, height }: LineChartProps) {
  const data: ChartData<'line'> = {
    labels,
    datasets: datasets.map((d) => ({
      label: d.label,
      data: d.data,
      borderColor: d.borderColor,
      backgroundColor: d.backgroundColor || d.borderColor + '33',
      fill: d.fill ?? false,
      tension: 0.32,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      pointBackgroundColor: d.borderColor,
      borderWidth: 2,
      borderDash: d.borderDash || [],
      spanGaps: false,
    })),
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: !height,
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

  return <Line data={data} options={options} height={height} />;
}
