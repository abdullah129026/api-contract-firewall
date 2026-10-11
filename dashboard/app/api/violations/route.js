// GET /api/violations?service=<service_id>&status=open&severity=breaking —
// JSON read of the violation stream. Params are optional; each filters.
// Used by the scripted deploy-day demo (scripts/e2e-demo.mjs), which polls
// for the open breaking violation the scripted break produces.
import { dbFromEnv } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get('service') || '';
  const status = searchParams.get('status') || undefined;
  const severity = searchParams.get('severity') || undefined;

  try {
    let rows;
    if (!serviceId) {
      rows = await db.listViolations({ status, severity });
    } else {
      // listViolations filters per endpoint, so expand the service's
      // endpoints and merge the per-endpoint results.
      const endpoints = await db.listEndpointsByService(serviceId);
      rows = [];
      for (const e of endpoints) {
        rows.push(...(await db.listViolations({ status, severity, endpointId: e.id })));
      }
      rows.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
    }
    return Response.json({ violations: rows });
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
}
