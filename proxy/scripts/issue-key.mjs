#!/usr/bin/env node
// Issues an API key for a new service. Merge the printed entry into the
// Worker's SERVICES_JSON secret; later milestones move issuance into the
// dashboard backed by Supabase.
// Usage: node scripts/issue-key.mjs <service-name> <origin-url>
import { randomBytes } from 'node:crypto';

const [name, origin] = process.argv.slice(2);
if (!name || !origin) {
  console.error('usage: node scripts/issue-key.mjs <service-name> <origin-url>');
  process.exit(1);
}

const key = `acf_${randomBytes(24).toString('base64url')}`;
const entry = { [key]: { name, origin } };

console.log(JSON.stringify(entry, null, 2));
console.log(`\nRegister it (merge into the Worker's SERVICES_JSON secret):`);
console.log(`  npx wrangler secret put SERVICES_JSON`);
console.log(`\nSmoke test against a local Worker (wrangler dev --port 8787):`);
console.log(`  curl -s -H "x-api-key: ${key}" http://127.0.0.1:8787/users | head -c 200`);
