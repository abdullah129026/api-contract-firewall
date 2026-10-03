// API Contract Firewall — forward proxy (Cloudflare Workers, ES modules).
//
// Devs point their API base URL at this Worker with an `x-api-key` header.
// The Worker validates the key, forwards the request to the registered
// origin, and returns the origin's response untouched (capture ships async
// in the next milestone via waitUntil — never blocking the hot path).
//
// Registry (milestone 1): `SERVICES_JSON` env var —
//   {"<api-key>": {"origin": "http://api.internal:3000", "name": "billing"}}
// Milestone 2 swaps this lookup for a cached Supabase REST query.

'use strict';

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

export default {
  async fetch(request, env, ctx) {
    // Capture of method/path/body/timings ships in the next milestone
    // via ctx.waitUntil(...), after the response is returned.
    return handleRequest(request, env);
  },
};
