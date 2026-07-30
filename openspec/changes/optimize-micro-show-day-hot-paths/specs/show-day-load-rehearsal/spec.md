## ADDED Requirements

### Requirement: Comparative capacity reruns preserve the baseline workload

A capacity rerun used to evaluate the Micro hot-path optimization SHALL use the same G9 seed,
compute tier, four-shard topology, duration, 100-session workload, ringside-session minimum,
workflow mix, evaluator, and thresholds as the recorded failing baseline. Any material workload or
threshold change MUST be labeled a new experiment and MUST NOT be used to claim the optimization
fixed the baseline failure.

#### Scenario: Post-optimization G9 is dispatched

- **WHEN** the optimized app and RBAC functions are deployed for the capacity decision
- **THEN** the unchanged G9 Normal scenario runs on Supabase Micro
- **AND** its result is compared directly with the recorded baseline

#### Scenario: Workload or threshold differs

- **WHEN** the rerun reduces concurrency, changes the workflow mix, shortens the duration, changes
  compute tier, or relaxes a required target
- **THEN** the result is recorded as a separate experiment and cannot prove the Micro optimization
  passed G9

### Requirement: G9 browser sessions model connected show-day devices

The capacity scenario SHALL keep non-scoring browser sessions connected after their assigned
check-in/read action rather than repeatedly hard-reloading the application. Scoring sessions SHALL
remain distributed across the fixture's classes while preserving the configured session count,
eight scores per full session, and bounded OCC-contention overlap.

#### Scenario: A non-scoring workflow completes

- **WHEN** a check-in, exhibitor-read, run-order-read, or operations-read session completes its
  assigned action before the scenario deadline
- **THEN** its browser remains mounted and connected until the deadline
- **AND** it does not repeatedly restart application/auth/replication initialization

#### Scenario: Scoring sessions begin an iteration

- **WHEN** the 55 scoring sessions select their next fixture entries
- **THEN** their class order is distributed by session rather than synchronized onto one class
- **AND** the explicit five-session contention group still targets the same entry

### Requirement: Workflow failures are preserved in rehearsal evidence

Every failed browser workflow SHALL record a bounded diagnostic summary containing workload kind,
route, normalized error message, and count. Distributed aggregation and rendered evidence SHALL
preserve those summaries.

#### Scenario: A browser workflow times out

- **WHEN** a scoring, check-in, exhibitor, run-order, or operations workflow throws
- **THEN** its failure count and diagnostic summary appear in the shard artifact
- **AND** the aggregate evidence identifies the failing workload and stage instead of reporting
  only an undifferentiated total

### Requirement: G9 capacity evidence proves generator validity

Every distributed G9 shard SHALL record whole-runner CPU, memory, load, coordinator event-loop
delay, Chromium control responsiveness, sampling completeness, context-preparation duration, and
synchronized-start headroom. Aggregation SHALL preserve every shard's evidence independently.

#### Scenario: A distributed shard completes

- **WHEN** the shard writes its observation artifact
- **THEN** the artifact contains its runner-health samples and preparation/headroom measurements
- **AND** missing or incomplete generator evidence prevents a G9 pass

#### Scenario: One runner is saturated

- **WHEN** a runner shows sustained resource pressure or unresponsive Chromium control while the
  other runners complete
- **THEN** aggregate evidence identifies that shard instead of averaging it away
- **AND** browser-observed latency is not represented as clean backend-only evidence

### Requirement: Session lifecycle is measured independently from workflow success

The G9 runner SHALL report configured assignments, prepared/open browser contexts, started
workflows, completed workflows, failed workflows, and peak active workflows for total and ringside
sessions. Gate concurrency SHALL use prepared/open contexts, not the duration for which workflows
overlap.

#### Scenario: A prepared workflow fails early

- **WHEN** its browser context was open at synchronized start but its assigned action times out
- **THEN** it remains included in prepared/open concurrency
- **AND** it increments the failed-workflow lifecycle count
- **AND** the failure cannot reduce the reported configured concurrency

#### Scenario: Shards are aggregated

- **WHEN** all shard artifacts cover every assignment exactly once
- **THEN** configured and prepared counts sum to the unchanged 100-session workload
- **AND** started, completed, and failed counts remain reconcilable
