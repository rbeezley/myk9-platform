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
