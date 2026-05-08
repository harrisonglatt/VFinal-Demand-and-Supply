'use client';

export default function Header() {
  return (
    <header className="hdr">
      <div className="hdr-brand-mark" aria-label="Little Spoon">LS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.1 }}>
        <div className="hdr-brand">Little Spoon Retail OS</div>
        <div className="hdr-sub">Target · Demand Intelligence</div>
      </div>
      <div className="badge gr" style={{ marginLeft: 12 }}>Week of Mar 22, 2026</div>
      <div className="badge yw">CW In Progress</div>
      <div className="hdr-r">
        <span className="omni-tag">Omni Live · Mar 24</span>
        <span className="live">
          <span className="dot" />
          Auto-Refresh
        </span>
      </div>
    </header>
  );
}
