// Violation stream: every contract change the detector raised, with
// status and severity filters plus a search box. Filters are a plain GET
// form (no JS), so they survive a reload and stay linkable.
import { dbFromEnv } from '../../lib/db.js';
import { EmptyState, RelativeTime } from '../../components/ui.js';

export const dynamic = 'force-dynamic';

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

  return (
    <>
      <h1 className="page-title">Violations</h1>
      <p className="page-sub">
        Contract changes the detector raised. Approving one makes the new shape the contract.
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

      {violations.length === 0 ? (
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
