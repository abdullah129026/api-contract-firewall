// POST /api/ingest — receives masked samples shipped by the proxy.
//
// Auth: bearer INGEST_SECRET (shared secret, set on the Worker and here).
// The proxy already masks PII before shipping; this route validates the
// payload shape and stores it. Failures here never reach the proxied user.

import { createDb } from '../../../lib/db.js';
import { ingestSample, ValidationError } from '../../../lib/ingest.js';

function db() {
  return createDb({
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  });
}

export async function POST(request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return Response.json({ error: 'ingest_not_configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    const endpoint = await ingestSample(db(), payload);
    return Response.json({ ok: true, state: endpoint.state, sampleCount: endpoint.sample_count });
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: 'invalid_sample', detail: err.message }, { status: 400 });
    }
    console.error('ingest failed:', err.message);
    return Response.json({ error: 'ingest_failed' }, { status: 500 });
  }
}
