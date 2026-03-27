'use client';

import { ReactNode } from 'react';

interface DataTableProps {
  children: ReactNode;
}

export default function DataTable({ children }: DataTableProps) {
  return (
    <div className="tc">
      <div className="ts">{children}</div>
    </div>
  );
}
