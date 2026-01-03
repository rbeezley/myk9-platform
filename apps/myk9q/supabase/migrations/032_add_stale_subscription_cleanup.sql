-- =====================================================
-- Migration 032: Stale Subscription Cleanup
-- =====================================================
-- Purpose: Remove push notification subscriptions that haven't been
--          updated in 90 days (likely abandoned devices)
-- Schedule: Weekly (every Sunday at 3 AM)
-- Date: 2025-11-02
-- Issue: #9 - Stale Subscription Cleanup
-- =====================================================

-- =====================================================
-- 1. CREATE CLEANUP FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_stale_subscriptions()
RETURNS TABLE (
  deleted_count INTEGER,
  execution_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
  v_start_time TIMESTAMPTZ;
BEGIN
  v_start_time := NOW();

  -- Delete subscriptions that haven't been updated in 90 days
  WITH deleted AS (
    DELETE FROM push_subscriptions
    WHERE updated_at < NOW() - INTERVAL '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  -- Log the cleanup operation
  RAISE NOTICE 'Stale subscription cleanup: Deleted % subscriptions older than 90 days', v_deleted_count;

  -- Return summary
  RETURN QUERY SELECT v_deleted_count, v_start_time;
END;
$$;

COMMENT ON FUNCTION cleanup_stale_subscriptions() IS 'Deletes push notification subscriptions that have not been updated in 90 days. These subscriptions are likely from abandoned devices. Runs weekly via pg_cron.';

-- =====================================================
-- 2. SCHEDULE CLEANUP JOB
-- =====================================================
-- Remove existing job if it exists
SELECT cron.unschedule('cleanup-stale-push-subscriptions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-push-subscriptions'
);

-- Schedule the cleanup to run every Sunday at 3 AM UTC
SELECT cron.schedule(
  'cleanup-stale-push-subscriptions',  -- Job name
  '0 3 * * 0',                          -- Every Sunday at 3 AM (cron format: min hour day month weekday)
  $$ SELECT cleanup_stale_subscriptions(); $$
);

-- =====================================================
-- 3. VERIFY SCHEDULED JOB
-- =====================================================
-- Query to check the scheduled job:
-- SELECT jobid, jobname, schedule, command, active
-- FROM cron.job
-- WHERE jobname = 'cleanup-stale-push-subscriptions';

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
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-stale-push-subscriptions')
-- ORDER BY start_time DESC
-- LIMIT 10;

-- =====================================================
-- 5. MANUAL EXECUTION (TESTING)
-- =====================================================
-- To manually run the cleanup (useful for testing):
-- SELECT * FROM cleanup_stale_subscriptions();

-- =====================================================
-- 6. CHECK STALE SUBSCRIPTIONS (BEFORE CLEANUP)
-- =====================================================
-- To see how many subscriptions would be deleted:
-- SELECT COUNT(*) as stale_count
-- FROM push_subscriptions
-- WHERE updated_at < NOW() - INTERVAL '90 days';
