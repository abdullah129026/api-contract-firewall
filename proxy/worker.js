// API Contract Firewall — forward proxy (Cloudflare Workers, ES modules).
//
// Devs point their API base URL at this Worker with an `x-api-key` header.
// The Worker validates the key, forwards the request to the registered
// origin, and returns the origin's response untouched.
//
// Capture ships async in ctx.waitUntil() AFTER the response is returned:
// method + templated path + status + timings + masked JSON body shape go to
// INGEST_URL (a Next.js API route writing to Postgres). Capture never
// blocks and never fails the proxied request — failures are counted in
// the dropped-sample counter.
//
// Registry (milestone 1): `SERVICES_JSON` env var —
//   {"<api-key>": {"origin": "http://api.internal:3000", "name": "billing"}}
// Milestone 2 swaps this lookup for a cached Supabase REST query.

'use strict';

import { buildSample, createSampler, shouldSample, templatePath } from './capture.js';

const KEY_CACHE_TTL_MS = 60_000; // cache validated keys for 60s (per plan)
const keyCache = new Map(); // apiKey -> { origin, name, expiresAt }

export function parseRegistry(json) {
  try {
    const parsed = JSON.parse(json || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  return {};
}

function lookupService(apiKey, env) {
  const now = Date.now();
  const cached = keyCache.get(apiKey);
  if (cached && cached.expiresAt > now) return cached.service;

  const registry = parseRegistry(env.SERVICES_JSON);
  const service = registry[apiKey] || null;
  if (service && typeof service.origin === 'string') {
    keyCache.set(apiKey, { service, expiresAt: now + KEY_CACHE_TTL_MS });
    return service;
  }
  keyCache.delete(apiKey);
  return null;
}

export function buildTargetUrl(origin, url) {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return base + url.pathname + url.search;
}

function jsonError(status, error, hint) {
  return new Response(JSON.stringify({ error, hint }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleRequest(request, env) {
  const startedAt = Date.now();
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    return jsonError(401, 'missing_api_key', 'Set the x-api-key header to your service key.');
  }

  const service = lookupService(apiKey, env);
  if (!service) {
    return jsonError(401, 'invalid_api_key', 'No service is registered for this key.');
  }

  const url = new URL(request.url);
  const target = buildTargetUrl(service.origin, url);

  const headers = new Headers(request.headers);
  headers.delete('host'); // let fetch set Host for the origin

  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let originResponse;
  try {
    originResponse = await fetch(target, init);
  } catch (err) {
    return jsonError(502, 'origin_unreachable', `Could not reach origin ${service.origin}.`);
  }

  // Pass the origin response through with proxy overhead measured.
  const proxyMs = Date.now() - startedAt;
  const out = new Response(originResponse.body, originResponse);
  out.headers.set('x-acf-proxy-ms', String(proxyMs));
  return out;
}

// ---- Async capture (never blocks the hot path) ----

const sampler = createSampler();
let droppedSamples = 0; // samples lost to capture/ingest failures

export function getDroppedSamples() {
  return droppedSamples;
}

// Resettable in tests only (worker instance state).
export function __resetCaptureState() {
  sampler.clear();
  droppedSamples = 0;
}

// Read and mask the response body, build the sample, POST it to INGEST_URL.
// Never throws: every failure increments the dropped-sample counter instead.
export async function captureAndShip(request, response, env, { durationMs, proxyMs }) {
  const url = new URL(request.url);
  const endpoint = `${request.method} ${templatePath(url.pathname)}`;
  if (!shouldSample(sampler, endpoint)) return;

  const ingestUrl = env.INGEST_URL;
  if (!ingestUrl) {
    droppedSamples += 1; // no ingest configured: sample exists but goes nowhere
    return;
  }

  let bodyJson;
  const contentType = response.headers.get('content-type') || '';
  if (response.body && contentType.includes('application/json')) {
    try {
      bodyJson = await response.clone().json();
    } catch {
      bodyJson = undefined; // unreadable body ships without a body
    }
  }

  const sample = buildSample({
    method: request.method,
    path: url.pathname,
    status: response.status,
    durationMs,
    proxyMs,
    bodyJson,
  });

  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample),
  });
  if (!res.ok) droppedSamples += 1;
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const response = await handleRequest(request, env);
    // Only capture successfully forwarded requests (401/502 are local
    // errors, not API traffic worth learning from).
    if (response.status !== 401 && response.status !== 502) {
      ctx.waitUntil(
        captureAndShip(request, response, env, {
          durationMs: Date.now() - startedAt,
          proxyMs: Number(response.headers.get('x-acf-proxy-ms')) || 0,
        }).catch(() => {
          droppedSamples += 1;
        })
      );
    }
    return response;
  },
};
