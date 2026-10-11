// GET /api/services/[id] — service row plus its endpoints with learning
// state and sample counts. The dashboard pages read these server-side;
// this route exists for the scripted deploy-day demo (scripts/e2e-demo.mjs)
// and for ops checks that want the state as JSON.
import { dbFromEnv } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  let service;
  try {
    service = await db.getServiceById(id);
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
  if (!service) return Response.json({ error: 'not_found' }, { status: 404 });

  let endpoints;
  try {
    endpoints = await db.listEndpointsByService(id);
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
  return Response.json({
    service,
    endpoints: (endpoints || []).map((e) => ({
      id: e.id,
      method: e.method,
      path_template: e.path_template,
      state: e.state,
      sample_count: e.sample_count,
      last_seen_at: e.last_seen_at,
    })),
  });
}
