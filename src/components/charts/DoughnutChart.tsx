'use client';

import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement, Tooltip, Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { LS } from '@/lib/colors';

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
        borderColor: '#fff',
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: !height,
    cutout: '62%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: LS.gray700,
          font: { size: 12, weight: 600 },
          padding: 14,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
        },
      },
    },
  };

  return <Doughnut data={chartData} options={options} height={height} />;
}
