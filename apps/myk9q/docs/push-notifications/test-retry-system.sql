-- =====================================================
-- Test Script: Push Notification Retry System
-- =====================================================
-- This script simulates a notification failure and tests
-- the retry queue system end-to-end
--
-- Steps:
-- 1. Break the Edge Function (set wrong secret)
-- 2. Create test announcement (will fail and queue)
-- 3. Verify it was queued
-- 4. Fix the Edge Function (restore correct secret)
-- 5. Process the queue (retry)
-- 6. Verify success
-- =====================================================

-- =====================================================
-- STEP 1: Break the Edge Function (Simulate Failure)
-- =====================================================
-- Temporarily set an invalid trigger secret to force 401 error
SELECT update_push_notification_secrets(
  'INVALID_SECRET_FOR_TESTING_12345',  -- Wrong secret (will cause 401)
  (SELECT anon_key FROM push_notification_config WHERE id = 1),  -- Keep anon key same
  'retry_test'
);

-- Verify the secret was changed
SELECT
  left(trigger_secret, 30) || '...' as secret_preview,
  updated_by,
  updated_at
FROM push_notification_config;

-- Expected: secret_preview should show "INVALID_SECRET_FOR_TESTING..."

-- =====================================================
-- STEP 2: Create Test Announcement (Will Fail)
-- =====================================================
-- This will trigger notify_announcement_created() which will fail
-- because the trigger secret is wrong (401 Unauthorized)
INSERT INTO announcements (
  license_key,
  title,
  content,
  priority,
  author_role,
  author_name,
  is_active
) VALUES (
  'myK9Q1-a260f472-e0d76a33-4b6c264c',
  'RETRY TEST - Simulated Failure',
  'This announcement should fail to send and be queued for retry',
  'normal',
  'admin',
  'Retry Test System',
  true
);

-- Wait a moment for trigger to fire...
SELECT pg_sleep(2);

-- =====================================================
-- STEP 3: Verify Notification Was Queued
-- =====================================================
-- Check if the failed notification is in the queue
SELECT
  id,
  notification_type,
  retry_count,
  next_retry_at,
  last_error,
  status,
  created_at,
  payload->>'title' as notification_title
FROM push_notification_queue
WHERE notification_type = 'announcement'
ORDER BY created_at DESC
LIMIT 1;

-- Expected results:
-- - notification_type: 'announcement'
-- - retry_count: 0 (first attempt)
-- - next_retry_at: ~1 minute from now
-- - last_error: Should contain error message (401 or timeout)
-- - status: 'pending'
-- - notification_title: 'RETRY TEST - Simulated Failure'

-- Also check the admin view
SELECT * FROM view_failed_notifications;

-- =====================================================
-- STEP 4: Try to Process Queue (Should Fail Again)
-- =====================================================
-- This will try to retry but fail again because secret is still wrong
SELECT * FROM process_notification_queue();

-- Expected result:
-- processed | succeeded | retried | failed
-- ---------|-----------|---------|--------
--        1 |         0 |       1 |      0
-- (1 processed, 0 succeeded, 1 retried for later, 0 failed permanently)

-- Check queue again - retry_count should be incremented
SELECT
  id,
  retry_count,
  next_retry_at,
  last_error,
  status
FROM push_notification_queue
WHERE notification_type = 'announcement'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- - retry_count: 1 (now on second attempt)
-- - next_retry_at: ~5 minutes from now (exponential backoff)
-- - status: 'pending'

-- =====================================================
-- STEP 5: Fix the Edge Function (Restore Correct Secret)
-- =====================================================
-- Restore the correct trigger secret so retries will succeed
SELECT update_push_notification_secrets(
  'JZ4SDjwSx8Mr1UDVmaYIiNEQOsVMYkQIZneykpRK4Z8=',  -- Correct secret
  (SELECT anon_key FROM push_notification_config WHERE id = 1),
  'retry_test_fix'
);

-- Verify secret restored
SELECT
  left(trigger_secret, 30) || '...' as secret_preview,
  updated_by,
  updated_at
FROM push_notification_config;

-- Expected: secret_preview should show "JZ4SDjwSx8Mr1UDVmaYIiNEQOs..."

-- =====================================================
-- STEP 6: Force Immediate Retry
-- =====================================================
-- Normally we'd wait for next_retry_at, but let's force it now
UPDATE push_notification_queue
SET
  next_retry_at = NOW(),  -- Make it ready to process now
  status = 'pending'      -- Reset status
WHERE notification_type = 'announcement'
  AND status IN ('pending', 'retrying');

-- =====================================================
-- STEP 7: Process Queue (Should Succeed Now)
-- =====================================================
SELECT * FROM process_notification_queue();

-- Expected result:
-- processed | succeeded | retried | failed
-- ---------|-----------|---------|--------
--        1 |         1 |       0 |      0
-- (1 processed, 1 succeeded! 🎉)

-- =====================================================
-- STEP 8: Verify Success
-- =====================================================
-- Check if notification succeeded
SELECT
  id,
  retry_count,
  status,
  last_error,
  updated_at
FROM push_notification_queue
WHERE notification_type = 'announcement'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- - status: 'succeeded' ✅
-- - retry_count: 1 (took 1 retry to succeed)

-- Check if it's still in the failed view (should be empty now)
SELECT * FROM view_failed_notifications;
-- Expected: No rows (all succeeded)

-- Check Edge Function response logs (should show 200 success)
SELECT
  id,
  status_code,
  content::text,
  created
FROM net._http_response
ORDER BY id DESC
LIMIT 3;

-- Expected: Most recent should show status_code: 200

-- =====================================================
-- STEP 9: Check Your Device
-- =====================================================
-- If you have push notifications enabled on your device,
-- you should have received the notification:
--
-- Title: "RETRY TEST - Simulated Failure"
-- Body: "This announcement should fail to send and be queued for retry"
--
-- It may have come through on the retry (not the initial attempt)

-- =====================================================
-- STEP 10: Cleanup Test Data
-- =====================================================
-- Remove the test announcement
DELETE FROM announcements
WHERE title = 'RETRY TEST - Simulated Failure';

-- Remove the queue entry (if still there)
DELETE FROM push_notification_queue
WHERE notification_type = 'announcement'
  AND payload->>'title' = 'RETRY TEST - Simulated Failure';

-- Verify cleanup
SELECT COUNT(*) as remaining_test_entries
FROM push_notification_queue
WHERE payload->>'title' LIKE '%RETRY TEST%';

-- Expected: 0

-- =====================================================
-- TEST COMPLETE! 🎉
-- =====================================================
--
-- Summary of what we tested:
-- ✅ Notification fails when Edge Function is broken
-- ✅ Failed notification is queued with error message
-- ✅ Retry count increments on subsequent failures
-- ✅ Exponential backoff scheduling works (1min, 5min, etc)
-- ✅ Notification succeeds when Edge Function is fixed
-- ✅ Queue status changes to 'succeeded'
-- ✅ Actual push notification delivered to device
--
-- This proves the retry system will:
-- - Never lose notifications
-- - Automatically retry with exponential backoff
-- - Eventually succeed when service recovers
-- - Track all failures for debugging
--
-- =====================================================

-- =====================================================
-- BONUS: Test Dead Letter Queue
-- =====================================================
-- Want to test what happens after max retries?
-- Uncomment below to simulate 5+ failures:

/*
-- Set max_retries to 1 for faster testing
UPDATE push_notification_queue
SET max_retries = 1
WHERE id = (SELECT id FROM push_notification_queue ORDER BY created_at DESC LIMIT 1);

-- Break the secret again
SELECT update_push_notification_secrets(
  'INVALID_SECRET',
  (SELECT anon_key FROM push_notification_config WHERE id = 1),
  'dead_letter_test'
);

-- Process twice (will move to dead letter after 2nd failure)
SELECT * FROM process_notification_queue();
SELECT pg_sleep(1);
SELECT * FROM process_notification_queue();

-- Check dead letter queue
SELECT * FROM push_notification_dead_letter WHERE NOT acknowledged;

-- Should see the notification moved to dead letter queue!
-- Clean up by fixing secret and acknowledging:
SELECT update_push_notification_secrets(
  'JZ4SDjwSx8Mr1UDVmaYIiNEQOsVMYkQIZneykpRK4Z8=',
  (SELECT anon_key FROM push_notification_config WHERE id = 1),
  'cleanup'
);
*/
