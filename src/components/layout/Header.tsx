'use client';

export default function Header() {
  async function handleSignOut() {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.href = '/sign-in';
  }

  return (
    <header className="hdr" style={{ borderBottom: '2px solid rgba(0,227,205,.3)' }}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        style={{ flexShrink: 0, marginRight: 2 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <ellipse cx="10" cy="5.5" rx="5" ry="5" fill="#00E3CD" opacity=".9" />
        <rect x="9" y="9.5" width="2.2" height="8" rx="1.1" fill="#00E3CD" opacity=".7" />
      </svg>
      <div className="hdr-logo">Little Spoon</div>
      <div className="hdr-sub-label">&times; Target</div>
      <div className="badge">Demand Intelligence</div>
      <div className="badge gr">Week of Mar 22, 2026</div>
      <div className="badge yw">&#9889; CW In Progress</div>
      <div className="hdr-r">
        <span className="omni-tag">&#128309; Omni Live &middot; Mar 24</span>
        <span className="live">
          <span className="dot" />
          Auto-Refresh
        </span>
        <button className="hdr-sign-out" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
