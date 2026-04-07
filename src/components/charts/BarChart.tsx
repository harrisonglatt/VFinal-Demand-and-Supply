'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';

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
      borderWidth: d.borderWidth ?? 1,
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
        labels: { color: '#7b97c8', font: { size: 11 } },
      },
    },
    scales: {
      x: { ticks: { color: '#44608a', font: { size: 10 } } },
      y: {
        ticks: {
          color: '#44608a',
          font: { size: 10 },
          callback: (v) => {
            const n = Number(v);
            return n >= 1000 ? (n / 1000).toFixed(0) + 'k' : String(v);
          },
        },
      },
    },
  };

  return <Bar data={data} options={options} height={height} />;
}
