'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  key: string;
  href: string;
  icon: string;
  label: string;
  badge?: string;
  badgeClass?: string;
  badgeStyle?: React.CSSProperties;
}

interface NavSection {
  heading?: string;
  separator?: boolean;
  items?: NavItem[];
}

const NAV: NavSection[] = [
  {
    heading: 'Core',
    items: [
      { key: 'exec', href: '/executive', icon: '🎯', label: 'Executive Summary', badge: 'Live', badgeClass: 'g' },
      { key: 'sop', href: '/sop', icon: '📋', label: 'S&OP Dashboard', badge: 'New', badgeClass: 'b' },
      { key: 'overview', href: '/overview', icon: '📊', label: 'Overview' },
      { key: 'demand', href: '/demand-plan', icon: '📈', label: 'Demand Plan' },
      { key: 'daily', href: '/daily', icon: '📅', label: 'Daily Performance', badge: 'Live', badgeClass: 'g' },
      { key: 'avf', href: '/actuals-vs-forecast', icon: '🎯', label: 'ST vs Forecast', badge: 'MAPE', badgeClass: 'y' },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { key: 'supply', href: '/supply-planning', icon: '🏭', label: 'Supply Planning', badge: 'New', badgeClass: 'g' },
      { key: 'skuspecs', href: '/sku-specs', icon: '⚙️', label: 'SKU Specs & Lead Times', badge: 'New', badgeClass: 'g' },
      { key: 'inventory', href: '/inventory', icon: '📦', label: 'Inventory Intel', badge: '12 OOS' },
      { key: 'shipment', href: '/shipment', icon: '🚚', label: 'Shipment Plan', badge: '52wk', badgeClass: 'b' },
      { key: 'potracker', href: '/po-tracker', icon: '🦉', label: 'PO Tracker', badge: 'Owlery', badgeClass: 'g' },
      { key: 'potrackerweb', href: '/po-tracker-web', icon: '📥', label: 'PO Delivery Tracker', badge: 'CSV', badgeClass: 'b' },
    ],
  },
  {
    heading: 'Planning',
    items: [
      { key: 'promo', href: '/promo', icon: '🗓', label: 'Promo Calendar', badge: '35', badgeClass: 'g' },
      { key: 'promotracker', href: '/promo-tracker', icon: '🎯', label: 'Promo Intel', badge: 'New', badgeClass: 'b' },
      { key: 'launch', href: '/launch', icon: '🚀', label: 'Launch Ramp', badge: '4 SKUs', badgeClass: 'b' },
      { key: 'historical', href: '/historical', icon: '📅', label: 'Historical S/T' },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { key: 'scenario', href: '/scenario', icon: '🔮', label: 'Scenario Analysis' },
      { key: 'endcap', href: '/endcap', icon: '📐', label: 'Promo Lift' },
      { key: 'assumptions', href: '/assumptions', icon: '⚙️', label: 'Assumptions' },
    ],
  },
  { separator: true },
  {
    items: [
      { key: 'fcastver', href: '/forecast-versions', icon: '🔒', label: 'Forecast Versions' },
      { key: 'backtest', href: '/backtest', icon: '🧠', label: 'Model Learning Lab' },
    ],
  },
  { separator: true },
  {
    items: [
      { key: 'addsku', href: '/add-sku', icon: '➕', label: 'Add SKU' },
    ],
  },
  { separator: true },
  {
    heading: 'Risk OS',
    items: [
      {
        key: 'riskos',
        href: '/risk-os',
        icon: '🚨',
        label: 'Risk Operating Center',
        badge: '$573K risk',
        badgeClass: 'r',
        badgeStyle: { background: 'rgba(239,68,68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)' },
      },
      { key: 'actuals', href: '/actuals-tracking', icon: '📈', label: 'Actuals Tracking' },
    ],
  },
  { separator: true },
  {
    items: [
      { key: 'guide', href: '/guide', icon: '📋', label: 'Model Guide' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sb">
      {NAV.map((section, i) => {
        if (section.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="nav-sep"
              style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '6px 8px' }}
            />
          );
        }

        return (
          <div key={`sec-${i}`}>
            {section.heading && <div className="nav-sec">{section.heading}</div>}
            {section.items?.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`nav-it${isActive ? ' active' : ''}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
                >
                  <span className="ni">{item.icon}</span>
                  {item.label}
                  {item.badge && (
                    <span
                      className={`nb${item.badgeClass ? ` ${item.badgeClass}` : ''}`}
                      style={item.badgeStyle}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
