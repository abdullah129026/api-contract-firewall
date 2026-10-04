// Async capture wiring tests — the Worker fetch handler with a fake ctx,
// fake origin, and fake ingest endpoint. All in plain Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { captureAndShip, getDroppedSamples, __resetCaptureState } from '../worker.js';
import { MASKED } from '../capture.js';

const KEY = 'dev-key-123';
const INGEST_URL = 'https://ingest.example/ingest';
const env = () => ({
  SERVICES_JSON: JSON.stringify({ [KEY]: { origin: 'http://origin.test', name: 'demo' } }),
  INGEST_URL,
});

function req(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(`https://proxy.example${path}`, { method, headers, body });
}

function runWithFakeFetch(ingestImpl, fn) {
  const real = globalThis.fetch;
  const seen = { ingest: [] };
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://origin.test')) {
      return new Response(JSON.stringify({ id: 7, email: 'a@b.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    seen.ingest.push({ url: String(url), init });
    return ingestImpl ? ingestImpl(url, init) : new Response('ok', { status: 200 });
  };
  return fn(seen).finally(() => { globalThis.fetch = real; });
}

function fakeCtx() {
  const promises = [];
  return {
    waitUntil(p) { promises.push(p.catch(() => {})); },
    async settled() { await Promise.all(promises); },
  };
}

test('10th request ships a masked, templated sample to INGEST_URL', async () => {
  __resetCaptureState();
  await runWithFakeFetch(null, async (seen) => {
    const ctx = fakeCtx();
    for (let i = 0; i < 10; i++) {
      const res = await worker.fetch(req('/users/42', { headers: { 'x-api-key': KEY } }), env(), ctx);
      assert.equal(res.status, 200, 'client response unaffected by capture');
      assert.ok((await res.text()).includes('a@b.com'), 'response body passes through raw');
    }
    await ctx.settled();
    assert.equal(seen.ingest.length, 1, 'exactly 1-in-10 requests ships a sample');
    const sample = JSON.parse(seen.ingest[0].init.body);
    assert.equal(sample.method, 'GET');
    assert.equal(sample.path, '/users/{id}', 'path templated before shipping');
    assert.equal(sample.status, 200);
    assert.equal(sample.body.id, 7);
    assert.equal(sample.body.email, MASKED, 'PII masked before storage');
    assert.equal(getDroppedSamples(), 0);
  });
});

test('unauthorized requests are not captured', async () => {
  __resetCaptureState();
  await runWithFakeFetch(null, async (seen) => {
    const ctx = fakeCtx();
    await worker.fetch(req('/users'), env(), ctx);
    await ctx.settled();
    assert.equal(seen.ingest.length, 0);
  });
});

test('ingest failure increments dropped counter, client unaffected', async () => {
  __resetCaptureState();
  await runWithFakeFetch(() => new Response('boom', { status: 500 }), async (seen) => {
    const ctx = fakeCtx();
    for (let i = 0; i < 10; i++) {
      const res = await worker.fetch(req('/users/1', { headers: { 'x-api-key': KEY } }), env(), ctx);
      assert.equal(res.status, 200);
    }
    await ctx.settled();
    assert.equal(seen.ingest.length, 1);
    assert.equal(getDroppedSamples(), 1);
  });
});

test('missing INGEST_URL drops the sample without throwing', async () => {
  __resetCaptureState();
  await runWithFakeFetch(null, async (seen) => {
    for (let i = 0; i < 10; i++) {
      await captureAndShip(
        req('/users/1'),
        new Response('[]', { headers: { 'content-type': 'application/json' } }),
        { ...env(), INGEST_URL: undefined },
        { durationMs: 5, proxyMs: 1 }
      ).catch(() => assert.fail('captureAndShip must never throw'));
    }
    assert.equal(getDroppedSamples(), 1, 'the one sampled request drops without a configured ingest');
  });
});
