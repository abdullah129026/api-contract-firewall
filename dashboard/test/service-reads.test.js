// The two JSON read routes the scripted demo needs: GET /api/services/[id]
// and GET /api/violations. Without DB env they must fail 503 like every
// other dashboard route, so a half-deployed stack degrades loudly.
import test from 'node:test';
import assert from 'node:assert/strict';

// Keep the DB unconfigured for these: both routes read via dbFromEnv().
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;

const { GET: getService } = await import('../app/api/services/[id]/route.js');
const { GET: getViolations } = await import('../app/api/violations/route.js');

test('GET /api/services/[id] returns 503 without DB env', async () => {
  const res = await getService(new Request('http://x/api/services/abc'), { params: Promise.resolve({ id: 'abc' }) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'database_not_configured');
});

test('GET /api/violations returns 503 without DB env', async () => {
  const res = await getViolations(new Request('http://x/api/violations?service=abc&status=open'));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'database_not_configured');
});
