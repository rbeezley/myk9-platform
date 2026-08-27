> **Workload freeze superseded 2026-08-27.** Every "unchanged 100-session/55-ringside"
> constraint below is a record of what this change preserved, not a forward requirement.
> The 55 ringside sessions put roughly seven concurrent scorers on every class, which
> cannot happen at a real show, so the workload is being remodelled by
> `openspec/changes/model-realistic-show-day-load/`. The teardown, drain, topology and
> platform-evidence work in this change is unaffected and stands.

## Why

The first instrumented G9 rehearsal proved that the four 25-session browser generators were saturated and that timed-out scoring requests survived into fixture cleanup, causing a rollback storm and an approved Supabase restart. Before another remote rehearsal can produce trustworthy capacity evidence, teardown must fail closed on active scoring work, the unchanged workload must be spread across more free runners, and the aggregate artifact must contain complete CPU/IO telemetry.

This directly supports fall 2026 launch readiness by protecting the shared prelaunch rehearsal target and separating generator failure from real show-day backend capacity. It does not duplicate a product surface: this is operational test infrastructure, and a link cannot enforce server-side cleanup or make a load measurement valid.

## What Changes

- Add teardown preflight/drain checks that cancel or wait for in-flight scoring work, require zero active scoring workers, and require a bounded quiet rollback window before reseeding.
- Pair canonical trial-packet Storage deletion with snapshot-row cleanup before reseeding; SQL-only reseeds fail closed instead of orphaning immutable PDFs.
- Expand the unchanged 100-session/55-ringside rehearsal across additional standard public GitHub runners without weakening duration, roles, fixture, or thresholds.
- Preserve exact global assignment and percentile aggregation for the larger shard topology.
- Ensure Supabase CPU and disk IO samples are captured and carried into the aggregate evidence; missing telemetry remains a hard failure.
- Add assertion-first unit and workflow contracts for teardown safety, shard topology, and complete platform evidence.
- Follow-up authorized after the failed eight-shard run: restrict generator metrics to the active workload window and batch existing class-visibility replication reads across trials. Preserve the current cascade, RBAC, offline storage and all workload thresholds.
- Guard the opt-in readiness diagnostic against automatic page-entry writes; retain only safe endpoint/request-count evidence locally.
- Open fully cached scoresheets without waiting for network hydration, retaining foreground hydration for incomplete caches and explicit retries/corrections.

Non-goals:

- No reduction of G9 thresholds, session count, duration, fixture size, or workload coverage.
- No production load, compute-tier upgrade, or shared-system rehearsal execution in this change.
- No user-facing UI or new product surface.
- No broad backend tuning or database migration. The targeted client-side read batching addresses measured startup fan-out; it does not establish a Micro capacity ceiling.

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
- Existing class-visibility replication enrichment, with no new product surface or API.
- Existing at-show scoresheet readiness, with unchanged scoring mutations and no new UI.
