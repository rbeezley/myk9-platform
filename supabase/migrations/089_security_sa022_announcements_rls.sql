-- =============================================================================
-- Migration 089: SA-022 — Fix broken admin check in show_announcements RLS
--
-- MEDIUM: The INSERT/UPDATE/DELETE policies used an inline EXISTS check
-- against user_roles.user_id = auth.uid(), but user_roles.user_id references
-- people.id (not auth.users.id). This meant the admin check never matched,
-- silently breaking admin UPDATE/DELETE. The inline check also didn't verify
-- is_active or use the standard helper functions.
--
-- Fix: Replace INSERT/UPDATE/DELETE with policies using is_platform_admin().
-- INSERT also allows the author (auth.uid() = author_id).
-- UPDATE/DELETE allows the author or platform admin.
-- SELECT policy is left unchanged (all authenticated users can read).
-- =============================================================================

-- Drop existing mutation policies
DROP POLICY IF EXISTS "Authenticated users can create announcements" ON show_announcements;
DROP POLICY IF EXISTS "Author or admin can update announcements" ON show_announcements;
DROP POLICY IF EXISTS "Author or admin can delete announcements" ON show_announcements;

-- INSERT: author must be the caller, or platform admin
CREATE POLICY "Authenticated users can create announcements" ON show_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    OR (SELECT is_platform_admin())
  );

-- UPDATE: author or platform admin
CREATE POLICY "Author or admin can update announcements" ON show_announcements
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = author_id
    OR (SELECT is_platform_admin())
  );

-- DELETE: author or platform admin
CREATE POLICY "Author or admin can delete announcements" ON show_announcements
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR (SELECT is_platform_admin())
  );
