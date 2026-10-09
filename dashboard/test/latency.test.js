// Tests for lib/latency.js. Series are newest-first, like getLatencySeries.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { regressionCheck } from '../lib/latency.js';

const flat = (n, ms) => Array(n).fill(ms);

test('flat series: no regression, ratio 1', () => {
  const r = regressionCheck(flat(100, 50));
  assert.equal(r.regressed, false);
  assert.equal(r.ratio, 1);
  assert.equal(r.recentP50, 50);
  assert.equal(r.baselineP50, 50);
});

test('recent window 3x slower: regression', () => {
  const series = [...flat(20, 150), ...flat(80, 50)];
  const r = regressionCheck(series);
  assert.equal(r.regressed, true);
  assert.ok(Math.abs(r.ratio - 3) < 0.001);
});

test('recent window 1.5x slower: no regression', () => {
  const series = [...flat(20, 75), ...flat(80, 50)];
  const r = regressionCheck(series);
  assert.equal(r.regressed, false);
  assert.ok(Math.abs(r.ratio - 1.5) < 0.001);
});

test('exactly 2x: regression (>= threshold)', () => {
  const series = [...flat(20, 100), ...flat(80, 50)];
  assert.equal(regressionCheck(series).regressed, true);
});

test('too few samples: null (no verdict)', () => {
  assert.equal(regressionCheck(flat(39, 50)), null);
  assert.equal(regressionCheck(flat(20, 50)), null);
  assert.equal(regressionCheck([]), null);
});

test('extra history beyond the windows is ignored', () => {
  const series = [...flat(20, 100), ...flat(80, 50), ...flat(500, 9999)];
  const r = regressionCheck(series);
  assert.equal(r.regressed, true);
  assert.equal(r.baselineP50, 50);
});

test('zero baseline median: null (ratios are meaningless)', () => {
  const series = [...flat(20, 5), ...flat(80, 0)];
  assert.equal(regressionCheck(series), null);
});

test('noisy data: medians stay stable', () => {
  const noisy = (n, base) => Array.from({ length: n }, (_, i) => base + (i % 3) - 1);
  const series = [...noisy(20, 100), ...noisy(80, 50)];
  const r = regressionCheck(series);
  assert.equal(r.regressed, true);
  assert.ok(r.ratio >= 1.9 && r.ratio <= 2.1);
});
