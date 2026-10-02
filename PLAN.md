# PLAN.md — API Contract Firewall

**Repo:** `abdullah129026/api-contract-firewall`
**Sprint:** 2026-10-02 → 2026-10-16 (deploy by end of week 2)
**One-liner:** Contract testing without writing contracts — point your traffic at the
proxy, it learns your API's real contract from observed traffic, alerts on drift,
and blocks deploys that would break it.

Derived from `RESEARCH.md` (2026-10-02). **Reviewed 2026-10-02** by separate
architecture and UI/UX reviewer agents; their blocker/major findings are
incorporated below (marked **[review]**). Stack limited to Abdullah's known stack.

---

## 1. Problem

Frontend breaks because the backend silently renamed `id` → `_id` and nobody told
anyone. Uptime monitors see HTTP 200 and stay green. Existing answers (Pact,
oasdiff, Checkly) all require authored specs/tests/probes — the authoring friction
is exactly why teams abandon them. Nothing derives the contract from live traffic
and guards it continuously.

## 2. MVP scope (what ships Oct 16)

**In scope:**

1. **Forward proxy** — devs point their API base URL at the proxy. Forwards
   requests, captures method + path + status + JSON body shapes + timings.
   Hot path stays fast: key validation is cached, capture ships async via
   `waitUntil` after the response is returned. Never block a proxied response
   on analysis or storage.
2. **Contract learning** — per endpoint (method + path template), infer a JSON
   schema from sampled responses. Endpoints live in explicit states:
   **LEARNING** (first 100 samples, or until a human clicks "confirm contract")
   → **ENFORCING**. No breaking violations are emitted during LEARNING; the
   dashboard shows "learning 37/100". **[review]**
3. **Breaking-change detection** — field removed, type changed, required-ness
   flipped (required = present in ≥99% of baseline samples; `null` observed =
   nullable, never "type changed to null"). Rename heuristic (removed + added,
   same type, same window) is demoted to **warning** severity with a "possibly
   renamed" hint — never breaking — because same-type field churn causes false
   positives. **[review]**
4. **Schema drift timeline** — per endpoint, list of schema versions with the
   enforced baseline distinctly marked ("v3 · enforced baseline"). A new version
   is created only on a confirmed breaking/warning diff or human approve —
   never on raw sample variance. **[review]**
5. **Violation stream dashboard** — triage view (not the home page): severity
   badge, endpoint, change summary, trend, "last seen", filters (severity,
   endpoint, time range) + text search; row actions: approve (undo toast →
   becomes new baseline), mark false positive. **[review]**
6. **CI deploy gate** — `GET /api/gate?service=<id>` served from the **Next.js
   API routes on Vercel** (always-on serverless; a gate that 500s blocks deploys
   spuriously, so it must not live on the proxy). Returns pass/fail from
   un-triaged breaking violations. Dashboard `/gate` screen shows the status
   pill, copyable GitHub Actions snippet, and evaluation history
   (time, commit, pass/fail, link to blocking violation). **[review]**
7. **Latency tracking** — p50/p95 per endpoint computed in the analyzer tick
   from short-retention raw timings (no separate bucket table for v1).
   Regression badge in the endpoint table row beside the p95 sparkline when p95
   drifts >2x baseline; regressions also surface as warning items in the
   violation stream. **[review]**
8. **PII masking (day one)** — field-name blocklist
   (`email`, `password`, `token`, `ssn`, `phone`, `authorization` headers…)
   applied in the capture path **before** anything reaches the DB. Implemented
   in the capture milestone, verified by test later. Non-negotiable. **[review]**
9. **Onboarding** — under 5 minutes, screen by screen: zero-services empty state
   (with action, no decorative illustration) → new-service form → setup screen
   (proxy URL + API key + copyable curl + one-click "send test request" +
   live "last request seen Xs ago" indicator) → learning state
   ("observing… N/100 requests, baseline forming") → first contract ready.
   Error states specified: origin unreachable, bad API key, analyzer lag →
   "data delayed" banner. **[review]**

**Out of scope for MVP (documented, not built):**
- TLS-intercepting proxy (MITM). v1 assumes HTTP services or TLS terminated
  before the proxy (dev/staging topology); documented as a limitation.
- Slack/Discord/email alerting (violations visible in dashboard + gate;
  webhooks come right after MVP).
- Multi-user teams / orgs / RBAC. Single user + per-service API keys.
- GraphQL / Protobuf / non-JSON bodies (REST/JSON only).
- Auto-generated OpenAPI export.
- Advanced sampling for very high traffic (fixed rule for v1, §3).
- ⌘K command palette — deferred to post-MVP (a shallow ⌘K is worse than
  none). **[review]**

## 3. Architecture

```
  client ──(base URL pointed at proxy,
            x-api-key header)──► ┌──────────────┐ ──► origin API
                                 │ proxy        │     (user's)
                                 │ Cloudflare   │
                                 │ Workers      │
                                 └──────┬───────┘
                                        │ waitUntil: POST /api/ingest
                                        ▼
  ┌──────────────┐  cron tick   ┌──────────────┐      ┌──────────────┐
  │  dashboard   │◄────────────►│  analyzer    │◄────►│  Postgres    │
  │  Next.js on  │  API routes  │  (scheduled  │      │  (Supabase,  │
  │  Vercel      │  incl. /api/ │  route,      │      │  PgBouncer   │
  │              │  gate        │  bounded)    │      │  :6543)      │
  └──────────────┘              └──────────────┘      └──────────────┘
```

**Decisions (all [review]-locked):**

- **Proxy host: Cloudflare Workers (free tier), not Render, not Fly.io.**
  Render's free tier sleeps after ~15 min idle with 30–60s cold starts — a
  sleeping inline proxy makes the user's API *less* reliable, the opposite of
  the product promise, and the demo would visibly hang. Fly.io removed free
  allowances for new accounts in 2024 (2-hour trial, then card required), so
  it violates the free-tier-only constraint. Workers are free, never sleep,
  and `fetch()`-based forwarding is plain JavaScript. Local dev via
  wrangler/miniflare before any deploy.
- **Proxy→service attribution: `x-api-key` request header.** Validated against
  Supabase REST (service-role key as Worker secret), cached in the Worker for
  60s. Rejected keys get a 401 with a terse JSON error naming the fix.
- **Capture path:** mask PII → build sample → `waitUntil(fetch(ingest))`.
  Ingest is a Next.js API route writing to Postgres. The proxied response is
  returned before capture ships; capture failures never fail the user's
  request (counted in a dropped-sample counter).
- **Path templating (without this, learning cannot work):** segments matching
  `/^\d+$/` or UUID patterns normalize to `{id}`; everything else literal.
  Simple, documented limits. **[review]**
- **Sampling & retention (v1):** 1-in-10 requests per endpoint, plus hard cap
  of first 200/min per endpoint; raw samples retained 7 days; analyzer tick
  runs the retention DELETE. **[review]**
- **Analyzer bounds:** scheduled route (Vercel Cron; fallback: CF Worker cron
  trigger if Vercel limits bite), max K endpoints per tick, round-robin;
  inference is CPU-bounded per tick so it can't stall request handling.
  **[review]**
- **DB access:** both services connect via Supabase PgBouncer (port 6543) —
  a Node proxy plus serverless functions would otherwise exhaust free-tier
  connections. **[review]**
- **Inference edge-case rules (v1):** empty array → `array<unknown>`, no
  element-type violations until a type is observed; union types recorded as-is,
  violation only if a previously-unseen type appears on a previously
  single-type high-confidence field; `null` observed → nullable; key absent vs
  `null` are different facts; per-field confidence = seen-in-x-of-y samples.
  **[review]**

**Why this stack:** everything stays inside Abdullah's known set (Next.js,
JavaScript, Postgres). No Go, no Kafka, no ClickHouse — Postgres handles MVP
volumes; the schema keeps `samples` isolated so a columnar store can replace
it later.

## 4. UX/UI direction (from research, hardened by UI/UX review — non-negotiable)

Dark-first dev-tool dashboard. **Design tokens (locked):** surfaces
`#0a0a0a` → `#111` → `#1a1a1a`; hairline borders `rgba(255,255,255,0.08)`;
radius scale 6px/8px only; text from neutral ramp only; one accent emerald
`#3ecf8e`; semantic red/amber for breaking/warning; colored badges and dots,
never colored body text. **Bans:** gradients, shadows, emoji in UI, card grids
for dense data (tables instead), "Welcome to your dashboard" copy, decorative
illustrations in empty states, accent-color sprawl — audit every screen.
**[review]**

**Route map (locked):** **[review]**
- `/` — services overview (default landing): endpoints table per service
  (status dot, last change, p95 sparkline, request volume) + gate status pill.
  This is the home page — steady-state value is contract health, not an
  (often empty) violation stream.
- `/s/[id]` — service detail: endpoints table + gate status.
- `/s/[id]/violations` — violation stream (triage view, nav badge count).
- `/s/[id]/endpoints/[eid]` — endpoint detail: schema timeline (baseline
  marked), side-by-side JSON diff, latency panel.
- `/s/[id]/setup` — proxy URL + API key + copyable curl + test-request button
  + "last request seen" indicator.
- `/s/[id]/gate` — CI gate config, GH Actions snippet, evaluation history.

**Component inventory (build once, reuse):** SeverityBadge, ViolationRow,
FieldDiffTable (field | before | after | severity rows), SchemaTimeline,
EndpointRow (status dot + sparkline + p95), EmptyState (with action slot),
CodeBlock + CopyButton, RelativeTime ("last seen" as primary temporal
signal). **[review]**

**Trust loop screen spec:** violation detail shows field rows with confidence
%; approve → undo toast → promotes to new baseline (timeline marker moves);
endpoint view distinguishes "v3 · enforced baseline" from LEARNING/draft
state. **[review]**

**Typography:** one sans (Geist/Inter, tight tracking on display) + one mono
(JetBrains Mono, code/schemas/paths/tokens only). Max ~4 type sizes per
screen. Linear discipline: near-instant search, inline editing over modals,
undo toasts instead of confirm dialogs, empty/loading/error states designed
not defaulted. Keyboard: j/k stream navigation + shortcut list, or the
"keyboard-first" claim is dropped.

## 5. Milestones & dates

| Dates | Milestone | Done when |
|---|---|---|
| Oct 3–4 | Scaffold + **demo origin** + proxy forwards | Tiny Fastify demo origin (`/users`, `/orders`, realistic JSON) + script flipping `id`→`_id`; service creation issues API keys; Worker validates `x-api-key`, forwards, overhead measured (<10ms target) |
| Oct 5–6 | Capture + masking + learning | **PII masking in the capture path**; path templating; 1-in-10 sampling + 7-day retention; LEARNING→ENFORCING states (100 samples or human confirm); baseline schema with per-field confidence in Postgres |
| Oct 7–8 | Detection engine + **fixture suite** | Rename→warning, edge-case rules (§3); `schema_versions` only on confirmed diff/approve; fixture suite of before/after JSON pairs (removed, renamed, type-changed, null-vs-missing, new-optional→no violation) green in CI |
| Oct 9–10 | Dashboard shell | Tokens, sidebar, services overview (endpoints table), setup screen with live traffic indicator. No ⌘K |
| Oct 11–12 | Triage + detail views | Violation stream + filters/search + violation detail (confidence, approve/undo); endpoint detail (timeline with baseline marker, diff, latency) |
| Oct 13 | CI gate + latency | `/api/gate` on Next.js; `/gate` screen (snippet + eval history); p50/p95 + regression badges (stream warnings too) |
| Oct 14 | Hardening (flex day) | Masking verified by test; first-run + empty/error states; analyzer bounds verified |
| Oct 15–16 | Deploy + docs | Proxy on Workers, dashboard on Vercel, DB on Supabase; README (5-min quickstart, architecture diagram, limitations incl. TLS + sleep-free hosting note); demo: scripted break → violation → blocked gate → approve → new baseline |

**Descope order (fixed):** latency regression UI → stream filters → schema
timeline extras. Never cut: PII masking, CI gate, demo origin, fixture suite.

## 6. Deploy targets (free tiers)

- Proxy → **Cloudflare Workers** (free, no sleep) **[review]**
- Dashboard → Vercel (Next.js, hobby)
- Postgres → Supabase (free tier, via PgBouncer :6543)

## 7. Risks & mitigations (from research + review)

- **No always-on free compute in 2026** → Workers chosen deliberately; the
  README documents why Render/Fly.io were rejected. If Workers limits bite
  (CPU/egress), the fallback is a $5/mo host — flagged to Abdullah, never
  silently adopted.
- **Latency in request path** → cached key validation, async capture,
  published p95 budget; measured on day 1 of proxy work.
- **PII in captured traffic** → name-based masking before storage, in the
  capture milestone (not later).
- **Inference false positives** → warning-severity rename, human confirm
  before ENFORCING, per-field confidence visible in the UI.
- **Adoption friction (base-URL change)** → 5-min onboarding, demo origin
  included so anyone can try without touching their infra.
- **Deadline slip** → descope order fixed above; report plainly, never
  silently.

## 8. Definition of done (Oct 16)

- [ ] Public repo with real atomic commit history
- [ ] Fixture suite green in CI
- [ ] Proxy + dashboard + DB deployed on free tiers, all linked from README
- [ ] Demo: scripted breaking change → violation → blocked gate →
      approve → new baseline, end-to-end on deployed URLs
- [ ] README: what it is, 5-min quickstart, architecture diagram, limitations
      (TLS interception, REST/JSON only, single user)
- [ ] No AI-slop UI: design matches the tokens and route map in §4
