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
