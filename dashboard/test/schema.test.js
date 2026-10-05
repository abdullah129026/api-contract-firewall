// Schema inference tests. Fixtures double as the documented edge cases:
// absent-vs-null, empty arrays, unions, type changes across samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeOf, inferSchema, flattenSchema } from '../lib/schema.js';

test('infers object field types with per-field confidence', () => {
  const bodies = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: 'widget',
    ...(i < 98 ? { sku: 'a-1' } : {}),
  }));
  const schema = inferSchema(bodies);
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.id.type, 'integer');
  assert.deepEqual([schema.properties.id.seen, schema.properties.id.total], [100, 100]);
  assert.deepEqual([schema.properties.sku.seen, schema.properties.sku.total], [98, 100]);
  assert.equal(schema.properties.sku.nullable, false);
});

test('null marks nullable, never changes the type', () => {
  const schema = inferSchema([{ a: 1 }, { a: null }, { a: 2 }]);
  assert.equal(schema.properties.a.type, 'integer');
  assert.equal(schema.properties.a.nullable, true);
});

test('absent key is low confidence, not nullable', () => {
  const schema = inferSchema([{ a: 1 }, {}, {}]);
  const a = schema.properties.a;
  assert.equal(a.seen, 1);
  assert.equal(a.total, 3);
  assert.equal(a.nullable, false, 'absent is not null');
});

test('empty array infers array<unknown>', () => {
  const schema = inferSchema([{ tags: [] }, { tags: [] }]);
  assert.equal(schema.properties.tags.type, 'array');
  assert.equal(schema.properties.tags.items.type, 'unknown');
});

test('array item types merge across samples', () => {
  const schema = inferSchema([{ tags: ['a'] }, { tags: ['b', 'c'] }, { tags: [] }]);
  assert.equal(schema.properties.tags.items.type, 'string');
});

test('union types recorded as-is', () => {
  const schema = inferSchema([{ v: 1 }, { v: 'x' }]);
  assert.deepEqual(schema.properties.v.type, ['integer', 'string']);
});

test('nested objects recurse with their own counts', () => {
  const schema = inferSchema([{ user: { id: 1, email: 'a@b' } }, { user: { id: 2 } }]);
  const user = schema.properties.user;
  assert.equal(user.type, 'object');
  assert.deepEqual([user.properties.id.seen, user.properties.id.total], [2, 2]);
  assert.deepEqual([user.properties.email.seen, user.properties.email.total], [1, 2]);
});

test('integer vs float stay distinct', () => {
  const ints = inferSchema([{ n: 3 }]);
  const floats = inferSchema([{ n: 3.5 }]);
  assert.equal(ints.properties.n.type, 'integer');
  assert.equal(floats.properties.n.type, 'number');
});

test('all-null field infers no type, stays nullable', () => {
  const schema = inferSchema([{ a: null }, { a: null }]);
  assert.deepEqual(schema.properties.a.type, []);
  assert.equal(schema.properties.a.nullable, true);
});

test('flattenSchema gives one row per field with dotted paths', () => {
  const schema = inferSchema([{ user: { id: 1 } }, { user: {} }]);
  const rows = flattenSchema(schema);
  const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));
  assert.ok(byPath['user']);
  assert.ok(byPath['user.id']);
  assert.equal(byPath['user.id'].seen, 1);
  assert.equal(byPath['user.id'].total, 2);
});
