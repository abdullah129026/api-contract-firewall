-- API Contract Firewall — Postgres schema (Supabase, free tier).
--
-- Apply it in the Supabase dashboard: SQL editor → paste this file → run.
-- Everything talks to Postgres through the service_role key (Worker secret
-- and dashboard env var). No client ever connects directly, so there are
-- no RLS policies; the service_role key bypasses RLS anyway.

-- One row per API the user points at the proxy.
create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin text not null,
  created_at timestamptz not null default now()
);

-- API keys. Only the sha256 hash is stored; the plaintext key is shown
-- once at issuance and never again.
create table api_keys (
  key_hash text primary key,
  service_id uuid not null references services(id) on delete cascade,
  label text not null default 'default',
  created_at timestamptz not null default now()
);
create index api_keys_service_id_idx on api_keys(service_id);

-- One row per (service, method, path template). Holds the learning state:
-- LEARNING until 100 samples or a human confirms the contract, then
-- ENFORCING. Breaking violations are only emitted while ENFORCING.
create table endpoints (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  method text not null,
  path_template text not null,
  state text not null default 'LEARNING'
    check (state in ('LEARNING', 'ENFORCING')),
  sample_count integer not null default 0,
  human_confirmed boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (service_id, method, path_template)
);
create index endpoints_service_id_idx on endpoints(service_id);

-- Masked samples shipped by the proxy. Short retention (7 days); the
-- analyzer tick deletes older rows. Bodies are already PII-masked by the
-- proxy before they arrive here.
create table samples (
  id bigint generated always as identity primary key,
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  status integer not null,
  duration_ms integer not null,
  proxy_ms integer not null,
  body jsonb,
  body_truncated boolean not null default false,
  sampled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index samples_endpoint_id_sampled_at_idx on samples(endpoint_id, sampled_at desc);

-- Learned schemas. A new row is created only when the endpoint transitions
-- to ENFORCING (version 1, marked as the baseline) or on a confirmed
-- breaking/warning diff or human approve. Never on raw sample variance.
create table schema_versions (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  version integer not null,
  schema jsonb not null,
  is_baseline boolean not null default false,
  source text not null default 'learning'
    check (source in ('learning', 'human')),
  created_at timestamptz not null default now(),
  unique (endpoint_id, version)
);
create index schema_versions_endpoint_id_idx on schema_versions(endpoint_id);
