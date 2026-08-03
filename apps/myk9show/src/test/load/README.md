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
assignments each. Shard 0 owns the single platform sampler. The aggregate job
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
and verifies `514|504|0` after success or failure. Pre-existing scoring work is never
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
