// Minimal Supabase client over PostgREST (plain fetch, no dependency).
//
// Only the queries the MVP needs. Every method takes and returns plain
// JSON. Errors throw with the Supabase status and a short body excerpt so
// the caller can log them; ingest failures must never leak details to the
// proxy.

'use strict';

export function createDb({ url, serviceKey }) {
  if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  const base = url.replace(/\/$/, '');

  async function req(path, { method = 'GET', body, prefer } = {}) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    // Services and keys
    async getServiceByName(name) {
      const rows = await req(
        `services?name=eq.${encodeURIComponent(name)}&select=id,name,origin`
      );
      return rows[0] || null;
    },
    async createService({ name, origin }) {
      const rows = await req('services', {
        method: 'POST',
        prefer: 'return=representation',
        body: { name, origin },
      });
      return rows[0];
    },
    async createApiKey({ keyHash, serviceId, label }) {
      const rows = await req('api_keys', {
        method: 'POST',
        prefer: 'return=representation',
        body: { key_hash: keyHash, service_id: serviceId, label: label || 'default' },
      });
      return rows[0];
    },
    async getKeyWithService(keyHash) {
      const rows = await req(
        `api_keys?key_hash=eq.${encodeURIComponent(keyHash)}` +
          `&select=key_hash,service:services(id,name,origin)`
      );
      return rows[0] || null;
    },

    // Endpoints and learning
    async getEndpoint(serviceId, method, pathTemplate) {
      const rows = await req(
        `endpoints?service_id=eq.${serviceId}` +
          `&method=eq.${encodeURIComponent(method)}` +
          `&path_template=eq.${encodeURIComponent(pathTemplate)}` +
          `&select=id,service_id,method,path_template,state,sample_count,human_confirmed`
      );
      return rows[0] || null;
    },
    async createEndpoint({ serviceId, method, pathTemplate }) {
      const rows = await req('endpoints', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          service_id: serviceId,
          method,
          path_template: pathTemplate,
          state: 'LEARNING',
          sample_count: 0,
        },
      });
      return rows[0];
    },
    // Atomically bump the sample counter and refresh last_seen.
    async bumpEndpointSampleCount(endpointId) {
      // PostgREST has no increment operator; read-modify-write is fine at
      // MVP ingest volumes (1-in-10 sampling, bounded per endpoint).
      const current = (
        await req(`endpoints?id=eq.${endpointId}&select=id,state,sample_count,human_confirmed`)
      )[0];
      const bumped = await req(`endpoints?id=eq.${endpointId}&select=id,state,sample_count,human_confirmed`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: {
          sample_count: current.sample_count + 1,
          last_seen_at: new Date().toISOString(),
        },
      });
      return bumped[0];
    },
    async setEndpointEnforcing(endpointId) {
      const rows = await req(`endpoints?id=eq.${endpointId}&select=id,state,sample_count,human_confirmed`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { state: 'ENFORCING' },
      });
      return rows[0];
    },
    async insertSample({ endpointId, status, durationMs, proxyMs, body, bodyTruncated, sampledAt }) {
      await req('samples', {
        method: 'POST',
        body: {
          endpoint_id: endpointId,
          status,
          duration_ms: durationMs,
          proxy_ms: proxyMs,
          body: body === undefined ? null : body,
          body_truncated: !!bodyTruncated,
          sampled_at: sampledAt ? new Date(sampledAt).toISOString() : new Date().toISOString(),
        },
      });
    },
    async getSampleBodies(endpointId, limit) {
      const rows = await req(
        `samples?endpoint_id=eq.${endpointId}&select=body&order=sampled_at.asc&limit=${limit}`
      );
      return rows.map((r) => r.body).filter((b) => b !== null && b !== undefined);
    },
    async insertSchemaVersion({ endpointId, version, schema, isBaseline, source }) {
      const rows = await req('schema_versions', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          endpoint_id: endpointId,
          version,
          schema,
          is_baseline: !!isBaseline,
          source: source || 'learning',
        },
      });
      return rows[0];
    },
    // The enforced baseline for an endpoint (null until it exists).
    async getBaselineSchemaVersion(endpointId) {
      const rows = await req(
        `schema_versions?endpoint_id=eq.${endpointId}` +
          `&is_baseline=is.true&select=version,schema&order=version.desc&limit=1`
      );
      return rows[0] || null;
    },
    async getMaxSchemaVersion(endpointId) {
      const rows = await req(
        `schema_versions?endpoint_id=eq.${endpointId}` +
          `&select=version&order=version.desc&limit=1`
      );
      return rows.length ? rows[0].version : 0;
    },
    // Record a detected change. An open row for the same
    // (endpoint, severity, kind, field) just gets its count bumped; a new
    // distinct change inserts a row. Returns { created }.
    async upsertViolation({ endpointId, severity, kind, fieldPath, summary, detail }) {      const open = await req(
        `violations?endpoint_id=eq.${endpointId}` +
          `&severity=eq.${encodeURIComponent(severity)}` +
          `&kind=eq.${encodeURIComponent(kind)}` +
          `&field_path=eq.${encodeURIComponent(fieldPath)}` +
          `&status=eq.open&select=id,occurrence_count`
      );
      if (open[0]) {
        await req(`violations?id=eq.${open[0].id}`, {
          method: 'PATCH',
          body: {
            occurrence_count: open[0].occurrence_count + 1,
            last_seen_at: new Date().toISOString(),
          },
        });
        return { created: false };
      }
      await req('violations', {
        method: 'POST',
        body: {
          endpoint_id: endpointId,
          severity,
          kind,
          field_path: fieldPath,
          summary,
          detail: detail || {},
          status: 'open',
        },
      });
      return { created: true };
    },

    // ---- Dashboard shell reads ----

    async listServices() {
      return req('services?select=id,name,origin,created_at&order=created_at.asc');
    },
    async getService(id) {
      const rows = await req(
        `services?id=eq.${encodeURIComponent(id)}&select=id,name,origin,created_at`
      );
      return rows[0] || null;
    },
    async listEndpointsByService(serviceId) {
      return req(
        `endpoints?service_id=eq.${encodeURIComponent(serviceId)}` +
          `&select=id,method,path_template,state,sample_count,human_confirmed,last_seen_at` +
          `&order=last_seen_at.desc`
      );
    },
    // Key hashes only. The plaintext key is shown once at issuance and is
    // never stored, so the setup screen can list keys but not re-display them.
    async listApiKeys(serviceId) {
      return req(
        `api_keys?service_id=eq.${encodeURIComponent(serviceId)}` +
          `&select=key_hash,label,created_at&order=created_at.desc`
      );
    },
    // Recent per-request durations for the p95 sparkline, newest first.
    async getLatencySeries(endpointId, limit = 120) {
      const rows = await req(
        `samples?endpoint_id=eq.${encodeURIComponent(endpointId)}` +
          `&select=duration_ms&order=sampled_at.desc&limit=${limit}`
      );
      return rows.map((r) => r.duration_ms);
    },
    // Open breaking violations for one service. One query plus an in-memory
    // filter.
    // ponytail: an inner-join PostgREST filter would save the filter step,
    // but endpoints per service are few in the MVP, so this stays readable.
    async listOpenBreakingViolations(serviceId) {
      const endpoints = await this.listEndpointsByService(serviceId);
      const ids = new Set(endpoints.map((e) => e.id));
      const rows = await req(
        'violations?select=id,endpoint_id,field_path,summary&status=eq.open&severity=eq.breaking'
      );
      return rows.filter((r) => ids.has(r.endpoint_id));
    },
    // Latest schema change or violation sighting for an endpoint, for the
    // "last change" column. Null when nothing changed yet.
    async getLastChangeAt(endpointId) {
      const enc = encodeURIComponent(endpointId);
      const [versions, violations] = await Promise.all([
        req(`schema_versions?endpoint_id=eq.${enc}&select=created_at&order=created_at.desc&limit=1`),
        req(`violations?endpoint_id=eq.${enc}&select=first_seen_at&order=first_seen_at.desc&limit=1`),
      ]);
      const times = [];
      if (versions[0]) times.push(new Date(versions[0].created_at).getTime());
      if (violations[0]) times.push(new Date(violations[0].first_seen_at).getTime());
      return times.length ? new Date(Math.max(...times)).toISOString() : null;
    },
  };
}

// Returns a db client from env, or null when the env vars are absent. Pages
// and routes use this so a missing DB config renders an empty state
// instead of a 500.
export function dbFromEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return createDb({ url, serviceKey });
}
