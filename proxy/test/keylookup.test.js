// Key lookup tests: Supabase-backed when configured, SERVICES_JSON
// fallback for local dev, 60s cache between them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, hashKey, lookupService } from '../worker.js';

const KEY = 'dev-key-123';
const SERVICE = { id: 'svc-1', name: 'demo', origin: 'http://origin.test' };

function req(path, { headers = {} } = {}) {
  return new Request(`https://proxy.example${path}`, { headers });
}

function withFakeFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = real; });
}

const supabaseEnv = () => ({
  SUPABASE_URL: 'https://xyz.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-role-key',
});

test('hashKey is sha256 hex', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(hashKey && (await hashKey(KEY)), createHash('sha256').update(KEY).digest('hex'));
});

test('Supabase lookup resolves the key and forwards', async () => {
  let hits = 0;
  await withFakeFetch(async (url, init) => {
    const u = String(url);
    if (u.includes('/rest/v1/api_keys')) {
      hits += 1;
      assert.ok(init.headers.Authorization.startsWith('Bearer '), 'service key sent');
      return new Response(JSON.stringify([{ service: SERVICE }]), { status: 200 });
    }
    return new Response('echo-ok', { status: 200 });
  }, async () => {
    const res = await handleRequest(req('/users', { headers: { 'x-api-key': 'cache-key-1' } }), supabaseEnv());
    assert.equal(res.status, 200);
  });
  assert.equal(hits, 1);
});

test('second request within 60s uses the cache, not the DB', async () => {
  let hits = 0;
  await withFakeFetch(async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/api_keys')) {
      hits += 1;
      return new Response(JSON.stringify([{ service: SERVICE }]), { status: 200 });
    }
    return new Response('echo-ok', { status: 200 });
  }, async () => {
    await lookupService('cache-key-2', supabaseEnv());
    await lookupService('cache-key-2', supabaseEnv());
  });
  assert.equal(hits, 1);
});

test('unknown key in Supabase -> 401', async () => {
  await withFakeFetch(async (url) => {
    if (String(url).includes('/rest/v1/api_keys')) {
      return new Response('[]', { status: 200 });
    }
    return new Response('echo-ok', { status: 200 });
  }, async () => {
    const res = await handleRequest(req('/users', { headers: { 'x-api-key': 'nope' } }), supabaseEnv());
    assert.equal(res.status, 401);
  });
});

test('Supabase down -> fail closed with 401', async () => {
  await withFakeFetch(async () => {
    throw new Error('db unreachable');
  }, async () => {
    const res = await handleRequest(req('/users', { headers: { 'x-api-key': KEY } }), supabaseEnv());
    assert.equal(res.status, 401);
  });
});

test('no Supabase configured -> SERVICES_JSON fallback still works', async () => {
  await withFakeFetch(async () => new Response('echo-ok', { status: 200 }), async () => {
    const env = {
      SERVICES_JSON: JSON.stringify({ [KEY]: { origin: 'http://origin.test', name: 'demo' } }),
    };
    const res = await handleRequest(req('/users', { headers: { 'x-api-key': KEY } }), env);
    assert.equal(res.status, 200);
  });
});
