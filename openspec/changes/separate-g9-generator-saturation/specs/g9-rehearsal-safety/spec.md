## ADDED Requirements

### Requirement: Cleanup proves scoring work is drained before reseed

The manual cleanup job SHALL request cancellation only for active
`ringside_update_entry` database workers whose query began inside the database-clock
rehearsal ownership window, then observe all scoring workers on the approved target until their
count is zero and the database rollback counter is unchanged for a bounded quiet window.
It MUST fail before reseeding if either condition cannot be proven.

#### Scenario: Scoring tail is drained

- **WHEN** cleanup finds active scoring workers and cancellation is requested
- **THEN** it waits for zero scoring workers and three consecutive unchanged rollback samples before running the canonical reseed

#### Scenario: Scoring work remains active

- **WHEN** the bounded drain window expires with an active scoring worker or changing rollback counter
- **THEN** cleanup exits non-zero before reseeding and reports that operator recovery is required

### Requirement: Generator topology preserves the unchanged G9 workload

The manual rehearsal SHALL use sixteen standard public GitHub runners with one unique
shard index each. Together the shards MUST retain exactly 100 sessions, 55 ringside
sessions, the original role composition, duration, fixture, thresholds, and every global
assignment sequence exactly once.

Sixteen replaced eight on 2026-08-26. At eight, each runner drove 12–13 Chromium contexts
and sat at 83–89% host CPU p95 — below the 90% saturation flag, yet every one of the 100
workflows failed on element-visibility timeouts. A single-session probe against the same
production bundle showed those routes interactive in 1.5–2.4 s, so the failures were
generator contention rather than the application. Spreading the same workload thinner is
the only permitted remedy; the workload itself is unchanged.

**SUPERSEDED 2026-08-27 by `model-realistic-show-day-load`. Two claims above are now
known false and are retained only as a record of what was believed at the time.**

The contention attribution is wrong. Run 33038456110 ran all sixteen shards HEALTHY at
45–70% CPU p95 with browser-control p95 of 9–15 ms, and 98 of 100 workflows still failed.
Generator contention was therefore not the cause of the eight-shard failures, or not the
whole of it.

The workload freeze is wrong as a forward constraint. The 55 ringside sessions distribute
across eight class IDs by `(entryNumber - 1) % 8`, placing roughly seven sessions scoring
seven different dogs in the same class simultaneously. A class is scored by one judge, one
dog at a time; the operator confirms the largest observed show ran eight judges, each in a
separate ring on a separate class. The 9.4 s scoring-write p95 that run 33075234998
measured with valid attribution is queueing on the row-exclusive lock
`refresh_class_scoring_state` takes on the class row — an artifact of a shape that cannot
occur, not a property of the platform.

The session counts in this requirement MUST NOT be preserved by a future change. The
topology, fail-closed teardown, ownership-window and evidence requirements around them
stand and are unaffected. See `openspec/changes/model-realistic-show-day-load/`.

#### Scenario: Shards aggregate the same workload

- **WHEN** all sixteen synchronized shard artifacts are aggregated
- **THEN** the aggregator accepts 6/7-session shards whose combined global sequences represent the unchanged 100-session scenario

#### Scenario: Topology is incomplete or duplicated

- **WHEN** aggregation receives fewer, more, duplicate, late, or overlapping shard artifacts
- **THEN** it fails closed without producing a valid G9 decision

### Requirement: Platform telemetry is available before and during rehearsal

The workflow SHALL preflight the Supabase Metrics API for CPU and disk-IO counter families
before reseeding. The runtime aggregate MUST contain exactly one designated platform
observation with finite CPU, IO, connection-cap, peak-connection, and statement-delta
values; missing or non-finite evidence SHALL fail evaluation.

#### Scenario: Metrics source and aggregate evidence are complete

- **WHEN** preflight finds both counter families and shard 0 records the runtime sample
- **THEN** the aggregate artifact contains the CPU/IO values alongside connections and statement deltas

#### Scenario: Metrics source or runtime sample is missing

- **WHEN** preflight or runtime sampling cannot provide CPU/IO evidence
- **THEN** the workflow or evaluator fails closed and G9 remains undecided

### Requirement: Platform probes have bounded lifecycle and truthful coverage

Telemetry-owned database queries SHALL have a 10-second statement deadline and
their client processes SHALL have a 15-second kill deadline. Connection probes
MUST NOT overlap. A skipped scheduled probe, failed query or invalid count MUST
remain missing evidence rather than a healthy peak. Resource sampling cadence,
request deadlines and G9 acceptance thresholds SHALL remain unchanged.

#### Scenario: A connection probe outlives its sampling interval

- **WHEN** the next connection sampling tick arrives while a prior probe is pending
- **THEN** no additional connection query starts and peak connection evidence is invalidated

#### Scenario: Shutdown is requested repeatedly while a probe is pending

- **WHEN** multiple callers stop the sampler before the first stop completes
- **THEN** they share one completion, periodic scheduling stops immediately, bounded work drains, and final observations are collected exactly once

#### Scenario: A database query fails or returns an invalid count

- **WHEN** startup, active or final sampling fails, or a connection count is empty or not a nonnegative safe integer
- **THEN** startup rejects without starting timers or the result preserves missing evidence, without exposing credentials or raw errors

### Requirement: Generator attribution measures active load

Generator percentiles SHALL exclude preparation idle and post-workload reconciliation.
Preparation duration and headroom SHALL remain available separately. Legacy or empty
active-window evidence MUST NOT establish healthy generators or backend capacity.

#### Scenario: Long preparation followed by saturated active load

- **WHEN** a long idle barrier precedes sustained active CPU pressure
- **THEN** active CPU p95 reflects that pressure and the generator is not classified healthy

#### Scenario: Legacy observation lacks a measurement window

- **WHEN** a report lacks explicit active-load sampling provenance
- **THEN** evaluation fails closed on generator attribution

### Requirement: Visibility enrichment bounds request fan-out

Class replication SHALL resolve the existing show/trial/class cascade in at most four
reads per 100 unique classes, scoped by each class's actual trial/show IDs. It MUST
preserve null inheritance, explicit false overrides, custom timing and offline enrichment.
No cross-sync settings cache or new authorization bypass SHALL be introduced.

#### Scenario: Multiple trials share shows

- **WHEN** classes from multiple trials and shows are replicated
- **THEN** batched reads preserve each class's own cascade and deduplicate filter IDs

#### Scenario: Visibility read fails

- **WHEN** a settings query returns an error
- **THEN** enrichment fails to the existing best-effort handler instead of manufacturing enabled/open defaults

### Requirement: Readiness diagnostics prevent automatic REST writes

The opt-in readiness diagnostic SHALL install the existing strict shared-staging write
guard before navigation, block service-worker bypass, and retain a write ledger. The
full G9 mutation workload SHALL NOT use this diagnostic guard.

#### Scenario: Opening a scoresheet starts a ring entry

- **WHEN** readiness navigation triggers a ringside write automatically
- **THEN** the diagnostic answers it locally and records interception without sending it to shared staging

### Requirement: Cached scoresheets do not wait for network refresh

An authorized scoresheet with a replicated class, target entry and trial SHALL open
without awaiting network sync. Background refresh SHALL target its active trial and
show entries without replacing the judge's active editing state. Missing cache data
and explicit retry/correction SHALL retain foreground scoped hydration.

#### Scenario: Sync stalls while the scoresheet is cached

- **WHEN** network sync never resolves but the required replicated rows exist
- **THEN** the sheet becomes usable and no whole-show trial refresh blocks rendering

#### Scenario: Cache is incomplete or a correction requests fresh data

- **WHEN** required local data is missing or the judge explicitly retries/corrects
- **THEN** the established scoped sync completes before the refreshed sheet opens

### Requirement: Message subscriptions survive unchanged data refreshes

The existing message hook SHALL retain its live subscription when replicated
rows or auth objects are replaced without changing their show membership or
authorization values. It MUST still refresh on changed show membership or auth
data, and release subscriptions on logout and unmount. Existing message queries,
RLS, current-subscription realtime behavior and offline data sources SHALL remain unchanged.
Pending subscriptions SHALL belong to their initiating membership/auth lifecycle:
new membership MUST NOT wait behind obsolete transport, and obsolete responses or
callbacks MUST NOT reinstall channels, write message state, or clear the new request's
busy state. Identical pending membership requests SHALL share the same work.
Failed initial thread/message hydration SHALL remain visible and retryable on
replica/auth refresh or reconnect. Recovery MUST preserve current store membership,
deduplicate pending work and leave healthy subscriptions untouched, without polling.

#### Scenario: Replication refreshes rows for the same shows

- **WHEN** row arrays are replaced, reordered or contain duplicate show IDs while the resulting show set stays equal
- **THEN** the hook does not unsubscribe, refetch threads or recreate channels

#### Scenario: Identity, authorization or show membership changes

- **WHEN** the authenticated identity, permission/scope data or resulting show set changes
- **THEN** the hook releases the old subscription and subscribes using the current data

#### Scenario: The user leaves the authenticated app

- **WHEN** the user signs out or the hook unmounts
- **THEN** existing message subscriptions are released

#### Scenario: Membership changes while an older fetch is pending

- **WHEN** a new subscription supersedes an unfinished thread, participant or message fetch
- **THEN** the new membership starts immediately and completion of the old fetch cannot replace its state or install obsolete channels

#### Scenario: An obsolete channel emits a late event

- **WHEN** an old subscription callback fires after teardown
- **THEN** it does not modify messages or unread counts, while callbacks owned by the current subscription still work

#### Scenario: Initial message hydration fails transiently

- **WHEN** a thread/message read fails and connectivity or replicated/auth data later refreshes
- **THEN** one retry hydrates the current store scope, repeated events do not overlap it, and later healthy refreshes cause no additional fetches
