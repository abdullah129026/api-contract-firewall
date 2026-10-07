// Small stats helpers for the dashboard tables.
// Pure functions, no db access, so they stay easy to test.

'use strict';

// p95 of a list of numbers. Empty list returns null (the table shows a dash).
export function p95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
