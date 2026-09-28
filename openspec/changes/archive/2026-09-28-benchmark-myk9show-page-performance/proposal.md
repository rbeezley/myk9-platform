## Why

MYK9-843 establishes a single-user performance baseline before fall 2026 launch readiness work proceeds. Without repeatable per-route measurements, slow secretary and ringside workflows and later regressions are hard to identify.

## What Changes

- Turn the existing performance tooling in `apps/myk9show/src/test/performance/` into a repeatable production-build benchmark for representative routes across public, exhibitor, secretary, judge/ringside, and admin roles.
- Record cold and warm mobile results, desktop results for secretary routes, usability timing, web performance metrics, transferred JavaScript, request counts, slow backend calls, and route chunk sizes.
- Check available Vercel and Sentry field-performance data before introducing new measurement services.
- Commit a dated baseline and ranked bottlenecks with likely causes for follow-up in MYK9-844.

**Non-goals:** optimize pages or change product behavior (tracked in MYK9-844); measure concurrent-user capacity or repair the load rehearsal harness (MYK9-109 and MYK9-126); add an in-product dashboard or duplicate a parallel performance harness.

## Capabilities

### New Capabilities

- `page-performance-benchmarking`: repeatable production-build measurement and recorded baseline for representative myK9Show routes.

### Modified Capabilities

- None. This work adds engineering diagnostics and does not change user-facing requirements.

## Impact

- Likely files: existing tooling under `apps/myk9show/src/test/performance/`, the existing `performance:baseline` command, and a dated `docs/qa/perf-baseline-YYYY-MM-DD.md` report.
- Reuse the existing Vite production build and bundle visualizer; no new application UI, dependency, or production configuration is intended.
- Duplication check: a basic Playwright performance test and loader script already exist. The ticket needs route/role coverage, controlled cold/warm profiles, complete metrics, and committed evidence that those tools do not provide, so extend or replace them in place rather than creating a second harness. This is engineering evidence; a link to an app page cannot substitute for repeatable route measurements.
