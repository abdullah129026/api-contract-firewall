// Ingest orchestration: validate a shipped sample at the trust boundary,
// store it, and advance the endpoint's learning state.
//
// The proxy is an internal caller authenticated by INGEST_SECRET, but the
// payload is still validated: a misbehaving or outdated proxy must not
// corrupt learning data. Validation failures throw ValidationError (the
// route turns them into 400s); storage failures throw and become 500s.

'use strict';

import { inferSchema } from './schema.js';
import { nextState, justBecameEnforcing, LEARNING_SAMPLE_TARGET } from './learning.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

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
  if (payload.body !== undefined && typeof payload.body !== 'object') {
    throw new ValidationError('body must be JSON or omitted');
  }
  return payload;
}

// Full ingest: validate -> resolve service -> upsert endpoint -> store
// sample -> advance learning. Returns the endpoint row.
export async function ingestSample(db, rawPayload) {
  const sample = validateSample(rawPayload);

  const service = await db.getServiceByName(sample.service);
  if (!service) throw new ValidationError(`unknown service: ${sample.service}`);

  let endpoint = await db.getEndpoint(service.id, sample.method, sample.path);
  if (!endpoint) {
    endpoint = await db.createEndpoint({
      serviceId: service.id,
      method: sample.method,
      pathTemplate: sample.path,
    });
  }

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
    // inline instead of waiting for the analyzer tick.
    const bodies = await db.getSampleBodies(endpoint.id, LEARNING_SAMPLE_TARGET);
    await db.insertSchemaVersion({
      endpointId: endpoint.id,
      version: 1,
      schema: inferSchema(bodies),
      isBaseline: true,
      source: 'learning',
    });
    endpoint = await db.setEndpointEnforcing(endpoint.id);
  }

  return endpoint;
}
