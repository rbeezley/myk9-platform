-- =============================================================================
-- Migration 088: SA-018 — Prevent actor_id spoofing in activity_log
--
-- MEDIUM: The INSERT policy only checked auth.uid() IS NOT NULL, allowing
-- any authenticated user to insert activity log entries with an arbitrary
-- actor_id, spoofing actions as other users. Now validates that actor_id
-- matches the caller's auth.uid().
--
-- The SELECT policy remains unchanged (authenticated read access).
-- Activity log is append-only: no UPDATE/DELETE policies exist or are added.
-- =============================================================================

-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "activity_log_insert" ON activity_log;

-- INSERT: actor_id must match the caller's auth user ID
CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
  );
