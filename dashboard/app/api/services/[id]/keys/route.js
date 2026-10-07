// GET /api/services/[id]/keys — list a service's keys (hash fingerprints
// only; plaintext is never stored). POST — issue a new key, returned once.
import { dbFromEnv } from '../../../../../lib/db.js';
import { generateApiKey, hashApiKey } from '../../../../../lib/keys.js';

export const dynamic = 'force-dynamic';

async function serviceOrError(id) {
  const db = dbFromEnv();
  if (!db) return { error: Response.json({ error: 'database_not_configured' }, { status: 503 }) };
  const service = await db.getService(id).catch(() => null);
  if (!service) return { error: Response.json({ error: 'not_found' }, { status: 404 }) };
  return { db };
}

export async function GET(_request, { params }) {
  const { id } = await params;
  const { db, error } = await serviceOrError(id);
  if (error) return error;
  const keys = await db.listApiKeys(id).catch(() => null);
  if (!keys) return Response.json({ error: 'database_unreachable' }, { status: 502 });
  return Response.json({
    keys: keys.map((k) => ({
      label: k.label,
      fingerprint: k.key_hash.slice(0, 12),
      createdAt: k.created_at,
    })),
  });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const { db, error } = await serviceOrError(id);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const label =
    typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 64) : 'default';

  const key = generateApiKey();
  const created = await db
    .createApiKey({ keyHash: hashApiKey(key), serviceId: id, label })
    .catch(() => null);
  if (!created) return Response.json({ error: 'database_unreachable' }, { status: 502 });

  // The plaintext key is returned once. Only its hash is stored.
  return Response.json({ key, label: created.label }, { status: 201 });
}
