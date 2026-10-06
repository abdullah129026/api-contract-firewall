// Breaking-change detection: diff one observed response shape against the
// enforced baseline schema.
//
// Both arguments are schema nodes from lib/schema.js. The baseline carries
// per-field seen/total confidence; the observed schema is inferred from a
// single new sample. Returns violations:
//   { severity, kind, path, summary, detail }
//
// Rules (from the plan):
// - removed required field (seen in >=99% of baseline samples): breaking
// - type changed: breaking, except null never changes a type; an empty-array
//   baseline raises nothing until an element type is observed; union
//   baselines are recorded as-is and never flag new types
// - null observed on a non-nullable field: breaking (nullability changed)
// - removed + added with the same type in one sample: warning "possibly
//   renamed", never breaking (same-type churn is a false-positive factory)
// - new fields, absent optional fields, empty arrays: no violation

'use strict';

const REQUIRED_RATIO = 0.99;

function asTypes(node) {
  return Array.isArray(node.type) ? node.type : [node.type];
}

// A baseline field counts as required when it showed up in >=99% of samples.
function isRequired(field) {
  return field.seen / field.total >= REQUIRED_RATIO;
}

function singleType(node) {
  return Array.isArray(node.type) ? null : node.type;
}

// Diff two schema nodes; pushes violations into out.
function diffField(path, b, o, out) {
  const bTypes = asTypes(b);
  const oTypes = asTypes(o);

  // Every observed value was null (inferSchema gives type [] for that): a
  // null never changes a type. On an already-nullable field it is expected;
  // on a non-nullable field it is a nullability break.
  if (oTypes.length === 0) {
    if (!b.nullable) {
      out.push({
        severity: 'breaking',
        kind: 'nullability_changed',
        path,
        summary: `field '${path}' is now nullable (null observed, baseline had none in ${b.total} samples)`,
        detail: { total: b.total },
      });
    }
    return;
  }
  // Observed schemas come from a single sample, so they are single-typed.
  const oType = oTypes[0];

  // 'unknown' means no type information yet: an empty-array baseline learns
  // its element type from the first non-empty sample, and an empty observed
  // array says nothing. Neither is a violation.
  if (oType === 'unknown') return;
  if (bTypes.length === 1 && bTypes[0] === 'unknown') return;

  // Union baselines are recorded as-is; only single-type fields flag changes.
  if (bTypes.length > 1) return;

  if (bTypes[0] !== oType) {
    out.push({
      severity: 'breaking',
      kind: 'type_changed',
      path,
      summary: `field '${path}' type changed: ${bTypes[0]} -> ${oType}`,
      detail: { before: bTypes[0], after: oType },
    });
    return;
  }

  // Same type: recurse into structure.
  if (bTypes[0] === 'object' && b.properties && o.properties) {
    diffObject(path, b.properties, o.properties, out, true);
  } else if (bTypes[0] === 'array' && b.items && o.items) {
    diffItems(path, b.items, o.items, out);
  }
}

// Array item shapes.
function diffItems(path, ib, io, out) {
  const itemPath = `${path}[]`;
  const ibTypes = asTypes(ib);
  const ioTypes = asTypes(io);
  // No type information on the observed side (empty array, or all nulls):
  // not a violation. Same for an empty-array baseline learning its type.
  if (ioTypes.length === 0 || ioTypes[0] === 'unknown') return;
  if (ibTypes.length === 1 && ibTypes[0] === 'unknown') return;
  if (ibTypes.length > 1) return;
  const ioType = ioTypes[0];
  if (ibTypes[0] !== ioType) {
    out.push({
      severity: 'breaking',
      kind: 'type_changed',
      path: itemPath,
      summary: `items of '${path}' type changed: ${ibTypes[0]} -> ${ioType}`,
      detail: { before: ibTypes[0], after: ioType },
    });
    return;
  }
  if (ibTypes[0] === 'object' && ib.properties && io.properties) {
    // ponytail: item properties carry no seen/total, so a field missing
    // inside array items is not assessed. Ceiling: track per-element
    // presence in inferSchema, then reuse isRequired here.
    diffObject(itemPath, ib.properties, io.properties, out, false);
  }
}

// Walk the properties of two object schemas. Removal candidates are paired
// with same-type added fields (rename heuristic) before anything is emitted.
function diffObject(prefix, bProps, oProps, out, assessRemovals) {
  const removed = [];
  const added = [];

  for (const key of Object.keys(bProps)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const b = bProps[key];
    const o = oProps[key];
    if (o === undefined) {
      if (assessRemovals && isRequired(b)) {
        removed.push({
          path,
          baselineType: singleType(b),
          seen: b.seen,
          total: b.total,
        });
      }
      continue;
    }
    diffField(path, b, o, out);
  }

  for (const key of Object.keys(oProps)) {
    if (!Object.prototype.hasOwnProperty.call(bProps, key)) {
      added.push({ key, type: oProps[key].type });
    }
  }

  const used = new Set();
  for (const r of removed) {
    const match =
      typeof r.baselineType === 'string'
        ? added.find((a) => !used.has(a.key) && a.type === r.baselineType)
        : undefined;
    if (match) {
      used.add(match.key);
      out.push({
        severity: 'warning',
        kind: 'renamed',
        path: r.path,
        summary: `field '${r.path}' removed, possibly renamed to '${match.key}' (same type ${r.baselineType})`,
        detail: { seen: r.seen, total: r.total, renamedTo: match.key },
      });
    } else {
      out.push({
        severity: 'breaking',
        kind: 'removed_field',
        path: r.path,
        summary: `field '${r.path}' removed (was required, seen in ${r.seen}/${r.total} baseline samples)`,
        detail: { seen: r.seen, total: r.total },
      });
    }
  }
  // Added fields never violate on their own (new-optional is not a break).
}

export function diffSchemas(baseline, observed) {
  const out = [];
  if (baseline.properties || observed.properties) {
    diffObject('', baseline.properties || {}, observed.properties || {}, out, true);
  } else {
    diffField('(body)', baseline, observed, out);
  }
  return out;
}
