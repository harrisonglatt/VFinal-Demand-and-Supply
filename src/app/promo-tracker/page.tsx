'use client';

import { useState, useRef } from 'react';

/**
 * Promo Intel module — embeds the Retail-promo-tracker single-file dashboard
 * from public/promo-tracker/index.html as a same-origin iframe.
 *
 * Relationship to existing surfaces:
 *   - /promo (PromoCalendarPage) — the planning surface where users add/edit promo events.
 *     Drives PromoContext.events and getLift(weekIdx, dpCategory) which feeds Demand Plan,
 *     Shipments, Supply Planning, Executive Summary. Lift numbers come from a hardcoded
 *     LIFT_MATRIX seeded with hist-promo.json.
 *   - /endcap (Promo Lift Lab) — analysis surface with historical lift breakdowns.
 *   - /promo-tracker (this) — Measures actual lifts from a weekly sales feed + promo
 *     calendar. Auto-classifies events, calculates incremental units/$, ROI, cannibalization,
 *     halo, fatigue, confidence intervals, SKU-level forecasts.
 *
 * Future integration: a postMessage bridge from this iframe back to PromoContext to
 * use measured lifts as overrides on top of LIFT_MATRIX defaults.
 */
export default function PromoTrackerPage() {
  const [present, setPresent] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  return (
    <div
      style={{
        position: present ? 'fixed' : 'relative',
        top: present ? 0 : undefined,
        left: present ? 0 : undefined,
        right: present ? 0 : undefined,
        bottom: present ? 0 : undefined,
        zIndex: present ? 1000 : undefined,
        background: 'var(--bg)',
        height: present ? '100vh' : 'calc(100vh - var(--hh))',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 24px',
          borderBottom: '1px solid var(--bd)',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'Mulish, sans-serif',
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--tx)',
              letterSpacing: '-0.02em',
            }}
          >
            Promo Intel
          </div>
          <div
            style={{
              fontFamily: 'Mulish, sans-serif',
              fontSize: 12,
              color: 'var(--tx2)',
              marginTop: 2,
            }}
          >
            Measured lift, ROI, incrementality + cannibalization analysis from sales feed
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a
            className="btn"
            href="/promo"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            title="Edit promo events that flow into demand plan"
          >
            Open Promo Calendar
          </a>
          <button
            className="btn"
            onClick={() => setPresent((p) => !p)}
            title="Hide app shell for screen-share"
          >
            {present ? 'Exit Present Mode' : 'Present Mode'}
          </button>
          <a
            className="btn"
            href="/promo-tracker/index.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          >
            Open in New Tab
          </a>
          <button
            className="btn"
            onClick={() => {
              if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
            }}
            title="Reload — clears uploaded data unless cached in localStorage"
          >
            Reload
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src="/promo-tracker/index.html"
        title="Little Spoon Promo Intel Dashboard"
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          background: '#FFFEF8',
        }}
      />
    </div>
  );
}
