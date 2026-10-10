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
    async getEndpoint(serviceId, method, pathTemplate) {
      return (
        state.endpoints.find(
          (e) => e.service_id === serviceId && e.method === method && e.path_template === pathTemplate
        ) || null
      );
    },
    async createEndpoint({ serviceId, method, pathTemplate }) {
      const row = {
        id: `ep-${state.endpoints.length}`,
        service_id: serviceId,
        method,
        path_template: pathTemplate,
        state: 'LEARNING',
        sample_count: 0,
        human_confirmed: false,
      };
      state.endpoints.push(row);
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
