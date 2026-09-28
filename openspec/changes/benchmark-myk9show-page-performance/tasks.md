## 1. Consolidate Existing Performance Tooling

- [x] 1.1 Inspect and either repair or replace the existing `apps/myk9show/src/test/performance/` tests/scripts; document which files were reused and remove any superseded duplicate implementation.
- [x] 1.2 Replace generic-heading readiness with route-specific data or intentional loaded-empty states; ensure loading/errors and unavailable sessions/data are blocked rather than counted as usable.
- [x] 1.3 Run controlled cold and primed service-worker-warm mobile and secretary desktop pairs in isolated browser workers; record LCP, INP or labeled TBT proxy, CLS, TTFB, time-to-usable, encoded JavaScript transfer, network request count, slowest Supabase/PostgREST calls, and route chunks. Block any warm attempt without worker-controlled script evidence.
- [x] 1.4 Add or update the single-command entry point and run browser automation through `pnpm qa:browser-session`; keep secrets/session state in local gitignored files and avoid shared-data mutations.
- [x] 1.5 Delete Markdown resume parsing; add a run manifest, atomic per-pair JSON results, exact matrix validation, and a dated output path.

## 2. Field Data and Baseline Evidence

- [x] 2.1 Check available Vercel Speed Insights/Analytics and Sentry performance traces; record source, time window, or access/data limitations.
- [x] 2.2 Rebuild and measure the complete production route/profile matrix, inspect `dist/stats.html`, and save a new dated baseline with environment details, blocked attempts, and evidence-supported causes.
- [ ] 2.3 Rank bottlenecks for MYK9-844 and update that issue with the ranked routes and evidence-supported causes.

## 3. Verification and Delivery

- [x] 3.1 Add focused coverage for route readiness, manifest/result validation, metric aggregation, and blocked-worker behavior; run those tests and the benchmark command against the production build.
- [x] 3.2 Review the regenerated complete matrix for missing/duplicate pairs, unavailable metrics, and accidental secrets; verify the dated baseline and bundle report are reproducible.
- [ ] 3.3 Run OpenSpec validation and the repo's relevant quality checks, then complete the PR, CI, review, and merge gates before archiving the change.
