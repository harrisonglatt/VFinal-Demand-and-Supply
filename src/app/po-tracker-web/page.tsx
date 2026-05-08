'use client';

import { useState, useRef } from 'react';

/**
 * PO Delivery Tracker module — embeds the po-tracker-web single-file app from
 * public/po-tracker-web/index.html as a same-origin iframe.
 *
 * Different from the existing /po-tracker (Owlery-backed live data):
 * this one is a local CSV/XLSX upload tool. Users drag in Extensiv/3PL Central
 * exports and get By SKU / By PO / Hierarchy / Layer Check views entirely client-side.
 *
 * Replace public/po-tracker-web/index.html to update the dashboard.
 */
export default function PoTrackerWebPage() {
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
            PO Delivery Tracker
          </div>
          <div
            style={{
              fontFamily: 'Mulish, sans-serif',
              fontSize: 12,
              color: 'var(--tx2)',
              marginTop: 2,
            }}
          >
            Drop in Extensiv items + sales orders CSVs (and optional SKU reference XLSX) — runs entirely in-browser
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={() => setPresent((p) => !p)}
            title="Hide app shell for screen-share"
          >
            {present ? 'Exit Present Mode' : 'Present Mode'}
          </button>
          <a
            className="btn"
            href="/po-tracker-web/index.html"
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
            title="Reload — clears uploaded data"
          >
            Reload
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src="/po-tracker-web/index.html"
        title="Little Spoon PO Delivery Tracker"
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
