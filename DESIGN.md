# Design: API Contract Firewall dashboard

Written 2026-10-11, after Abdullah looked at the live site and called it
AI slop. He was right. The dashboard worked, but it had no point of view:
screens built one milestone at a time, each solving its own ticket, never
designed as a whole. This doc records the jobs, the character, and the
information architecture so every screen serves one of them.

## The four jobs

1. Know in 3 seconds whether anything is broken. The user opens the
   dashboard between other things. The answer must be the first thing the
   eye hits, not something assembled from tables.
2. Triage a violation with confidence. See what changed, weigh the
   evidence, decide. The decision needs the evidence beside it, and the
   consequence of the decision stated plainly before clicking.
3. Get a service connected without reading docs. Create service, point
   traffic, watch it learn. Three steps, each one showing its own
   progress. No step asks for something the previous step did not produce.
4. Wire the CI gate. Copy the snippet, set the secret, see the verdict.
   The gate page answers "is my pipeline protected?" in one glance.

Every screen exists for exactly one of these. If a screen serves none,
it gets cut.

## Point of view: the calm sentinel

The dashboard is a sentinel, not a control panel. When every contract
holds, it stays quiet and out of the way: restrained, low-chroma, airy.
Color and visual weight are earned by trouble. A breaking violation is
the only thing allowed to shout. Status is always the first thing the
eye hits. Evidence is always one click from an alert. Actions use plain
verbs that say what happens: "approve new contract", not "triage". The
product never asks for attention it has not earned.

Consequences of this, applied everywhere:
- The quiet state is the default aesthetic. Most of the time the
  dashboard should look almost empty, and that is the design working.
- The violation state gets the red, the weight, the top of the page.
  Nothing else competes with it.
- Every alert links straight to its evidence. No alert without a
  next step.
- Buttons say what they do and what it costs: "Approve new contract
  (becomes the enforced baseline)".

## Information architecture

Urgency decides placement, always in this order: status, exceptions,
evidence, action.

- `/` answers job 1. A system banner states the verdict for all
  services ("All contracts holding" or "2 need a decision"), then
  service rows. The add-service form only appears when there are no
  services, as a guided flow, never as a permanent fixture in a void.
- `/violations` answers job 2. Open breaking items lead, each row
  reads as a decision waiting to happen: what changed, where, how
  confident, one click to the evidence.
- `/violations/[vid]` is evidence then decision. The summary states
  the change in plain words, the evidence rows back it up, and the
  decision bar sits directly under the evidence with consequences
  stated. Approve means "the new shape becomes the enforced baseline".
- `/s/[id]/setup` answers job 3. Three steps, each with visible
  progress: get a key, point traffic at the proxy, watch it arrive.
  The page knows which steps are done and says so.
- `/s/[id]/gate` answers job 4. The verdict first, then the snippet,
  then history. The snippet is copyable in one click; the page says
  where the secret goes.
- `/s/[id]` and `/s/[id]/e/[endpointId]` are reference pages. They
  stay dense and quiet: tables, timelines, numbers.

## References (patterns stolen, look not copied)

- Linear: issue triage as a decision queue, keyboard-first lists, quiet
  chrome that gets out of the way of the work.
- Vercel: deployment status as the first thing the eye hits, plain
  language verdicts, copyable snippets with one job each.
- Datadog: dense tables where every column answers a question, sparklines
  inline with the number they explain, never decoration.
- PagerDuty: the alert is the unit of work; every alert carries its
  severity, its evidence, and its acknowledge action together.

## What this replaces

The previous UI was built feature by feature with no composition: a
bare form floating in empty space, filter bars over voids, developer
shorthand for labels ("triage", "ENFORCING", "1-in-10 sampled").
It looked generated because it was assembled, not designed. This
pass keeps every route, API, and data behavior, and redesigns the
composition around the four jobs.
