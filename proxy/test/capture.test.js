// Capture pipeline tests — run in plain Node; capture.js has no
// Cloudflare-specific imports, so everything is directly testable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASKED,
  MAX_BODY_BYTES,
  maskSensitive,
  isSensitiveName,
  templatePath,
  createSampler,
  shouldSample,
  buildSample,
} from '../capture.js';

test('maskSensitive redacts sensitive fields at any depth', () => {
  const input = {
    id: 1,
    email: 'a@b.com',
    password: 'hunter2',
    profile: { phone: '0300', name: 'Ab' },
    tokens: [{ token: 'abc' }, { kind: 'x' }],
  };
  const out = maskSensitive(input);
  assert.equal(out.email, MASKED);
  assert.equal(out.password, MASKED);
  assert.equal(out.profile.phone, MASKED);
  assert.equal(out.tokens[0].token, MASKED);
  // non-sensitive values pass through unchanged
  assert.equal(out.id, 1);
  assert.equal(out.profile.name, 'Ab');
  assert.equal(out.tokens[1].kind, 'x');
});

test('maskSensitive matching is case-insensitive on field names', () => {
  const out = maskSensitive({ Email: 'a@b.com', AUTHORIZATION: 'bearer x', sSn: '1' });
  assert.equal(out.Email, MASKED);
  assert.equal(out.AUTHORIZATION, MASKED);
  assert.equal(out.sSn, MASKED);
});

test('maskSensitive leaves scalars and empty structures alone', () => {
  assert.equal(maskSensitive('x'), 'x');
  assert.equal(maskSensitive(42), 42);
  assert.equal(maskSensitive(null), null);
  assert.deepEqual(maskSensitive([]), []);
  assert.deepEqual(maskSensitive({}), {});
});

test('isSensitiveName does not over-match', () => {
  assert.equal(isSensitiveName('tokenized'), false);
  assert.equal(isSensitiveName('my_email_address'), false);
  assert.equal(isSensitiveName('name'), false);
  assert.equal(isSensitiveName('api_key'), true); // hyphen/underscore variant
  assert.equal(isSensitiveName('authorization'), true);
});

test('templatePath normalizes numeric and UUID segments to {id}', () => {
  assert.equal(templatePath('/users/123'), '/users/{id}');
  assert.equal(
    templatePath('/orders/9f3a2b1c-4d5e-4f6a-8b9c-0d1e2f3a4b5c/items/7'),
    '/orders/{id}/items/{id}'
  );
  assert.equal(templatePath('/users/me'), '/users/me');
  assert.equal(templatePath('/health'), '/health');
});

test('shouldSample keeps 1-in-10 per endpoint and caps at 200/min', () => {
  const sampler = createSampler();
  let sampled = 0;
  const base = Date.now();
  for (let i = 1; i <= 3000; i++) {
    if (shouldSample(sampler, 'GET /users/{id}', base + i)) sampled += 1;
  }
  assert.equal(sampled, 200, 'capped at 200 per minute window');
});

test('shouldSample is per-endpoint', () => {
  const sampler = createSampler();
  const now = Date.now();
  for (let i = 1; i <= 10; i++) shouldSample(sampler, 'GET /a', now + i);
  assert.equal(shouldSample(sampler, 'GET /b', now + 100), false, 'first /b request is not sampled');
});

test('buildSample masks PII in the body', () => {
  const sample = buildSample({
    method: 'GET',
    path: '/users/123',
    status: 200,
    durationMs: 42,
    proxyMs: 3,
    bodyJson: { id: 123, email: 'a@b.com' },
  });
  assert.equal(sample.path, '/users/{id}');
  assert.equal(sample.body.email, MASKED);
  assert.equal(sample.body.id, 123);
  assert.ok(!('bodyTruncated' in sample));
});

test('buildSample truncates oversized bodies', () => {
  const big = 'x'.repeat(MAX_BODY_BYTES * 2);
  const sample = buildSample({
    method: 'GET',
    path: '/users/123',
    status: 200,
    durationMs: 42,
    proxyMs: 3,
    bodyJson: { data: big },
  });
  assert.equal(sample.bodyTruncated, true);
  assert.ok(sample.body.length <= MAX_BODY_BYTES);
});

test('buildSample without body omits the body field', () => {
  const sample = buildSample({ method: 'GET', path: '/health', status: 200, durationMs: 1, proxyMs: 1 });
  assert.ok(!('body' in sample));
  assert.ok(!('bodyTruncated' in sample));
});
