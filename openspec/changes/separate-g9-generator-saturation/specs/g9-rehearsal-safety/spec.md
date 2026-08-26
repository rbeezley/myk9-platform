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

The manual rehearsal SHALL use eight standard public GitHub runners with one unique shard
index each. Together the shards MUST retain exactly 100 sessions, 55 ringside sessions,
the original role composition, duration, fixture, thresholds, and every global assignment
sequence exactly once.

#### Scenario: Eight shards aggregate the same workload

- **WHEN** eight synchronized shard artifacts are aggregated
- **THEN** the aggregator accepts 12/13-session shards whose combined global sequences represent the unchanged 100-session scenario

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
