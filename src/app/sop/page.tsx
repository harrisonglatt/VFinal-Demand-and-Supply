'use client';

import { useState, useRef } from 'react';

/**
 * S&OP Dashboard module — embeds the Retail-SOP single-file dashboard from public/sop/index.html
 * as a same-origin iframe. Adds a slim toolbar with:
 *   - Present mode (full-screen, hides our app shell)
 *   - Open in new tab
 *   - Source link to the public/sop assets
 *
 * The dashboard is fully self-contained: data is inlined, deps come from CDN.
 * To update content: replace public/sop/index.html (or rebuild via the build/extract
 * scripts in public/sop/).
 */
export default function SopPage() {
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
      {/* Toolbar */}
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
            S&amp;OP Dashboard
          </div>
          <div
            style={{
              fontFamily: 'Mulish, sans-serif',
              fontSize: 12,
              color: 'var(--tx2)',
              marginTop: 2,
            }}
          >
            Target/Circana POS · Roundel media · single-file Retail-SOP build
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={() => setPresent((p) => !p)}
            title="Hide app shell and scale up for screen-share"
          >
            {present ? 'Exit Present Mode' : 'Present Mode'}
          </button>
          <a
            className="btn"
            href="/sop/index.html"
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
            title="Reload the dashboard"
          >
            Reload
          </button>
        </div>
      </div>

      {/* Embedded dashboard */}
      <iframe
        ref={iframeRef}
        src="/sop/index.html"
        title="Little Spoon Retail S&OP Dashboard"
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
