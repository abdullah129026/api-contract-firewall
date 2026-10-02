# RESEARCH.md — API Contract Firewall

**Product:** A proxy service devs route API traffic through. It auto-detects breaking
contract changes (renamed/removed fields, type changes), tracks schema drift over time
and response-time regression, and can block deploys on contract breaks via a CI gate.
**Audience:** frontend + backend teams, indie hackers, API developers.
**Researched:** 2026-10-02. All facts below are from the cited sources; anything not
verifiable is marked uncertain.

---

## 1. Problem space & demand

**Silent API contract breakage is a widely complained-about, expensive failure mode.**

- A dev.to post-mortem by UltraNews's builder documents a case where a major news API
  provider silently changed its response format and 200+ applications broke within
  hours; the author cites (unverified survey figures) that 67% of developers have hit
  unexpected breaking changes and 89% of teams have inadequate monitoring for
  third-party API changes. Uptime-style health checks miss it: a `200` tells you the
  endpoint is alive, not that the response shape is intact — "like checking if your car
  starts without verifying if the steering wheel is connected."
  (https://dev.to/mrdubey/breaking-changes-why-your-api-monitoring-is-failing-you-and-how-we-fixed-it-2ib9)
- A Sept 2026 Medium analysis argues detection is now the easy half: most teams have
  Sentry/monitors catching the loud breaks. The expensive part is investigation —
  figuring out whether you even use the field that changed, tracing which integration
  touches it — and the worst cases "don't announce themselves at all. The API still
  returns a `200`, the JSON still validates, and yet some quiet piece of business
  logic is now producing wrong numbers."
  (https://medium.com/@solovaultinfo/the-real-cost-of-an-api-change-isnt-the-alert-707dc79da9df)
- MadeTech's architecture handbook frames the cost as: production incidents from
  downstream failures, manual coordination ("Did you change the User schema?" on
  Slack), rollbacks/hotfixes, and lost trust between teams.
  (https://github.com/madetech/architecture-handbook/blob/HEAD/learning_paths/ai/04-governance-automation/integration-contracts.md)
- A Medium post-mortem (CodexLab, Jan 2026) of a breaking API versioning incident puts
  concrete numbers on one case: $47K lost revenue, 400 hours of support overhead,
  and a backend dev quitting from firefighting burnout. Take as anecdotal, not a
  representative stat.
  (https://medium.com/@codexlab/we-versioned-our-api-wrong-breaking-changes-hit-10-000-users-d381932945c4)
- **Pact friction evidence:** a real ADR (digitalservicebund/ris-search, Dec 2025)
  documents a team *removing* Pact contract testing: maintaining consumer+provider
  Pact tests created friction, git hooks and file generation overhead, "complexity
  … without proportional benefit"; they fell back to Playwright E2E.
  (https://github.com/digitalservicebund/ris-search/blob/HEAD/doc/adr/0019-remove-pact-contract-testing.md)
  This is the core opening for a proxy-based tool: teams want contract safety but
  resent writing/maintaining contract tests by hand.

**Demand read:** the pain is real and well documented; the workflow gap is that
existing answers demand upfront spec/test authoring. A tool that learns contracts from
live traffic (no hand-written contracts) sidesteps the exact friction that kills
Pact adoption.

---

## 2. Competitive landscape (2024–2026)

### Contract testing / spec diffing

- **Pact (open source) + PactFlow (SaaS broker).** Consumer-driven contract testing:
  consumers record expectations, providers replay-verify, `can-i-deploy` answers
  "will this build break a live consumer" — the closest existing analog to the CI
  gate. PactFlow pricing: Starter free (2 integrations), Team ~$115–127/mo
  (50 integrations), Enterprise custom. UX strength: the compatibility matrix and
  deployment-gating workflow. Weakness: the record-and-replay authoring model is
  heavy; teams abandon it (see ADR above). (http://pactflow.io/pricing/,
  https://github.com/juststeveking/apiguide.dev/blob/HEAD/src/content/tools/pact.md)
- **Optic — ARCHIVED (Jan 2026).** Its GitHub-hosted CLI/API-changelog tool was the
  nearest "learn API behavior from traffic" reference; last push 2026-01-08. Its
  archive leaves an explicit hole in the traffic-derived contract space.
  (https://github.com/webdevsamran/api-verity-lab/blob/HEAD/docs/competitive-analysis.md,
  https://dev.to/deepaksatyam/openapi-contract-testing-in-2026-oasdiff-vs-spectral-vs-pactflow-and-what-i-built-21an)
- **oasdiff (open source, active).** Compares two OpenAPI specs, detects 300+
  breaking-change categories, ships a GitHub Action (`oasdiff-action/breaking`) that
  fails CI on breaking changes; oasdiff.com Pro adds per-change approve/reject review.
  UX strength: CLI-native, zero signup, composes with CI in minutes. Weakness:
  **spec-to-spec only** — it compares declared specs, not what the API actually
  returns; cannot catch undocumented drift. (https://github.com/oasdiff/oasdiff/blob/HEAD/docs/README.md)
- **Spectral / vacuum (linting).** De-facto OpenAPI linters; free, bundled into
  Stoplight/Apigee/Azure API Center. CI output rots into `|| true` because it's a
  wall of warnings nobody triages. Gap: lint output has no severity triage or
  consumer-awareness. (https://dev.to/deepaksatyam/openapi-contract-testing-in-2026-oasdiff-vs-spectral-vs-pactflow-and-what-i-built-21an)
- **Schemathesis (MIT, active) / Assertible / Prism / WireMock / Karate.**
  Fuzz/property-based API testing (Schemathesis), contract + mock servers. All live
  in test-time, not in the live traffic path.
- **GraphQL Inspector / Buf.** Schema governance for GraphQL and Protobuf
  respectively — proof that per-protocol contract governance is a valued category;
  both are protocol-bound, REST/JSON is the indie volume.
- **PactFlow Bi-Directional Contract Testing** (paid-only): consumer contract vs
  provider's OpenAPI spec statically compared — low barrier, but still needs specs
  to exist. Nobody derives the contract from observed traffic.

### Traffic capture / API monitoring

- **Speedscale.** Captures production API traffic (sidecar/operator), replays it in
  sandboxes for load/regression testing, CI integration, Datadog/New Relic export.
  Founded 2020, usage-based pricing on GB ingested; proxymock CLI free. UX strength:
  production-traffic realism for replay. Gap: it's regression *testing*, not contract
  governance — no auto-derived contract, no drift alerts, no deploy gate on schema
  compatibility. (https://github.com/api-evangelist/speedscale,
  https://github.com/speedscale/docs/blob/HEAD/docs/reference/pricing-faq.md)
- **Checkly.** Playwright/TS monitoring-as-code: Hobby free (10k API check runs/mo),
  Starter $24/mo, Team $64/mo. Strength: checks live in Git, CLI deploys them,
  transparent metered pricing. Gap: synthetic probes assert what you hand-wrote;
  nothing learns the contract from traffic or diffs schemas automatically.
  (https://hyperping.com/blog/best-api-monitoring-tools,
  https://www.checklyhq.com/datadog-alternative/)
- **Postman Monitors / Assertible / Better Stack / Hyperping / Datadog Synthetics.**
  Scheduled probes + uptime + alerting. All require authored assertions; none diff
  response shapes against a learned baseline. (https://hyperping.com/blog/best-api-monitoring-tools,
  https://aitechfy.com/blog/best-api-monitoring-tools/)
- **Schema registries (Confluent/AsyncAPI):** event-schema governance; not HTTP API
  contract enforcement.

**The gap a "contract firewall" proxy fills:** everything above tests in CI against
specs, or probes production with authored assertions. Nothing sits *in the live
traffic path* continuously deriving the effective contract from observed traffic,
alerting on drift the moment it happens, and gating deploys against the *observed*
contract rather than a possibly-stale spec. Optic's archive (Jan 2026) vacated the
closest precedent. The viable wedge: "zero authoring contract safety" — deploy the
proxy, it learns, it guards.

---

## 3. 2026 UX/UI best practice for dev-tool dashboards

Studied design systems of Vercel/Geist, Linear, Sentry, Supabase, Railway-era
devtools via public design-doc captures and reviews.

### Typography
- **One sans + one mono.** Vercel's Geist system is the 2026 reference: Geist Sans
  for all UI text, Geist Mono *only* for code, file paths, shell commands, inline
  technical tokens. (Fallback stacks seen in the wild:
  `Geist, Inter, -apple-system, "Segoe UI", sans-serif`;
  `"Geist Mono", "JetBrains Mono", Menlo, Consolas, monospace`.)
  (https://github.com/dls-git/cv/blob/HEAD/vercel-design/SKILL.md,
  https://github.com/yiben633/fe_skill/blob/HEAD/ai/skills/design-systems/vercel-ship-geist-conference-ui/SKILL.md)
- Tight tracking on display type (-0.02em to -0.03em), max ~4 type sizes per screen,
  text color from a neutral ramp only — never decorative accent color on text.
- Supabase uses a humanist sans (Circular) at weight 500 display / 400 body with
  negative letter-spacing; code blocks sit on deep `#1c1c1c`.
  (https://github.com/sidhxntt/praxis/blob/HEAD/cli/templates/ui.supabase/DESIGN.md)

### Color systems (dark-first dev tools)
- **Monochrome canvas, color rationed to semantics.** Vercel: 95% black/white/grays,
  color only for success/warning/error; depth from 1px hairline borders, never drop
  shadows. Dark surfaces: `#000`→`#0a0a0a`→`#111`→`#1a1a1a` layered hierarchy.
  (https://github.com/dimabraven/design-md/blob/HEAD/examples/vercel.md)
- **One accent.** Supabase: single emerald `#3ecf8e` — reads like terminal success
  output; Linear: near-black surfaces, muted borders, a single accent; the 2026
  trend is dark-first (not a toggle) with softer near-black surfaces and restrained
  accent.
  (http://adminlte.io/blog/dark-dashboard-templates/,
  https://github.com/ironsail-llc/genus-os/blob/HEAD/docs/superpowers/specs/2026-07-16-dashboard-design-research.md)
- **Semantic states for our domain:** pass/compatible = green (emerald), breaking =
  red, drift/warning = amber, informational = neutral. Colored badges/dots, never
  colored body text.

### Layout patterns
- **Left sidebar nav + main content** (Supabase Studio, Linear, Vercel dashboard).
- **Command palette (⌘K)** as central navigation — Linear's defining pattern.
- **Stream views:** Sentry's issue stream is a dense responsive table (title + meta
  row, severity indicator, trend sparkline, "last seen" as primary temporal signal,
  bulk triage, keyboard navigation) — the right model for a "contract violations
  stream". (https://github.com/epure-sh/epure/blob/HEAD/specs/002-dashboard-ux/research/sentry-ia-borrow.md)
- **Trace/inspector pattern:** LangSmith/Langfuse's left-tree → right-detail-panel
  with per-step latency badges is table stakes for drill-down on endpoints/diffs.
  (https://github.com/ironsail-llc/genus-os/blob/HEAD/docs/superpowers/specs/2026-07-16-dashboard-design-research.md)
- **Linear discipline to copy:** keyboard-first, fast (optimistic UI, near-instant
  search), empty/loading/error states designed not defaulted, inline editing over
  modals, undo toasts instead of confirm dialogs.
  (https://github.com/darkinno/ui-styles-deprecated [style guide summary],
  https://www.morgen.so/blog-posts/linear-project-management)

### Visualizing diffs and drift
- Side-by-side or unified JSON diff with **red/green line highlighting**
  (GitHub-diff convention developers already read fluently); field-level changes
  rendered as rows: `field | before type | after type | severity (breaking/non-breaking)`.
- **Timeline view** of schema versions per endpoint: version list on the left, diff
  on selection — mirrors oasdiff's changelog output, but visual.
- Alert design: severity badges + "last seen" + one-click "approve / mark intentional
  / revert" actions in the violation row — the deploy-gate triage loop.

**Concrete design direction:** dark-first dashboard, Geist/Inter sans + JetBrains
Mono for schemas, near-black layered surfaces with hairline borders, one accent
(emerald) + semantic red/amber/green, sidebar nav, ⌘K palette, Sentry-style
violation stream, side-by-side JSON diffs, per-endpoint schema timeline. No
gradients, no decorative color.

---

## 4. Feature & market differentiation

Concrete differentiators a small indie-built tool can own vs. incumbents:

1. **Zero-authoring contracts.** Every competitor needs a spec, a test, or a probe
   you wrote. The proxy derives the effective contract from observed traffic —
   onboarding is "point the proxy at your API" instead of "write contracts for a
   week." This is exactly the friction that got Pact removed in the ADR above.
2. **Live-traffic drift detection, not CI-only.** oasdiff/Pact catch what changed
   in the spec at PR time; the firewall catches what changed *in production
   traffic* the moment it happens — including drift the spec never declared.
3. **Deploy gate against the observed contract, not the declared one.**
   `can-i-deploy` semantics (borrow from PactFlow) but with traffic-learned
   baselines — blocks the deploy that would break a real consumer seen in traffic.
4. **Response-time regression per endpoint for free.** The proxy already sees
   timings; p50/p95 trend alerts are a near-zero marginal feature that
   contract-testing tools don't offer and uptime tools charge per-check for.
5. **Indie-hacker price point and setup.** Incumbent floor is $24/mo (Checkly) to
   ~$115/mo (PactFlow Team); a generous free tier + simple self-host proxy + plain
   English onboarding wins the solo-dev segment none of them court.

**Positioning (one line):** "Contract testing without writing contracts — point
your traffic at it, and it learns your API's real contract, alerts on drift, and
blocks deploys that would break it."

---

## 5. Risks & open questions

### Technical risks of a proxy-based approach
- **Latency.** Sitting in the request path adds milliseconds per call; budget and
  measure it publicly, keep the hot path async (sample/store, analyze out of band).
- **TLS.** Inspecting HTTPS bodies requires the client to trust the proxy's CA —
  standard for dev/staging proxies, a hard sell for production without a clear
  self-hosted/on-prem story and strong data-handling posture.
- **PII in captured payloads.** Capturing real traffic means storing real user data;
  Speedscale answers this with automatic field masking — masking/redaction must be
  a day-one feature, not a roadmap item.
- **Adoption friction.** Changing the base URL in clients, DNS, or deploy topology
  is a bigger ask than adding a GitHub Action (oasdiff's whole advantage). Mitigate
  with a sidecar/agent mode and a "mirror traffic" option that doesn't sit inline.
- **Schema inference quality.** Inferring types from sampled JSON is noisy (nulls,
  union types, rarely-hit optional fields). Confidence scoring per field and a
  "confirm contract" human step are likely required — validate how often inferred
  contracts produce false positives.

### What to validate in the MVP
- Can the proxy run inline on a real dev's stack with <10ms added latency?
- Can field-level breaking changes (renamed/removed/type-changed) be detected from
  sampled traffic with acceptable false-positive rates?
- Will a frontend dev trust an auto-learned contract enough to gate a deploy on it?
  (Test with one real project before building the gate UI.)
- Does the drift alert actually fire faster/more accurately than the target user's
  existing Sentry/checks on a real silent-break incident?

**Open questions:** self-hosted vs. hosted proxy for v1 (self-hosted dodges TLS
trust and data-residency objections but complicates the SaaS funnel); which
protocols to support first (REST/JSON only for v1); sampling strategy for
high-traffic APIs; how to price without per-GB metering surprises (Speedscale's
documented overage complaints are a cautionary tale:
https://github.com/speedscale/docs/blob/HEAD/docs/reference/pricing-faq.md).
