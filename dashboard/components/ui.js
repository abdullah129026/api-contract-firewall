// Shared presentational components. Server components unless noted.

import CopyButton from './CopyButton.js';

// Status dot: emerald = ENFORCING, amber = LEARNING, gray = unknown.
export function StatusDot({ state }) {
  const cls =
    state === 'ENFORCING' ? 'dot-enforcing' : state === 'LEARNING' ? 'dot-learning' : 'dot-idle';
  return <span className={`dot ${cls}`} title={state || 'unknown'} />;
}

// Gate pill for a service: blocked (red) when any open breaking violation
// exists, passing (emerald) otherwise. Color on the badge, not the text.
export function GatePill({ openBreaking }) {
  if (openBreaking > 0) {
    return (
      <span className="pill pill-block">
        <span className="dot" style={{ background: 'var(--red)' }} />
        gate: blocked ({openBreaking})
      </span>
    );
  }
  return (
    <span className="pill pill-pass">
      <span className="dot" style={{ background: 'var(--accent)' }} />
      gate: passing
    </span>
  );
}

// "Last seen" as the primary temporal signal: 3m ago, 2h ago, 5d ago.
export function RelativeTime({ at }) {
  if (!at) return <span className="muted">never</span>;
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  const label =
    s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return <span title={new Date(at).toLocaleString()}>{label}</span>;
}

// Inline SVG sparkline of recent per-request durations (ms).
export function Sparkline({ values, width = 96, height = 28 }) {
  if (!values || values.length < 2) return <span className="muted">--</span>;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export function CodeBlock({ code }) {
  return (
    <div className="codeblock">
      <CopyButton text={code} />
      {code}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
