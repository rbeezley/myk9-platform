## Context

The current manual G9 workflow uses four `ubuntu-latest` runners with 25 Chromium
contexts each. The last run saturated every generator and left timed-out scoring
requests active while the cleanup job reseeded the shared prelaunch fixture. That
ordering produced a rollback storm and required an approved database restart.

The existing TypeScript load runner already collects generator evidence, platform
metrics, queue state, and exact shard aggregation. This follow-up changes the
topology and cleanup gate around those existing seams; it does not change the
show-day application or its replication-backed mutations.

## Goals / Non-Goals

**Goals:**

- Make cleanup abort/drain scoring work before any reseed and fail closed when the
  database is not quiet.
- Distribute the unchanged 100-session/55-ringside workload across sixteen standard
  public GitHub runners, preserving global assignment sequences and exact percentiles.
- Preflight the Supabase Metrics API and preserve CPU/IO evidence as a required
  single-sampler field in the aggregate artifact.
- Protect each decision with assertion-first unit and workflow contracts.

**Non-Goals:**

- No threshold, workload, fixture, duration, or compute-tier changes.
- No production load or database migration.
- No backend query tuning or product UI changes.

## Decisions

### Cancel, then observe a quiet scoring window

The cleanup job will identify active database sessions whose query text contains the
controlled `ringside_update_entry` RPC and whose query began after the workflow recorded
its microsecond rehearsal ownership timestamp from the database clock, request
cancellation, then poll the database until
the total scoring-worker count is zero and `pg_stat_database.xact_rollback` is unchanged
for three consecutive samples. Pre-existing scoring work is not canceled, but remains in
the total worker count and therefore blocks reseeding. Cleanup will not run the canonical
reseed if either condition is not met within a bounded timeout. This is safer than relying
on the row-count postcondition, which remained true while the retry storm continued.

The predicate is deliberately scoped to the scoring RPC and excludes the cleanup
connection itself. The operator-approved prelaunch target and existing workflow
environment gate remain the authorization boundary; no application-wide backend
termination is introduced.

### Use sixteen free runners with the same global workload

The shard count is sixteen, assigning global sequence `sequence % 16` to each shard.
This yields 6 or 7 sessions per runner while retaining exactly 100 sessions and 55
ringside sessions. It was eight until 2026-08-26, at which point 12-13 contexts per
runner were shown to be the cause of the page-readiness timeouts. **Both halves of that
sentence are superseded (2026-08-27).** Run 33038456110 ran all sixteen shards HEALTHY
and 98 of 100 workflows still failed, so contexts-per-runner was not the cause; and the
100/55 workload is being remodelled by `model-realistic-show-day-load` because 55 ringside
sessions place ~7 concurrent scorers on every class. The sixteen-shard topology, sequence
validation and raw-sample percentiles below are unaffected. The aggregator continues to validate all global sequences and uses
raw samples, not averaged shard percentiles. Sixteen standard runners plus the platform sampler is 17 concurrent jobs. The 20-job Free
ceiling is ACCOUNT-WIDE, so the prepare job now measures actual free capacity before the
reseed and refuses the window rather than letting a queued shard miss the barrier.

### Fail early on missing CPU/IO telemetry

The prepare job will verify that the Metrics API credential and both required Prometheus
counter families are available before seeding. Shard 0 remains the sole runtime platform
sampler, and aggregation still requires exactly one platform observation with finite CPU,
IO, connection, and statement-delta fields. A preflight success does not replace runtime
evidence; it only prevents starting a destructive rehearsal that cannot be interpreted.

### Keep cleanup separate and unconditional

The existing `if: always()` cleanup job remains separate from aggregation. Its first
operation becomes the cancel/drain/quiet gate, followed by canonical reseed and the
existing `514|504|0` check. If drain fails, the job exits before reseed and reports the
operator recovery requirement rather than claiming cleanup succeeded.

### Remove canonical packet objects before packet audit rows

The canonical demo show may now have immutable emergency packet PDFs in the private
`trial-packets` bucket. Both prepare and unconditional cleanup remove those objects
through the service-role Storage API before deleting their `trial_packet_snapshots`
audit rows and running the SQL seed. Paths are deduplicated and must remain under the
canonical show prefix. If Storage deletion fails, audit rows remain and the rehearsal
fails closed. Metadata deletion is limited to the selected snapshot IDs, then the helper
re-reads the show and fails closed if a concurrent snapshot appeared. The SQL seed
independently refuses to replace the show while snapshot rows remain, preventing a
direct reseed from orphaning private objects.

## Risks / Trade-offs

- **[Risk]** A scoring query may be missed because provider query text changes. →
  **Mitigation:** fail closed on any non-zero rollback growth after cancellation, keep the
  predicate contract-tested, and require manual target recovery if the worker count cannot
  be proven zero.
- **[Risk]** Sixteen runners plus the sampler leave only three spare slots under the
  account-wide 20-job ceiling, and `support-triage.yml` runs every 15 minutes. →
  **Mitigation:** the prepare job counts other active jobs and fails BEFORE the reseed;
  `max-parallel` equals the matrix size so no shard is throttled past the barrier; missing
  shard artifacts still fail closed. No workload is silently reduced.
- **[Risk]** Metrics API access may pass preflight but fail during the load window. →
  **Mitigation:** the runtime sampler converts any missing CPU/IO sample to non-finite
  evidence and the evaluator rejects the result.

## Migration Plan

1. Run local unit, workflow-contract, discovery, typecheck, and OpenSpec validation.
2. Merge the reviewed workflow/code change before dispatching the manual rehearsal.
3. In an explicitly approved window, dispatch the unchanged G9 workload.
4. Require drain, a complete set of shard artifacts, CPU/IO evidence, and `514|504|0`
   restoration before interpreting the result.

Rollback is a source revert before any rehearsal. If a rehearsal has started, use the
workflow's drain gate and canonical seed recovery procedure; never bypass the quiet
window to restore row counts.

## Open Questions

- Eight standard runners did NOT provide sufficient browser headroom: 12–13 contexts each
  held 83–89% host CPU p95 and every one of the 100 workflows failed on element-visibility
  timeouts, while the same routes were interactive in 1.5–2.4 s at a single session.
  Whether sixteen runners at 6–7 contexts each is sufficient will be answered by the next
  apples-to-apples evidence artifact; no capacity conclusion is made in source.

## Authorized performance follow-up

The failed eight-shard run exposed preparation-idle dilution in generator metrics.
Preparation/headroom remain separate fields. Host CPU, memory, event-loop delay and
browser probes start at the workload barrier and stop before persistence/platform
reconciliation. Legacy reports without an explicit active-load window remain readable
but cannot support backend attribution. Empty active sampling fails closed.

Measured startup fan-out also includes four sequential HTTP reads per trial to enrich
class visibility. Batch by at most 100 unique classes: read their trial/show mapping,
then show settings, trial overrides and class overrides in parallel. Use the existing
timing and check-in cascade unchanged. Each sync owns its maps; do not add a persistent
cache or bypass RLS. Missing settings retain existing defaults; failed reads propagate
to the existing best-effort replication handler rather than inventing permissive values.

This narrow client optimization extends the original harness-only scope under the
user's performance-fix request. No UI is duplicated. Database changes, production
frontend changes to the load workflow, and further load execution remain operator-gated.

A second reproduction proves cached scoresheets remain in a loading state while a
whole-show refresh is stalled. Read the replicated class, target entry and trial first.
When all exist, render the cached sheet immediately and refresh only the active trial
and show's entries in the background; do not replace a sheet the judge is editing.
Missing cache data and explicit retries retain the existing scoped foreground hydration.
Scoring authorization, transitions, durable queue writes and completion stay unchanged.

The readiness diagnostic installs the existing strict shared-staging write guard before
sign-in/navigation and blocks service workers so routes cannot bypass interception.
It reports intercepted/blocked writes, safe endpoint counts and readiness, not write
correctness or capacity. Full G9 must continue to use real mutations and cleanup.

## Telemetry lifecycle follow-up [ADDED]

Resume the existing platform sampler seam; do not add a competing monitor or a
product surface. First reproduce slow database commands and concurrent stop calls
using mocked process/network boundaries and fake clocks. A command's connection
timeout alone does not bound its query or child-process lifetime. Add bounded
telemetry-owned command/query execution only after the regression demonstrates
the gap. Set the query deadline with SQL before each SELECT on the existing
session-mode pooler connection, not via startup options that the pooler may drop.
The client must stop on SET failure and suppress SET command tags in parsed output.
Periodic probes must not accumulate while an earlier probe remains live;
skipped/lost coverage must remain visible and fail closed, not improve a reported
peak by silently dropping work. Do not alter resource request cadence or extend
timeouts to conceal the prior failure.

Shutdown must have one shared in-flight completion, clear scheduling immediately,
drain bounded telemetry work, and take final observations once. Startup or final
query failures must remain explicit, sanitized missing evidence. Never include
database URLs, credentials, response bodies or raw transport errors in artifacts.
No shared database settings, writes, restarts or cleanup predicates are changed.
Rollback is a source revert; no migration or data recovery is required for this
local sampler slice.

Testing precedes each repair: slow-probe concurrency, command/query deadline
options, simultaneous/repeated stop, startup/active/final failures, timer/child
cleanup, redaction and incomplete-evidence rejection. Use focused sampler/load
tests and types/lint plus discovery and strict OpenSpec validation. Actual G9
acceptance remains a separate reviewed, approved, evidence-complete execution.
Do not assert that a local lifecycle reproduction explains the remote resource
timeouts without a discriminating measurement.

## Plan verification [ADDED]

### Message subscription churn follow-up [ADDED]

The existing request trace and local hook regression expose repeated thread
subscription setup as replicated arrays are replaced without changing show IDs.
Keep the existing message surface and store; do not duplicate UI or add a data
cache. Stabilize the hook's show-ID set using the sorted-ID key pattern already
used by useNotificationMonitor. Compare the auth snapshot by value so an identical
user refresh does not restart channels; retain all auth fields in that comparison
so changed roles, permissions, scopes or identity still force refresh. Do not
change the store's RLS queries, current-subscription realtime behavior or offline data
sources. Sign-out, changed membership and unmount must still release subscriptions.

Testing: first reproduce five unchanged updates causing six subscriptions. Then
cover stable membership despite reordered/replaced rows, changed membership,
identity/authorization transitions, logout and unmount; verify real-store mocked
transport request/channel counts, not only hook action mocks. Run affected hook,
message store and notification tests, app types/lint and unchanged load contracts.
Full CI and approved guarded/live evidence remain required before acceptance.
Rollback is a source revert; no schema, shared target or test workload changes.

Plan gap audit: initial follow-up coverage 80/100 (auth refresh and real request
count verification were partial). Both are explicit above; patched coverage
100/100 is plan coverage only. No new surface duplicates an existing page.

| Requirement                                                 | Status  | Plan evidence                                                                 |
| ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Reduce unchanged-scope request churn                        | Covered | Sorted-ID key and by-value auth snapshot                                      |
| Preserve authorization, scope changes and lifecycle cleanup | Covered | All auth fields; membership, sign-out and unmount cases                       |
| Preserve offline/realtime and recovery                      | Covered | No query/source change; active callbacks and failed-hydration recovery tests  |
| Prove request reduction and guard G9 acceptance             | Covered | Hook and real-store transport tests; CI and approved evidence remain required |

Validation profile for this follow-up: risk medium / validation app. The change
affects the message subscription lifecycle across the app, but does not change
authorization decisions, data access or replicated scoring paths. Reassess if
the fix must alter store concurrency or authentication behavior.

Review exposed a necessary concurrency repair: the store's busy flag drops a new
show/auth request while an older fetch is pending, and stale work can reinstall
channels after cleanup. Replace that dropped-request behavior with a
generation-owned subscription: the latest request starts immediately, identical
in-flight requests share work, and superseded fetches/callbacks cannot update the
store or install channels. Unsubscribe invalidates pending work. Pass a private
applicability predicate through the existing fetch action so obsolete results do
not overwrite current threads; do not change query shapes or RLS. Extract the
subscription action into a sibling module to keep the existing >500-line store
under the repository limit. Add delayed-response A-to-B, logout/unmount,
identical concurrent request and stale-data regressions. Validation is now risk
high / full because store concurrency across message consumers is involved:
repository types/lint and broad app tests, respecting the 60-second hang rule.

Review also identified failed initial hydration becoming permanently skipped by
stable dependencies. Return hydration success from the existing fetch action while
retaining its non-throwing/logging contract for direct callers. Keep realtime
channels available after a read failure, but expose incomplete hydration as an
error and allow the same scope to retry. The hook retries only failed hydration
on an existing replica/auth refresh or browser reconnect, once per event with
in-flight deduplication; no polling timer or healthy-subscription restart. Retry
the store's current scope so a secretary page's wider scope is not narrowed.
Test fail-first recovery through both triggers, repeated events while pending,
healthy no-op behavior and listener teardown. Workload and thresholds stay fixed.

Initial review found lifecycle details only partially covered; score 85/100.
The additions above and tasks 8–9 address the identified gaps; plan coverage is
100/100 after patching (this is plan coverage, not implementation acceptance).

| Requirement                                         | Status  | Evidence                                        |
| --------------------------------------------------- | ------- | ----------------------------------------------- |
| Preserve workload and truthful capacity attribution | Covered | Goals/Non-Goals; tasks 9.3–9.5                  |
| Timeout, overlap and shutdown failure paths         | Covered | Telemetry lifecycle follow-up; tasks 8.1–8.3    |
| Secret redaction and shared-system boundaries       | Covered | Telemetry lifecycle follow-up; tasks 8.5, 9.3   |
| Offline/scoring correctness and real persistence    | Covered | Authorized performance follow-up; tasks 9.1–9.2 |
| Regression tests, CI and independent review         | Covered | Testing paragraph; tasks 8.4–8.5, 9.2           |
| Cleanup, rollback and incomplete evidence           | Covered | Migration Plan; tasks 9.4–9.5                   |

## Validation Profile [ADDED]

- Risk: high for the combined telemetry and message-subscription slice.
- Validation: full repository types/lint and broad app tests, plus focused lifecycle/load contracts and independent review.
- Rationale: the app follow-up now changes shared message-store concurrency and recovery. No schema/shared-system mutation is included; CI and an approved evidence-complete G9 remain required before acceptance.
