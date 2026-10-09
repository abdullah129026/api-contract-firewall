// GET /api/gate — the CI gate. A deployment pipeline calls this before
// shipping; the gate passes unless the service has open breaking violations.
//
// Auth: x-api-key <service api key> (the same keys the proxy takes; issue
// one on the Setup page). The key identifies the service, so no service
// parameter is needed.
//
// Response: { decision: "pass" | "blocked", service, open_breaking: [...] }.
// Always 200 for a valid key; the pipeline fails the step when decision is
// not "pass" (see the snippet on the gate screen). Each call is recorded in
// gate_evaluations, best-effort, so the gate screen can show the history.
import { dbFromEnv } from '../../../lib/db.js';
import { hashApiKey } from '../../../lib/keys.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  const apiKey = (request.headers.get('x-api-key') || '').trim();
  if (!apiKey || apiKey.length > 200) {
    return Response.json({ error: 'api_key_required' }, { status: 401 });
  }

  let keyRow;
  try {
    keyRow = await db.getKeyWithService(hashApiKey(apiKey));
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
  if (!keyRow || !keyRow.service) {
    return Response.json({ error: 'invalid_api_key' }, { status: 401 });
  }

  const serviceId = keyRow.service.id;
  let breaking;
  try {
    breaking = await db.listOpenBreakingViolations(serviceId);
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
  const decision = breaking.length > 0 ? 'blocked' : 'pass';

  // History is a side effect: a failed write must not fail the gate itself.
  db.insertGateEvaluation({
    serviceId,
    decision,
    openBreaking: breaking.length,
  }).catch((err) => console.error('gate evaluation write failed:', err.message));

  return Response.json({
    decision,
    service: keyRow.service.name,
    open_breaking: breaking.map((v) => ({
      id: v.id,
      field_path: v.field_path,
      summary: v.summary,
    })),
  });
}
