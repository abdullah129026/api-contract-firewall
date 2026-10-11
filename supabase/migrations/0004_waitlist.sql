-- 0004_waitlist.sql — landing page waitlist signups.
--
-- One row per email. Duplicates are rejected by the unique constraint;
-- the API translates the 409 into an "already on the list" answer, so
-- signing up twice is never an error for the user.

create table waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Explicit grant: service_role bypasses RLS but not grants, and Supabase
-- stops auto-granting on new public tables for existing projects on
-- 2026-10-30. The API only inserts; nothing reads this table yet.
-- Never GRANT ALL to anon or authenticated.
grant insert on public.waitlist to service_role;
