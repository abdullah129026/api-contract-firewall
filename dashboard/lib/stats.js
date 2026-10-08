// Small stats helpers for the dashboard tables.
// Pure functions, no db access, so they stay easy to test.

'use strict';

// Percentile of a list of numbers (0 < q <= 1). Empty list returns null
// (the table shows a dash).
function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(q * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function p95(values) {
  return percentile(values, 0.95);
}

export function p50(values) {
  return percentile(values, 0.5);
}
