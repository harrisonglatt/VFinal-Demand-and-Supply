'use client';

import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement, Tooltip, Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DoughnutChartProps {
  labels: string[];
  data: number[];
  colors: string[];
  height?: number;
}

export default function DoughnutChart({ labels, data, colors, height }: DoughnutChartProps) {
  const chartData: ChartData<'doughnut'> = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderColor: 'rgba(13,22,38,0.8)',
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: !height,
    cutout: '60%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: '#7b97c8', font: { size: 11 }, padding: 12 },
      },
    },
  };

  return <Doughnut data={chartData} options={options} height={height} />;
}
