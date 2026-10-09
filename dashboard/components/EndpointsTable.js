// Endpoints table, shared by the overview and service detail pages.
// Columns: endpoint, status, last change, p95 + sparkline, samples,
// open breaking count.
import { RelativeTime, Sparkline, StatusDot } from './ui.js';

export default function EndpointsTable({ rows, serviceId }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Status</th>
          <th>Last change</th>
          <th>p95</th>
          <th></th>
          <th>Samples</th>
          <th>Breaking</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="mono">
              <a
                href={`/s/${serviceId}/e/${r.id}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <span className="method">{r.method}</span>
                {r.path}
              </a>
            </td>
            <td>
              <StatusDot state={r.state} />
              {r.state === 'ENFORCING' ? 'Enforcing' : 'Learning'}
            </td>
            <td>
              <RelativeTime at={r.lastChangeAt} />
            </td>
            <td className="mono">
              {r.p95 === null ? '--' : `${r.p95}ms`}
              {r.regression && r.regression.regressed && (
                <div style={{ marginTop: 2 }}>
                  <span className="pill pill-warn" title="Recent p50 is over 2x the baseline window">
                    slow x{r.regression.ratio.toFixed(1)}
                  </span>
                </div>
              )}
            </td>
            <td>
              <Sparkline values={r.latencies} />
            </td>
            <td className="mono">{r.sampleCount}</td>
            <td>
              {r.breaking > 0 ? (
                <a href={`/violations?status=open&endpoint=${r.id}`} className="pill pill-block">
                  <span className="dot" style={{ background: 'var(--red)' }} />
                  {r.breaking}
                </a>
              ) : (
                <span className="muted">--</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
