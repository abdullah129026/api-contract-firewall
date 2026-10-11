# API Contract Firewall — forward proxy (Cloudflare Workers)

Scaffold of the inline proxy. Forwards dev traffic to the registered origin
after validating the `x-api-key` header. Capture, masking, and learning ship
in the next milestone; this module keeps the hot path fast and testable.

## Contract

- Request must carry `x-api-key`. Missing/invalid key → `401` JSON with a terse hint.
- Validated keys are cached in-Worker for 60s (per PLAN §3).
- Origin unreachable → `502` JSON. Proxy-internal errors never alter the
  user's request beyond these two well-defined errors.
- Proxied responses carry `x-acf-proxy-ms` (proxy overhead; budget <10ms).

## Service registry (milestone 1)

`SERVICES_JSON` secret: `{"<api-key>":{"origin":"http://…","name":"billing"}}`.
Milestone 2 replaces the lookup with a cached Supabase REST query.

## Local dev

```bash
npm test
```

## Deploy (Cloudflare Workers, free tier)

`wrangler.json` holds the non-secret config. The four secrets are set once
on the worker; they never go in the repo. `INGEST_SECRET` is the shared
bearer secret the dashboard also knows (the deployer generates it with
`openssl rand -base64 32` and sets the same value in both places).

```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY   # Supabase service_role key
npx wrangler secret put INGEST_URL             # https://<dashboard>/api/ingest
npx wrangler secret put INGEST_SECRET
npx wrangler deploy
```

Normal result: `Deployed acf-proxy to https://acf-proxy.<subdomain>.workers.dev`.
Hitting it with no key returns a 401 JSON; that is the expected response.
`SERVICES_JSON` is a local-dev fallback only (see `.dev.vars.example`); the
deployed worker looks keys up in the Supabase `api_keys` table.
