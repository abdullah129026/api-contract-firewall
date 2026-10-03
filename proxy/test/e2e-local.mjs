// Local end-to-end check (not part of the Worker bundle):
// runs handleRequest() against the real demo origin and prints
// round-trip timings. Run with the origin listening on :3001.
import { handleRequest } from '../worker.js';

const KEY = 'dev-key-123';
const env = {
  SERVICES_JSON: JSON.stringify({ [KEY]: { origin: 'http://127.0.0.1:3001', name: 'demo' } }),
};

for (const path of ['/health', '/users', '/users/2', '/orders']) {
  const t0 = Date.now();
  const req = new Request(`https://proxy.example${path}`, { headers: { 'x-api-key': KEY } });
  const res = await handleRequest(req, env);
  const total = Date.now() - t0;
  const overhead = res.headers.get('x-acf-proxy-ms');
  console.log(`${res.status} ${path}  total=${total}ms  proxy-overhead=${overhead}ms`);
  if (path === '/users/2') {
    const body = await res.json();
    console.log('  sample user keys:', Object.keys(body).join(','));
  }
}

// breaking-change preview: hit the origin directly with BREAK_CONTRACT=1
console.log('\nflip the origin with BREAK_CONTRACT=1 to see id -> _id in responses');
