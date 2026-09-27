## 1. Consolidate Existing Performance Tooling

- [x] 1.1 Inspect and either repair or replace the existing `apps/myk9show/src/test/performance/` tests/scripts; document which files were reused and remove any superseded duplicate implementation.
- [x] 1.2 Add route/role definitions and primary-content readiness checks for all routes required by MYK9-843; ensure unavailable sessions/data are reported as blocked rather than as fast successful loads.
- [x] 1.3 Add controlled cold/warm mobile and secretary desktop runs, repeat measurements, and record LCP, INP or labeled TBT proxy, CLS, TTFB, time-to-usable, JavaScript transfer, request count, slowest Supabase/PostgREST calls, and route chunk sizes.
- [x] 1.4 Add or update the single-command entry point and run browser automation through `pnpm qa:browser-session`; keep secrets/session state in local gitignored files and avoid shared-data mutations.

## 2. Field Data and Baseline Evidence

- [x] 2.1 Check available Vercel Speed Insights/Analytics and Sentry performance traces; record source, time window, or access/data limitations.
- [x] 2.2 Build and measure the production bundle, inspect `dist/stats.html`, and save a dated cold/warm mobile and secretary desktop baseline in `docs/qa/perf-baseline-2026-09-26.md` with environment details and likely root causes.
- [ ] 2.3 Rank bottlenecks for MYK9-844 and update that issue with the ranked routes and evidence-supported causes.

## 3. Verification and Delivery

- [x] 3.1 Add focused coverage for route configuration, metric aggregation/labeling, and blocked-route behavior; run those tests and the benchmark command against the production build.
- [x] 3.2 Review generated results for missing routes, unavailable metric values, and accidental secrets; verify the dated baseline and bundle report are reproducible from the documented command.
- [ ] 3.3 Run OpenSpec validation and the repo's relevant quality checks, then complete the PR, CI, review, and merge gates before archiving the change.
