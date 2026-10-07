// Services overview (home page): one endpoints table per service with
// gate status pills, plus service registration.
import { dbFromEnv } from '../lib/db.js';
import { endpointRows } from '../lib/overview.js';
import { EmptyState, GatePill } from '../components/ui.js';
import EndpointsTable from '../components/EndpointsTable.js';
import NewServiceForm from '../components/NewServiceForm.js';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const db = dbFromEnv();
  if (!db) {
    return (
      <EmptyState
        title="Database not configured"
        body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY on the dashboard deployment, then reload."
      />
    );
  }

  const services = await db.listServices().catch(() => null);
  if (!services) {
    return (
      <EmptyState
        title="Could not reach the database"
        body="The dashboard is up but Supabase did not answer. Check the env vars and try again."
      />
    );
  }

  return (
    <>
      <h1 className="page-title">Services</h1>
      <p className="page-sub">
        Contract health per API. Steady state lives here; violations get their own stream.
      </p>

      {services.length === 0 && (
        <EmptyState
          title="No services yet"
          body="Point the proxy at your first API and it starts learning the contract."
          action={<NewServiceForm />}
        />
      )}

      {services.map(async (s) => {
        const rows = await endpointRows(db, s.id);
        const openBreaking = rows.reduce((n, r) => n + r.breaking, 0);
        const enforcing = rows.filter((r) => r.state === 'ENFORCING').length;
        return (
          <section key={s.id}>
            <div className="service-head">
              <h2>
                <a href={`/s/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {s.name}
                </a>
              </h2>
              <span className="origin">{s.origin}</span>
              <GatePill openBreaking={openBreaking} />
              <span className="muted" style={{ fontSize: 12 }}>
                {enforcing}/{rows.length} enforcing
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No traffic seen yet. Finish the <a href={`/s/${s.id}/setup`}>setup</a> and send
                requests through the proxy.
              </p>
            ) : (
              <EndpointsTable rows={rows} />
            )}
          </section>
        );
      })}

      {services.length > 0 && (
        <>
          <h3 className="section-title">Add a service</h3>
          <NewServiceForm />
        </>
      )}
    </>
  );
}
