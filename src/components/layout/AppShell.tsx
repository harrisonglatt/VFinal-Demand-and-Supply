'use client';

import Header from './Header';
import Sidebar from './Sidebar';
import ChartProvider from '../charts/ChartProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
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
