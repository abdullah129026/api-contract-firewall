// Latency regression check: is this endpoint slower than it used to be?
//
// Compares the median duration of the newest samples against the median of
// the window before them. Pure function; the dashboard calls it on the
// series getLatencySeries returns (newest first, 1-in-10 sampled so the
// numbers are approximate).

'use strict';

import { p50 } from './stats.js';

// Returns null when the history is too short for a verdict. Otherwise
// { regressed, ratio, recentP50, baselineP50 }. A regression is a recent
// median at least 2x the baseline median; small jitters stay quiet.
export function regressionCheck(
  latencies,
  { recentN = 20, minBaseline = 20, maxBaseline = 80 } = {}
) {
  if (!latencies || latencies.length < recentN + minBaseline) return null;
  const recent = latencies.slice(0, recentN);
  const baseline = latencies.slice(recentN, recentN + maxBaseline);
  const recentP50 = p50(recent);
  const baselineP50 = p50(baseline);
  // A zero baseline median (sub-ms local origin) makes ratios meaningless.
  if (baselineP50 === null || baselineP50 <= 0) return null;
  const ratio = recentP50 / baselineP50;
  return { regressed: ratio >= 2, ratio, recentP50, baselineP50 };
}
