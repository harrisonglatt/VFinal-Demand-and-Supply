'use client';

import { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  extra?: ReactNode;
}

export default function PageShell({ title, subtitle, children, extra }: PageShellProps) {
  return (
    <div className="pg active">
      <div className="ph">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="pt">{title}</div>
            <div className="ps">{subtitle}</div>
          </div>
          {extra && <div>{extra}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
