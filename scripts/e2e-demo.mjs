// Scripted end-to-end demo of API Contract Firewall against a deployed stack.
// Exercises: register service -> baseline traffic -> LEARNING turns ENFORCING
// -> flip the breaking change -> violation appears -> gate blocks ->
// approve -> new baseline -> gate passes.
//
// Needs:
//   DASHBOARD_URL  the deployed dashboard, e.g. https://acf-dashboard.vercel.app
//   PROXY_URL      the deployed worker, e.g. https://acf-proxy.<sub>.workers.dev
//   DEMO_ORIGIN    a publicly reachable demo origin. The repo's origin/
//                  server is fine, but the worker cannot reach localhost, so
//                  it must be hosted somewhere public (Render/Railway/ngrok).
//                  Run it with BREAK_CONTRACT=1 only when the script asks.
//
// Usage:
//   DASHBOARD_URL=... PROXY_URL=... DEMO_ORIGIN=... node scripts/e2e-demo.mjs
//
// The script creates one throwaway service named e2e-demo-<timestamp>.
// The dashboard has no service delete route yet, so delete it from the
// services table afterwards if you care about the demo data.
import { createInterface } from 'node:readline';

const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const PROXY_URL = (process.env.PROXY_URL || '').replace(/\/$/, '');
const DEMO_ORIGIN = (process.env.DEMO_ORIGIN || '').replace(/\/$/, '');
if (!DASHBOARD_URL || !PROXY_URL || !DEMO_ORIGIN) {
  console.error('set DASHBOARD_URL, PROXY_URL and DEMO_ORIGIN first (see header).');
  process.exit(2);
}

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

async function api(path, { method = 'GET', key, body } = {}) {
  const res = await fetch(DASHBOARD_URL + path, {
    method,
    headers: {
      ...(key ? { 'x-api-key': key } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}

// Fire n GETs through the proxy with limited concurrency. The proxy samples
// 1-in-10 deterministically, so 1050 requests give ~105 samples, enough to
// flip the endpoint to ENFORCING at 100.
async function blast(proxy, key, paths, n, concurrency = 25) {
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (done < n) {
      const i = done++;
      const r = await fetch(proxy + paths[i % paths.length], {
        headers: { 'x-api-key': key },
      });
      await r.text(); // drain
    }
  });
  await Promise.all(workers);
  return n;
}

async function poll(desc, fn, timeoutMs = 180_000) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${desc}`);
    await new Promise((r) => setTimeout(r, 10_000));
    process.stdout.write('.');
  }
}

function waitForEnter(prompt) {
  if (process.env.E2E_SKIP_BREAK_PROMPT === '1') return Promise.resolve();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  // 1. register a service
  step(1, 'registering service');
  const name = `e2e-demo-${Date.now()}`;
  const reg = await api('/api/services', { method: 'POST', body: { name, origin: DEMO_ORIGIN } });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  const { service, apiKey } = reg.json;
  console.log(`service ${service.id} registered; key ${apiKey.slice(0, 6)}...`);

  // 2. baseline traffic
  step(2, 'sending baseline traffic (expect ~1 min)');
  const sent = await blast(PROXY_URL, apiKey, ['/users', '/orders'], 1050);
  console.log(`sent ${sent} requests through the proxy`);

  // 3. wait for ENFORCING
  step(3, 'waiting for LEARNING -> ENFORCING');
  const enforcing = await poll('enforcing state', async () => {
    const r = await api(`/api/services/${service.id}`);
    if (r.status !== 200) return null;
    const ep = r.json.endpoints.find((e) => e.path_template === '/users');
    console.log(`\n    /users: ${ep ? `${ep.state} (${ep.sample_count} samples)` : 'not seen yet'}`);
    return ep && ep.state === 'ENFORCING';
  });
  if (!enforcing) throw new Error('no enforcing endpoint');
  console.log('enforcing confirmed');

  // 4. flip the breaking change
  step(4, 'breaking change');
  console.log('Now restart the demo origin with BREAK_CONTRACT=1 (id -> _id in all responses).');
  await waitForEnter('Press Enter when the broken origin is serving: ');

  // 5. broken traffic
  step(5, 'sending broken traffic');
  await blast(PROXY_URL, apiKey, ['/users'], 80);

  // 6. wait for the violation
  step(6, 'waiting for the breaking violation');
  const violation = await poll('open breaking violation', async () => {
    const r = await api(`/api/violations?service=${service.id}&status=open&severity=breaking`);
    if (r.status !== 200) return null;
    return r.json.violations[0] || null;
  });
  console.log(`\nviolation ${violation.id}: ${violation.summary || violation.field_path}`);

  // 7. gate blocks
  step(7, 'checking the CI gate (expect blocked)');
  const gate1 = await api('/api/gate', { key: apiKey });
  if (gate1.json.decision !== 'blocked') throw new Error(`gate should block, got ${gate1.json.decision}`);
  console.log('gate blocked as expected');

  // 8. approve -> new baseline
  step(8, 'approving the violation (promotes new baseline)');
  const approve = await api(`/api/violations/${violation.id}`, {
    method: 'POST',
    body: { action: 'approve' },
  });
  if (approve.status !== 200 || approve.json.status !== 'approved') {
    throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.json)}`);
  }
  console.log('approved');

  // 9. gate passes again
  step(9, 'waiting for the stream to clear, then checking the gate (expect pass)');
  await poll('cleared violations', async () => {
    const r = await api(`/api/violations?service=${service.id}&status=open&severity=breaking`);
    return r.status === 200 && r.json.violations.length === 0;
  });
  const gate2 = await api('/api/gate', { key: apiKey });
  if (gate2.json.decision !== 'pass') throw new Error(`gate should pass, got ${gate2.json.decision}`);
  console.log('gate passes');

  console.log(`\nDone. Full loop verified: learn -> break -> violation -> blocked -> approve -> new baseline -> pass.`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
