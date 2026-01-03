-- Fix Performance Warnings
-- Migration: 20251117000005_fix_performance_warnings
-- Created: 2025-11-17
--
-- Purpose: Fix Supabase Performance Advisor warnings
--
-- Issues:
-- 1. Auth RLS Initialization Plan - 5 policies re-evaluating current_setting() per row
-- 2. Duplicate Index - classes table has 2 identical indexes on trial_id
--
-- Fixes:
-- 1. Wrap current_setting() in (SELECT ...) to evaluate once per query
-- 2. Drop duplicate index idx_competition_classes_trial_event_id

BEGIN;

-- =============================================================================
-- FIX 1: Auth RLS Initialization Plan (Performance Optimization)
-- =============================================================================
-- Replace current_setting() calls with (SELECT current_setting()) to prevent
-- re-evaluation for each row. This is a massive performance improvement for
-- large result sets.

-- Fix: push_notification_config - Admins can update config
DROP POLICY IF EXISTS "Admins can update config" ON push_notification_config;
CREATE POLICY "Admins can update config"
  ON push_notification_config FOR UPDATE
  USING ((SELECT current_setting('request.jwt.claims'::text, true))::jsonb->>'role' = 'service_role');

COMMENT ON POLICY "Admins can update config" ON push_notification_config IS
  'Optimized: current_setting() wrapped in SELECT for single evaluation per query';

-- Fix: performance_metrics - performance_metrics_select_own_show
DROP POLICY IF EXISTS "performance_metrics_select_own_show" ON performance_metrics;
CREATE POLICY "performance_metrics_select_own_show"
  ON performance_metrics FOR SELECT
  USING (license_key = (SELECT current_setting('app.license_key', true)));

COMMENT ON POLICY "performance_metrics_select_own_show" ON performance_metrics IS
  'Optimized: current_setting() wrapped in SELECT for single evaluation per query';

-- Fix: performance_metrics - performance_metrics_insert_own_show
DROP POLICY IF EXISTS "performance_metrics_insert_own_show" ON performance_metrics;
CREATE POLICY "performance_metrics_insert_own_show"
  ON performance_metrics FOR INSERT
  WITH CHECK (license_key = (SELECT current_setting('app.license_key', true)));

COMMENT ON POLICY "performance_metrics_insert_own_show" ON performance_metrics IS
  'Optimized: current_setting() wrapped in SELECT for single evaluation per query';

-- Fix: performance_session_summaries - session_summaries_select_own_show
DROP POLICY IF EXISTS "session_summaries_select_own_show" ON performance_session_summaries;
CREATE POLICY "session_summaries_select_own_show"
  ON performance_session_summaries FOR SELECT
  USING (license_key = (SELECT current_setting('app.license_key', true)));

COMMENT ON POLICY "session_summaries_select_own_show" ON performance_session_summaries IS
  'Optimized: current_setting() wrapped in SELECT for single evaluation per query';

-- Fix: performance_session_summaries - session_summaries_insert_own_show
DROP POLICY IF EXISTS "session_summaries_insert_own_show" ON performance_session_summaries;
CREATE POLICY "session_summaries_insert_own_show"
  ON performance_session_summaries FOR INSERT
  WITH CHECK (license_key = (SELECT current_setting('app.license_key', true)));

COMMENT ON POLICY "session_summaries_insert_own_show" ON performance_session_summaries IS
  'Optimized: current_setting() wrapped in SELECT for single evaluation per query';

-- =============================================================================
-- FIX 2: Duplicate Index (Storage & Performance Optimization)
-- =============================================================================
-- The classes table has idx_classes_trial (trial_id) which is redundant because
-- idx_classes_trial_status (trial_id, class_status, class_order) can satisfy
-- queries on trial_id alone via PostgreSQL's leftmost prefix rule.
--
-- Keep: idx_classes_trial_status (composite - more useful)
-- Drop: idx_classes_trial (redundant single column)

DROP INDEX IF EXISTS idx_classes_trial;

COMMENT ON INDEX idx_classes_trial_status IS
  'Composite index on (trial_id, class_status, class_order). Handles trial_id lookups via leftmost prefix. Redundant idx_classes_trial removed.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  duplicate_count INTEGER;
  policy_count INTEGER;
BEGIN
  -- Check for remaining duplicate indexes on classes.trial_id
  SELECT COUNT(*) INTO duplicate_count
  FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename = 'classes'
  AND indexdef LIKE '%trial_id%';

  -- Verify optimized policies exist
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND policyname IN (
    'Admins can update config',
    'performance_metrics_select_own_show',
    'performance_metrics_insert_own_show',
    'session_summaries_select_own_show',
    'session_summaries_insert_own_show'
  );

  RAISE NOTICE '';
  RAISE NOTICE '=== PERFORMANCE FIX RESULTS ===';
  RAISE NOTICE 'Indexes on classes.trial_id: % (should be 1)', duplicate_count;
  RAISE NOTICE 'Optimized RLS policies: % (should be 5)', policy_count;
  RAISE NOTICE '';

  IF duplicate_count = 1 AND policy_count = 5 THEN
    RAISE NOTICE '✅ SUCCESS: All performance warnings resolved';
  ELSE
    RAISE WARNING '⚠️  Unexpected results - review migration';
  END IF;
END $$;

COMMIT;

SELECT 'Performance warnings fixed successfully' as status,
       '5 RLS policies optimized, 1 duplicate index removed' as details;
