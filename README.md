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
- Dashboard + analyzer + CI gate: next milestones (see PLAN.md §5).

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

## Known limitations (MVP)

- REST/JSON only; no GraphQL, Protobuf, or non-JSON bodies.
- Assumes HTTP or TLS-terminated-before-the-proxy; no MITM TLS interception.
- Single user + per-service API keys; no teams/RBAC yet.
