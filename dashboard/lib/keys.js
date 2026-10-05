// API key generation and hashing.
//
// The proxy sends the plaintext key in x-api-key; the Worker hashes it and
// looks up the hash in Postgres. The plaintext is shown once at issuance
// and never stored.

'use strict';

import { randomBytes, createHash } from 'node:crypto';

export function generateApiKey() {
  return `acf_${randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(key) {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}
