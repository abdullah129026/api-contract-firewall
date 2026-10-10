// API Contract Firewall — capture pipeline helpers (proxy hot path).
//
// These run inside the Worker in `ctx.waitUntil()` *after* the proxied
// response is returned: capture must never block or fail the user's
// request. PII masking happens here, BEFORE anything reaches storage —
// a masked sample is the only thing ever shipped to /api/ingest.
//
// Pure functions, no Cloudflare-specific imports: unit-testable in plain
// Node.

'use strict';

export const MASKED = '[redacted]';
export const MAX_BODY_BYTES = 16 * 1024; // cap stored bodies; never keep whole payloads
export const SAMPLE_EVERY_N = 10; // 1-in-10 requests per endpoint (plan §3)
export const MAX_SAMPLES_PER_MINUTE = 200; // hard cap per endpoint (plan §3)

// Field names that are never persisted raw. Match is case-insensitive on the
// key name, applied at any nesting depth. Covers JSON fields and, when the
// caller passes headers through, auth headers too.
const SENSITIVE_NAME_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /^secret$/i,
  /^token$/i,
  /^api[-_]?key$/i,
  /^email$/i,
  /^e[-_]?mail$/i,
  /^phone$/i,
  /^mobile$/i,
  /^ssn$/i,
  /^social[-_]?security[-_]?number$/i,
  /^credit[-_]?card$/i,
  /^card[-_]?number$/i,
  /^cvv$/i,
  /^authorization$/i,
  /^proxy[-_]?authorization$/i,
  /^cookie$/i,
  /^set[-_]?cookie$/i,
];

export function isSensitiveName(name) {
  return typeof name === 'string' && SENSITIVE_NAME_PATTERNS.some((re) => re.test(name));
}

// Recursively replace values of sensitive fields with '[redacted]'.
// Non-sensitive values (including nested structures) pass through unchanged.
export function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSensitiveName(key) ? MASKED : maskSensitive(val);
    }
    return out;
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT_RE = /^\d+$/;

// Path templating (plan §3): numeric segments and UUIDs normalize to {id};
// everything else stays literal. Without this, per-endpoint learning cannot
// aggregate (each /users/1, /users/2 would be a different endpoint).
export function templatePath(pathname) {
  return pathname
    .split('/')
    .map((seg) => (NUMERIC_SEGMENT_RE.test(seg) || UUID_RE.test(seg) ? '{id}' : seg))
    .join('/');
}

// Per-endpoint sampling state: endpoint key -> { windowMinute, count, sampled }.
// Deterministic (counter-based 1-in-N) so tests and ops are reproducible,
// unlike Math.random().
export function createSampler() {
  return new Map();
}

export function shouldSample(sampler, endpoint, now = Date.now()) {
  const minute = Math.floor(now / 60_000);
  let entry = sampler.get(endpoint);
  if (!entry || entry.minute !== minute) {
    entry = { minute, count: 0, sampled: 0 };
    sampler.set(endpoint, entry);
    // The sampler lives as long as the Worker isolate, so drop endpoint
    // windows that already rolled over. Without this, one map entry
    // accumulates per endpoint that was ever requested.
    for (const [key, e] of sampler) {
      if (e.minute < minute) sampler.delete(key);
    }
  }
  entry.count += 1;
  if (entry.sampled >= MAX_SAMPLES_PER_MINUTE) return false;
  // 1-in-10: sample when the request counter crosses an N boundary.
  if (entry.count % SAMPLE_EVERY_N === 0) {
    entry.sampled += 1;
    return true;
  }
  return false;
}

// Build the sample object shipped to /api/ingest. Body is masked JSON
// truncated to MAX_BODY_BYTES; non-JSON bodies ship without a body.
export function buildSample({ method, path, status, durationMs, proxyMs, bodyJson, sampledAt = Date.now() }) {
  const masked = bodyJson === undefined ? undefined : maskSensitive(bodyJson);
  let body;
  let truncated = false;
  if (masked !== undefined) {
    const text = JSON.stringify(masked);
    if (text.length > MAX_BODY_BYTES) {
      // Slicing mid-string almost never yields valid JSON; ship the prefix
      // as a string with a truncation flag so storage stays bounded.
      body = text.slice(0, MAX_BODY_BYTES);
      truncated = true;
    } else {
      body = masked;
    }
  }
  return {
    v: 1,
    method,
    path: templatePath(path),
    status,
    durationMs,
    proxyMs,
    sampledAt,
    ...(body !== undefined ? { body, ...(truncated ? { bodyTruncated: true } : {}) } : {}),
  };
}
