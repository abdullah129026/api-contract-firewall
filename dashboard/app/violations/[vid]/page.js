// Violation detail: what changed, how confident the detector is, and
// the triage actions. Confidence comes from the baseline's per-field
// seen/total counts the detector recorded in the violation detail.
import { notFound } from 'next/navigation';
import { dbFromEnv } from '../../../lib/db.js';
import { CodeBlock, EmptyState, RelativeTime } from '../../../components/ui.js';
import TriageButtons from '../../../components/TriageButtons.js';

export const dynamic = 'force-dynamic';

// Per-kind evidence. The summary tells the story; these rows back it up
// with the numbers the detector used.
function Evidence({ violation }) {
  const d = violation.detail || {};
  const rows = [];
  if (violation.kind === 'removed_field' || violation.kind === 'renamed') {
    const ratio = d.total ? Math.round((d.seen / d.total) * 100) : null;
    rows.push(['Baseline confidence', `${d.seen}/${d.total} samples${ratio !== null ? ` (${ratio}% present)` : ''}`]);
    if (d.renamedTo) rows.push(['Possible rename to', d.renamedTo]);
  } else if (violation.kind === 'type_changed') {
    rows.push(['Was', d.before], ['Now', d.after]);
  } else if (violation.kind === 'nullability_changed') {
    rows.push(['Baseline samples', d.total]);
  }
  rows.push(['Field path', violation.field_path], ['Kind', violation.kind]);
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ViolationDetail({ params }) {
  const { vid } = await params;
  const db = dbFromEnv();
  if (!db) {
    return <EmptyState title="Database not configured" body="Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then reload." />;
  }

  const violation = await db.getViolation(vid).catch(() => null);
  if (!violation) notFound();

  const ep = violation.endpoint;
  const statusLine =
    violation.status === 'open'
      ? 'Open. The CI gate blocks deploys while it is open.'
      : violation.status === 'approved'
        ? 'Approved. The changed shape is now the enforced baseline.'
        : 'Marked as a false positive. The detector keeps watching; a recurrence opens a fresh row.';

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 8 }}>
        <a href="/violations" style={{ color: 'inherit' }}>
          Violations
        </a>
        {' / '}
        <span className="mono">{violation.id.slice(0, 8)}</span>
      </p>
      <h1 className="page-title mono" style={{ fontSize: 17 }}>
        {violation.summary}
      </h1>
      <p className="page-sub">
        <span className={`pill ${violation.severity === 'breaking' ? 'pill-block' : 'pill-warn'}`} style={{ marginRight: 8 }}>
          {violation.severity}
        </span>
        <a href={`/s/${ep.service.id}/e/${ep.id}`} style={{ color: 'inherit' }}>
          <span className="method">{ep.method}</span>
          {ep.path_template}
        </a>
        {' · '}
        {ep.service.name}
      </p>

      <div className="panel">
        <h3>Status</h3>
        <p>{statusLine}</p>
        <TriageButtons violationId={violation.id} status={violation.status} />
      </div>

      <h3 className="section-title">Evidence</h3>
      <Evidence violation={violation} />

      <h3 className="section-title">Occurrences</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Seen {violation.occurrence_count} time{violation.occurrence_count === 1 ? '' : 's'} ·
        first <RelativeTime at={violation.first_seen_at} /> · last{' '}
        <RelativeTime at={violation.last_seen_at} />
      </p>

      <h3 className="section-title">Raw detail</h3>
      <CodeBlock code={JSON.stringify(violation.detail || {}, null, 2)} />
    </>
  );
}
