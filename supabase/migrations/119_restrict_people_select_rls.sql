-- Migration 119: Restrict people SELECT to own-record or privileged role
--
-- Closes the PII exposure gap: previously any authenticated user could read
-- all people rows (email, phone, address) via the Supabase REST API.
-- Now regular users see only their own record. Secretaries and platform
-- admins retain full visibility (admins including soft-deleted rows).
--
-- Impact analysis: all people queries from non-privileged users go through
-- AuthContext (own auth_user_id) or useProfileForm (own record). Secretary
-- features (volunteer search, entry management, user admin) are covered by
-- is_trial_secretary(). CSV export uses get_entries_for_export RPC
-- (SECURITY DEFINER, bypasses RLS). TV/spectator views use entries.handler
-- text field, not the people table.
--
-- Edge case: people rows with NULL auth_user_id become invisible to regular
-- users (only secretary/admin can see them). This is correct — such rows are
-- system-created or orphaned and should not be exposed to regular users.
--
-- Performance: is_trial_secretary() and is_platform_admin() are STABLE
-- SECURITY DEFINER functions — Postgres caches their result per-statement.
-- The auth_user_id comparison uses the existing index on people(auth_user_id).
--
-- Rollback: DROP POLICY "people_select" ON people; then re-create the
-- permissive policy from migration 111:
--   CREATE POLICY "people_select" ON people FOR SELECT TO authenticated
--     USING (deleted_at IS NULL OR (SELECT is_platform_admin()));

DROP POLICY IF EXISTS "people_select" ON people;

CREATE POLICY "people_select" ON people
  FOR SELECT TO authenticated
  USING (
    (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
    AND (
      deleted_at IS NULL
      OR (SELECT is_platform_admin())
    )
  );
