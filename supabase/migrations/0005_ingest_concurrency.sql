-- Ingest concurrency hardening.
--
-- The proxy ships ~1-in-10 samples asynchronously, so bursts of traffic
-- produce many concurrent POSTs to /api/ingest. The old sample counter
-- was read-modify-write (select count, then patch count + 1), which loses
-- increments when requests overlap. This function bumps the counter and
-- refreshes last_seen atomically in a single statement; the dashboard
-- calls it via POST /rest/v1/rpc/bump_endpoint_sample_count.
--
-- Run in the Supabase SQL editor (same as the earlier migrations).

create or replace function public.bump_endpoint_sample_count(p_endpoint_id uuid)
returns public.endpoints
language sql
as $$
  update public.endpoints
    set sample_count = sample_count + 1,
        last_seen_at = now()
    where id = p_endpoint_id
  returning endpoints.*;
$$;

-- Minimal grant: the dashboard and proxy only ever use service_role.
-- (Supabase stopped auto-granting on new public objects for existing
-- projects on 2026-10-30; without this the RPC fails with 42501.)
grant execute on function public.bump_endpoint_sample_count(uuid) to service_role;
