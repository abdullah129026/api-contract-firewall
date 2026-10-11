// Service setup: get a key, point traffic at the proxy, watch it learn.
// Three steps, each showing its own state: done steps get the accent,
// the current step holds the action, upcoming steps wait their turn.
// The plaintext key is shown once at issuance and never stored; the key
// table lists labels and hash fingerprints only.
import { notFound } from 'next/navigation';
import { dbFromEnv } from '../../../../lib/db.js';
import { CodeBlock, EmptyState, RelativeTime } from '../../../../components/ui.js';
import NewKeyButton from '../../../../components/NewKeyButton.js';
import TestRequestButton from '../../../../components/TestRequestButton.js';
import LiveTraffic from '../../../../components/LiveTraffic.js';

export const dynamic = 'force-dynamic';

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || 'https://<your-worker>.workers.dev';

function GuideStep({ n, state, title, children }) {
  return (
    <div className={`guide-step ${state}`}>
      <div className="guide-num">{n}</div>
      <div className="guide-body">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default async function Setup({ params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const service = await db.getService(id).catch(() => null);
  if (!service) notFound();
  const [keys, endpoints] = await Promise.all([
    db.listApiKeys(id).catch(() => []),
    db.listEndpointsByService(id).catch(() => []),
  ]);

  const hasKey = keys.length > 0;
  const trafficSeen = endpoints.some((e) => e.last_seen_at);
  const curl = `curl -H "x-api-key: <API_KEY>" ${PROXY_URL}/health`;

  return (
    <>
      <p className="crumbs">
        <a href={`/s/${id}`}>{service.name}</a>
        <span className="sep" aria-hidden="true">/</span>
        <span>setup</span>
      </p>
      <h1 className="page-title">Connect {service.name}</h1>
      <p className="page-sub">
        Three steps. The contract starts learning on the first request that
        passes through the proxy.
      </p>

      <div className="guide">
        <GuideStep n={1} state={hasKey ? 'done' : 'current'} title="Get an API key">
          <p>
            One key per client. It is shown once, right after creation; the
            dashboard stores only its hash.
          </p>
          {keys.length > 0 && (
            <table className="data" style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Fingerprint</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.key_hash}>
                    <td>{k.label}</td>
                    <td className="mono muted">{k.key_hash.slice(0, 12)}...</td>
                    <td>
                      <RelativeTime at={k.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <NewKeyButton serviceId={id} />
        </GuideStep>

        <GuideStep
          n={2}
          state={!hasKey ? 'todo' : trafficSeen ? 'done' : 'current'}
          title="Point traffic at the proxy"
        >
          <p>
            Use this host instead of your origin. Same paths, same responses,
            with your key as a header.
          </p>
          <CodeBlock code={PROXY_URL} />
          <div style={{ marginTop: 16 }}>
            <TestRequestButton serviceId={id} proxyUrl={PROXY_URL} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Or from your own client:
          </p>
          <CodeBlock code={curl} />
        </GuideStep>

        <GuideStep
          n={3}
          state={!hasKey ? 'todo' : trafficSeen ? 'done' : 'current'}
          title="Watch it learn"
        >
          <p>
            <LiveTraffic serviceId={id} />
          </p>
          <p>
            The first requests teach the contract. After 100 samples, or when
            you confirm it, the firewall starts enforcing: every new response
            gets compared against what was learned.
          </p>
        </GuideStep>
      </div>
    </>
  );
}
