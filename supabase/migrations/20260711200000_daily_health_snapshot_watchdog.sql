-- Daily health snapshot watchdog.
--
-- The 07:00 UTC daily-health-check job only proves that pg_cron queued its
-- asynchronous Edge request. This pure-SQL job runs at 08:00 UTC and proves
-- that the runner actually persisted a cron-health-check snapshot during the
-- expected one-hour window. A miss becomes a durable /admin/health alert.
--
-- Independence is deliberate: this job does not call the Edge Function and
-- does not depend on its HTTP delivery path or credentials.
--
-- Rollback (run in a follow-up migration):
-- SELECT cron.unschedule(jobid)
-- FROM cron.job
-- WHERE jobname = 'daily-health-snapshot-watchdog';

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily-health-snapshot-watchdog';

SELECT cron.schedule(
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
      AND snapshots.created_at >= run_window.expected_at
      AND snapshots.created_at < run_window.deadline_at
    ORDER BY snapshots.created_at DESC
    LIMIT 1
  ),
  latest_snapshot AS (
    SELECT snapshots.created_at
    FROM public.system_health_snapshots AS snapshots
    WHERE snapshots.source = 'cron-health-check'
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

COMMIT;
