'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';

interface ChartProviderProps {
  children: ReactNode;
}

export default function ChartProvider({ children }: ChartProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    ChartJS.register(...registerables);

    // Apply Little Spoon brand defaults
    ChartJS.defaults.font.family = "'Roboto',sans-serif";
    ChartJS.defaults.font.size = 12;
    ChartJS.defaults.color = '#7b97c8';
    ChartJS.defaults.borderColor = 'rgba(30,48,84,0.5)';

    ChartJS.defaults.plugins.legend.labels.font = {
      family: "'Roboto',sans-serif",
      size: 11,
      weight: 500,
    };
    ChartJS.defaults.plugins.tooltip.titleFont = {
      family: "'Roboto',sans-serif",
      size: 12,
      weight: 'bold' as const,
    };
    ChartJS.defaults.plugins.tooltip.bodyFont = {
      family: "'Roboto',sans-serif",
      size: 11,
    };
    ChartJS.defaults.plugins.tooltip.backgroundColor = 'rgba(13,22,38,0.95)';
    ChartJS.defaults.plugins.tooltip.borderColor = '#00E3CD';
    ChartJS.defaults.plugins.tooltip.borderWidth = 1;
    ChartJS.defaults.plugins.tooltip.padding = 10;

    ChartJS.defaults.scale.grid.color = 'rgba(30,45,80,.4)';
    ChartJS.defaults.scale.grid.lineWidth = 1;
  }, []);

  return <>{children}</>;
}
