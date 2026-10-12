// Ingest orchestration tests with an in-memory fake db.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestSample, validateSample, ValidationError } from '../lib/ingest.js';

function fakeDb() {
  const state = {
    services: [{ id: 'svc-1', name: 'demo', origin: 'http://origin.test' }],
    endpoints: [],
    samples: [],
    versions: [],
    violations: [],
  };
  return {
    state,
    async getServiceByName(name) {
      return state.services.find((s) => s.name === name) || null;
    },
    async getOrCreateEndpoint({ serviceId, method, pathTemplate }) {
      let row = state.endpoints.find(
        (e) => e.service_id === serviceId && e.method === method && e.path_template === pathTemplate
      );
      if (!row) {
        row = {
          id: `ep-${state.endpoints.length}`,
          service_id: serviceId,
          method,
          path_template: pathTemplate,
          state: 'LEARNING',
          sample_count: 0,
          human_confirmed: false,
        };
        state.endpoints.push(row);
      }
      return { ...row };
    },
    async bumpEndpointSampleCount(id) {
      const row = state.endpoints.find((e) => e.id === id);
      row.sample_count += 1;
      return { ...row };
    },
    async setEndpointEnforcing(id) {
      const row = state.endpoints.find((e) => e.id === id);
      row.state = 'ENFORCING';
      return { ...row };
    },
    async insertSample(s) {
      state.samples.push(s);
    },
    async getSampleBodies(endpointId, limit) {
      return state.samples
        .filter((s) => s.endpointId === endpointId)
        .slice(0, limit)
        .map((s) => s.body);
    },
    async insertSchemaVersion(v) {
      state.versions.push(v);
      return v;
    },
    async getBaselineSchemaVersion(endpointId) {
      return state.versions.find((v) => v.endpointId === endpointId && v.isBaseline) || null;
    },
    async getMaxSchemaVersion(endpointId) {
      return state.versions
        .filter((v) => v.endpointId === endpointId)
        .reduce((m, v) => Math.max(m, v.version), 0);
    },
    async upsertViolation({ endpointId, severity, kind, fieldPath, summary, detail }) {
      const open = state.violations.find(
        (v) =>
          v.endpointId === endpointId &&
          v.severity === severity &&
          v.kind === kind &&
          v.fieldPath === fieldPath &&
          v.status === 'open'
      );
      if (open) {
        open.occurrenceCount += 1;
        return { created: false };
      }
      state.violations.push({
        endpointId,
        severity,
        kind,
        fieldPath,
        summary,
        detail,
        status: 'open',
        occurrenceCount: 1,
      });
      return { created: true };
    },
  };
}

const sample = (overrides = {}) => ({
  v: 1,
  service: 'demo',
  method: 'GET',
  path: '/users/{id}',
  status: 200,
  durationMs: 12,
  proxyMs: 3,
  sampledAt: Date.now(),
  body: { id: 7, name: 'widget' },
  ...overrides,
});

test('stores the sample and creates the endpoint on first sight', async () => {
  const db = fakeDb();
  const endpoint = await ingestSample(db, sample());
  assert.equal(endpoint.state, 'LEARNING');
  assert.equal(endpoint.sample_count, 1);
  assert.equal(db.state.endpoints.length, 1);
  assert.equal(db.state.samples.length, 1);
  assert.equal(db.state.samples[0].status, 200);
});

test('reuses the endpoint on repeat samples', async () => {
  const db = fakeDb();
  await ingestSample(db, sample());
  await ingestSample(db, sample());
  assert.equal(db.state.endpoints.length, 1);
  assert.equal(db.state.samples.length, 2);
});

test('100th sample promotes to ENFORCING and stores the baseline', async () => {
  const db = fakeDb();
  let endpoint;
  for (let i = 0; i < 100; i++) {
    endpoint = await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  assert.equal(endpoint.state, 'ENFORCING');
  assert.equal(db.state.versions.length, 1);
  const baseline = db.state.versions[0];
  assert.equal(baseline.version, 1);
  assert.equal(baseline.isBaseline, true);
  assert.equal(baseline.source, 'learning');
  assert.equal(baseline.schema.properties.id.type, 'integer');
  assert.equal(baseline.schema.seen, 100);
});

test('no baseline is stored before the 100th sample', async () => {
  const db = fakeDb();
  for (let i = 0; i < 99; i++) await ingestSample(db, sample());
  assert.equal(db.state.versions.length, 0);
});

test('unknown service is a validation error, nothing stored', async () => {
  const db = fakeDb();
  await assert.rejects(ingestSample(db, sample({ service: 'nope' })), ValidationError);
  assert.equal(db.state.samples.length, 0);
});

test('validateSample rejects malformed payloads', () => {
  for (const bad of [
    null,
    { v: 1 },
    sample({ service: '' }),
    sample({ v: 2 }),
    sample({ method: 'BREW' }),
    sample({ path: 'users' }),
    sample({ status: 99 }),
    sample({ durationMs: -1 }),
    sample({ body: 'not-json' }),
    sample({ body: { data: 'x'.repeat(33 * 1024) } }),
  ]) {
    assert.throws(() => validateSample(bad), ValidationError, JSON.stringify(bad));
  }
});

test('validateSample accepts bodies up to the size bound', () => {
  const ok = validateSample(sample({ body: { data: 'x'.repeat(32 * 1024 - 20) } }));
  assert.ok(ok);
});

test('breaking diff on an enforcing sample records a violation and snapshots the drift', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  assert.equal(db.state.violations.length, 0);

  await ingestSample(db, sample({ body: { name: 'w' } }));
  assert.equal(db.state.violations.length, 1);
  const v = db.state.violations[0];
  assert.equal(v.severity, 'breaking');
  assert.equal(v.kind, 'removed_field');
  assert.equal(v.fieldPath, 'id');
  assert.equal(v.occurrenceCount, 1);
  assert.equal(db.state.versions.length, 2);
  const drift = db.state.versions[1];
  assert.equal(drift.version, 2);
  assert.equal(drift.isBaseline, false);
  assert.equal(drift.source, 'detected');

  // Same break again: bumps the count, no new version row.
  await ingestSample(db, sample({ body: { name: 'w' } }));
  assert.equal(db.state.violations.length, 1);
  assert.equal(db.state.violations[0].occurrenceCount, 2);
  assert.equal(db.state.versions.length, 2);
});

test('learning samples are never analyzed', async () => {
  const db = fakeDb();
  for (let i = 0; i < 50; i++) {
    await ingestSample(db, sample({ body: { id: i } }));
  }
  await ingestSample(db, sample({ body: {} }));
  assert.equal(db.state.violations.length, 0);
  assert.equal(db.state.versions.length, 0);
});

test('non-2xx samples are not analyzed', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i } }));
  }
  await ingestSample(db, sample({ status: 500, body: { error: 'boom' } }));
  assert.equal(db.state.violations.length, 0);
  assert.equal(db.state.versions.length, 1);
});

test('truncated bodies are not analyzed', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  await ingestSample(db, sample({ body: { name: 'w' }, bodyTruncated: true }));
  assert.equal(db.state.violations.length, 0);
  assert.equal(db.state.versions.length, 1);
});

test('promotion is idempotent when a baseline already exists', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  assert.equal(db.state.versions.length, 1);
  // A concurrent sample can still observe the pre-promotion row: the
  // existing baseline must not be duplicated.
  const ep = db.state.endpoints[0];
  ep.state = 'LEARNING';
  ep.sample_count = 99;
  const out = await ingestSample(db, sample({ body: { id: 101, name: 'w' } }));
  assert.equal(out.state, 'ENFORCING');
  assert.equal(db.state.versions.length, 1);
});

test('a lost baseline promotion race does not drop the sample', async () => {
  const db = fakeDb();
  // Simulate two samples observing the 100th sample at once: the first
  // insert wins, the second gets a 409 from the unique (endpoint, version)
  // index and must still promote and store its sample.
  let calls = 0;
  const realInsert = db.insertSchemaVersion.bind(db);
  db.insertSchemaVersion = async (v) => {
    calls += 1;
    if (v.isBaseline && calls === 1) throw new Error('supabase 409: duplicate key');
    return realInsert(v);
  };
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  assert.equal(db.state.versions.length, 0);
  const ep = db.state.endpoints[0];
  assert.equal(ep.state, 'ENFORCING');
  assert.equal(db.state.samples.length, 100);
});

test('a concurrent drift snapshot recomputes its version instead of failing', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  // Another sample's drift snapshot lands first, so our computed version
  // collides: the retry must recompute and store ours under a fresh version.
  let calls = 0;
  const realInsert = db.insertSchemaVersion.bind(db);
  db.insertSchemaVersion = async (v) => {
    calls += 1;
    if (!v.isBaseline && calls === 1) {
      await realInsert({ ...v, version: v.version });
      throw new Error('supabase 409: duplicate key');
    }
    return realInsert(v);
  };
  await ingestSample(db, sample({ body: { name: 'w' } }));
  const versions = db.state.versions.map((v) => v.version).sort((a, b) => a - b);
  assert.deepEqual(versions, [1, 2, 3]);
  assert.equal(db.state.violations.length, 1);
});

test('a concurrent violation upsert is retried instead of dropping the sample', async () => {
  const db = fakeDb();
  for (let i = 0; i < 100; i++) {
    await ingestSample(db, sample({ body: { id: i, name: 'w' } }));
  }
  // The open-row dedupe index 409s the loser; the retry finds the open
  // row and bumps its occurrence count.
  let calls = 0;
  const realUpsert = db.upsertViolation.bind(db);
  db.upsertViolation = async (u) => {
    calls += 1;
    if (calls === 1) {
      await realUpsert(u);
      throw new Error('supabase 409: duplicate key');
    }
    return realUpsert(u);
  };
  await ingestSample(db, sample({ body: { name: 'w' } }));
  assert.equal(db.state.violations.length, 1);
  assert.equal(db.state.violations[0].occurrenceCount, 2);
  assert.equal(db.state.samples.length, 101);
});
