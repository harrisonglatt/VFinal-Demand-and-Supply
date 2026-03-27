'use client';

interface KpiCardProps {
  icon: string;
  label: string;
  style?: string;
  value: string | number;
  delta: string;
  deltaClass: string;
  sub: string;
}

export default function KpiCard({ icon, label, style, value, delta, deltaClass, sub }: KpiCardProps) {
  const isSmall = typeof value === 'string' && value.length > 8;

  return (
    <div className="kc" style={style ? parseCssVars(style) : undefined}>
      <div className="ki">{icon}</div>
      <div className="kl">{label}</div>
      <div className={`kv${isSmall ? ' sm' : ''}`}>{value}</div>
      <div className={`kd ${deltaClass}`}>{delta}</div>
      <div className="ks">{sub}</div>
    </div>
  );
}

/**
 * Parse a CSS custom-property inline style string (e.g. "--kc-accent:#00E3CD;--kc-glow:...")
 * into a React CSSProperties object.
 */
function parseCssVars(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  css.split(';').forEach((pair) => {
    const [key, val] = pair.split(':').map((s) => s.trim());
    if (key && val) {
      style[key] = val;
    }
  });
  return style as React.CSSProperties;
}
