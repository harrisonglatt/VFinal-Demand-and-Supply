import type { Metadata } from 'next';
import { Mulish, Roboto } from 'next/font/google';
import '@/styles/globals.css';
import { OverridesProvider } from '@/context/OverridesContext';
import { PromoProvider } from '@/context/PromoContext';
import { NewSkuProvider } from '@/context/NewSkuContext';
import { CalibrationProvider } from '@/context/CalibrationContext';
import { PlannedPOsProvider } from '@/context/PlannedPOsContext';
import { AppShell } from '@/components/layout/AppShell';

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-mulish',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Little Spoon · Target Demand Intelligence',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${mulish.variable} ${roboto.variable}`}>
      <body>
        <OverridesProvider>
          <PromoProvider>
            <NewSkuProvider>
              <CalibrationProvider>
                <PlannedPOsProvider>
                  <AppShell>{children}</AppShell>
                </PlannedPOsProvider>
              </CalibrationProvider>
            </NewSkuProvider>
          </PromoProvider>
        </OverridesProvider>
      </body>
    </html>
  );
}
