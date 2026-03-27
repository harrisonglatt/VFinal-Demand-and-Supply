'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface DatasetDef {
  label: string;
  data: number[];
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
      backgroundColor: d.backgroundColor || d.borderColor + '18',
      fill: d.fill ?? false,
      tension: 0.4,
      pointRadius: 3,
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

  return <Line data={data} options={options} height={height} />;
}
