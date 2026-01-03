-- =====================================================
-- Security Fix: Update Push Notification Secrets
-- =====================================================
-- This SQL updates the push notification config with your new secure secret
-- Run this AFTER applying Migration 028
--
-- Instructions:
-- 1. Make sure Migration 028 has been applied first
-- 2. Copy this entire file
-- 3. Go to: https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx/sql/new
-- 4. Paste and execute
-- 5. Verify the output shows "Successfully updated secrets"
-- =====================================================

-- Update the config with new secret
SELECT update_push_notification_secrets(
  'JZ4SDjwSx8Mr1UDVmaYIiNEQOsVMYkQIZneykpRK4Z8=',  -- New secure secret (never expires!)
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMjYzMzIsImV4cCI6MjA3MDYwMjMzMn0.vXgwI9HyBMiH-t6WP13unRgFVc9rg3khDRNdhIedWqs',  -- Current anon key
  'Richard'  -- Your name for audit trail
);

-- Verify the update worked (should show 1 row with your new secret preview)
SELECT
  id,
  left(trigger_secret, 20) || '...' as secret_preview,
  left(anon_key, 40) || '...' as key_preview,
  updated_at,
  updated_by
FROM push_notification_config;

-- =====================================================
-- Expected Output:
-- id | secret_preview        | key_preview                               | updated_at           | updated_by
-- ---|-----------------------|-------------------------------------------|----------------------|-----------
--  1 | JZ4SDjwSx8Mr1UDVMA... | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.... | 2025-11-01 XX:XX:XX  | Richard
-- =====================================================

-- Test by creating a test announcement (after updating Edge Function env var)
-- Uncomment below to test:
/*
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
  'Security Fix Test',
  'Testing push notifications after security fix',
  'normal',
  'admin',
  'System Test',
  true
);
*/

-- Check if the notification was sent successfully
-- Run this AFTER creating test announcement above:
/*
SELECT
  id,
  status_code,
  content::text,
  created
FROM net._http_response
ORDER BY id DESC
LIMIT 3;
*/

-- Status code 200 = Success!
-- Status code 401 = Auth failed (Edge Function secret not updated yet)
-- Status code 500 = Edge Function error
