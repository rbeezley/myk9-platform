## ADDED Requirements

### Requirement: Playwright load entry points discover and execute the load suite

Every documented Playwright load command SHALL use a load-specific configuration whose test
directory and match pattern include the maintained load spec. Discovery SHALL report a non-zero
test count including the Normal show-day gate test, and a missing suite SHALL fail the command.

#### Scenario: Maintained load suite is listed

- **WHEN** the repository's load discovery command runs
- **THEN** it exits successfully and lists the Normal show-day gate test from `src/test/load`

#### Scenario: Load spec cannot be discovered

- **WHEN** the configured load spec is absent or excluded
- **THEN** the discovery/contract check fails instead of reporting a successful rehearsal

### Requirement: Load writes fail closed outside an approved target

The load runner MUST resolve and validate the application URL, Supabase URL/project identity, and
explicit target mode before it authenticates sessions or sends mutations. It SHALL permit only the
disposable isolated E2E target or an explicitly allowlisted non-production staging/E2E target and
MUST reject production, unknown, mismatched, or incompletely configured targets.
Secrets, bearer tokens, storage state, database URLs, and raw authorization headers MUST NOT appear
in logs or evidence artifacts.

#### Scenario: Approved prelaunch target is complete

- **WHEN** the runner receives the owner-approved remote prelaunch mode, matching project identity,
  declared compute tier, and explicit allowlist
- **THEN** preflight permits the load smoke to proceed

#### Scenario: Target identity is missing or unsafe

- **WHEN** target mode, project identity, allowlist membership, or app/Supabase consistency cannot
  be proven
- **THEN** the runner exits before login, scoring, check-in, or seed mutation

### Requirement: Normal gate workload represents a real show day

The G9 Normal scenario SHALL configure exactly 100 concurrent sessions, including at least 50
role-bound ringside scoring sessions, against a seeded show with approximately 500 entries across
multiple trials and classes. The remaining sessions SHALL exercise secretary check-in, exhibitor
reads, run-order/dogs-ahead reads, and operational reads through current consolidated myK9Show
routes and established replication-backed mutation/query paths.

#### Scenario: Gate scenario is inspected

- **WHEN** the Normal scenario contract is evaluated before execution
- **THEN** it proves 100 total sessions, at least 50 ringside scoring sessions, every required
  show-day workflow, and fixture distribution across multiple trials/classes

#### Scenario: Browse-heavy legacy scenario is supplied

- **WHEN** a Normal scenario has fewer than 50 ringside sessions or points at removed/fake
  routes, selectors, credentials, or generic `/api/*` endpoints
- **THEN** preflight fails and the scenario cannot produce gate-closing evidence

#### Scenario: Normal workload is distributed across free runners

- **WHEN** the approved manual GitHub rehearsal is dispatched
- **THEN** four synchronized shards each own exactly 25 unique global session assignments and the
  combined manifests prove the unchanged 100-session role/workflow composition

#### Scenario: A distributed shard is missing, duplicated, or late

- **WHEN** aggregation finds fewer or more than four unique shard indexes, inconsistent
  target/scenario/start identity, overlapping assignments, or a shard that missed the bounded
  start barrier
- **THEN** the rehearsal is incomplete and cannot produce a G9 decision

### Requirement: Scenario results use the scenario's complete budget

The evaluator SHALL grade each scenario against its own response-time, error-rate, throughput, and
availability targets and SHALL include configured concurrency and ringside-session count in the
decision. G9 SHALL use the Normal budget: 100 sessions, at least 50 ringside sessions, p95 scoring
write/API latency no more than 200 ms, error rate no more than 5%, throughput at least 50 requests
per second, and availability at least 99.5%. Peak and Stress results SHALL use their declared
budgets and SHALL be labeled informational.

#### Scenario: Normal workload meets every target

- **WHEN** all Normal workload counts and performance dimensions meet or exceed their targets
- **THEN** the evaluator reports a passing G9 workload result

#### Scenario: One required dimension fails or is absent

- **WHEN** latency, error rate, throughput, availability, concurrency, ringside-session count, or a
  required metric is outside budget or missing
- **THEN** the evaluator reports failure and identifies each failing or missing dimension

#### Scenario: Peak or Stress scenario is evaluated

- **WHEN** an informational scenario completes
- **THEN** its own error/throughput/availability/latency budget is used and its result neither
  closes nor blocks G9

### Requirement: Rehearsal evidence covers workload, client, and platform behavior

A gate-closing rehearsal SHALL record target identity, seed size, scenario duration, compute tier,
peak CPU/IO, peak `pg_stat_activity` connections and connection cap, p95 scoring-write latency,
SQLSTATE `40001` count and rate over all scoring-write attempts, retry attempts/outcomes,
maximum/final replication queue depth, final persisted-score reconciliation, throughput,
availability, per-query `pg_stat_statements` deltas from the pre-run baseline, and the supported
ceiling in the form "N concurrent ringside sessions on a show of M entries." A passing result MUST
end with every ringside queue drained to zero and every expected final score persisted.

#### Scenario: Required telemetry is available

- **WHEN** the full approved Normal rehearsal completes
- **THEN** a timestamped machine-readable result and human-readable summary contain every required
  workload, client, platform, target, tier, and ceiling field

#### Scenario: Distributed samples are aggregated

- **WHEN** all four approved shard manifests complete
- **THEN** the aggregator concatenates raw latency samples for exact global percentiles, sums
  additive counters and concurrency, accepts platform telemetry from exactly one designated
  sampler, and evaluates G9 once

#### Scenario: Platform telemetry cannot be collected

- **WHEN** CPU/IO, connection, statement, conflict, or replication evidence is unavailable
- **THEN** the run is recorded as incomplete and cannot close G9

#### Scenario: Requests eventually succeed but queues do not drain

- **WHEN** retries mask intermediate conflicts but any ringside queue remains non-zero or its final
  score cannot be reconciled after the bounded drain window
- **THEN** the Normal rehearsal fails and records the affected session/operation counts

### Requirement: Canonical seed remains deterministic and idempotent

`supabase/seed-demo.sql` SHALL remain the single canonical fixture and SHALL create approximately
500 entries by adding 504 deterministic active load rows across four trials/eight non-finalized
classes while
retaining the ten hand-authored journey rows. Rerunning the seed SHALL clean and recreate the load
range without duplicates or foreign-key failures.

#### Scenario: Approved remote prelaunch environment is seeded

- **WHEN** the canonical seed runs against the final migrated approved remote schema
- **THEN** the demo show contains the declared approximate entry count across multiple
  trials/classes and all fixture postconditions pass

#### Scenario: Canonical seed is rerun

- **WHEN** the seed executes again against its prior output
- **THEN** it succeeds and produces the same load-fixture identifiers and counts

### Requirement: Recurring validation detects harness rot safely

The repository SHALL provide recurring source validation that compiles the load code and discovers
the Playwright suite without shared writes. A bounded remote smoke and the full gate rehearsal SHALL
remain explicit on-demand operations against an owner-approved prelaunch target.

#### Scenario: Routine anti-rot validation runs

- **WHEN** the configured workflow executes on its cadence or by manual dispatch
- **THEN** it validates compilation and discovery without shared-target writes

#### Scenario: Bounded smoke is requested

- **WHEN** an operator invokes the bounded smoke
- **THEN** the runner requires the same approved remote target identity and allowlist before writes

#### Scenario: Full rehearsal is requested

- **WHEN** an operator invokes the gate workload
- **THEN** the runner requires the approved target/window and does not start through the routine
  pull-request path

#### Scenario: Manual distributed rehearsal exits in any state

- **WHEN** all shards pass, any shard fails, aggregation fails, or the workflow is cancelled after
  the seed step begins
- **THEN** a separate always-run cleanup job restores the canonical seed and verifies 514 total
  show entries, 504 load entries, and zero scored load entries
