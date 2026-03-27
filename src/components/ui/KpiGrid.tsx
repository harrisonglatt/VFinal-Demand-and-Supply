'use client';

import { ReactNode } from 'react';

interface KpiGridProps {
  columns: 2 | 3 | 4;
  children: ReactNode;
}

export default function KpiGrid({ columns, children }: KpiGridProps) {
  return <div className={`kpis k${columns}`}>{children}</div>;
}
