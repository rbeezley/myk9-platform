# MYK9-156 — Sentry proxy for admin dashboard metrics

> **Status:** Complete

## Scope

Add one authenticated Supabase Edge Function that reads Sentry's organization
Explore API without exposing the Sentry API token. It returns normalized error
rate and client-observed transaction p95 values to the existing
`/admin/dashboard` stat-tile surface.

This does not add a new dashboard page, uptime monitoring, traffic charts, or a
server-latency claim. The existing stat tiles are the single surface for these
metrics.

## Implementation

1. Add a site-admin-only `sentry-dashboard-metrics` Edge Function.
2. Query the Sentry Explore timeseries endpoint for error rate and p95
   transaction duration.
3. Cache each metric independently for about one minute and serve stale cached
   data when only its upstream query fails.
4. Add a typed client hook that invokes the function and exposes each metric's
   fresh/stale/unavailable state.
5. Add the two tiles to the existing dashboard with labels that identify p95 as
   client-observed and avoid rendering unavailable data as zero.

## Testing

- Unit-test proxy URL construction, Sentry response parsing, cache fallback, and
  site-admin authorization/error behavior.
- Unit-test client response mapping and dashboard tile labels/error states.
- Run focused Vitest tests, app typecheck/build/lint, then the full app test
  suite once at the end if it remains within the repository's normal runtime.

## Deployment prerequisites

Before deploying the function, provision `SENTRY_API_TOKEN` and
`SENTRY_ORGANIZATION_SLUG` as Supabase Edge Function secrets. Never commit their
values. Before treating the p95 tile as reliable, verify the deployed
`VITE_SENTRY_TRACES_SAMPLE_RATE`; the dashboard warns when it is below 10%.
