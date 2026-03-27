'use client';

import { ReactNode } from 'react';

interface ChipProps {
  className: string;
  children: ReactNode;
}

export default function Chip({ className, children }: ChipProps) {
  return <span className={`ch ${className}`}>{children}</span>;
}

/* ── RiskChip ─────────────────────────────────────────────── */

interface RiskChipProps {
  flag: string;
}

export function RiskChip({ flag }: RiskChipProps) {
  const f = flag || '';
  if (f.includes('OOS')) return <Chip className="cr">&#128308; OOS</Chip>;
  if (f.includes('Watch')) return <Chip className="cy2">&#128993; Watch</Chip>;
  return <Chip className="cg">&#9989; OK</Chip>;
}
