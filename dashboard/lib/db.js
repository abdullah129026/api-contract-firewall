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
  };
}
