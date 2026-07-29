## Why

The existing myK9Show load harness has never produced a recorded rehearsal and its Playwright
entry points currently exit without finding tests. Repairing and exercising the existing harness
against a realistic show-day workload is required to prove that the fall 2026 launch candidate can
support at least 50 concurrent ringside sessions without exhausting its 60-connection database cap
or missing the documented latency, error-rate, throughput, and availability targets.

## What Changes

- Add a load-specific Playwright configuration and point every Playwright load script at it so a
  non-zero test count is visible and a missing suite fails closed.
- Audit and refresh the existing Playwright, database, k6, Artillery, framework, and runner
  scenarios for the consolidated myK9Show `/at-show` workflow.
- Model the gate workload as 100 concurrent users with at least 50 concurrent ringside scoring
  sessions plus secretary check-in, exhibitor reads, and run-order/dogs-ahead reads.
- Extend the canonical demo seed path to generate approximately 500 entries across multiple
  trials and classes without creating a parallel fixture.
- Add bounded instrumentation and a rehearsal evidence format covering peak CPU and connections,
  scoring-write p95, SQLSTATE `40001` rate, replication queue depth, throughput, availability, and
  the assumed Supabase compute tier.
- Decide and encode an appropriate recurring workflow that detects entry-point and scenario rot
  without running a destructive or expensive load rehearsal on every pull request.
- Add an explicitly manual, approval-gated four-shard GitHub Actions rehearsal that uses only
  standard free public-repository runners, serves the frontend on each runner, and keeps Vercel
  outside the load path.
- Record the passing rehearsal, supported ceiling, and tracking updates only after running against
  staging or the isolated E2E project after MYK9-111.

Non-goals:

- No new load-test framework or duplicate product/testing surface.
- No load against the production-candidate Supabase project.
- No unrelated database, RLS, query, replication, or MYK9-114 sequential-scan remediation.
- No new user-facing page, dialog, or control.
- No claim that G9 is closed from a recorded-but-failing run, a stock browse-heavy scenario, or a
  run missing the required platform metrics.

This does not duplicate an existing product surface. It repairs and consolidates the existing
load harness; a link cannot make its broken entry points execute or make its stale workload
represent show day.

## Capabilities

### New Capabilities

- `show-day-load-rehearsal`: Defines executable entry points, realistic fixture/workload shape,
  environment safety, required instrumentation, scenario-specific grading, ceiling evidence, and
  recurring rot detection for capacity rehearsals.

### Modified Capabilities

- `go-live-phase-4-evidence-pass-verification`: Adds the G9 capacity rehearsal to the evidence-bound
  Phase 4 checklist and prevents a missing or failing rehearsal from closing the gate.

## Impact

- `apps/myk9show/playwright.load.config.ts` and `apps/myk9show/package.json`
- `apps/myk9show/src/test/load/` scenarios, runner, metrics, tests, and documentation
- `apps/myk9show/scripts/` load orchestration and evidence helpers as needed
- `supabase/seed-demo.sql` and its focused source-contract tests
- CI/workflow configuration for safe recurring harness validation
- A manual GitHub Actions matrix for four synchronized 25-session generators, exact shard
  aggregation, evidence upload, and unconditional canonical reseed
- OpenSpec, MYK9-109, the Phase 4 runbook, and launch-readiness scorecard evidence
- Staging or the isolated E2E Supabase project during the explicitly targeted rehearsal; no
  production-candidate mutation or load
