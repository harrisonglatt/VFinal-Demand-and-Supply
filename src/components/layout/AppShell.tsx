'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import ChartProvider from '../charts/ChartProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/sign-in') {
    return <>{children}</>;
  }

  return (
    <ChartProvider>
      <Header />
      <Sidebar />
      <main className="main">
        {children}
      </main>
    </ChartProvider>
  );
}
