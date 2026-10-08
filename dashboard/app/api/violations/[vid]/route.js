// POST /api/violations/[vid] — triage action: approve, false_positive, reopen.
//
// Approving accepts the change: the latest observed schema becomes the
// enforced baseline, and the previous baseline id is saved in the
// violation's detail so reopening (undo) can restore it. Dismissing a
// false positive touches nothing. The transition rules live in
// lib/triage.js; this route just applies them.
import { dbFromEnv } from '../../../../lib/db.js';
import { actionTarget, transitionAllowed, baselineEffect } from '../../../../lib/triage.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { vid } = await params;
  const db = dbFromEnv();
  if (!db) return Response.json({ error: 'database_not_configured' }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const target = actionTarget(typeof body.action === 'string' ? body.action : '');
  if (!target) return Response.json({ error: 'invalid_action' }, { status: 400 });

  const violation = await db.getViolation(vid).catch(() => null);
  if (!violation) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!transitionAllowed(violation.status, target)) {
    return Response.json({ error: 'invalid_transition' }, { status: 409 });
  }

  try {
    const effect = baselineEffect(violation.status, target);
    if (effect === 'promote_latest') {
      // The detector snapshots one schema version per confirmed diff,
      // newest first, so versions[0] is the shape that raised this change.
      const versions = await db.listSchemaVersions(violation.endpoint_id);
      if (versions[0]) {
        const { previousBaseline } = await db.rebaseline(
          violation.endpoint_id,
          versions[0].version
        );
        await db.mergeViolationDetail(violation.id, { previous_baseline: previousBaseline });
      }
    } else if (effect === 'restore') {
      const prev = violation.detail && violation.detail.previous_baseline;
      if (prev) await db.rebaseline(violation.endpoint_id, prev);
    }
    const updated = await db.setViolationStatus(violation.id, target);
    return Response.json({ status: updated ? updated.status : target });
  } catch {
    return Response.json({ error: 'database_unreachable' }, { status: 502 });
  }
}
