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
- Distribute the unchanged 100-session/55-ringside workload across eight standard
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

### Use eight free runners with the same global workload

The shard count becomes eight, assigning global sequence `sequence % 8` to each shard.
This yields 12 or 13 sessions per runner while retaining exactly 100 sessions and 55
ringside sessions. The aggregator continues to validate all global sequences and uses
raw samples, not averaged shard percentiles. Eight standard runners remain within the
public GitHub Actions concurrency available to this repository and avoid paid runners.

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

## Risks / Trade-offs

- **[Risk]** A scoring query may be missed because provider query text changes. →
  **Mitigation:** fail closed on any non-zero rollback growth after cancellation, keep the
  predicate contract-tested, and require manual target recovery if the worker count cannot
  be proven zero.
- **[Risk]** Eight runners could hit a repository concurrency limit. → **Mitigation:** use
  the standard public runner label, `max-parallel: 8`, and fail closed on missing shard
  artifacts; no workload is silently reduced.
- **[Risk]** Metrics API access may pass preflight but fail during the load window. →
  **Mitigation:** the runtime sampler converts any missing CPU/IO sample to non-finite
  evidence and the evaluator rejects the result.

## Migration Plan

1. Run local unit, workflow-contract, discovery, typecheck, and OpenSpec validation.
2. Merge the reviewed workflow/code change before dispatching the manual rehearsal.
3. In an explicitly approved window, dispatch the unchanged G9 workload.
4. Require drain, complete eight-shard artifacts, CPU/IO evidence, and `514|504|0`
   restoration before interpreting the result.

Rollback is a source revert before any rehearsal. If a rehearsal has started, use the
workflow's drain gate and canonical seed recovery procedure; never bypass the quiet
window to restore row counts.

## Open Questions

- Whether eight standard runners provide sufficient browser headroom will be answered by
  the next apples-to-apples evidence artifact; no capacity conclusion is made in source.
