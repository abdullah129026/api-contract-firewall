// p95 unit checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { p95 } from '../lib/stats.js';

test('p95 of an empty list is null', () => {
  assert.equal(p95([]), null);
});

test('p95 picks the 95th percentile', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(p95(values), 95);
});

test('p95 rounds up on small lists', () => {
  assert.equal(p95([10, 20]), 20);
  assert.equal(p95([7]), 7);
});
