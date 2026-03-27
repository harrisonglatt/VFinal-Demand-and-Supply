'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  modules: string[];
  visible: boolean;
  onClose: () => void;
}

export default function Toast({ message, modules, visible, onClose }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 340,
        transition: 'opacity .3s',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          background: '#0d1626',
          border: '1px solid rgba(0,207,146,.4)',
          borderRadius: 10,
          padding: '12px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gr)', marginBottom: 4 }}>
          &#9989; {message}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
          Updated: {modules.join(' · ')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
          Changes applied to all views
        </div>
      </div>
    </div>
  );
}
