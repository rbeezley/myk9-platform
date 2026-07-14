# Daily Health Monitoring Evidence

**Checked:** 2026-07-11 15:59 UTC

**Project:** `sojmvhhwsjxmfistvzbe`

**Mutation performed:** none

## Read-only baseline

- `daily-health-check` is active at `0 7 * * *`; the July 11 scheduler run reported
  `succeeded`, which proves only that `net.http_post` was queued.
- The newest `cron-health-check` row remained `2026-07-10 07:00:02 UTC`, more than 30 hours old
  during evidence gathering.
- Deployed `cron-health-check` version 3 was active with JWT verification disabled, matching its
  internal `x-function-secret` authentication design.
- Redacted digest comparison showed that Vault `service_role_key` did not match the current Edge
  runtime service-role secret. The archived `pg_net` response was no longer available, so this is
  the leading delivery-failure hypothesis, not a closed root-cause claim. Vault reconciliation and
  a manual dispatch remain approval-gated.

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
timestamp predicate. The migration itself and a rolled-back write-path transaction were not run;
those remain behind the shared-system gate. The write proof must use the exact owner recorded in
`cron.job.username`, not `service_role`, and the first scheduled run must be checked in
`cron.job_run_details` so FORCE RLS or execution-role failures cannot remain hidden.

## External Sentry Cron path

Focused tests were recorded RED before the shared seam and Edge wiring existed. They are GREEN at
11/11 and prove correlated `in_progress`/`ok`/`error` check-ins, original-error preservation,
snapshot persistence when start or terminal delivery fails, best-effort flush behavior, and the
no-DSN path.

The Edge runner uses optional Supabase-side `SENTRY_DSN` and `SENTRY_ENVIRONMENT` values. It does
not require them for snapshot generation, does not read the browser DSN, starts monitoring only
after request authentication, and does not mutate monitor schedule configuration. Sentry monitor
creation, named-human routing, secret configuration, deployment, and missed/recovery proof remain
operator/shared-system tasks.
