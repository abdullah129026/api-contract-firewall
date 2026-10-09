// Violation stream: every contract change the detector raised, with
// status and severity filters plus a search box. Latency regressions show up
// as synthetic warning rows computed from each endpoint's latency series.
// Filters are a plain GET form (no JS), so they survive a reload and stay
// linkable.
import { dbFromEnv } from '../../lib/db.js';
import { regressionCheck } from '../../lib/latency.js';
import { EmptyState, RelativeTime } from '../../components/ui.js';

export const dynamic = 'force-dynamic';

// Synthetic warning rows for endpoints whose recent p50 latency is at
// least 2x their baseline window (see lib/latency.js). Computed lazily from
// the latency series, not stored, so there is nothing to triage: the row
// links to the endpoint detail page. Best-effort; a failure here never
// breaks the stream itself.
async function latencyWarnings(db, { status, severity, q, endpointId }) {
  if (status !== 'open' && status !== 'all') return [];
  if (severity && severity !== 'warning') return [];
  try {
    const services = await db.listServices();
    const warnings = [];
    for (const s of services) {
      const endpoints = await db.listEndpointsByService(s.id);
      // ponytail: one latency-series query per endpoint. Endpoints per
      // service are few in the MVP; batch this when it hurts.
      for (const e of endpoints) {
        if (endpointId && e.id !== endpointId) continue;
        const series = await db.getLatencySeries(e.id, 120).catch(() => null);
        const reg = series ? regressionCheck(series) : null;
        if (!reg || !reg.regressed) continue;
        const summary = `p50 latency x${reg.ratio.toFixed(1)} the baseline (${reg.recentP50}ms vs ${reg.baselineP50}ms)`;
        if (q) {
          const needle = q.toLowerCase();
          if (
            !summary.toLowerCase().includes(needle) &&
            !e.path_template.toLowerCase().includes(needle)
          )
            continue;
        }
        warnings.push({
          synthetic: true,
          severity: 'warning',
          kind: 'latency_regression',
          summary,
          endpoint: {
            id: e.id,
            method: e.method,
            path_template: e.path_template,
            service_id: e.service_id,
            service: { name: s.name },
          },
          last_seen_at: e.last_seen_at,
        });
      }
    }
    return warnings;
  } catch {
    return [];
  }
}

function SeverityPill({ severity }) {
  if (severity === 'breaking') {
    return (
      <span className="pill pill-block">
        <span className="dot" style={{ background: 'var(--red)' }} />
        breaking
      </span>
    );
  }
  return (
    <span className="pill pill-warn">
      <span className="dot" style={{ background: 'var(--amber)' }} />
      warning
    </span>
  );
}

export default async function Violations({ searchParams }) {
  const params = await searchParams;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const status = typeof params.status === 'string' && params.status ? params.status : 'open';
  const severity = params.severity === 'breaking' || params.severity === 'warning' ? params.severity : '';
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const endpointId =
    typeof params.endpoint === 'string' && params.endpoint ? params.endpoint : undefined;

  const violations = await db
    .listViolations({
      status: status === 'all' ? undefined : status,
      severity: severity || undefined,
      endpointId,
      q: q || undefined,
    })
    .catch(() => null);
  if (!violations) {
    return <EmptyState title="Could not reach the database" body="Supabase did not answer. Check the env vars and try again." />;
  }
  const warnings = await latencyWarnings(db, { status, severity, q, endpointId });

  return (
    <>
      <h1 className="page-title">Violations</h1>
      <p className="page-sub">
        Contract changes the detector raised, plus latency regressions. Approving a contract change
        makes the new shape the contract.
      </p>

      {endpointId && (
        <p className="muted" style={{ fontSize: 13 }}>
          Filtered to one endpoint.{' '}
          <a href="/violations" style={{ color: 'inherit' }}>
            Clear
          </a>
        </p>
      )}

      <form method="GET" action="/violations" className="filter-form">
        {endpointId && <input type="hidden" name="endpoint" value={endpointId} />}
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="open">Open</option>
            <option value="approved">Approved</option>
            <option value="false_positive">False positive</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity" defaultValue={severity}>
            <option value="">All</option>
            <option value="breaking">Breaking</option>
            <option value="warning">Warning</option>
          </select>
        </label>
        <label className="filter-q">
          Search
          <input type="text" name="q" placeholder="field path or summary" defaultValue={q} />
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>

      {violations.length === 0 && warnings.length === 0 ? (
        <EmptyState
          title={status === 'open' ? 'No open violations' : 'No violations match'}
          body={
            status === 'open'
              ? 'Every enforced endpoint still matches its baseline. Quiet is good.'
              : 'Try a different status, severity, or search term.'
          }
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Change</th>
              <th>Endpoint</th>
              <th>Seen</th>
              <th>Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {warnings.map((w) => (
              <tr key={`latency:${w.endpoint.id}`}>
                <td>
                  <SeverityPill severity="warning" />
                </td>
                <td>
                  <a
                    href={`/s/${w.endpoint.service_id}/e/${w.endpoint.id}`}
                    className="mono"
                    style={{ color: 'inherit' }}
                  >
                    {w.summary}
                  </a>
                  <div className="muted" style={{ fontSize: 11 }}>
                    latency_regression · not triageable
                  </div>
                </td>
                <td className="mono">
                  <span className="method">{w.endpoint.method}</span>
                  {w.endpoint.path_template}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {w.endpoint.service.name}
                  </div>
                </td>
                <td className="mono">
                  <span className="muted">--</span>
                </td>
                <td>
                  <RelativeTime at={w.last_seen_at} />
                </td>
                <td>
                  <span className="muted" style={{ fontSize: 12 }}>
                    open
                  </span>
                </td>
              </tr>
            ))}
            {violations.map((v) => (
              <tr key={v.id}>
                <td>
                  <SeverityPill severity={v.severity} />
                </td>
                <td>
                  <a href={`/violations/${v.id}`} className="mono" style={{ color: 'inherit' }}>
                    {v.summary}
                  </a>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {v.kind} · ×{v.occurrence_count}
                  </div>
                </td>
                <td className="mono">
                  <span className="method">{v.endpoint.method}</span>
                  {v.endpoint.path_template}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {v.endpoint.service.name}
                  </div>
                </td>
                <td className="mono">
                  <RelativeTime at={v.first_seen_at} />
                </td>
                <td>
                  <RelativeTime at={v.last_seen_at} />
                </td>
                <td>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {v.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
