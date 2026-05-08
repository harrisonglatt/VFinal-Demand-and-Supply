'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { LS } from '@/lib/colors';

interface ChartProviderProps {
  children: ReactNode;
}

const FAMILY = "'Mulish', -apple-system, BlinkMacSystemFont, sans-serif";

export default function ChartProvider({ children }: ChartProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    ChartJS.register(...registerables);

    // ─── Typography & color (light theme) ─────────────────────────
    ChartJS.defaults.font.family = FAMILY;
    ChartJS.defaults.font.size = 12;
    ChartJS.defaults.color = LS.gray700;
    ChartJS.defaults.borderColor = LS.gray200;

    // ─── Legend ──────────────────────────────────────────────────
    ChartJS.defaults.plugins.legend.position = 'bottom';
    ChartJS.defaults.plugins.legend.labels.font = {
      family: FAMILY,
      size: 12,
      weight: 600,
    };
    ChartJS.defaults.plugins.legend.labels.color = LS.gray700;
    ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
    ChartJS.defaults.plugins.legend.labels.pointStyle = 'circle';
    ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
    ChartJS.defaults.plugins.legend.labels.boxHeight = 8;
    ChartJS.defaults.plugins.legend.labels.padding = 16;

    // ─── Tooltip (per Retail OS spec) ────────────────────────────
    ChartJS.defaults.plugins.tooltip.titleFont = {
      family: FAMILY,
      size: 12,
      weight: 700,
    };
    ChartJS.defaults.plugins.tooltip.bodyFont = {
      family: FAMILY,
      size: 12,
      weight: 400,
    };
    ChartJS.defaults.plugins.tooltip.titleColor = '#fff';
    ChartJS.defaults.plugins.tooltip.bodyColor = '#fff';
    ChartJS.defaults.plugins.tooltip.backgroundColor = 'rgba(20,20,20,0.95)';
    ChartJS.defaults.plugins.tooltip.borderColor = 'transparent';
    ChartJS.defaults.plugins.tooltip.borderWidth = 0;
    ChartJS.defaults.plugins.tooltip.padding = 12;
    ChartJS.defaults.plugins.tooltip.cornerRadius = 10;
    ChartJS.defaults.plugins.tooltip.displayColors = true;
    ChartJS.defaults.plugins.tooltip.boxPadding = 4;

    // ─── Scales ─────────────────────────────────────────────────
    ChartJS.defaults.scale.grid.color = LS.gray100;
    ChartJS.defaults.scale.grid.lineWidth = 1;
    ChartJS.defaults.scale.border.display = false;

    // ─── Element defaults ───────────────────────────────────────
    ChartJS.defaults.elements.bar.borderRadius = 4;
    ChartJS.defaults.elements.bar.borderWidth = 0;
    ChartJS.defaults.elements.line.borderWidth = 2;
    ChartJS.defaults.elements.line.tension = 0.32;
    ChartJS.defaults.elements.point.radius = 0;
    ChartJS.defaults.elements.point.hoverRadius = 5;
    ChartJS.defaults.elements.point.hoverBorderWidth = 2;
    ChartJS.defaults.elements.point.hoverBorderColor = '#fff';
  }, []);

  return <>{children}</>;
}
