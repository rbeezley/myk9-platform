# Daily Health Monitoring Evidence

**Checked:** 2026-07-15 08:15 UTC

**Project:** `sojmvhhwsjxmfistvzbe`

**Mutation performed:** none

## Read-only baseline

- `daily-health-check` is active at `0 7 * * *`; its 2026-07-15 run reported `succeeded`.
- `daily-health-snapshot-watchdog` is active at `0 8 * * *`; its 2026-07-15 run reported
  `succeeded` with `return_message = INSERT 0 0`.
- The newest `cron-health-check` row is `2026-07-15 07:00:02.440617 UTC` with
  `overall_status = ok` and `source = cron-health-check`.
- Both scheduled jobs execute as `postgres`, matching the required owner for the watchdog proof.

No secret value was read into this evidence file.

## SQL-only watchdog

The focused source contract was recorded RED with five failures before
`20260711200000_daily_health_snapshot_watchdog.sql` existed. It is GREEN at 5/5 after adding the
08:00 UTC pure-SQL watchdog.

The watchdog:

- checks the `cron-health-check` snapshot window from 07:00 UTC through 08:00 UTC;
- uses the existing descending `created_at` index and no Edge, `pg_net`, Vault, or secret path;
- inserts an `error` alert from `daily-health-snapshot-watchdog` with stable dedupe key
  `daily-health-check:YYYY-MM-DD`, the missed window, and the most recent prior snapshot time;
- relies on the unresolved-only unique index so a repeated open miss deduplicates and a recurrence
  after resolution can alert again; and
- documents exact unschedule rollback SQL.

A read-only live `EXPLAIN (FORMAT JSON, COSTS OFF)` selected
`system_health_snapshots_created_at_desc_idx` via a `Bitmap Index Scan` for the same bounded
timestamp predicate. The approved write proof, deduplication/recurrence proof, and rollback
evidence are recorded in the runbook. The 2026-07-15 `cron.job_run_details` read-back now proves
the first scheduled path is live under the recorded `postgres` owner; no shared-system mutation
was performed during this evidence sweep.

## External Sentry Cron path

Focused tests were recorded RED before the shared seam and Edge wiring existed. They are GREEN at
11/11 and prove correlated `in_progress`/`ok`/`error` check-ins, original-error preservation,
snapshot persistence when start or terminal delivery fails, best-effort flush behavior, and the
no-DSN path.

The Edge runner uses optional Supabase-side `SENTRY_DSN` and `SENTRY_ENVIRONMENT` values. It does
not require them for snapshot generation, does not read the browser DSN, starts monitoring only
after request authentication, and does not mutate monitor schedule configuration. The live
correlated `in_progress` → `ok` check-in, Sentry monitor creation, named-human routing, secret
configuration, deployment, and missed/recovery proof remain unverified operator/shared-system
tasks. The 2026-07-15 database query cannot establish those external Sentry facts.
