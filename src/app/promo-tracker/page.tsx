'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMeasuredLifts } from '@/context/MeasuredLiftsContext';

/**
 * Promo Intel module — embeds the Retail-promo-tracker single-file dashboard
 * from public/promo-tracker/index.html as a same-origin iframe.
 *
 * Sync-to-demand-plan flow:
 *  - "Sync to Demand Plan" button posts 'ls:promo-intel:request-sync' to iframe
 *  - Iframe replies with 'ls:promo-intel:sync-response' carrying type x dp-category lifts
 *  - MeasuredLiftsContext persists to localStorage; PromoContext.computeLift consults it.
 */
export default function PromoTrackerPage() {
  const [present, setPresent] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const measured = useMeasuredLifts();

  // Listen for messages from the iframe
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      if (data.type === 'ls:promo-intel:ready') {
        setIframeReady(true);
      }
      if (data.type === 'ls:promo-intel:sync-response') {
        setSyncing(false);
        const payload = data.payload;
        if (!payload || payload.error) {
          setSyncMsg({
            kind: 'error',
            text: payload?.error ?? 'Sync failed — no payload returned.',
          });
          return;
        }
        if (!payload.measuredLifts || Object.keys(payload.measuredLifts).length === 0) {
          setSyncMsg({
            kind: 'info',
            text: 'No measurable lifts — load sales data and a promo calendar in the dashboard first.',
          });
          return;
        }
        measured.setFromBridge(payload);
        const n = Object.keys(payload.measuredLifts).length;
        setSyncMsg({
          kind: 'success',
          text: `Synced ${n} measured lift combos to demand plan (${payload.weeksCovered ?? 0} weeks of data).`,
        });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [measured]);

  const handleSync = useCallback(() => {
    setSyncMsg(null);
    setSyncing(true);
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setSyncing(false);
      setSyncMsg({ kind: 'error', text: 'Iframe not ready.' });
      return;
    }
    win.postMessage({ type: 'ls:promo-intel:request-sync' }, '*');
    // Safety timeout in case the iframe never responds
    setTimeout(() => {
      setSyncing((s) => {
        if (s) setSyncMsg({ kind: 'error', text: 'Sync timed out — is the dashboard fully loaded?' });
        return false;
      });
    }, 8000);
  }, []);

  const handleClear = useCallback(() => {
    measured.clear();
    setSyncMsg({ kind: 'info', text: 'Cleared measured lifts — demand plan reverted to lift matrix.' });
  }, [measured]);

  const lastSyncedAtLabel = measured.state.syncedAt
    ? new Date(measured.state.syncedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

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
          flexWrap: 'wrap',
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Sync state pill */}
          {measured.hasMeasured ? (
            <div
              style={{
                fontSize: 11,
                color: '#067A56',
                background: 'rgba(0,207,146,.10)',
                border: '1px solid rgba(0,207,146,.28)',
                padding: '4px 10px',
                borderRadius: 999,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
              title={`Synced ${measured.state.categoryCount} combos · ${measured.state.weeksCovered} weeks of data`}
            >
              ✓ Demand plan using {measured.state.categoryCount} measured lifts {lastSyncedAtLabel ? `· ${lastSyncedAtLabel}` : ''}
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: 'var(--tx2)',
                background: 'var(--s2)',
                border: '1px solid var(--bd)',
                padding: '4px 10px',
                borderRadius: 999,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              Not yet synced — demand plan using lift matrix
            </div>
          )}

          <button
            className="btn btn-accent"
            onClick={handleSync}
            disabled={!iframeReady || syncing}
            title="Compute measured lifts and feed them into Demand Plan / Shipments / Supply Planning / Executive"
          >
            {syncing ? 'Syncing…' : measured.hasMeasured ? 'Re-sync to Demand Plan' : 'Sync to Demand Plan'}
          </button>
          {measured.hasMeasured && (
            <button className="btn" onClick={handleClear} title="Drop measured lifts; revert to lift matrix">
              Clear
            </button>
          )}
          <a
            className="btn"
            href="/promo"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            title="Edit promo events"
          >
            Promo Calendar
          </a>
          <button
            className="btn"
            onClick={() => setPresent((p) => !p)}
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
              if (iframeRef.current) {
                setIframeReady(false);
                iframeRef.current.src = iframeRef.current.src;
              }
            }}
          >
            Reload
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncMsg && (
        <div
          style={{
            padding: '10px 24px',
            fontSize: 12.5,
            fontWeight: 600,
            color:
              syncMsg.kind === 'success' ? '#067A56' :
              syncMsg.kind === 'error' ? '#A33E1F' :
              'var(--tx-label)',
            background:
              syncMsg.kind === 'success' ? 'rgba(0,207,146,.08)' :
              syncMsg.kind === 'error' ? 'rgba(255,135,102,.08)' :
              'var(--s2)',
            borderBottom: '1px solid var(--bd)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{syncMsg.text}</span>
          <button
            onClick={() => setSyncMsg(null)}
            style={{
              marginLeft: 'auto', background: 'transparent', border: 'none',
              color: 'inherit', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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
