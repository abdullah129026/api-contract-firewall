// Infer a JSON schema from masked response bodies (one per sampled request).
//
// Output is a plain JSON tree. Every object property carries `seen` and
// `total` (seen in x of y samples) so the UI can show per-field confidence.
// Rules (from the plan): null never changes a type, it only marks nullable;
// an empty array infers array<unknown> and raises no violations until a type
// is observed; union types are recorded as-is; a key being absent and a key
// being null are different facts (absent lowers confidence, null sets
// nullable).

'use strict';

export function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'object') return 'object';
  return 'unknown';
}

// Merge an array of inferred child nodes into one node.
function inferNode(values) {
  const nonNull = values.filter((v) => v !== null);
  const types = [...new Set(nonNull.map(typeOf))];
  const node = {
    type: types.length === 1 ? types[0] : types,
    nullable: nonNull.length < values.length,
  };

  if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))) {
    const objects = nonNull.filter((v) => typeOf(v) === 'object');
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    node.properties = {};
    for (const key of keys) {
      const present = objects.filter((o) => Object.prototype.hasOwnProperty.call(o, key));
      const child = inferNode(present.map((o) => o[key]));
      child.seen = present.length;
      child.total = objects.length;
      node.properties[key] = child;
    }
  }

  if (node.type === 'array' || (Array.isArray(node.type) && node.type.includes('array'))) {
    const items = nonNull.filter((v) => typeOf(v) === 'array').flatMap((a) => a);
    // No elements seen yet: unknown item type, no violations until one is.
    node.items = items.length === 0 ? { type: 'unknown' } : inferNode(items);
  }

  return node;
}

// bodies: array of JSON values (already PII-masked by the proxy).
// Returns the root schema node; root.seen/total equal the sample count.
export function inferSchema(bodies) {
  const root = inferNode(bodies);
  root.seen = bodies.length;
  root.total = bodies.length;
  return root;
}

// Flatten a schema tree to rows the UI can render:
// [{ path: 'user.id', type: 'integer', nullable: false, seen: 98, total: 100 }]
export function flattenSchema(node, prefix = '') {
  const rows = [];
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      rows.push({
        path,
        type: child.type,
        nullable: child.nullable,
        seen: child.seen,
        total: child.total,
      });
      rows.push(...flattenSchema(child, path));
    }
  }
  if (node.items && node.items.properties) {
    rows.push(...flattenSchema(node.items, `${prefix}[]`));
  }
  return rows;
}
