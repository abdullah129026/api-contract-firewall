// Service detail: endpoints table plus gate status.
import { notFound } from 'next/navigation';
import { dbFromEnv } from '../../../lib/db.js';
import { endpointRows } from '../../../lib/overview.js';
import { EmptyState, GatePill } from '../../../components/ui.js';
import EndpointsTable from '../../../components/EndpointsTable.js';

export const dynamic = 'force-dynamic';

export default async function ServiceDetail({ params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const service = await db.getService(id).catch(() => null);
  if (!service) notFound();

  const rows = await endpointRows(db, id).catch(() => null);
  if (!rows) {
    return <EmptyState title="Could not reach the database" body="Supabase did not answer. Check the env vars and try again." />;
  }
  const openBreaking = rows.reduce((n, r) => n + r.breaking, 0);

  return (
    <>
      <h1 className="page-title">{service.name}</h1>
      <p className="page-sub mono">{service.origin}</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <GatePill openBreaking={openBreaking} />
        <a className="btn" href={`/s/${id}/setup`}>
          Setup
        </a>
      </div>

      <h3 className="section-title">Endpoints</h3>
      {rows.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No traffic seen yet. Finish the <a href={`/s/${id}/setup`}>setup</a> and send requests
          through the proxy.
        </p>
      ) : (
        <>
          <EndpointsTable rows={rows} />
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Samples are 1-in-10 per endpoint, so volume and p95 are approximate.
          </p>
        </>
      )}
    </>
  );
}
