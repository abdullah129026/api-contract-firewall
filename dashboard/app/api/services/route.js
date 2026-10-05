// POST /api/services — register a new service, issue its API key.
//
// Body: { name, origin }. Returns the service row and the plaintext key
// (shown once; only the sha256 hash is stored). The key goes in the
// x-api-key header of requests sent through the proxy.

import { createDb } from '../../../lib/db.js';
import { generateApiKey, hashApiKey } from '../../../lib/keys.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const origin = typeof body.origin === 'string' ? body.origin.trim() : '';
  if (!name) return Response.json({ error: 'name_required' }, { status: 400 });

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return Response.json({ error: 'origin_must_be_url' }, { status: 400 });
  }
  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
    return Response.json({ error: 'origin_must_be_http' }, { status: 400 });
  }

  const db = createDb({
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  });

  const existing = await db.getServiceByName(name);
  if (existing) return Response.json({ error: 'name_taken' }, { status: 409 });

  const service = await db.createService({ name, origin: originUrl.toString().replace(/\/$/, '') });
  const apiKey = generateApiKey();
  await db.createApiKey({ keyHash: hashApiKey(apiKey), serviceId: service.id, label: 'default' });

  return Response.json({ service, apiKey }, { status: 201 });
}
