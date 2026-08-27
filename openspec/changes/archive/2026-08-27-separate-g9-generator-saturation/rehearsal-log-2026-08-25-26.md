# G9 rehearsal log, 2026-08-25 to 08-26 (redacted)

Redacted publication of a private execution log kept during the G9 rehearsal work.
The original was an internal working journal that explicitly excluded itself from
publication, so it is not committed. This version preserves the factual record and
drops the material that exclusion protected.

**Removed:** verbatim operator approval exchanges; paths to gitignored diagnostic
artifacts and repair SQL; the specifics of a narrow one-row database repair (row
identity, versions, transaction timestamps, rollback counters); CI secret handling;
internal environment and deployment identifiers; instructions written for future
agents about retaining local state.

**Kept:** run identifiers and outcomes, aggregate verdicts and their reasons,
measured metrics, restoration proofs, verification counts, merged pull requests, and
the interpretation cautions the original was careful to record. Run IDs, PR numbers
and merge SHAs are already public on this repository.

## Later results that post-date this log

The log ends 2026-08-26. Three subsequent results change how parts of it read, and
are noted here rather than by editing entries written before they were known.

- **Run 33038456110** ran all sixteen shards HEALTHY at 45–70% CPU p95 and still
  failed 98 of 100 workflows. Generator saturation was real in the runs below and is
  correctly reported, but it was not the cause of the workflow failures that
  motivated moving from eight shards to sixteen.
- **Run 33075234998** produced the first valid backend attribution with complete
  platform telemetry, and failed on a 9.4 s scoring-write p95.
- That p95 is an **artifact of the scenario**, not the platform. Fifty-five ringside
  sessions distributed across eight classes by `(entryNumber - 1) % 8` put roughly
  seven concurrent scorers on every class, serializing on the row-exclusive lock
  `refresh_class_scoring_state` takes on the class row. A class is scored by one
  judge, one dog at a time. The workload is remodelled by
  `openspec/changes/model-realistic-show-day-load/`.

Every "Micro capacity remains unestablished" statement below therefore remains true,
but for a reason the log had not yet identified: the workload itself was invalid.

---

## Run 32915776644 — 2026-08-26

One protected rerun on the merged harness: unchanged 100 sessions / 55 ringside
across eight runners on the prelaunch Micro target, canonical reseed, 25-minute
preparation, 10-minute scenario. Not authorized: compute upgrade, database restart,
gate bypass, or publishing detailed diagnostics.

Final state completed/failure. All eight shard jobs wrote reports, aggregation
correctly produced FAIL, and mandatory restoration succeeded.

### Outcome

- 100 sessions (55 ringside) prepared and started; **0 completed, 100 failed** —
  55 scoring, 15 check-in, 15 exhibitor, 10 run-order, 5 Show Desk. Failures were
  readiness waits for submit controls, dog cards, or headings.
- Common start epoch `1787706189000` (01:03:09 UTC), observed skew at most 1 ms.
  Shards returned after 148.703–249.502 s. The ten-minute scenario did not sustain
  ten minutes because every workflow failed; a successful job exit means evidence
  was produced, not that the workload completed.
- Browser-observed scoring p95 39,708.788 ms; API p95 34,994.688 ms.
- 122,418 requests, 69 failed; 99.862% reported availability. These HTTP summaries
  do not outweigh zero completed workflows.
- Queue max/final 2/0, no telemetry failures. 99 scoring attempts, zero SQLSTATE
  40001, 49 retries / 20 successes / 2 exhausted.
- Expected score count 22, observed unknown. Seven shards reported transport failure
  status 0 during reconciliation; shard 5 attempted no persistence query. Status 0 is
  not an HTTP response and does not prove a transport cause or that scores were lost.
- CPU/IO unknown: 5 sampling attempts, 3 successes, 2 timeouts. Peak connections
  36/60; 20 statement deltas preserved.
- The generator evaluator marked all eight runners healthy with attribution true, on
  whole-run CPU p95 of 51.880–72.727%. Those summaries covered roughly 25–27 minutes
  including preparation rather than active load only — a dilution the evaluator was
  later changed to reject.
- "Supported ceiling" in the generated report was the configured scenario label, not
  an established ceiling on a FAIL.

### Restoration

Cleanup job `98025092876` succeeded, logging `Scoring workers are zero and rollback
quiet window passed.` at `2026-08-26T01:08:57.268Z`. Canonical reseed committed at
`01:09:02.244Z`; the exact `514|504|0` postcondition passed at `01:09:02Z`; workflow
completed `01:09:04Z`. No restart or recovery override.

## Local follow-up — 2026-08-26

Proven regressions and repairs, each reproduced before being fixed:

- **Visibility fan-out.** A three-trial fixture made 12 reads where the assertion
  required 4. Resolution now batches at most 100 unique classes and reads settings
  afresh, preserving per-class/trial/show cascades. Failed settings reads propagate
  to the best-effort sync handler instead of replacing cached restrictions with open
  defaults.
- **Cached scoresheet readiness.** An unresolved network sync kept a fully cached
  sheet loading. Warm opens now render replicated data without awaiting refresh;
  cold loads and explicit retries keep foreground hydration. Scoring and permission
  paths unchanged.
- **Generator attribution.** A virtual-time test reproduced idle preparation hiding
  100% active CPU (reported p95 was 0%). Sampling now starts at the load barrier and
  ends before reconciliation. Legacy unscoped evidence is incomplete, not healthy.
- **Failed-run labelling.** Failed or non-gate-eligible runs now report
  `Not established` rather than advertising the configured workload as a supported
  ceiling.

Request observations are diagnostic, not a controlled benchmark. A development-server
sign-in plus scoresheet visit counted 126 API calls; a guarded production-build visit
counted 107; a batching-only visit counted 72. Timing, auth hydration and background
sync differ between visits — 72 is not a stable ceiling or a proven improvement.

Guarded browser readiness: run order 2.417 s, scoresheet 1.865 s, Show Desk 2.436 s,
My Run Schedule 0.973 s. Five tests passed in 18.2 s with service workers blocked and
writes intercepted. Not sustained-load or production-PWA measurements.

A bounded, secretary-scoped EXPLAIN of the 514-row entry view executed in 20.511 ms
(planning 16.999 ms), with visibility work memoized over nine calls. This does not
establish behaviour under concurrency or justify an index or compute change.

Verification: 104 load tests / 21 files; 143 focused app, replication and write-guard
tests / 6 files; five guarded browser tests; app, test and edge typechecks; ESLint;
production build; code-quality ratchet unchanged; strict OpenSpec validation.

### Diagnostic side effect and repair

The readiness diagnostic did not intercept the scoresheet's automatic
`transitionToInRing` mutation, so its first visit marked one demo entry in-ring and
set a ring-entry timestamp. No score was submitted, and canonical counts remained
`514|504|0`. This occurred after the successful cleanup above and was not a failure
of that job.

The diagnostic now installs the strict shared-staging write guard before navigation
and blocks service workers; subsequent automatic REST writes were intercepted. The
full scoring load runner remains unguarded by design.

A single unscored entry was restored to its seeded state under explicit approval, in
a guarded transaction with fail-closed preconditions and a before/after assertion
proving no other field changed. Read-only quiet-window samples before and after
confirmed zero active scoring workers and `514|504|0`. *(Row identity, versions and
transaction detail redacted.)*

## PR #1806 — merged 2026-08-26

Squash-merged at `02:40:48Z` as `991cd022d8e5d971907a4dba7d98d3b2282f4704`, with the
reviewed head unchanged, required checks passing, and 47 focused regression tests
rerun. Post-merge, both Linear issues remained In Progress with unmet gates.

## Post-merge request attribution — 2026-08-26

The bounded diagnostic used canonical role overrides, fresh Chromium contexts, a
local production build, blocked service workers and the strict write guard installed
before authentication. It separates sign-in, a 3-second startup window, first
document navigation, cached client navigation, cached document reload and their
background windows. CDP recorded endpoint, method, status, timing and sanitized
source frames; query values, payloads and credentials were not saved.

**Confirmed cause.** The automatic in-ring mutation's successful upload dispatched
only table names, and the provider responded with its entire global download pass —
pulling unrelated shows, dogs, clubs, armbands and waitlists. The regression first
failed because entries received scope `''` instead of the affected show; entries skip
remote sync with an empty scope, so the broad pass was not even a substitute for
refreshing the affected show after server-side scoring triggers.

**Repair.** Successful-upload events now carry only row identity, table, operation and
RPC name — never payloads. Only complete, exclusively `ringside_update_entry` batches
use local IDB context to refresh the affected show-entry and trial-class scopes.
Mixed, generic or legacy uploads retain the full-refresh path. Uploads arriving during
a download are coalesced; a full refresh requested during a scoped pass is retained;
a failed scope cannot be hidden by another successful scope of the same table.

| Window | Baseline API requests | Patched API requests |
| --- | ---: | ---: |
| Startup after sign-in | 35 | 35 |
| First sheet document navigation | 98 | 88 |
| Next cached sheet client navigation | 35 | 25 |
| Cached sheet document reload | 73 | 62 |

Cached next-sheet readiness was 54 ms before and 52 ms after. Unrelated clubs, dogs
and waitlist reads disappeared from the next-sheet window. First-document readiness
was 7,582 ms before and 5,601 ms after with CDP async stacks enabled — not comparable
to the lighter diagnostic, and not proof of a stable latency improvement. Duplicate
class, entry, visibility and message reads and startup cost remain.

Verification: 527 replication tests / 35 files; 206 focused app tests / 10 files;
replication typecheck and build; app, test and edge typechecks; production build.
The broader root ESLint invocation still flags two pre-existing declarations in
replication `types.ts` — that invocation is not green and was not described as such.

## PR #1807 — merged 2026-08-26

Squash-merged at `03:27:00Z` as `a9d44d47c5435c1b4692f8d41d9833938a379078` after full
CI including three app shards, package and SQL tests, coverage gate, build, smoke,
accessibility and E2E smoke. No failing check was ignored or rerun.

The merge integration automatically closed both Linear issues despite unmet
acceptance gates. Both were restored to In Progress by status-only updates. Merge
success is not deployment or capacity proof.

## Run 32927274194 — 2026-08-26

Dispatched on the merged revision with a 25-minute preparation window. Completed with
FAILURE at `04:19:56Z`. All eight shard jobs produced reports and exited successfully;
aggregate job `98059419590` correctly failed G9.

### Workload and evidence validity

- All reports belong to `32927274194-1`, unique shard indices 0–7, exactly 100 unique
  global assignment sequences 0–99. Only shard 0 supplied platform data.
- Common barrier `1787717163000` (`04:06:03Z`); observed starts 2–101 ms late.
- Sessions configured/prepared/started/completed/failed `100/100/100/0/100`; ringside
  `55/55/55/0/55`. Peak active workflows 86; peak ringside 55.
- All workflows failed readiness waits: 55 scoring submit controls, 15 check-in dog
  cards, 15 exhibitor headings, 10 run-order dog-card waits, 5 Show Desk headings.
  Some score attempts occurred before failure; zero completed workflows does not mean
  zero writes were attempted.
- **Active-load generator CPU p95 was saturated on every runner.** The evaluator
  correctly set `generatorAttributionValid: false`, unlike the earlier diluted
  whole-run sampling. Host and browser-attempt coverage at least 99.471% / 98.413%.

| Shard | Sessions/ringside | CPU p95 % | Active sample seconds | Final queue | Expected/observed scores |
| --- | --- | ---: | ---: | ---: | --- |
| 0 | 13/7 | 99.497 | 562.920 | 46 | 30/unknown |
| 1 | 13/7 | 95.970 | 482.839 | 27 | 20/unknown |
| 2 | 13/7 | 99.000 | 419.249 | 13 | 15/unknown |
| 3 | 13/7 | 99.246 | 323.726 | 1 | 10/unknown |
| 4 | 12/7 | 99.500 | 189.063 | 0 | 5/unknown |
| 5 | 12/7 | 94.924 | 144.961 | 0 | 0/0 (no query) |
| 6 | 12/7 | 98.241 | 694.257 | 70 | 35/unknown |
| 7 | 12/6 | 97.519 | 624.850 | 59 | 30/unknown |

Shard elapsed time including reconciliation ranged 145.110–709.385 s. Early failures
and long tails mean these artifacts do not demonstrate sustained ten-minute coverage.

### Failures retained, not interpreted as capacity

- Browser-observed scoring/API p95 `147344.723 / 130376.691 ms`; page p95
  `5749.496446 ms`. Generator saturation invalidates backend attribution from these
  numbers and prevents defensible before/after capacity conclusions.
- Requests/failed/workflow failures `233245/1145/100`; throughput `328.798889 rps`;
  availability `99.466455%`. Harness observations, not demonstrated user throughput.
- Scoring attempts 265; SQLSTATE 40001 count 0. Retries attempted/succeeded/exhausted
  `124/33/36`. Recorded max queue field 15, summed final queues 216, queue telemetry
  failures 0. Both queue fields are preserved as reported; 15 is not a global maximum
  and the client queues are not claimed to have drained.
- Expected persisted scores 145, observed unknown; seven shards reported transport
  failure status 0. Missing persistence evidence, not proof of lost scores.
- Required platform CPU, IO and peak connections were null. The resource sampler made
  11 attempts: 2 succeeded, 9 timed out. Twenty statement deltas remained available,
  but partial deltas do not replace missing runtime metrics.
- Aggregate FAIL reasons: scoring and API latency, availability, non-drained queues,
  failed persistence reconciliation, missing platform telemetry, and all eight
  saturated generators. Supported ceiling explicitly `Not established`.

### Cleanup

Cleanup job `98059559416` succeeded. Drain log at `04:19:43.893Z`: `Scoring workers
are zero and rollback quiet window passed.` Canonical reseed committed `04:19:51.622Z`;
fail-closed exact `514|504|0` assertion passed `04:19:52Z`; run completed `04:19:56Z`.
Server drain and canonical restoration are proven even though client queues and
persistence reconciliation failed beforehand.

## Bounded generator diagnostic — 2026-08-26

### Confirmed defect: forced file-watch polling

`apps/myk9show/vite.config.ts` forced `usePolling: true` at a 100 ms interval. Idle
CPU cost was isolated before the source was changed:

| Same local dev server, no browser traffic | CPU time in approximately 8 seconds |
| --- | ---: |
| Original forced polling (8,005 ms wall) | 2,870 ms |
| Only `CHOKIDAR_USEPOLLING=false` changed (8,011 ms wall) | 10 ms |
| Source fix, no environment override (8,009 ms wall) | 0 ms at `ps` resolution |

The original consumed about 35.85% of one local CPU core while idle. This is local
macOS evidence, not proof of the Linux runner contribution or of a G9 root cause.
Native file events are now the default; `CHOKIDAR_USEPOLLING=true` remains an opt-in.
HMR is retained.

### Development versus production assets

The same guarded single-context diagnostic ran against a local dev server and a local
production preview, both Chromium with blocked service workers and identical routes
and data. Instrumentation affects timings; this is not an end-user benchmark.

| First scoresheet document navigation | Dev measured | Production measured |
| --- | ---: | ---: |
| Same-origin frontend resources | 831 | 71 |
| Script resources | 829 | 67 |
| Completed encoded bytes | 26,256,485 | 1,807,401 |
| API requests, navigation plus next 3 s | 87 | 87 |
| Time until visible submit control | 1,899 ms | 5,518 ms |

Next cached client navigation requested zero frontend assets in both, with 24 API
requests in both (44 ms dev, 92 ms production). **The build comparison demonstrates
less frontend resource work, but not lower API demand or a reliable latency
improvement.**

**Report interpretation.** `LoadMetrics.requestCount` increments for all browser
responses and failures; `/rest/v1/` filtering is used for API timing, not the total
counter. The failed run's 233,245 requests are **not** 233,245 API calls. Neither
count is successful score throughput.

Read-only sampler inspection found two-second connection probes with
`PGCONNECT_TIMEOUT=10` but no child or query deadline, and resource requests every
60 seconds with a 15-second timeout. Probe overlap was a hypothesis, not a proven
explanation for the nine resource timeouts.

## PR #1808 — merged 2026-08-26

Squash-merged at `13:50:03Z` as `7b7b8c10167176e64d9e1d7debff3a677e7d9cf1`.

CI initially failed the new native-watcher regression in one app shard: the event
arrived with the expected path plus an optional `Stats` argument, so an exact
one-argument `toHaveBeenCalledWith` was an incorrect portability assumption. The
merge stayed blocked; no bypass or blind rerun was used. The test was parameterised
over `alwaysStat=false/true`, reproducing the failure locally before the assertion
was changed to assert the exact path independent of optional metadata.

## Telemetry reliability slice — 2026-08-26

Three regressions failed first: absent query and process deadlines, four overlapping
connection probes after six seconds, and duplicated final observations on concurrent
stop calls. Added fail-path cases exposed four further invalid-count failures — empty,
whitespace, negative and fractional output all appeared usable.

Fixes: one in-flight connection probe; skipped scheduled observations invalidate the
peak; one shared stop promise; a 15-second SIGKILL deadline for each telemetry-owned
`psql` child. No workload, HTTP cadence, global database setting or cleanup predicate
changed.

Independent review found the initial `PGOPTIONS` approach incompatible with the pooler
contract. Two red tests reproduced the missing explicit setting and ordering, and each
invocation became a quiet-mode `SET statement_timeout=10000` followed by its `SELECT`
on the same session, retaining `ON_ERROR_STOP=1` and keeping passwords out of argv and
errors. The workflow uses session-mode port 5432; upstream startup-option handling
cannot be relied on to forward `statement_timeout`. This is source and documentation
verification, not a test of the hosted pooler's deployed version.

Verification: 123 load tests / 21 files; test typecheck; focused ESLint; load
discovery still lists exactly G9 and bounded smoke; strict OpenSpec validation.

## Message subscription churn — 2026-08-26

Repeated `show_message_threads` reads were reproduced at the hook and real-store
transport boundary: initial mount plus five identical replica updates made six
subscribe calls and six reads where one was expected. Identical auth-object refreshes
reproduced six subscriptions.

The hook now keys its show union by a sorted unique ID set and compares the full auth
snapshot by value. Identity, permission, role, scope and membership changes still
refresh; logout and unmount release subscriptions.

Independent review exposed two further reliability gaps, both red first: pending
A-to-B changes were dropped by the old busy flag and an unmounted hook's pending fetch
could install a stale channel; and stable dependencies removed incidental retries
after initial hydration failed. Subscription ownership is now generation-based, so
obsolete responses and realtime callbacks cannot write state or install channels, and
an old completion cannot clear a newer request's busy state. Retries are bounded to
incomplete hydration; no polling timer or unbounded retry was added.

Extracting subscription ownership reduced the pre-existing 522-line message store
below the 500-line limit.

Verification: 184 tests / 27 files; full repository types and lint. A broad app run
completed with 18,053 passing, two failing, nine skipped — the only failures being
`devServerWatch.test.ts` native-change cases receiving no event under the sandbox. An
out-of-sandbox focused rerun passed all three watcher tests in 807 ms without changing
the tests or configuration. The failed broad result is preserved, not relabelled green.

## PR #1810 — merged 2026-08-26

Squash-merged at `15:31:22Z` as `64ea3c4504d99ed13e2e517b6c33196bb84af760` after full
CI on the reviewed head, including all app shards, coverage gate, packages, SQL,
build, smoke, accessibility and E2E smoke. The merge tree exactly matched the reviewed
head. The integration again auto-closed both Linear issues at merge; both were
restored to In Progress by status-only updates.

## Run 32985449474 — dispatched 2026-08-26 15:32:54 UTC

Dispatched once on the merged revision with a 25-minute preparation window, initially
queued. GitHub separately reported an Actions outage overlapping dispatch, which is
the likely scheduling cause rather than evidence about application capacity.

*(This run never allocated jobs. It remained permanently queued and later refused
cancellation, reporting `queued` while the API declined the request as already
completed. It produced no evidence.)*

## Delayed-response diagnosis and repair — 2026-08-26

Tests used the mutation manager's public queue and upload seams with the installed
Supabase client and an injected fake fetch transport, over real in-memory IndexedDB.
No shared database was contacted. All three predictions were tested red-to-green:

1. A controlled RS429 response arriving ten seconds after the upload pass began left
   about 50 seconds of a requested 60-second containment window. The upload runner now
   creates the deadline from the time the response is handled, preserving the full
   server-requested pause.
2. A controlled 40001 response arriving ten seconds late left about 20 seconds of a
   deterministic 30-second OCC backoff. The OCC handler now receives response-time
   `Date.now()`, preserving the full interval.
3. A Supabase RPC crossing the 15-second application timeout had no `AbortSignal` and
   remained active. `withTimeout` now attaches an `AbortController` to thenables
   exposing Supabase's public `abortSignal` seam and aborts the transport before the
   next retry.

Verification: new regression file 3/3; focused mutation, OCC and timeout neighbourhood
134/134; full `@myk9/replication` suite 530/530 across 36 files; replication typecheck.

These fixes remove two client-side retry-amplification paths but do not establish that
either caused a prior G9 failure, and a local fetch abort does not prove that remote
SQL was cancelled after the server received it.

## Standing position at the end of this log

G9 and Micro capacity remained unproven; both Linear issues remained open with unmet
acceptance gates. The confirmed generator saturation, application readiness defects
and missing platform sampling evidence were kept distinct from one another, and no
capacity conclusion was drawn from any run. See the later results at the top of this
document for what has since changed.
