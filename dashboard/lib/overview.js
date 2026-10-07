// Builds the rows the endpoints tables render: one per endpoint with its
// recent latency series, p95, last change, and open breaking count.

'use strict';

import { p95 } from './stats.js';

// ponytail: N+1 queries per endpoint (latency series + last change).
// Endpoints per service are few in the MVP; batch this when it hurts.
export async function endpointRows(db, serviceId) {
  const endpoints = await db.listEndpointsByService(serviceId);
  const breaking = await db.listOpenBreakingViolations(serviceId);
  const breakingByEndpoint = {};
  for (const v of breaking) {
    breakingByEndpoint[v.endpoint_id] = (breakingByEndpoint[v.endpoint_id] || 0) + 1;
  }
  return Promise.all(
    endpoints.map(async (e) => {
      const [latencies, lastChangeAt] = await Promise.all([
        db.getLatencySeries(e.id),
        db.getLastChangeAt(e.id),
      ]);
      return {
        id: e.id,
        method: e.method,
        path: e.path_template,
        state: e.state,
        sampleCount: e.sample_count,
        lastSeenAt: e.last_seen_at,
        lastChangeAt,
        latencies,
        p95: p95(latencies),
        breaking: breakingByEndpoint[e.id] || 0,
      };
    })
  );
}
