-- Test RLS Policies
-- Purpose: Verify that all tables have RLS enabled and policies are working
-- Run this AFTER applying migration 20251117000003_add_rls_policies.sql

-- ============================================================================
-- TEST 1: Verify RLS is Enabled
-- ============================================================================
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'judge_profiles',
  'nationals_scores',
  'nationals_rankings',
  'nationals_advancement',
  'class_requirements',
  'announcement_rate_limits',
  'push_notification_queue',
  'push_notification_dead_letter',
  'event_statistics',
  'tv_messages',
  'show_result_visibility_defaults',
  'trial_result_visibility_overrides',
  'class_result_visibility_overrides'
)
ORDER BY tablename;

-- Expected: All 13 tables should have rls_enabled = true

-- ============================================================================
-- TEST 2: Count Policies Per Table
-- ============================================================================
SELECT
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'judge_profiles',
  'nationals_scores',
  'nationals_rankings',
  'nationals_advancement',
  'class_requirements',
  'announcement_rate_limits',
  'push_notification_queue',
  'push_notification_dead_letter',
  'event_statistics',
  'tv_messages',
  'show_result_visibility_defaults',
  'trial_result_visibility_overrides',
  'class_result_visibility_overrides'
)
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Expected: Each table should have 4 policies (SELECT, INSERT, UPDATE, DELETE)

-- ============================================================================
-- TEST 3: List All Policies
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'judge_profiles',
  'nationals_scores',
  'nationals_rankings',
  'nationals_advancement',
  'class_requirements',
  'announcement_rate_limits',
  'push_notification_queue',
  'push_notification_dead_letter',
  'event_statistics',
  'tv_messages',
  'show_result_visibility_defaults',
  'trial_result_visibility_overrides',
  'class_result_visibility_overrides'
)
ORDER BY tablename, policyname;

-- ============================================================================
-- TEST 4: Verify SECURITY DEFINER Views Still Work
-- ============================================================================
-- These views should bypass RLS and return data

SELECT 'Testing view_class_summary' as test_name,
       COUNT(*) as record_count
FROM view_class_summary
LIMIT 1;

SELECT 'Testing view_entry_with_results' as test_name,
       COUNT(*) as record_count
FROM view_entry_with_results
LIMIT 1;

SELECT 'Testing view_trial_summary_normalized' as test_name,
       COUNT(*) as record_count
FROM view_trial_summary_normalized
LIMIT 1;

-- Expected: All views should return counts without errors

-- ============================================================================
-- TEST 5: Verify Base Tables Are Still Accessible
-- ============================================================================
-- With current policies (allowing all), these should work

SELECT 'Testing judge_profiles access' as test_name,
       COUNT(*) as record_count
FROM judge_profiles
LIMIT 1;

SELECT 'Testing class_requirements access' as test_name,
       COUNT(*) as record_count
FROM class_requirements
LIMIT 1;

SELECT 'Testing nationals_scores access' as test_name,
       COUNT(*) as record_count
FROM nationals_scores
LIMIT 1;

-- Expected: All tables should return counts without errors

-- ============================================================================
-- TEST 6: Security Summary Report
-- ============================================================================
WITH table_security AS (
  SELECT
    t.tablename,
    t.rowsecurity as rls_enabled,
    COUNT(p.policyname) as policy_count
  FROM pg_tables t
  LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
  WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'judge_profiles',
    'nationals_scores',
    'nationals_rankings',
    'nationals_advancement',
    'class_requirements',
    'announcement_rate_limits',
    'push_notification_queue',
    'push_notification_dead_letter',
    'event_statistics',
    'tv_messages',
    'show_result_visibility_defaults',
    'trial_result_visibility_overrides',
    'class_result_visibility_overrides'
  )
  GROUP BY t.tablename, t.rowsecurity
)
SELECT
  tablename,
  rls_enabled,
  policy_count,
  CASE
    WHEN rls_enabled AND policy_count >= 4 THEN '✅ Fully Protected'
    WHEN rls_enabled AND policy_count < 4 THEN '⚠️  RLS Enabled but Missing Policies'
    WHEN NOT rls_enabled THEN '❌ RLS NOT Enabled'
    ELSE '❓ Unknown Status'
  END as security_status
FROM table_security
ORDER BY security_status, tablename;

-- Expected: All tables should show "✅ Fully Protected"

-- ============================================================================
-- FINAL REPORT
-- ============================================================================
DO $$
DECLARE
  total_tables int;
  protected_tables int;
  total_policies int;
BEGIN
  SELECT COUNT(*) INTO total_tables
  FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN (
    'judge_profiles',
    'nationals_scores',
    'nationals_rankings',
    'nationals_advancement',
    'class_requirements',
    'announcement_rate_limits',
    'push_notification_queue',
    'push_notification_dead_letter',
    'event_statistics',
    'tv_messages',
    'show_result_visibility_defaults',
    'trial_result_visibility_overrides',
    'class_result_visibility_overrides'
  );

  SELECT COUNT(*) INTO protected_tables
  FROM pg_tables
  WHERE schemaname = 'public'
  AND rowsecurity = true
  AND tablename IN (
    'judge_profiles',
    'nationals_scores',
    'nationals_rankings',
    'nationals_advancement',
    'class_requirements',
    'announcement_rate_limits',
    'push_notification_queue',
    'push_notification_dead_letter',
    'event_statistics',
    'tv_messages',
    'show_result_visibility_defaults',
    'trial_result_visibility_overrides',
    'class_result_visibility_overrides'
  );

  SELECT COUNT(*) INTO total_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename IN (
    'judge_profiles',
    'nationals_scores',
    'nationals_rankings',
    'nationals_advancement',
    'class_requirements',
    'announcement_rate_limits',
    'push_notification_queue',
    'push_notification_dead_letter',
    'event_statistics',
    'tv_messages',
    'show_result_visibility_defaults',
    'trial_result_visibility_overrides',
    'class_result_visibility_overrides'
  );

  RAISE NOTICE '';
  RAISE NOTICE '=== RLS POLICY TEST RESULTS ===';
  RAISE NOTICE 'Total Tables Tested: %', total_tables;
  RAISE NOTICE 'Tables with RLS Enabled: %', protected_tables;
  RAISE NOTICE 'Total Policies Created: %', total_policies;
  RAISE NOTICE '';

  IF protected_tables = total_tables AND total_policies = total_tables * 4 THEN
    RAISE NOTICE '✅ SUCCESS: All tables are fully protected with RLS policies';
  ELSE
    RAISE WARNING '⚠️  INCOMPLETE: Some tables are missing RLS or policies';
    RAISE WARNING 'Expected: % tables with % policies', total_tables, total_tables * 4;
    RAISE WARNING 'Actual: % tables with % policies', protected_tables, total_policies;
  END IF;
END $$;
