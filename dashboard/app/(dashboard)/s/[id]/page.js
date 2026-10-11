// Service detail: endpoints table plus gate status.
import { notFound } from 'next/navigation';
import { dbFromEnv } from '../../../../lib/db.js';
import { endpointRows } from '../../../../lib/overview.js';
import { EmptyState, GatePill } from '../../../../components/ui.js';
import EndpointsTable from '../../../../components/EndpointsTable.js';

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
      <p className="crumbs">
        <a href="/">Services</a>
        <span className="sep" aria-hidden="true">/</span>
        <span>{service.name}</span>
      </p>
      <h1 className="page-title">{service.name}</h1>
      <p className="page-sub mono">{service.origin}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <GatePill openBreaking={openBreaking} />
        <a className="btn btn-primary" href={`/s/${id}/setup`}>
          Setup
        </a>
        <a className="btn" href={`/s/${id}/gate`}>
          CI gate
        </a>
      </div>

      <h3 className="section-title">Endpoints</h3>
      {rows.length === 0 ? (
        <div className="panel">
          <h3>No traffic yet</h3>
          <p>
            The proxy has not reported any requests for this service. Finish
            setup and send traffic to start learning the contract.
          </p>
          <a className="btn btn-primary" href={`/s/${id}/setup`}>
            Finish setup
          </a>
        </div>
      ) : (
        <>
          <EndpointsTable rows={rows} serviceId={id} />
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Samples are 1-in-10 per endpoint, so volume and p95 are approximate.
          </p>
        </>
      )}
    </>
  );
}
