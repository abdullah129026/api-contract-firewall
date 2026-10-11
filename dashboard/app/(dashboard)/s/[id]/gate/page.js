// Gate screen: the current verdict, the GitHub Actions snippet that calls
// the gate, and the evaluation history. The gate passes unless the service
// has open breaking violations; approving or dismissing them passes it again.
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { dbFromEnv } from '../../../../../lib/db.js';
import { endpointRows } from '../../../../../lib/overview.js';
import { CodeBlock, EmptyState, RelativeTime } from '../../../../../components/ui.js';

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
      <p className="crumbs">
        <a href={`/s/${id}`}>{service.name}</a>
        <span className="sep" aria-hidden="true">/</span>
        <span>gate</span>
      </p>
      <h1 className="page-title">CI gate</h1>
      <p className="page-sub">
        One question: is this service safe to deploy? The gate answers it.
        Wire the step below into your pipeline.
      </p>

      <div className={`status-banner${openBreaking > 0 ? ' alert' : ''}`} role={openBreaking > 0 ? 'alert' : undefined}>
        <div>
          <p className="verdict">{openBreaking > 0 ? 'Blocked' : 'Passing'}</p>
          <p className="detail">
            {openBreaking > 0
              ? `${openBreaking} open breaking violation${openBreaking === 1 ? '' : 's'}. Deploys calling /api/gate are blocked until each one is approved or dismissed.`
              : 'No open breaking violations. Deploys calling /api/gate pass.'}
          </p>
        </div>
        {openBreaking > 0 && (
          <div className="action">
            <a className="btn btn-primary" href="/violations?status=open">
              Review now
            </a>
          </div>
        )}
      </div>

      <h3 className="section-title">Add it to your pipeline</h3>
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
              <th className="num">Open breaking</th>
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
                <td className="mono num">{h.open_breaking}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
