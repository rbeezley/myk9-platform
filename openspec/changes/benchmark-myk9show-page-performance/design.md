## Context

MYK9Show already has performance files under `apps/myk9show/src/test/performance/`, but they cover a few routes, use fixed pass/fail budgets, and do not produce the role-by-route cold/warm evidence MYK9-843 requires. `apps/myk9show/vite.config.ts` already emits `dist/stats.html` with `rollup-plugin-visualizer`. This task is diagnosis only; MYK9-844 owns performance fixes, while MYK9-109 and MYK9-126 own concurrent-load work.

## Goals / Non-Goals

**Goals:**

- Make one documented command run the benchmark against a production build.
- Cover the requested routes for public, exhibitor, secretary, judge/ringside, and admin roles.
- Record cold and warm mobile metrics, secretary desktop metrics, route usability timing, slow backend calls, and route chunk sizes.
- Preserve raw measurements and their environment so the baseline can be rerun and compared.
- Check existing Vercel Speed Insights/Analytics and Sentry traces for field data without adding services.

**Non-Goals:**

- Change application runtime behavior, establish performance budgets, or optimize a route.
- Seed or mutate shared/production data, create test users, reset passwords, or store credentials in the repository.
- Build a dashboard or measure concurrent-user capacity.

## Decisions

1. **Extend the current performance area, not a new parallel harness.** Repair or replace the stale scripts under `apps/myk9show/src/test/performance/` and expose the benchmark as a root `pnpm` command. Keep the existing bundle analyzer as the chunk inventory source. A small route configuration will pair each requested path and role with a primary-content readiness condition; failure to become usable is recorded as a route failure, not counted as a successful load.

2. **Measure the production build in an owned browser session.** Build myK9Show and serve it with Vite preview. Launch browser work through the required `pnpm qa:browser-session` wrapper. Use a fresh browser context for cold measurements (empty service-worker, local storage, and IndexedDB state); prime the same context before the warm measurement. Apply a 4x CPU slowdown and Fast 4G and Slow 4G profiles on mobile. Run unthrottled desktop measurements for secretary routes. Record build SHA, browser version, viewport, throttle profile, run count, and date with the results.

3. **Collect lab metrics with explicit proxy semantics.** Capture LCP, CLS, TTFB, and INP where the browser produces it. Use TBT only as a labeled lab proxy when INP cannot be measured. Count network requests, sum JavaScript transfer sizes, record time until the route's primary data is visible, and rank slow Supabase/PostgREST calls. Repeat each condition and report the median; preserve per-run values so variability is visible. Use the bundle analyzer output to rank route chunks, and note when cross-origin timing restrictions prevent an exact transfer-size measurement.

4. **Use existing authorized test identities and read-only routes.** Read role session states from local, gitignored paths or existing E2E auth setup. The benchmark must not provision accounts, change passwords, submit entries, or perform scoring mutations. If credentials, session state, or required show data are missing, the run reports the affected route as blocked and continues with independent public routes; it must not silently present a partial run as complete.

5. **Treat field data as a manual preflight.** Check available Vercel and Sentry views before building new instrumentation. Record what was available and the time window; if access/data is absent, say so in the baseline rather than fabricating or substituting lab data.

6. **Isolate each cold/warm pair.** The first benchmark crashed Chromium on Reports, and its Markdown-based resume path could duplicate partial routes or mix builds. Remove that resume path. A parent process creates a run manifest (build identity, seed show, and expected route/profile/repeat pairs), then launches one browser worker per pair, sequentially to avoid CPU contention. Each worker writes one atomic JSON result; when a worker exits without one, the parent writes a blocked pair result. The parent validates each result against the manifest before rendering a dated report. A new run gets a new directory and report date; it never silently appends to an earlier baseline.

7. **Require data-backed readiness.** A generic heading can render during loading or error states. Each route predicate must identify primary data or an intentional loaded empty state, exclude loading/error UI, and be exercised against representative pages before its timing is accepted. Keep these predicates in the diagnostic harness so the measurement work does not change product behavior.

## Risks / Trade-offs

- [Role sessions or useful show data are unavailable] → Report blocked routes and exact prerequisites; do not create shared data or credentials as a side effect.
- [Background sync and third-party calls add noise] → Use repeated runs, record raw values and network conditions, and identify outliers rather than asserting pass/fail budgets.
- [Cross-origin Resource Timing omits transfer sizes] → Use browser protocol network events where available and label any remaining estimates.
- [A failed route can look like a fast route] → Require a route-specific primary-content condition and distinguish unusable/error results from timings.
- [A browser target crashes] → Isolate each pair in its own process and record the worker failure as blocked without losing the rest of the matrix.
- [Field dashboards are inaccessible] → Record the unavailable source and continue with the controlled lab baseline.

## Migration Plan

No production migration or deployment is required. Build and serve the local production bundle, run the benchmark, inspect the generated bundle report, and commit the dated evidence. Revert by removing the benchmark additions; no persisted user data is changed.

## Open Questions

- Which pre-existing role storage states and non-mutating show records are available for the secretary, exhibitor, judge/ringside, and admin routes?
- Does the existing `qa:browser-session` wrapper work with the browser-control approach selected during implementation, or should it launch the benchmark command while owning a separate CLI session as the repository rule requires?
