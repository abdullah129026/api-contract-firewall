// POST /api/waitlist — join the waitlist.
//
// Body: { email }. Validates and lowercases the address, inserts one row.
// A duplicate address is not an error: { status: 'already' } with 200.
// New signup: { status: 'joined' } with 201.
import { dbFromEnv } from '../../../lib/db.js';
import { normalizeEmail, isValidEmail } from '../../../lib/waitlist.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  let result;
  try {
    result = await db.addToWaitlist(email);
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }

  return Response.json(
    { status: result.status },
    { status: result.status === 'joined' ? 201 : 200 }
  );
}
