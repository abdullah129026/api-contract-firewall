// Service setup: proxy URL, API keys, curl, test request, live traffic.
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

export default async function Setup({ params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const service = await db.getService(id).catch(() => null);
  if (!service) notFound();
  const keys = await db.listApiKeys(id).catch(() => []);

  const curl = `curl -H "x-api-key: <API_KEY>" ${PROXY_URL}/health`;

  return (
    <>
      <h1 className="page-title">{service.name}: setup</h1>
      <p className="page-sub">
        Route traffic through the proxy. The contract starts learning on the first request.
      </p>

      <div className="step">
        <div className="step-num">1</div>
        <div className="step-body">
          <div className="panel">
            <h3>Proxy URL</h3>
            <p>Point your client at this host instead of your origin. Same paths, same responses.</p>
            <CodeBlock code={PROXY_URL} />
          </div>
        </div>
      </div>

      <div className="step">
        <div className="step-num">2</div>
        <div className="step-body">
          <div className="panel">
            <h3>API keys</h3>
            <p>One key per client. Keys are shown once at creation; only the hash is stored.</p>
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
          </div>
        </div>
      </div>

      <div className="step">
        <div className="step-num">3</div>
        <div className="step-body">
          <div className="panel">
            <h3>Send traffic</h3>
            <p>Replace the origin host with the proxy URL and add your key as a header.</p>
            <CodeBlock code={curl} />
            <div style={{ marginTop: 16 }}>
              <TestRequestButton serviceId={id} proxyUrl={PROXY_URL} />
            </div>
          </div>
        </div>
      </div>

      <div className="step">
        <div className="step-num">4</div>
        <div className="step-body">
          <div className="panel">
            <h3>Watch it arrive</h3>
            <p>The indicator turns live when the proxy reports traffic for this service.</p>
            <LiveTraffic serviceId={id} />
          </div>
        </div>
      </div>
    </>
  );
}
