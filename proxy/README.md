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

## Deploy (later milestone)

```bash
npx wrangler deploy --var SERVICES_JSON:'{"key":{"origin":"https://…"}}'
```
