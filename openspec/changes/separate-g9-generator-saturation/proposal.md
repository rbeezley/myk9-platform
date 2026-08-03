## Why

The first instrumented G9 rehearsal proved that the four 25-session browser generators were saturated and that timed-out scoring requests survived into fixture cleanup, causing a rollback storm and an approved Supabase restart. Before another remote rehearsal can produce trustworthy capacity evidence, teardown must fail closed on active scoring work, the unchanged workload must be spread across more free runners, and the aggregate artifact must contain complete CPU/IO telemetry.

This directly supports fall 2026 launch readiness by protecting the shared prelaunch rehearsal target and separating generator failure from real show-day backend capacity. It does not duplicate a product surface: this is operational test infrastructure, and a link cannot enforce server-side cleanup or make a load measurement valid.

## What Changes

- Add teardown preflight/drain checks that cancel or wait for in-flight scoring work, require zero active scoring workers, and require a bounded quiet rollback window before reseeding.
- Expand the unchanged 100-session/55-ringside rehearsal across additional standard public GitHub runners without weakening duration, roles, fixture, or thresholds.
- Preserve exact global assignment and percentile aggregation for the larger shard topology.
- Ensure Supabase CPU and disk IO samples are captured and carried into the aggregate evidence; missing telemetry remains a hard failure.
- Add assertion-first unit and workflow contracts for teardown safety, shard topology, and complete platform evidence.

Non-goals:

- No reduction of G9 thresholds, session count, duration, fixture size, or workload coverage.
- No production load, compute-tier upgrade, or shared-system rehearsal execution in this change.
- No user-facing UI or new product surface.
- No broad backend tuning beyond the evidence needed to separate generator saturation from database capacity.

## Capabilities

### New Capabilities

- `g9-rehearsal-safety`: Defines fail-closed teardown, expanded free-runner topology, and complete platform evidence for the next G9 rehearsal.

### Modified Capabilities

- None.

## Impact

- `.github/workflows/load-rehearsal.yml` cleanup and shard matrix.
- `apps/myk9show/src/test/load/` shard, teardown, platform telemetry, aggregation, and contract tests.
- `apps/myk9show/scripts/` only if a focused typed helper is needed.
- OpenSpec rehearsal evidence and task tracking; no production application API changes.
