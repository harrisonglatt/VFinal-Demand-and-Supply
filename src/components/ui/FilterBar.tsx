'use client';

import { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  meta?: string;
}

export default function FilterBar({ children, meta }: FilterBarProps) {
  return (
    <div className="fb">
      {children}
      {meta && <span className="fm">{meta}</span>}
    </div>
  );
}
