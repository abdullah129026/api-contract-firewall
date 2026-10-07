// GET /api/services/[id]/status — last request seen across the service's
// endpoints. Polled by the setup screen's live traffic indicator.
import { dbFromEnv } from '../../../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  const endpoints = await db.listEndpointsByService(id).catch(() => null);
  if (!endpoints) return Response.json({ error: 'database_unreachable' }, { status: 502 });

  const lastSeenAt = endpoints.reduce(
    (max, e) => (!max || e.last_seen_at > max ? e.last_seen_at : max),
    null
  );
  return Response.json({ lastSeenAt });
}
