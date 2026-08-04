# MYK9-157 — Continuous health checks and Run now

## Goal

Make `/admin/health` answer whether the platform is broken now by refreshing cheap checks continuously, retaining nightly deep checks, and adding a real site-admin-gated Run now action.

## Scope

- Define health-check cadence and stale windows in one shared TypeScript module.
- Add a continuous Edge Function mode that refreshes cheap checks and carries forward the last deep-check results.
- Schedule continuous and nightly health runs in Supabase without exposing `HEALTH_CRON_SECRET` to the browser.
- Add a `SECURITY DEFINER` site-admin RPC that queues a full health run through Vault-backed pg_net.
- Add the admin button, running/error state, and polling/refetch so the existing filter remains unchanged.
- Preserve the existing `/admin/health` surface; do not add a duplicate health page or sync workflow.

## Testing phase

- Unit-test cadence metadata, per-check stale thresholds, continuous carry-forward, and full-run behavior.
- Unit-test selector behavior for per-check freshness and parsing legacy snapshots.
- Test the Run now hook/page contract with mocked Supabase and query results.
- Add migration/source contract coverage for the RPC, grants, and schedules.
- Run focused Vitest files, then the app typecheck and relevant lint/build checks.

## Non-goals

- Do not expose or rotate the cron secret.
- Do not redesign `/admin/sync` or invent a second sync-monitoring surface.
- Do not push the migration or deploy the Edge Function from this task.
