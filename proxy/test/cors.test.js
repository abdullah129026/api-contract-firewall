// Preflight handling: OPTIONS is answered at the edge with CORS headers,
// never forwarded to the origin and never 401'd for a missing key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handlePreflight } from '../worker.js';

const env = () => ({ SERVICES_JSON: '{}' });
const fakeCtx = () => ({ waitUntil() {} });

test('OPTIONS preflight returns 204 with CORS headers and no key needed', async () => {
  const req = new Request('https://proxy.example/repos/x/intent/y', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://www.fluxyai.codes',
      'access-control-request-headers': 'x-api-key',
    },
  });
  const res = await worker.fetch(req, env(), fakeCtx());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-allow-headers') || '', /x-api-key/);
});

test('handlePreflight returns null for non-OPTIONS methods', () => {
  const req = new Request('https://proxy.example/repos/x');
  assert.equal(handlePreflight(req), null);
});

test('GET without a key still 401s (preflight did not loosen auth)', async () => {
  const req = new Request('https://proxy.example/repos/x');
  const res = await worker.fetch(req, env(), fakeCtx());
  assert.equal(res.status, 401);
});
