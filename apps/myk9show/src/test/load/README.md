# Show-day load rehearsal

This is the supported MYK9-109 load harness. It uses Chromium sessions against
the current consolidated at-show UI and its replication-backed scoring and
check-in mutations. The former fake `/api/*`, k6, Artillery, and direct-database
runners were retired because they no longer represented the application.

## Commands

Run from `apps/myk9show`:

```bash
pnpm test:load:list
pnpm test:load:unit
pnpm test:load:quick
pnpm test:load:playwright
pnpm test:load:full
```

`test:load:list` and `test:load:unit` are safe discovery/contracts. This project
uses the remote prelaunch Supabase project, so the quick smoke and full commands
require an approved remote window. They are never scheduled or run in pull
request CI.

Ordinary Vitest runs install an HTTP guard that rejects every hosted
`*.supabase.co` request before it leaves the process. Unit/component tests must
mock that boundary. Real Supabase coverage still belongs in the dedicated
Playwright/load commands above, which do not load the Vitest setup and retain
their explicit target approval gates.

Do not use one local browser process as G9 evidence. The five-session smoke is
supported locally, but two 100-session attempts saturated the local generator
before they could produce a valid Supabase result.

## Which server serves the app

`LOAD_TEST_APP_SERVER` selects it, and the two modes are not interchangeable:

| Value               | Serves                       | Used by          |
| ------------------- | ---------------------------- | ---------------- |
| `dev` (the default) | `vite` dev server            | local runs       |
| `preview`           | prebuilt bundle (`.../dist`) | the CI rehearsal |

CI sets `preview` and runs `pnpm run build` first — **`vite preview` serves
whatever is in `dist/`, so without that build step the rehearsal measures a
stale bundle or 404s.** The dev server was used until 2026-08-26 and is not
valid for G9 evidence: it ships unminified dev-mode React and transforms
modules on demand, which pegged all eight runners at 95–99.5% host CPU p95 and
invalidated backend latency attribution (run 32927274194).

Because a local run defaults to `dev`, its numbers are not comparable to CI's.

### Service workers are blocked, and what that excludes

The production bundle registers the PWA (`main.tsx` gates on
`!import.meta.env.DEV`), so every context the harness opens sets
`serviceWorkers: 'block'` — otherwise each of the 100 fresh contexts would
Workbox-precache the full 41 MB manifest inside the measurement window. Real
devices pay that once and arrive warm; 100 simultaneous cold contexts would
measure the generator, not Supabase.

**Caveat when reading a passing result.** `RingsideSessionHeartbeat` reaches
`navigator.serviceWorker.ready`, which never resolves while registration is
blocked, so the per-30s `upsert_ringside_session` write does not run during the
rehearsal. That write path is therefore **outside** G9 coverage, and a pass does
not by itself establish headroom for ringside presence traffic. This is not new
to the preview switch — the dev server never registered a worker either — but it
is now a deliberate, recorded gap rather than an accident.

## Free GitHub distributed rehearsal

`.github/workflows/load-rehearsal.yml` is the gate-closing entry point. It is
manual-only and uses eight standard public-repository `ubuntu-latest` runners.
Each runner serves the checked-out frontend locally, prepares 12 or 13 isolated
browser sessions, connects to the same remote Supabase project, and waits for
one shared UTC start barrier. This does not require a paid runner or Vercel.
Page p95 remains informational because it includes browser-runner scheduling.
Every shard now records whole-runner CPU/memory/load, Node event-loop delay,
Chromium control latency, context-preparation time, and synchronized-start
headroom. G9 fails closed if that evidence is missing. Scoring/API thresholds
remain unchanged, but their result must be interpreted alongside the per-runner
evidence before latency is attributed solely to Supabase.
The renderer marks a runner saturated when host CPU p95 is at least 90%, memory
peak is at least 95%, event-loop p95 is at least 100 ms, browser-control p95 is
at least 1 second, or browser-control failures reach 5%. Host and browser
sampling coverage must each reach 80%. An incomplete or saturated runner makes
browser-derived backend-latency attribution invalid and prevents a G9 pass.
Create the `load-rehearsal` GitHub environment with a required reviewer before
the first dispatch so the prepare job cannot seed the remote target unattended.
The prepare job also verifies that `authenticated` can execute
`ringside_update_entry` and aborts before reseeding when scoring is disabled;
restoring that grant remains a separate operator-approved action.
GitHub only permits `workflow_dispatch` after the workflow exists on the default
branch, so merge the reviewed harness implementation before running it. That
implementation merge does not close G9 or MYK9-109; the aggregate evidence must
pass first.

The workflow requires these existing repository secrets:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
E2E_SECRETARY_EMAIL
E2E_SECRETARY_PASSWORD
E2E_DEMO_EXHIBITOR_EMAIL
E2E_DEMO_EXHIBITOR_PASSWORD
```

It also requires these two repository secrets, which must be installed before
the first dispatch:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD
```

The prepare job requires the operator to type the approved project ref and
performs the CPU/IO telemetry preflight and canonical reseed. Eight shards then run 12 or 13 unique global
assignments each.

A ninth, browser-free `platform` job owns the sampler. Shard 0 owned it until
2026-08-26, and that was self-defeating: polling `pg_stat_activity` every two
seconds and the Metrics API while also driving 12-13 Chromium contexts left it
the only saturated runner in the fleet (95.3% host CPU p95 against seven healthy
siblings at 83-89%), and a saturated shard invalidates the very latency
attribution the sampling exists to support — while its own dropped samples then
fail the telemetry gate.

The sampler proves its credentials and both transports before waiting, so a bad
secret fails in seconds rather than after the barrier. It waits on the same
synchronized start, baselines 15 s ahead of it so the opening statement snapshot
excludes rehearsal traffic, and keeps sampling **150 s** past the scenario:
sessions can still be hitting the database for the 90 s queue-drain budget plus
three 20 s queue probes, and stopping earlier under-reports peak connections —
which biases toward a false PASS, because the gate only fails when connections
_exceed_ the cap.

Its artifact carries the run ID and start timestamp, and a pair that does not
match is discarded — nothing else structurally ties a separate runner's output
to this rehearsal. Unusable telemetry of any kind (absent, truncated, corrupt or
mismatched) is recorded as the G9 failure "Required platform telemetry was
missing" **without** discarding the eight shards' evidence, which costs an
operator-approved window to produce. Aggregation itself still throws on a
mismatched artifact, so no other caller can count a stale one, and it rejects any
shard that carries platform telemetry, so the old topology cannot creep back.

Because cleanup waits on this job, a rehearsal whose shards all fail fast still
holds the canonical reseed until the sampler finishes its window — deliberate, so
a reseed cannot land mid-snapshot.

The aggregate job
requires all eight matching artifacts, concatenates sanitized raw timings for
exact global percentiles, preserves each runner's generator evidence separately,
evaluates G9 once, and uploads JSON/Markdown evidence. Session evidence reports
configured, prepared/open, started, completed, failed, and peak-active workflows;
an early workflow failure no longer reduces the prepared concurrency count.
Each workflow also records a high-resolution epoch interval, so aggregation
computes the actual cross-runner simultaneous peak instead of summing unrelated
shard-local maxima. The separate `if: always()` cleanup job first cancels scoring
queries that began inside the database-clock rehearsal ownership window, requires zero
scoring workers across the target and three unchanged rollback samples, then reseeds
and verifies `514|504|0` after success or failure. Before either reseed, the workflow
removes canonical-show emergency packet objects through the service-role Storage API,
then deletes their audit rows; the SQL seed refuses metadata-only deletion. Pre-existing scoring work is never
canceled; it blocks reseeding instead. If the quiet-window gate fails, cleanup leaves
the target for operator recovery.

## Scenario budgets

The G9 Normal scenario is 100 concurrent sessions over 10 minutes with a
2-minute ramp: 55 ringside scoring, 15 secretary check-in, 15 exhibitor at-show
reads, 10 run-order/dogs-ahead reads, and 5 show-desk reads.
Ringside sessions 50–54 intentionally share their first scoring target to
create a bounded contention sample; every other scoring target is disjoint.

It passes only when all of these are present and passing:

- scoring-write and API p95 at or below 200 ms;
- page p95 recorded as informational and interpreted with generator health;
- error rate at or below 5%;
- throughput at or above 50 requests/second;
- availability at or above 99.5%;
- at least 50 ringside sessions;
- replication queues drain to zero and scored rows reconcile;
- CPU, IO, `pg_stat_activity` peak connections versus the verified cap, and
  `pg_stat_statements` baseline-to-final deltas are supplied.

Peak (250 sessions) and Stress (500 sessions) definitions are informational and
cannot close G9.

## Target safety

Every executable run requires an explicit mode and allowlist. The approved
remote prelaunch project requires:

```text
LOAD_TEST_MODE=staging|e2e
LOAD_TEST_APPROVED_PROJECT_REFS=<project-ref>
LOAD_TEST_SUPABASE_PROJECT_REF=<project-ref>
LOAD_TEST_CLOUD_APPROVED=true
LOAD_TEST_COMPUTE_TIER=<verified tier>
SUPABASE_DB_URL=<operator-provided passwordless connection URL>
SUPABASE_DB_PASSWORD=<operator-provided password>
SUPABASE_SERVICE_ROLE_KEY=<operator-provided Metrics API credential>
```

Obtain explicit operator approval for the named prelaunch project, reseed
window, load window, and telemetry access before running. Never commit
credentials, storage state, database headers, or raw provider exports.

## Fixture lifecycle

`supabase/seed-demo.sql` creates 63 deterministic load dogs across the eight
non-finalized demo classes: 504 load entries plus the 10 hand-authored entries.
It excludes the finalized/released class and aborts unless the show total is
exactly 514. Re-run the canonical reset/reseed before and after an approved
rehearsal; verify the postcondition both times.

The browser runner scores deterministic entries through the live scoresheet,
changes check-in through the live status dialog, samples request/page metrics,
observes replication queue drain, and reconciles scores against persisted rows.

## Platform evidence

The runner samples `pg_stat_activity` every two seconds and calculates
`pg_stat_statements` deltas from `SUPABASE_DB_URL`. It also samples the official
Supabase Prometheus Metrics API for CPU and disk-busy deltas. Passwords are
passed through process environment only and never appear in arguments or
evidence. Missing samples fail G9. The generated Playwright attachment and timestamped
OpenSpec JSON/Markdown records include request/error/availability metrics,
`40001` count and rate over all scoring attempts, retry outcomes, queue depth,
persistence reconciliation, target tier, statement deltas, and platform
evidence. Missing G9 metrics fail closed.

After a forced workflow cancellation, verify that the cleanup job completed.
If GitHub itself prevented cleanup from running, manually restore the approved
target with the canonical reseed and verify `514|504|0` before leaving the load
window.

## Known coverage caveats

The harness runs with `serviceWorkers: 'block'` (`load-request-phases.spec.ts`,
`load-readiness.spec.ts`, pinned by `loadDiscovery.contract.test.ts`), so every
rehearsal session is a device with **no service worker at all**. Two
consequences:

- Nothing the harness measures exercises the push path — subscription lookup,
  the `push_subscriptions` upsert, or any code that assumes a registration.
  A rehearsal cannot produce evidence about push behaviour under load.
- The rehearsal reaches the ringside heartbeat's push-independent fallback on
  every session rather than the normal `upsert_ringside_session` path, so the
  presence/heartbeat load it generates is not representative of a real
  show-day mix. Read heartbeat-derived numbers with that in mind.

This is also how a pre-existing bug surfaced during the #1812 rehearsal:
`getExistingSubscription()` used to throw on a device with no
`navigator.serviceWorker`, which killed the whole heartbeat before that
fallback and left revoked ringside passcodes working indefinitely (fixed in
#1813). Blocking service workers makes that class of assumption visible here
first — treat a heartbeat anomaly in a rehearsal as a real finding, not a
harness artifact.
