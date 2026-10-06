-- 0002_violations.sql — apply after schema.sql on existing projects.
--
-- Run in the Supabase dashboard SQL editor. New projects should apply
-- schema.sql instead (it already includes everything below).

-- Detected contract breaks. One open row per distinct change; repeat
-- sightings bump occurrence_count and last_seen_at instead of inserting.
-- Triage moves a row to approved or false_positive; a later recurrence
-- then opens a fresh row.
create table violations (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  severity text not null check (severity in ('breaking', 'warning')),
  kind text not null,
  field_path text not null,
  summary text not null,
  detail jsonb not null default '{}',
  status text not null default 'open'
    check (status in ('open', 'approved', 'false_positive')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1
);
create index violations_endpoint_id_idx on violations(endpoint_id);
create index violations_open_idx on violations(endpoint_id) where status = 'open';
create unique index violations_open_dedupe_idx
  on violations(endpoint_id, severity, kind, field_path) where status = 'open';

-- Schema versions snapshotted by the detector use source 'detected'
-- (was: learning, human).
alter table schema_versions drop constraint schema_versions_source_check;
alter table schema_versions
  add constraint schema_versions_source_check
  check (source in ('learning', 'human', 'detected'));

-- Explicit grants: service_role bypasses RLS but not grants, and Supabase
-- stops auto-granting on new public tables for existing projects on
-- 2026-10-30. Never GRANT ALL to anon or authenticated.
grant select, insert, update, delete on public.violations to service_role;
