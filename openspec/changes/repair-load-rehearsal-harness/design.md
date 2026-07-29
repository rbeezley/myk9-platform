## Context

MYK9-109 covers an existing but stale load-testing system, not a greenfield harness. The current
Playwright scripts inherit `playwright.config.ts`, whose `testDir` excludes
`src/test/load/playwright-load-tests.spec.ts`; the framework models browse-heavy traffic, mutates
shared scenario objects, grades every scenario against the Normal error budget, and uses routes,
selectors, credentials, fake data, and `/api/*` endpoints that no longer describe the consolidated
myK9Show application. The full runner and README also predate the isolated, resettable E2E
lifecycle now available in `scripts/qa/`.

The launch gate is narrower than the old "comprehensive" marketing copy. G9 requires a passing
Normal rehearsal with 100 concurrent sessions, at least 50 exercising ringside scoring, a
realistic approximately 500-entry show, p95 API/scoring-write latency within 200 ms, no more than
5% errors, at least 50 requests/second, and at least 99.5% availability. It also requires peak CPU
and database connections, SQLSTATE `40001` rate, replication queue depth, and a stated compute-tier
ceiling. Peak and Stress runs are informational and use their own budgets.

This is test and operational infrastructure. It adds no UX surface and does not change the
role-specific experience described in `docs/INTENT.md`. The show-day browser workflows must use
the existing `/at-show/:showId`, `/at-show/:showId/class/:classId`, Show Desk, My Entries, and
replication-backed scoring/check-in paths instead of inventing direct application mutations.

## Goals / Non-Goals

**Goals:**

- Make every documented Playwright load entry point discover and execute the intended load suite.
- Replace stale routes, selectors, fake IDs, fake credentials, and generic `/api/*` calls with
  canonical seeded show-day workflows.
- Make scenario definitions immutable and grade each scenario against its own complete budget.
- Give the Normal gate scenario 100 concurrent sessions with at least 50 ringside scoring sessions.
- Extend `supabase/seed-demo.sql` deterministically to approximately 500 entries across the
  existing trials/classes without creating a second seed model.
- Collect a machine-readable result plus the platform evidence needed to decide G9 truthfully.
- Add a cheap recurring anti-rot check while keeping full load generation manual/on-demand.

**Non-Goals:**

- Running load against production or an unidentified shared target.
- Closing G9 from local source validation, Playwright discovery, a partial rehearsal, or a failed
  rehearsal.
- Replacing the established replication/mutation paths with load-only production code.
- Fixing MYK9-114 scan sources, changing RLS, or tuning the database before the baseline exists.
- Making Peak or Stress results a G9 blocker.

## Decisions

### Use a dedicated Playwright load configuration and a discovery command

`playwright.load.config.ts` will set `testDir: './src/test/load'`, match only the load spec, use the
Chromium project, disable retries, and default to one Playwright worker because each test creates
its own virtual sessions. The package scripts will always pass that config. A fast
`test:load:list` command will run `playwright test --list` and a source-contract test will assert
that the expected Normal gate test is discovered. This catches the exact `testDir` regression
without generating load.

Changing the general E2E `testDir` was rejected because it would mix long-running, stateful load
tests into ordinary E2E execution.

### Fail closed on target identity before opening sessions

The runner will require an explicit load target mode and resolved application/Supabase target.
Only an explicit allowlisted staging/E2E project may run a write workload. Shared targets require a
separate operator-owned allowlist value;
an absent mode, unresolved project ref, mismatch between app and Supabase URLs, or production
target aborts before authentication or mutation.

The repository has no operator-used local Supabase or Docker lifecycle. A gate-closing run and its
bounded smoke therefore target the owner-approved remote prelaunch Supabase project on the
declared tier. Routine automation compiles and discovers the harness without shared writes.

### Refactor the existing Normal scenario around role-bound show-day workflows

The scenario definition will identify an exact session count per role/workflow instead of choosing
every workflow randomly for every role. The Normal gate workload remains 100 sessions and reserves
at least 50 for ringside scoring. Remaining sessions cover secretary check-in, exhibitor
My Entries/public results, run-order/dogs-ahead reads, and a small operational monitoring share.
All paths resolve from the canonical seeded show, trial, class, entry, and accounts.

The browser runner will reuse authenticated storage state per canonical role when safe, then create
isolated browser contexts so each ringside session has its own replication queue. Scoring and
check-in go through the current UI/replication path; read scenarios use current pages and selectors.
The runner will capture request timing and response classifications around the actual Supabase RPC
and REST traffic rather than synthetic `/api/entries` endpoints.

Merely changing `userDistribution.judges` from 10 to 50 was rejected because the current runner
does not bind workflows to roles and would still let "judge" sessions browse or submit entries.

### Make scenario evaluation a pure, scenario-specific contract

Metrics will be represented as typed samples and reduced into one JSON result per scenario.
Evaluation will use that scenario's latency, error-rate, throughput, and availability budgets and
will explicitly verify configured concurrency and ringside-session count. The evaluator will never
read `PERFORMANCE_TARGETS.errorRate.normal` when grading Peak or Stress.

The result will distinguish:

- workload metrics: concurrency, ringside sessions, operation counts, p50/p95/p99, throughput,
  availability, total errors, and `40001` errors/retries;
- client durability metrics: maximum and final replication queue depth per ringside session; and
- platform samples: CPU, IO, `pg_stat_activity`, connection cap, and
  `pg_stat_statements` top-total-time statements.

A missing required gate metric is a failure, not a zero. Peak/Stress reports remain informational
and are labeled with their own thresholds.

### [ADDED] Define telemetry denominators and isolate the rehearsal delta

Platform sampling will capture a baseline before ramp-up and a final snapshot after queue drain.
`pg_stat_statements` evidence will report per-query deltas in calls, rows, and total/mean execution
time between those snapshots; a cumulative top-query list without a rehearsal delta is not
sufficient. `pg_stat_activity` will be sampled throughout the run and report the observed maximum
against the verified server cap.

The `40001` rate is the number of scoring-write attempts returning SQLSTATE `40001` divided by all
scoring-write attempts. The result will separately record automatic retry attempts, ultimately
successful operations, and exhausted failures so retry success cannot hide contention. After the
duration ends, each ringside session receives a bounded drain window. Gate evidence records maximum
and final queue depth and reconciles the final persisted score; a non-zero final queue or missing
persisted write fails the Normal rehearsal.

Management/database credentials, bearer tokens, storage state, database URLs, and raw request
headers will never enter logs or evidence artifacts. Target/telemetry errors will be sanitized to a
host/project identifier plus error class/status.

### Extend the canonical seed with deterministic bulk fixtures

`supabase/seed-demo.sql` will retain its hand-authored journey fixtures and add a clearly delimited
load-fixture block. It will deterministically create enough synthetic dogs and entries to produce
504 synthetic active entries (63 dogs × the 8 non-finalized existing classes) spread across four existing trials,
for a declared demo-show total of 514 rows including the ten hand-authored entries. It will use
stable IDs, armbands, run orders, handler ownership, and literal values. The cleanup block will
delete the load-fixture ID range before the parent show/classes/dogs are recreated, preserving
idempotency.

The already completed/released class `...031` is deliberately excluded: adding new unscored rows
there would contradict its finalized score count and published placements.

The isolated reset/reseed lifecycle will execute the final-schema SQL as the authoritative
validation. A focused source-contract test will protect the expected row count, multi-trial/class
spread, deterministic range, and cleanup markers.

A companion seed file was rejected because it would fork Lane 1.1 and let rehearsal data drift from
the show-day fixture.

### Split cheap anti-rot validation from expensive rehearsal execution

Pull-request/local verification will compile the load TypeScript, run focused unit/source-contract
tests, and list the Playwright suite without database writes. A short remote smoke proves
authentication, current routes, replication-backed scoring/check-in, and result generation only
when an operator explicitly approves the prelaunch target/window. The full 100-session,
ten-minute gate-closing rehearsal remains manual/on-demand because it consumes material compute
and requires cloud telemetry.

This keeps routine CI safe while ensuring the entry points and current scenario do not silently
rot again.

### [ADDED] Run the full gate on four synchronized free GitHub runners

The two owner-approved local full attempts proved that one Mac/Chromium process is the load
generator bottleneck: the five-session remote smoke passed, while 100 full React/IndexedDB
contexts could not finish inside the bounded test window and produced no Supabase capacity
failure. Raising the local timeout would measure delayed local work instead of 100 concurrent
sessions.

The gate-closing path will therefore be a dedicated `workflow_dispatch` workflow on four standard
`ubuntu-latest` public-repository runners. Each shard will prepare exactly 25 isolated sessions,
serve the current frontend locally on its runner, connect to the same approved remote Supabase
project, and wait for one shared UTC start timestamp before beginning its portion of the global
two-minute ramp. A shard that is missing, duplicated, late to the start barrier, or configured for
a different target/scenario SHALL fail the aggregate closed.

Shard assignment uses each session's global sequence, not a shard-local sequence, so the four
workers together preserve the original 100-session composition and ramp. One designated shard
owns platform sampling across the common window. Every shard writes sanitized raw latency samples
and counters; a separate aggregate job validates all four manifests, concatenates raw timing
samples for exact global percentiles, sums additive counters/concurrency, uses the single platform
sample, evaluates G9 once, and writes the final JSON/Markdown evidence.

The workflow will use GitHub secrets, never Vercel credentials or a Vercel deployment. It will
run the canonical seed before the matrix and an `if: always()` canonical reseed/postcondition job
after aggregation or any shard failure. Routine PR and nightly workflows remain source-only and
cannot start the shared write workload.

One paid larger runner was rejected because the owner has free GitHub/Vercel accounts and this
public repository already qualifies for standard hosted runners. A Vercel preview was rejected
because each runner can serve the checked-out frontend locally and Vercel is not under test.

Any rewritten load implementation will be TypeScript and split into focused sibling modules under
500 lines. Existing JavaScript-only k6/Artillery assets will either remain untouched with an
explicitly documented compatibility status or be retired/replaced by typed build inputs; new
orchestration will not extend the legacy JavaScript modules.

### Record evidence without weakening the gate

The run command will write a timestamped JSON result and a Markdown evidence summary under the
OpenSpec change while it is active. The summary will state target identity, seed count, scenario,
compute tier, concurrency ceiling, all thresholds/results, platform peaks, and pass/fail. The
runbook and scorecard remain unchanged unless every G9 requirement passes; otherwise the evidence
records the failing dimension and MYK9-109 stays open.

## Risks / Trade-offs

- **[Risk] Browser-context load measures the runner host as well as the backend.** →
  **Mitigation:** distribute 25 contexts to each of four standard runners, synchronize the start,
  record shard identity/timing, fail on late or missing shards, and separate page/UI timing from
  Supabase request timing.
- **[Risk] GitHub matrix jobs do not become ready simultaneously.** →
  **Mitigation:** calculate a future UTC barrier before matrix setup, prepare contexts before the
  barrier, fail any late shard, and aggregate only four manifests with the same run/start identity.
- **[Risk] Per-shard p95 values cannot be averaged truthfully.** →
  **Mitigation:** upload sanitized raw duration samples and compute global nearest-rank percentiles
  only after concatenating all four shard sample sets.
- **[Risk] A shard or aggregate job fails before normal cleanup.** →
  **Mitigation:** keep cleanup in a separate `if: always()` job that depends on every write-capable
  job and verifies the canonical 514/504/0 postcondition.
- **[Risk] Fifty concurrent scoring sessions contend on the same few entries and create an
  unrealistic conflict storm.** → **Mitigation:** allocate stable entry ranges across sessions,
  include a bounded intentional-overlap subset for `40001` observation, and report both.
- **[Risk] Reusing one canonical judge identity understates Auth/RLS session diversity.** →
  **Mitigation:** use isolated browser contexts/tokens and document the identity reuse; the gate is
  concurrent ringside sessions, not 50 distinct officials.
- **[Risk] A bulk seed makes ordinary E2E runs slower.** → **Mitigation:** use set-based
  deterministic SQL, measure reset time, and keep the rows in the existing single transaction.
- **[Risk] Cloud CPU/IO collection depends on target permissions/API availability.** →
  **Mitigation:** preflight telemetry before load and fail the gate run if any required source is
  unavailable; never backfill missing values by inference.
- **[Risk] Shared staging traffic could disrupt other work.** → **Mitigation:** require an explicit
  allowlisted non-production target and operator window before the full rehearsal.
- **[Risk] A remote run is interrupted after reseeding or partial scoring writes.** →
  **Mitigation:** capture the target's starting fixture marker, install signal/finally cleanup, and
  run the canonical reset/reseed verification after both success and failure; preserve the failed
  evidence before cleanup.

## Migration Plan

1. Add failing contracts for Playwright discovery/config, scenario composition/evaluation, target
   safety, and canonical seed volume.
2. Add the load-specific config and repair every package/full-runner entry point.
3. Refactor scenario definitions, metrics, evaluator, and the Normal show-day runner; update k6,
   Artillery, database, and README references or explicitly retire dead paths.
4. Extend and execute the canonical seed twice through the approved remote lifecycle; keep the reset idempotent.
5. Run focused tests, load-suite discovery, TypeScript checks, short approved-target smoke, and OpenSpec
   verification.
6. Ship the reviewed harness implementation through an approved PR so the manual workflow exists
   on the default branch; this implementation merge does not close G9 or MYK9-109.
7. Configure the protected GitHub environment/secrets, obtain the approved target/window, seed it,
   then run four synchronized 25-session standard-runner shards with one platform sampler; merge
   raw shard samples/counters into one Normal evaluation and capture cloud/database/client deltas.
8. Preserve evidence and restore the target through the canonical reset path after success,
   failure, or interruption. If the rehearsal fails, remediate without changing thresholds. If it
   passes, update the runbook/scorecard and close MYK9-109 only after the evidence follow-up merges.

Rollback is source-only before the approved rehearsal: revert the load config, runner, and
set-based seed block. Any seeded remote rehearsal target is reset through the canonical reseed
lifecycle; no production data is touched.

## Open Questions

- Resolved 2026-07-28: owner-approved prelaunch project `sojmvhhwsjxmfistvzbe`, Micro tier,
  `max_connections = 60`.
- Resolved 2026-07-28: remote write smoke remains manual; scheduled validation is source-only.
