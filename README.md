# API Contract Firewall

Contract testing without writing contracts. Point your API traffic at the proxy;
it learns your API's real contract from observed traffic, alerts on drift, and
blocks deploys that would break it.

**Status:** build in progress (sprint 2026-10-02 → 2026-10-16). See
[PLAN.md](PLAN.md) for milestones, [RESEARCH.md](RESEARCH.md) for background.

## Architecture

```
client ──(x-api-key)──► ┌──────────────┐ ──► origin API
                        │ proxy        │     (user's)
                        │ Cloudflare   │
                        │ Workers      │
                        └──────┬───────┘
                               │ waitUntil: POST /api/ingest  (next milestone)
                               ▼
┌──────────────┐       ┌──────────────┐      ┌──────────────┐
│  dashboard   │◄─────►│  analyzer    │◄────►│  Postgres    │
│  Next.js on  │       │  (scheduled) │      │  (Supabase)  │
│  Vercel      │       │              │      │              │
└──────────────┘       └──────────────┘      └──────────────┘
```

- `proxy/` — Cloudflare Worker forward proxy. Validates `x-api-key`, forwards
  to the registered origin, returns `x-acf-proxy-ms` overhead (<10ms budget).
- `origin/` — tiny demo API (`/users`, `/orders`) with a scripted breaking
  change (`scripts/flip-id.js`) so anyone can try the product end to end.
- `dashboard/` — Next.js 16 UI: service overview, triage stream, endpoint
  detail with schema timeline, CI gate screen.
- `supabase/` — schema + migrations (run in the Supabase SQL editor).
- `scripts/e2e-demo.mjs` — scripted demo against a deployed stack:
  register -> baseline -> enforcing -> break -> violation -> blocked gate ->
  approve -> new baseline -> pass.

## Quickstart (local)

```bash
# 1. demo origin
cd origin && npm install && node server.js          # :3001

# 2. proxy tests
cd ../proxy && npm test

# 3. proxy against the live origin (measures forwarding + overhead)
node test/e2e-local.mjs   # needs SERVICES_JSON mapping key -> origin :3001

# 4. simulate the silent breaking change
cd ../origin
node scripts/flip-id.js --break
BREAK_CONTRACT=1 node server.js                     # id -> _id in all responses
```

## Deploy (free tiers)

Both pieces deploy from this repo. The one secret the deployer creates is
`INGEST_SECRET`: a long random string (`openssl rand -base64 32`) set as a
worker secret and as a Vercel env var, same value in both places. The proxy
signs ingest calls with it; the dashboard rejects calls without it.

**Proxy** (Cloudflare Workers): `cd proxy`, `npx wrangler login`, then
`npx wrangler secret put` for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`INGEST_URL` (`https://<dashboard>/api/ingest`), `INGEST_SECRET`, then
`npx wrangler deploy`. See `proxy/README.md` for the exact commands.

**Dashboard** (Vercel): import the repo, set the root directory to
`dashboard`, and add env vars `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`INGEST_SECRET`, and `NEXT_PUBLIC_PROXY_URL` (the worker URL). See
`dashboard/.env.example`.

Then verify the full loop with the demo origin hosted somewhere public:

```bash
DASHBOARD_URL=https://<dashboard> PROXY_URL=https://<worker> \
  DEMO_ORIGIN=https://<public-demo-origin> node scripts/e2e-demo.mjs
```

## Known limitations (MVP)

- REST/JSON only; no GraphQL, Protobuf, or non-JSON bodies.
- Assumes HTTP or TLS-terminated-before-the-proxy; no MITM TLS interception.
- Single user + per-service API keys; no teams/RBAC yet.
