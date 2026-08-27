## MODIFIED Requirements

### Requirement: Generator topology preserves the unchanged G9 workload

The manual rehearsal SHALL use sixteen standard public GitHub runners with one unique
shard index each. Together the shards MUST cover the active scenario's full session set
exactly once, preserving its role composition, duration, fixture, and every global
assignment sequence exactly once.

Session counts SHALL come from the scenario definition and MUST NOT be frozen in this
requirement. The prior text fixed them at "exactly 100 sessions, 55 ringside sessions",
which three changes then preserved verbatim without ever modelling them. Fifty-five
ringside sessions distribute across eight class IDs by `(entryNumber - 1) % 8`, placing
roughly seven sessions scoring seven different dogs in the same class at once; a class is
scored by one judge, one dog at a time. See `model-realistic-show-day-load`.

The requirement's original name is retained so this modification targets it. The topology
guarantee it carries — sixteen runners, unique shard indexes, exact sequence coverage,
raw-sample percentiles — is unchanged and still binding.

#### Scenario: Shards aggregate the same workload

- **WHEN** all sixteen synchronized shard artifacts are aggregated
- **THEN** the aggregator accepts uneven per-shard session counts whose combined global sequences represent the active scenario exactly once

#### Scenario: Topology is incomplete or duplicated

- **WHEN** aggregation receives fewer, more, duplicate, late, or overlapping shard artifacts
- **THEN** it fails closed without producing a valid G9 decision
