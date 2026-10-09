-- 0003_gate_evaluations.sql — apply after 0002 on existing projects.
--
-- Every call to GET /api/gate (the CI gate) appends one row: which service
-- was checked, whether the gate passed or was blocked, and how many open
-- breaking violations decided it. The gate screen renders these as the
-- evaluation history.

create table gate_evaluations (
  id bigint generated always as identity primary key,
  service_id uuid not null references services(id) on delete cascade,
  decision text not null check (decision in ('pass', 'blocked')),
  open_breaking integer not null default 0,
  evaluated_at timestamptz not null default now()
);
create index gate_evaluations_service_idx on gate_evaluations(service_id, evaluated_at desc);

-- Explicit grant: service_role bypasses RLS but not grants, and Supabase
-- stops auto-granting on new public tables for existing projects on
-- 2026-10-30. Never GRANT ALL to anon or authenticated.
grant select, insert, update, delete on public.gate_evaluations to service_role;
