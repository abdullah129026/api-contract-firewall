// Detection engine fixture suite: before/after JSON pairs diffed against the
// plan's edge-case rules. A before.json that is a single object is repeated
// to a full learning window (100 samples); an array is used as-is so a
// fixture can express partial presence (optional fields) or unions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferSchema } from '../lib/schema.js';
import { diffSchemas } from '../lib/detect.js';
import { LEARNING_SAMPLE_TARGET } from '../lib/learning.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'detect');

const read = (name, file) =>
  JSON.parse(readFileSync(join(dir, name, file), 'utf8'));

for (const name of readdirSync(dir).sort()) {
  test(`fixture: ${name}`, () => {
    let before = read(name, 'before.json');
    if (!Array.isArray(before)) {
      before = Array(LEARNING_SAMPLE_TARGET).fill(before);
    }
    const after = read(name, 'after.json');
    const expected = read(name, 'expected.json');

    const diffs = diffSchemas(inferSchema(before), inferSchema([after]));

    assert.equal(
      diffs.length,
      expected.violations.length,
      `expected ${expected.violations.length} violations, got ${diffs.length}: ` +
        JSON.stringify(diffs, null, 2)
    );
    for (const [i, e] of expected.violations.entries()) {
      const d = diffs[i];
      assert.equal(d.severity, e.severity, `violation ${i} severity`);
      assert.equal(d.kind, e.kind, `violation ${i} kind`);
      assert.equal(d.path, e.path, `violation ${i} path`);
      assert.ok(d.summary && d.summary.length > 0, `violation ${i} summary`);
      for (const [k, v] of Object.entries(e.detail || {})) {
        assert.deepEqual(d.detail[k], v, `violation ${i} detail.${k}`);
      }
    }
  });
}

test('rename is a warning even though a required field vanished', () => {
  const diffs = diffSchemas(
    inferSchema(Array(100).fill({ id: 1 })),
    inferSchema([{ _id: 1 }])
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, 'warning');
  assert.ok(!diffs.some((d) => d.severity === 'breaking'));
});
