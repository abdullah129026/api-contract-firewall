// Services overview (home page): answers job 1, "is anything broken?"
// The system banner states the verdict first; service rows follow.
// With no services yet, the page is a guided 3-step flow instead of a
// bare form.
import { dbFromEnv } from '../../lib/db.js';
import { endpointRows } from '../../lib/overview.js';
import { EmptyState, GatePill } from '../../components/ui.js';
import EndpointsTable from '../../components/EndpointsTable.js';
import NewServiceForm from '../../components/NewServiceForm.js';

export const dynamic = 'force-dynamic';

// The verdict for every service, computed once so the banner and the
// rows agree.
async function serviceSummaries(db, services) {
  return Promise.all(
    services.map(async (s) => {
      const rows = await endpointRows(db, s.id);
      return {
        service: s,
        rows,
        openBreaking: rows.reduce((n, r) => n + r.breaking, 0),
        enforcing: rows.filter((r) => r.state === 'ENFORCING').length,
      };
    })
  );
}

function SystemBanner({ summaries }) {
  const openBreaking = summaries.reduce((n, s) => n + s.openBreaking, 0);
  const enforcing = summaries.reduce((n, s) => n + s.enforcing, 0);
  if (openBreaking > 0) {
    return (
      <div className="status-banner alert" role="alert">
        <div>
          <p className="verdict">
            {openBreaking} contract change{openBreaking === 1 ? '' : 's'} need
            {openBreaking === 1 ? 's' : ''} a decision
          </p>
          <p className="detail">
            Deploys are blocked until each one is approved or dismissed.
          </p>
        </div>
        <div className="action">
          <a className="btn btn-primary" href="/violations?status=open">
            Review now
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="status-banner">
      <div>
        <p className="verdict">All contracts holding</p>
        <p className="detail">
          {summaries.length} service{summaries.length === 1 ? '' : 's'} ·{' '}
          {enforcing} endpoint{enforcing === 1 ? '' : 's'} enforcing
        </p>
      </div>
    </div>
  );
}

// First run: three steps, each showing its own state. Step 1 holds the
// form; steps 2 and 3 unlock once the service exists.
function FirstRun() {
  return (
    <>
      <h1 className="page-title">Connect your first API</h1>
      <p className="page-sub">
        Three steps. The proxy learns your API's contract from real traffic,
        then guards it.
      </p>
      <div className="guide">
        <div className="guide-step current">
          <div className="guide-num">1</div>
          <div className="guide-body">
            <h3>Name your API</h3>
            <p>Tell the dashboard what to watch. You get an API key for it.</p>
            <NewServiceForm />
          </div>
        </div>
        <div className="guide-step todo">
          <div className="guide-num">2</div>
          <div className="guide-body">
            <h3>Send traffic through the proxy</h3>
            <p>
              After creating the service, its setup page gives you the proxy
              URL, a key, and a test button.
            </p>
          </div>
        </div>
        <div className="guide-step todo">
          <div className="guide-num">3</div>
          <div className="guide-body">
            <h3>Watch it learn</h3>
            <p>
              The first requests teach the contract. After 100 samples (or
              your confirmation) the firewall starts enforcing it.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

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

  if (services.length === 0) return <FirstRun />;

  const summaries = await serviceSummaries(db, services);

  return (
    <>
      <h1 className="page-title">Services</h1>
      <p className="page-sub">
        Is anything broken? This page answers that first.
      </p>

      <SystemBanner summaries={summaries} />

      {summaries.map(({ service: s, rows, openBreaking, enforcing }) => (
        <section key={s.id}>
          <div className="service-head">
            <h2>
              <a href={`/s/${s.id}`}>{s.name}</a>
            </h2>
            <GatePill openBreaking={openBreaking} />
          </div>
          <p className="service-meta">
            <span className="origin">{s.origin}</span>
            <span aria-hidden="true">·</span>
            <span>
              {enforcing}/{rows.length} enforcing
            </span>
          </p>
          {rows.length === 0 ? (
            <div className="panel">
              <h3>No traffic yet</h3>
              <p>
                The proxy has not reported any requests for this service.
                Finish setup and send traffic to start learning the contract.
              </p>
              <a className="btn btn-primary" href={`/s/${s.id}/setup`}>
                Finish setup
              </a>
            </div>
          ) : (
            <EndpointsTable rows={rows} serviceId={s.id} />
          )}
        </section>
      ))}

      <h3 className="section-title">Add another service</h3>
      <NewServiceForm />
    </>
  );
}
