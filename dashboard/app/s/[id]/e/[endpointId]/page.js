// Endpoint detail: state, latency, the schema timeline with the
// baseline marked, and the violations raised against this endpoint.
import { notFound } from 'next/navigation';
import { dbFromEnv } from '../../../../../lib/db.js';
import { p50, p95 } from '../../../../../lib/stats.js';
import { regressionCheck } from '../../../../../lib/latency.js';
import { CodeBlock, EmptyState, RelativeTime, Sparkline, StatusDot } from '../../../../../components/ui.js';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL = { learning: 'learned', detected: 'drift detected', human: 'human-approved' };

function Timeline({ versions }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Version</th>
          <th>Recorded</th>
          <th>Source</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.version}>
            <td className="mono">v{v.version}</td>
            <td>
              <RelativeTime at={v.created_at} />
            </td>
            <td>
              <span className="muted" style={{ fontSize: 12 }}>
                {SOURCE_LABEL[v.source] || v.source}
              </span>
            </td>
            <td>
              {v.is_baseline ? (
                <span className="pill pill-pass">
                  <span className="dot" style={{ background: 'var(--accent)' }} />
                  baseline
                </span>
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

export default async function EndpointDetail({ params }) {
  const { id, endpointId } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const endpoint = await db.getEndpointById(endpointId).catch(() => null);
  if (!endpoint || endpoint.service_id !== id) notFound();

  const [versions, violations, latencies] = await Promise.all([
    db.listSchemaVersions(endpointId).catch(() => null),
    db.listViolations({ endpointId }).catch(() => null),
    db.getLatencySeries(endpointId).catch(() => null),
  ]);
  if (!versions || !violations || !latencies) {
    return <EmptyState title="Could not reach the database" body="Supabase did not answer. Check the env vars and try again." />;
  }
  const baseline = versions.find((v) => v.is_baseline);
  const regression = regressionCheck(latencies);

  return (
    <>
      <p className="crumbs">
        <a href={`/s/${id}`}>{endpoint.service.name}</a>
        <span className="sep" aria-hidden="true">/</span>
        <span>endpoint</span>
      </p>
      <h1 className="page-title mono">
        <span className="method">{endpoint.method}</span>
        {endpoint.path_template}
      </h1>
      <p className="page-sub">
        <StatusDot state={endpoint.state} />
        {endpoint.state === 'ENFORCING' ? 'Enforcing' : 'Learning'} · {endpoint.sample_count}{' '}
        samples · last seen <RelativeTime at={endpoint.last_seen_at} />
      </p>

      <h3 className="section-title">Latency</h3>
      <div className="panel">
        <div className="stats">
          <div>
            <div className="stat-label">p50</div>
            <div className="stat-value">{p50(latencies) === null ? '--' : `${p50(latencies)}ms`}</div>
          </div>
          <div>
            <div className="stat-label">p95</div>
            <div className="stat-value">{p95(latencies) === null ? '--' : `${p95(latencies)}ms`}</div>
          </div>
          <div>
            <div className="stat-label">Trend</div>
            <Sparkline values={latencies} width={180} height={40} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '14px 0 0' }}>
          Per-request durations, sampled 1-in-10. Approximate.
        </p>
        {regression && regression.regressed && (
          <p style={{ margin: '10px 0 0' }}>
            <span className="pill pill-warn">regression</span>{' '}
            <span className="mono" style={{ fontSize: 13 }}>
              p50 {regression.recentP50}ms vs baseline {regression.baselineP50}ms (x
              {regression.ratio.toFixed(1)})
            </span>
          </p>
        )}
      </div>

      <h3 className="section-title">Violations ({violations.length})</h3>
      {violations.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No violations raised for this endpoint.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Change</th>
              <th>Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className={`pill ${v.severity === 'breaking' ? 'pill-block' : 'pill-warn'}`}>
                    {v.severity}
                  </span>
                </td>
                <td>
                  <a href={`/violations/${v.id}`} className="mono" style={{ color: 'inherit' }}>
                    {v.summary}
                  </a>
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

      <h3 className="section-title">Schema timeline</h3>
      {versions.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No schema recorded yet. The baseline is learned after 100 samples.
        </p>
      ) : (
        <Timeline versions={versions} />
      )}

      {baseline && (
        <>
          <h3 className="section-title">Enforced baseline (v{baseline.version})</h3>
          <CodeBlock code={JSON.stringify(baseline.schema, null, 2)} />
        </>
      )}
    </>
  );
}
