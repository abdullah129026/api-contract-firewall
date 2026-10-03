#!/usr/bin/env node
// Scripted breaking change for demos: restarts the origin with BREAK_CONTRACT=1
// (responses rename `id` -> `_id`), then restores it. The proxy's detection
// milestone consumes this to prove a silent break is caught.
//
// Usage:
//   node scripts/flip-id.js --break    # flip id -> _id (simulates the bad deploy)
//   node scripts/flip-id.js --restore  # back to the stable contract
//
// This script only writes the desired state; it does not manage the origin
// process itself. Restart the origin with the printed env var to take effect.

'use strict';

const mode = process.argv[2];

if (mode === '--break') {
  console.log('BREAKING CHANGE ARMED');
  console.log('Restart the origin with:  BREAK_CONTRACT=1 node server.js');
  console.log('From now on every response renames `id` -> `_id` — the classic silent contract break.');
} else if (mode === '--restore') {
  console.log('CONTRACT RESTORED');
  console.log('Restart the origin with:  node server.js   (BREAK_CONTRACT unset or 0)');
} else {
  console.error('usage: node scripts/flip-id.js --break | --restore');
  process.exit(1);
}
