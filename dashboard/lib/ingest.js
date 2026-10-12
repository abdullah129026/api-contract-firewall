// Ingest orchestration: validate a shipped sample at the trust boundary,
// store it, and advance the endpoint's learning state.
//
// The proxy is an internal caller authenticated by INGEST_SECRET, but the
// payload is still validated: a misbehaving or outdated proxy must not
// corrupt learning data. Validation failures throw ValidationError (the
// route turns them into 400s); storage failures throw and become 500s.

'use strict';

import { inferSchema } from './schema.js';
import { diffSchemas } from './detect.js';
import { nextState, justBecameEnforcing, LEARNING_SAMPLE_TARGET } from './learning.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

// 2x the proxy-side truncation cap (capture.js): the proxy truncates at
// 16KB, so anything bigger comes from a misbehaving caller and is rejected
// instead of stored.
const MAX_BODY_BYTES = 32 * 1024;

export class ValidationError extends Error {}

// The body the proxy ships (capture.js buildSample plus the service name).
export function validateSample(payload) {
  if (!payload || typeof payload !== 'object') throw new ValidationError('sample must be an object');
  if (typeof payload.service !== 'string' || !payload.service) throw new ValidationError('service is required');
  if (payload.v !== 1) throw new ValidationError('unsupported sample version');
  if (!METHODS.has(payload.method)) throw new ValidationError('invalid method');
  if (typeof payload.path !== 'string' || !payload.path.startsWith('/')) {
    throw new ValidationError('path must start with /');
  }
  if (!Number.isInteger(payload.status) || payload.status < 100 || payload.status > 599) {
    throw new ValidationError('invalid status');
  }
  for (const field of ['durationMs', 'proxyMs']) {
    if (typeof payload[field] !== 'number' || payload[field] < 0) {
      throw new ValidationError(`invalid ${field}`);
    }
  }
  if (payload.body !== undefined) {
    if (typeof payload.body !== 'object') {
      throw new ValidationError('body must be JSON or omitted');
    }
    if (JSON.stringify(payload.body).length > MAX_BODY_BYTES) {
      throw new ValidationError('body too large');
    }
  }
  return payload;
}

// Full ingest: validate -> resolve service -> upsert endpoint -> store
// sample -> advance learning. Returns the endpoint row.
export async function ingestSample(db, rawPayload) {
  const sample = validateSample(rawPayload);

  const service = await db.getServiceByName(sample.service);
  if (!service) throw new ValidationError(`unknown service: ${sample.service}`);

  // Atomic upsert: a select-then-insert loses the race when a burst of
  // samples hits a new endpoint, and every loser gets a 409 (dropping the
  // sample).
  let endpoint = await db.getOrCreateEndpoint({
    serviceId: service.id,
    method: sample.method,
    pathTemplate: sample.path,
  });

  await db.insertSample({
    endpointId: endpoint.id,
    status: sample.status,
    durationMs: sample.durationMs,
    proxyMs: sample.proxyMs,
    body: sample.body,
    bodyTruncated: sample.bodyTruncated,
    sampledAt: sample.sampledAt,
  });

  const before = endpoint.state;
  endpoint = await db.bumpEndpointSampleCount(endpoint.id);
  const after = nextState(endpoint);

  if (justBecameEnforcing({ state: before }, after)) {
    // Learning complete: infer the baseline from the collected samples.
    // Bounded at 100 rows (LEARNING_SAMPLE_TARGET); cheap enough to run
    // inline instead of waiting for the analyzer tick. The baseline check
    // plus the conflict-tolerant insert make promotion idempotent: under
    // burst traffic two samples can both observe the 100th sample, and
    // exactly one baseline row must land.
    const existing = await db.getBaselineSchemaVersion(endpoint.id);
    if (!existing) {
      const bodies = await db.getSampleBodies(endpoint.id, LEARNING_SAMPLE_TARGET);
      try {
        await db.insertSchemaVersion({
          endpointId: endpoint.id,
          version: 1,
          schema: inferSchema(bodies),
          isBaseline: true,
          source: 'learning',
        });
      } catch (err) {
        if (!/^supabase 409/.test(err.message)) throw err;
        // Lost the promotion race; the other sample's baseline stands.
      }
    }
    endpoint = await db.setEndpointEnforcing(endpoint.id);
  }

  if (after === 'ENFORCING') {
    await detectDrift(db, endpoint, sample);
  }

  return endpoint;
}

// Retries a db write once when a concurrent request won the same unique
// row first (PostgREST answers 409). The retry then sees the winner's row.
async function retryOnConflict(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!/^supabase 409/.test(err.message)) throw err;
    return fn();
  }
}

// Compare a new sample against the enforced baseline and record violations.
// Only 2xx responses with a complete JSON body are analyzed: error bodies
// and truncated samples would raise false "field removed" violations.
async function detectDrift(db, endpoint, sample) {
  if (sample.status < 200 || sample.status >= 300) return;
  if (sample.body === undefined || sample.body === null || sample.bodyTruncated) return;

  const baseline = await db.getBaselineSchemaVersion(endpoint.id);
  if (!baseline) return;

  const observed = inferSchema([sample.body]);
  const diffs = diffSchemas(baseline.schema, observed);
  if (diffs.length === 0) return;

  let isNew = false;
  for (const d of diffs) {
    // Two samples can sight the same new diff concurrently; the open-row
    // dedupe index 409s the loser, whose retry then bumps the winner's row.
    const res = await retryOnConflict(() =>
      db.upsertViolation({
        endpointId: endpoint.id,
        severity: d.severity,
        kind: d.kind,
        fieldPath: d.path,
        summary: d.summary,
        detail: d.detail,
      })
    );
    if (res.created) isNew = true;
  }

  if (isNew) {
    // First sighting of this diff: snapshot the drifted shape. One version
    // per confirmed diff, never per sample (plan section 2.4). Two samples
    // can compute the same next version concurrently; the loser recomputes
    // after the winner's row lands instead of dropping the sample.
    let version = (await db.getMaxSchemaVersion(endpoint.id)) + 1;
    try {
      await db.insertSchemaVersion({
        endpointId: endpoint.id,
        version,
        schema: observed,
        isBaseline: false,
        source: 'detected',
      });
    } catch (err) {
      if (!/^supabase 409/.test(err.message)) throw err;
      version = (await db.getMaxSchemaVersion(endpoint.id)) + 1;
      await db.insertSchemaVersion({
        endpointId: endpoint.id,
        version,
        schema: observed,
        isBaseline: false,
        source: 'detected',
      });
    }
  }
}
