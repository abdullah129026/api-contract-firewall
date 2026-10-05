#!/usr/bin/env node
// Issues an API key for a new service through the dashboard API, which
// stores only the sha256 hash in Supabase. The plaintext key is printed
// once; it is never stored anywhere.
// Usage: node scripts/issue-key.mjs <service-name> <origin-url> [dashboard-url]
// dashboard-url defaults to http://127.0.0.1:3000

const [name, origin, dashboardUrl = 'http://127.0.0.1:3000'] = process.argv.slice(2);
if (!name || !origin) {
  console.error('usage: node scripts/issue-key.mjs <service-name> <origin-url> [dashboard-url]');
  process.exit(1);
}

const res = await fetch(`${dashboardUrl.replace(/\/$/, '')}/api/services`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, origin }),
});
const data = await res.json();
if (!res.ok) {
  console.error(`failed (${res.status}):`, data.error || data);
  process.exit(1);
}

console.log(`service: ${data.service.name} (${data.service.id})`);
console.log(`origin:  ${data.service.origin}`);
console.log(`\nAPI key (shown once, only the hash is stored):`);
console.log(`  ${data.apiKey}`);
console.log(`\nPoint the API base URL at the proxy and send the key as x-api-key.`);
