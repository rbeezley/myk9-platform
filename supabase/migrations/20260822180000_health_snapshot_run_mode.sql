-- =============================================================================
-- Migration: give system_health_snapshots a run-mode discriminator and narrow
--            the daily-health-snapshot-watchdog predicate to it.
--
-- QA-HEALTH-WATCHDOG-INERT-2026-08-22.
--
-- The watchdog (20260711200000) raises an operator_alert when NO snapshot with
-- `source = 'cron-health-check'` exists between 07:00 and 08:00 UTC. That was
-- correct when the runner fired once a day. Since MYK9-157 (20260804161000) the
-- `continuous-health-check` pg_cron calls the same function every five minutes
-- and writes snapshots with that SAME source, so twelve of them land inside the
-- detection window every day. Measured 2026-08-22 over the prior seven days:
-- 13 rows in the window, every single day. The predicate has therefore been
-- unsatisfiable since 2026-08-04, and the runbook's "two independent paths"
-- for a missed nightly run has really been one path.
--
-- Fix: record WHICH kind of run wrote each row, and let the watchdog count only
-- the nightly full run.
--
-- Deploy-order safety: the new predicate is `run_mode IS DISTINCT FROM
-- 'continuous'`, not `run_mode = 'full'`. Rows written before the matching
-- function deploy have a NULL run_mode, and NULL must keep counting as a
-- nightly run — otherwise this migration landing ahead of the deploy would make
-- the watchdog fire a false "snapshot missing" alert at the next 08:00. That
-- makes the two halves order-independent; once the function is deployed the
-- predicate is exact, because every new row carries a run_mode.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Column
--    Nullable on purpose: existing rows predate the discriminator and there is
--    no way to reconstruct which ones were nightly. No backfill, no DEFAULT --
--    a DEFAULT would silently label future continuous rows as full if the
--    function ever stopped sending the value.
-- -----------------------------------------------------------------------------
alter table public.system_health_snapshots
  add column if not exists run_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.system_health_snapshots'::regclass
      and conname = 'system_health_snapshots_run_mode_check'
  ) then
    alter table public.system_health_snapshots
      add constraint system_health_snapshots_run_mode_check
      check (run_mode is null or run_mode in ('continuous', 'full'));
  end if;
end
$$;

comment on column public.system_health_snapshots.run_mode is
  'Which cron wrote this row: ''full'' (the 07:00 nightly or a manual Run now) or ''continuous'' (the five-minute job). NULL = written before 2026-08-22, when the two were indistinguishable. daily-health-snapshot-watchdog counts only non-continuous rows; see QA-HEALTH-WATCHDOG-INERT-2026-08-22.';

-- No GRANT needed: system_health_snapshots carries TABLE-level privileges
-- (`authenticated=r`, `service_role=arwdDxtm`, verified against the applied
-- database on 2026-08-22, no column-level ACLs), so a new column inherits them.
-- If column-level grants are ever introduced on this table, this migration's
-- assumption breaks and the column must be granted explicitly.

-- -----------------------------------------------------------------------------
-- 2. Watchdog: count only nightly runs inside the expected window
--    Body copied from 20260711200000_daily_health_snapshot_watchdog.sql with the
--    two snapshot CTEs re-scoped. Everything else -- schedule, dedupe key,
--    detail payload, ON CONFLICT -- is unchanged.
-- -----------------------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-health-snapshot-watchdog';

select cron.schedule(
  'daily-health-snapshot-watchdog',
  '0 8 * * *',
  $health_watchdog$
  WITH run_window AS (
    SELECT
      (
        date_trunc('day', now() AT TIME ZONE 'UTC') + interval '7 hours'
      ) AT TIME ZONE 'UTC' AS expected_at,
      (
        date_trunc('day', now() AT TIME ZONE 'UTC') + interval '8 hours'
      ) AT TIME ZONE 'UTC' AS deadline_at
  ),
  expected_window_snapshot AS (
    SELECT snapshots.created_at
    FROM public.system_health_snapshots AS snapshots
    CROSS JOIN run_window
    WHERE snapshots.source = 'cron-health-check'
      AND snapshots.run_mode IS DISTINCT FROM 'continuous'
      AND snapshots.created_at >= run_window.expected_at
      AND snapshots.created_at < run_window.deadline_at
    ORDER BY snapshots.created_at DESC
    LIMIT 1
  ),
  latest_snapshot AS (
    SELECT snapshots.created_at
    FROM public.system_health_snapshots AS snapshots
    WHERE snapshots.source = 'cron-health-check'
      AND snapshots.run_mode IS DISTINCT FROM 'continuous'
    ORDER BY snapshots.created_at DESC
    LIMIT 1
  )
  INSERT INTO public.operator_alerts (
    source,
    severity,
    title,
    detail,
    dedupe_key
  )
  SELECT
    'daily-health-snapshot-watchdog',
    'error',
    'Daily health snapshot missing',
    jsonb_build_object(
      'job_name', 'daily-health-check',
      'snapshot_source', 'cron-health-check',
      'snapshot_run_mode', 'full',
      'expected_at', run_window.expected_at,
      'deadline_at', run_window.deadline_at,
      'checked_at', now(),
      'latest_snapshot_at', (SELECT created_at FROM latest_snapshot)
    ),
    'daily-health-check:' ||
      to_char(run_window.expected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  FROM run_window
  LEFT JOIN expected_window_snapshot ON true
  WHERE expected_window_snapshot.created_at IS NULL
  ON CONFLICT (source, dedupe_key)
    WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL
  DO NOTHING;
  $health_watchdog$
);

commit;

notify pgrst, 'reload schema';
