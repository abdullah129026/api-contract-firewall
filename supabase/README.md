# Supabase setup

The dashboard and the proxy both talk to Postgres through the Supabase
PostgREST API. You need one free Supabase project.

## One-time setup (Abdullah, ~5 minutes)

1. Go to https://supabase.com and create a free project (any name, any region).
2. Open the SQL editor and run `schema.sql` from this directory.
3. Project Settings → API: copy the **Project URL** and the **service_role**
   key (not the anon key).

## Environment variables

Dashboard (Vercel, or `.env.local` for local dev):

- `SUPABASE_URL` — the Project URL
- `SUPABASE_SERVICE_KEY` — the service_role key
- `INGEST_SECRET` — any long random string; the proxy and the dashboard
  must share it (the proxy sends it as a bearer token on every ingest call)

Proxy (Cloudflare Worker secrets):

- `SUPABASE_URL` — same Project URL
- `SUPABASE_SERVICE_KEY` — same service_role key
- `INGEST_URL` — the dashboard's `/api/ingest` URL
- `INGEST_SECRET` — same value as the dashboard's

Without `SUPABASE_URL` on the Worker, key validation falls back to the
`SERVICES_JSON` secret (local dev only).

## Migrations

`schema.sql` is the full schema for new projects. If you already ran it
before, apply the files in `migrations/` in order instead (SQL editor,
one file at a time):

- `0002_violations.sql` — violations table for the detection engine.
