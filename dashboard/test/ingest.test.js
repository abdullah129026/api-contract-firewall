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
  ]) {
    assert.throws(() => validateSample(bad), ValidationError, JSON.stringify(bad));
  }
});
