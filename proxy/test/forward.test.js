// Proxy forwarding tests — run in plain Node; the Worker module has no
// Cloudflare-specific imports, so handleRequest() is directly testable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, buildTargetUrl, parseRegistry } from '../worker.js';

const KEY = 'dev-key-123';
const env = () => ({
  SERVICES_JSON: JSON.stringify({ [KEY]: { origin: 'http://origin.test', name: 'demo' } }),
});

function req(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(`https://proxy.example${path}`, { method, headers, body });
}

function withFakeOrigin(fn, impl) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = real; });
}

test('missing x-api-key -> 401 with terse hint', async () => {
  const res = await handleRequest(req('/users'), env());
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'missing_api_key');
  assert.ok(body.hint.includes('x-api-key'));
});

test('invalid x-api-key -> 401', async () => {
  const res = await handleRequest(req('/users', { headers: { 'x-api-key': 'nope' } }), env());
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'invalid_api_key');
});

test('valid key forwards method/path/query/headers and passes body through', async () => {
  let seen = null;
  await withFakeOrigin(async () => {
    seen = null;
    const res = await handleRequest(
      req('/orders?limit=2', { method: 'POST', headers: { 'x-api-key': KEY, 'x-custom': 'abc' }, body: '{"a":1}' }),
      env()
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'echo-ok');
    assert.ok(res.headers.get('x-acf-proxy-ms') !== null, 'overhead header present');
  }, async (url, init) => {
    seen = { url, init, body: init.body ? await new Response(init.body).text() : null };
    assert.ok(!init.headers.get('host'), 'host header stripped');
    assert.equal(init.headers.get('x-custom'), 'abc');
    return new Response('echo-ok', { status: 200 });
  });
  assert.equal(seen.url, 'http://origin.test/orders?limit=2');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.body, '{"a":1}');
});

test('GET passes no body to origin', async () => {
  await withFakeOrigin(async () => {
    await handleRequest(req('/users/1', { headers: { 'x-api-key': KEY } }), env());
  }, async (url, init) => {
    assert.equal(init.body, undefined);
    return new Response('[]');
  });
});

test('origin unreachable -> 502 terse error', async () => {
  const res = await withFakeOrigin(
    () => handleRequest(req('/users', { headers: { 'x-api-key': KEY } }), env()),
    async () => { throw new TypeError('fetch failed'); }
  );
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'origin_unreachable');
});

test('buildTargetUrl joins origin and path without double slashes', () => {
  const u = new URL('https://proxy.example/a/b?x=1');
  assert.equal(buildTargetUrl('http://o:3000/', u), 'http://o:3000/a/b?x=1');
  assert.equal(buildTargetUrl('http://o:3000', u), 'http://o:3000/a/b?x=1');
});

test('parseRegistry rejects malformed JSON', () => {
  assert.deepEqual(parseRegistry('not json'), {});
  assert.deepEqual(parseRegistry('["array"]'), {});
  assert.deepEqual(parseRegistry(null), {});
});
