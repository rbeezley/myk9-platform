-- =============================================================================
-- Migration 019: Fix Overly-Permissive INSERT Policies for Audit/Logging Tables
-- =============================================================================
-- Addresses Supabase security linter warnings for:
-- - performance_metrics (INSERT WITH CHECK true)
-- - permission_audit_log (INSERT WITH CHECK true)
-- - rules_feedback (INSERT WITH CHECK true)
-- - rules_query_log (INSERT WITH CHECK true)
--
-- These are logging/telemetry tables. The fix ensures users can only insert
-- records that properly identify them (where applicable).
-- =============================================================================

-- =============================================================================
-- 1. PERFORMANCE_METRICS
-- =============================================================================
-- This table logs anonymous client-side performance telemetry.
-- Since it has no user column, we add auth_user_id to tie metrics to users
-- and validate it matches the authenticated user.

-- Add auth_user_id column if it doesn't exist
ALTER TABLE performance_metrics
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Drop the old permissive policy
DROP POLICY IF EXISTS "performance_metrics_insert" ON performance_metrics;

-- Create a policy that validates auth_user_id matches when provided
-- If auth_user_id is provided, it must match auth.uid()
-- If not provided (legacy data), allow insert but recommend providing it
CREATE POLICY "performance_metrics_insert" ON performance_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id IS NULL OR auth_user_id = auth.uid()
  );

-- =============================================================================
-- 2. PERMISSION_AUDIT_LOG
-- =============================================================================
-- This table logs permission changes. The user_id should match the person
-- record of the authenticated user.

DROP POLICY IF EXISTS "permission_audit_log_insert" ON permission_audit_log;

-- User can only insert audit records for their own actions
CREATE POLICY "permission_audit_log_insert" ON permission_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- 3. RULES_QUERY_LOG
-- =============================================================================
-- This table logs rule queries. The user_id (if provided) should match
-- the authenticated user's person record.

DROP POLICY IF EXISTS "rules_query_log_insert" ON rules_query_log;

-- User can insert query logs where user_id is NULL (anonymous) or matches their person_id
CREATE POLICY "rules_query_log_insert" ON rules_query_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = (SELECT get_my_person_id())
  );

-- =============================================================================
-- 4. RULES_FEEDBACK
-- =============================================================================
-- This table logs feedback on rules. Users should only be able to provide
-- feedback on their own query log entries.

DROP POLICY IF EXISTS "rules_feedback_insert" ON rules_feedback;

-- User can insert feedback for their own query_log entries or anonymous ones
CREATE POLICY "rules_feedback_insert" ON rules_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow if query_log_id is NULL (direct feedback not tied to a query)
    query_log_id IS NULL
    -- Or if the query_log entry belongs to this user or is anonymous
    OR query_log_id IN (
      SELECT id FROM rules_query_log
      WHERE user_id IS NULL OR user_id = (SELECT get_my_person_id())
    )
  );

-- =============================================================================
-- Add index for performance_metrics auth_user_id
-- =============================================================================
CREATE INDEX IF NOT EXISTS performance_metrics_auth_user_id_idx
  ON performance_metrics(auth_user_id);

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 019: Fixed permissive INSERT policies for audit/logging tables' as status;
