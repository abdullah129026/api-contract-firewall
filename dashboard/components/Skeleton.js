// Loading skeletons. Static blocks only: shimmer needs a gradient,
// which the theme bans. Shapes mirror the page they stand in for.
export function PageSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 30, width: 220, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 240 }} />
    </>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="skeleton" style={{ padding: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 14,
            marginBottom: i === rows - 1 ? 0 : 14,
            width: `${92 - (i % 3) * 12}%`,
            border: 'none',
            background: 'var(--bg-2)',
          }}
        />
      ))}
    </div>
  );
}
