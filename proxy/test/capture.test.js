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

test('masking leaves no raw secret anywhere in the shipped sample', () => {
  const body = {
    ok: true,
    user: {
      password: 's3cr3t-pw',
      Email: 'victim@example.com',
      api_key: 'sk-live-abc123',
      sessions: [{ authorization: 'Bearer xyz', deep: { ssn: '123-45-6789' } }],
    },
  };
  const sample = buildSample({
    method: 'POST',
    path: '/login',
    status: 200,
    durationMs: 5,
    proxyMs: 1,
    bodyJson: body,
  });
  const shipped = JSON.stringify(sample);
  for (const secret of ['s3cr3t-pw', 'victim@example.com', 'sk-live-abc123', 'Bearer xyz', '123-45-6789']) {
    assert.ok(!shipped.includes(secret), `secret leaked into shipped sample: ${secret}`);
  }
  assert.ok(shipped.includes(MASKED), 'masked marker present');
  assert.ok(shipped.includes('"ok":true'), 'non-sensitive fields survive');
});

test('maskSensitive does not mutate its input', () => {
  const input = { email: 'a@b.com', profile: { password: 'x' }, list: [{ token: 'y' }] };
  const before = JSON.stringify(input);
  maskSensitive(input);
  assert.equal(JSON.stringify(input), before, 'masking must copy, never rewrite the caller data');
});

test('maskSensitive redacts variant key spellings at any depth', () => {
  const out = maskSensitive({
    'API-KEY': 'k1',
    level1: { e_mail: 'e@x.com', level2: [{ 'Credit-Card': '4111', note: 'keep' }] },
  });
  assert.equal(out['API-KEY'], MASKED);
  assert.equal(out.level1.e_mail, MASKED);
  assert.equal(out.level1.level2[0]['Credit-Card'], MASKED);
  assert.equal(out.level1.level2[0].note, 'keep');
});

test('shouldSample resumes after the minute window rolls over', () => {
  const sampler = createSampler();
  const minute = Math.floor(1_700_000_000_000 / 60_000) * 60_000;
  let sampled = 0;
  for (let i = 1; i <= 3000; i++) {
    if (shouldSample(sampler, 'GET /a', minute + i)) sampled += 1;
  }
  assert.equal(sampled, 200, 'capped within the minute');
  // Next minute: the cap lifts and 1-in-10 sampling resumes.
  sampled = 0;
  const next = minute + 60_000;
  for (let i = 1; i <= 100; i++) {
    if (shouldSample(sampler, 'GET /a', next + i)) sampled += 1;
  }
  assert.equal(sampled, 10, 'sampling resumes in the new window');
});

test('shouldSample evicts rolled-over endpoint windows', () => {
  const sampler = createSampler();
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  for (let i = 0; i < 500; i++) shouldSample(sampler, `GET /e${i}`, minute + i);
  assert.equal(sampler.size, 500);
  // A request in the next minute drops every stale window, so a long-lived
  // isolate does not accumulate one entry per endpoint it ever saw.
  shouldSample(sampler, 'GET /e0', minute + 60_000 + 1);
  assert.equal(sampler.size, 1, 'only the fresh window remains');
});
