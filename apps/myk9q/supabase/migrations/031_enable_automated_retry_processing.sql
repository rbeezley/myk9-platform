-- =====================================================
-- Migration 031: Enable Automated Retry Processing
-- =====================================================
-- Purpose: Enable pg_cron and schedule automatic retry processing
-- Schedule: Every 5 minutes
-- Date: 2025-11-02

-- =====================================================
-- 1. ENABLE PG_CRON EXTENSION
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- 2. SCHEDULE RETRY PROCESSOR
-- =====================================================
-- Remove existing job if it exists
SELECT cron.unschedule('process-push-notification-queue')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-push-notification-queue'
);

-- Schedule the retry processor to run every 5 minutes
SELECT cron.schedule(
  'process-push-notification-queue',  -- Job name
  '*/5 * * * *',                      -- Every 5 minutes (cron format: min hour day month weekday)
  $$ SELECT process_notification_queue(); $$
);

-- =====================================================
-- 3. VERIFY SCHEDULED JOB
-- =====================================================
-- Query to check the scheduled job:
-- SELECT jobid, jobname, schedule, command, active
-- FROM cron.job
-- WHERE jobname = 'process-push-notification-queue';

-- =====================================================
-- 4. MONITOR JOB EXECUTION
-- =====================================================
-- To see job execution history:
-- SELECT
--   jobid,
--   runid,
--   job_pid,
--   status,
--   return_message,
--   start_time,
--   end_time
-- FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-push-notification-queue')
-- ORDER BY start_time DESC
-- LIMIT 10;

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used to automatically process push notification retry queue every 5 minutes';
