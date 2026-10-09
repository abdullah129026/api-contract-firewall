// Gate screen: the current verdict, the GitHub Actions snippet that calls
// the gate, and the evaluation history. The gate passes unless the service
// has open breaking violations; approving or dismissing them passes it again.
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { dbFromEnv } from '../../../../lib/db.js';
import { endpointRows } from '../../../../lib/overview.js';
import { CodeBlock, EmptyState, GatePill, RelativeTime } from '../../../../components/ui.js';

export const dynamic = 'force-dynamic';

const SNIPPET = (host) => `name: contract gate
on: [push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - name: Check the API contract gate
        env:
          ACF_API_KEY: \${{ secrets.ACF_API_KEY }} # a key from this service's Setup page
        run: |
          resp=$(curl -sf -H "x-api-key: $ACF_API_KEY" "https://${host}/api/gate")
          echo "$resp" | jq .
          [ "$(echo "$resp" | jq -r .decision)" = "pass" ]`;

export default async function Gate({ params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const service = await db.getService(id).catch(() => null);
  if (!service) notFound();

  const [rows, history] = await Promise.all([
    endpointRows(db, id).catch(() => null),
    db.listGateEvaluations(id).catch(() => null),
  ]);
  if (!rows || !history) {
    return <EmptyState title="Could not reach the database" body="Supabase did not answer. Check the env vars and try again." />;
  }
  const openBreaking = rows.reduce((n, r) => n + r.breaking, 0);

  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'your-dashboard.vercel.app';

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 8 }}>
        <a href={`/s/${id}`} style={{ color: 'inherit' }}>
          {service.name}
        </a>
        {' / '}
        <span className="muted">gate</span>
      </p>
      <h1 className="page-title">CI gate</h1>
      <p className="page-sub">
        The gate passes unless this service has open breaking violations. Approving or dismissing
        them passes it again. Add the step below to your pipeline to block deploys on a broken
        contract.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <GatePill openBreaking={openBreaking} />
      </div>

      <h3 className="section-title">GitHub Actions step</h3>
      <CodeBlock code={SNIPPET(host)} />
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Store a key from the <a href={`/s/${id}/setup`}>setup page</a> as the ACF_API_KEY repository
        secret. The step fails when the gate is blocked (or unreachable).
      </p>

      <h3 className="section-title">Evaluation history</h3>
      {history.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No evaluations yet. The first CI run calling /api/gate will appear here.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Time</th>
              <th>Decision</th>
              <th>Open breaking</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={`${h.evaluated_at}-${i}`}>
                <td>
                  <RelativeTime at={h.evaluated_at} />
                </td>
                <td>
                  {h.decision === 'blocked' ? (
                    <span className="pill pill-block">
                      <span className="dot" style={{ background: 'var(--red)' }} />
                      blocked
                    </span>
                  ) : (
                    <span className="pill pill-pass">
                      <span className="dot" style={{ background: 'var(--accent)' }} />
                      pass
                    </span>
                  )}
                </td>
                <td className="mono">{h.open_breaking}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
