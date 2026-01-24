-- =============================================================================
-- Migration 016: Fix Overly-Permissive RLS Policies
-- =============================================================================
-- Replaces "any authenticated user can do anything" policies with proper
-- role-based access control.
--
-- Access Model:
-- - clubs: Public read, platform_admin manages
-- - people: Public read, users manage own profile, platform_admin manages all
-- - dogs: Public read, owners manage own, platform_admin manages all
-- - shows/trials/classes: Public read for published, club_admin/secretary manage
-- - entries: Already has proper policies from migration 009
--
-- ROLLBACK: Re-run migration 006 to restore original policies
-- =============================================================================

-- =============================================================================
-- HELPER: Cached role check function
-- =============================================================================
-- Wrapping has_role in a subquery caches the result for the entire query
-- This prevents the function from being called for every row

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'platform_admin'
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION is_club_admin(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'club_admin'
      AND (check_club_id IS NULL OR ur.club_id = check_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION is_trial_secretary(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'trial_secretary'
      AND (check_club_id IS NULL OR ur.club_id = check_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- Get current user's person_id (cached)
CREATE OR REPLACE FUNCTION get_my_person_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- =============================================================================
-- CLUBS - Public read, only platform_admin can manage
-- =============================================================================

DROP POLICY IF EXISTS "clubs_select" ON clubs;
DROP POLICY IF EXISTS "clubs_insert" ON clubs;
DROP POLICY IF EXISTS "clubs_update" ON clubs;
DROP POLICY IF EXISTS "clubs_delete" ON clubs;

-- Anyone can view clubs
CREATE POLICY "clubs_select" ON clubs
  FOR SELECT USING (true);

-- Only platform_admin can create clubs
CREATE POLICY "clubs_insert" ON clubs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

-- Club admin can update their club, platform_admin can update any
CREATE POLICY "clubs_update" ON clubs
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_platform_admin())
    OR (SELECT is_club_admin(id))
  );

-- Only platform_admin can delete clubs
CREATE POLICY "clubs_delete" ON clubs
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

-- =============================================================================
-- PEOPLE - Public read, users manage own, platform_admin manages all
-- =============================================================================

DROP POLICY IF EXISTS "people_select" ON people;
DROP POLICY IF EXISTS "people_select_policy" ON people;
DROP POLICY IF EXISTS "people_insert" ON people;
DROP POLICY IF EXISTS "people_update" ON people;
DROP POLICY IF EXISTS "people_delete" ON people;

-- Anyone can view people (needed for handler lookups, catalogs)
-- Respects soft delete
CREATE POLICY "people_select" ON people
  FOR SELECT USING (
    deleted_at IS NULL
    OR (SELECT is_platform_admin())
  );

-- Authenticated users can create people records
-- (needed for auth trigger and adding handlers)
CREATE POLICY "people_insert" ON people
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Users can update their own profile, platform_admin can update any
CREATE POLICY "people_update" ON people
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (SELECT is_platform_admin())
  );

-- Only platform_admin can delete (soft delete)
CREATE POLICY "people_delete" ON people
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

-- =============================================================================
-- DOGS - Public read, owners manage own, platform_admin manages all
-- =============================================================================

DROP POLICY IF EXISTS "dogs_select" ON dogs;
DROP POLICY IF EXISTS "dogs_select_policy" ON dogs;
DROP POLICY IF EXISTS "dogs_insert" ON dogs;
DROP POLICY IF EXISTS "dogs_update" ON dogs;
DROP POLICY IF EXISTS "dogs_delete" ON dogs;

-- Anyone can view dogs (needed for show catalogs)
-- Respects soft delete
CREATE POLICY "dogs_select" ON dogs
  FOR SELECT USING (
    deleted_at IS NULL
    OR (SELECT is_platform_admin())
  );

-- Authenticated users can add dogs
CREATE POLICY "dogs_insert" ON dogs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Owners can update their dogs, platform_admin can update any
CREATE POLICY "dogs_update" ON dogs
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

-- Owners can delete their dogs, platform_admin can delete any
CREATE POLICY "dogs_delete" ON dogs
  FOR DELETE TO authenticated
  USING (
    owner_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- DOG_REGISTRATIONS - Same as dogs
-- =============================================================================

DROP POLICY IF EXISTS "dog_registrations_select" ON dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_insert" ON dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_update" ON dog_registrations;
DROP POLICY IF EXISTS "dog_registrations_delete" ON dog_registrations;

-- Anyone can view registrations
CREATE POLICY "dog_registrations_select" ON dog_registrations
  FOR SELECT USING (true);

-- Dog owners can add registrations
CREATE POLICY "dog_registrations_insert" ON dog_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Dog owners can update registrations
CREATE POLICY "dog_registrations_update" ON dog_registrations
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- Dog owners can delete registrations
CREATE POLICY "dog_registrations_delete" ON dog_registrations
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- SHOWS - Public read for published, club_admin/secretary manage
-- =============================================================================

DROP POLICY IF EXISTS "shows_select" ON shows;
DROP POLICY IF EXISTS "shows_insert" ON shows;
DROP POLICY IF EXISTS "shows_update" ON shows;
DROP POLICY IF EXISTS "shows_delete" ON shows;
DROP POLICY IF EXISTS "exhibitors_see_published_shows" ON shows;

-- Anyone can view published shows, admins see all
CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    (
      -- Published shows are public
      status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
      AND deleted_at IS NULL
    )
    OR (SELECT is_club_admin(club_id))
    OR (SELECT is_trial_secretary(club_id))
    OR (SELECT is_platform_admin())
  );

-- Club admins and platform admins can create shows
CREATE POLICY "shows_insert" ON shows
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_club_admin(club_id))
    OR (SELECT is_platform_admin())
  );

-- Club admin/secretary for their club, platform_admin for all
CREATE POLICY "shows_update" ON shows
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_club_admin(club_id))
    OR (SELECT is_trial_secretary(club_id))
    OR (SELECT is_platform_admin())
  );

-- Club admin for their club, platform_admin for all
CREATE POLICY "shows_delete" ON shows
  FOR DELETE TO authenticated
  USING (
    (SELECT is_club_admin(club_id))
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- TRIALS - Inherit access from parent show
-- =============================================================================

DROP POLICY IF EXISTS "trials_select" ON trials;
DROP POLICY IF EXISTS "trials_insert" ON trials;
DROP POLICY IF EXISTS "trials_update" ON trials;
DROP POLICY IF EXISTS "trials_delete" ON trials;

-- Anyone can view trials for visible shows
CREATE POLICY "trials_select" ON trials
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows
      WHERE (
        status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
        AND deleted_at IS NULL
      )
      OR (SELECT is_club_admin(club_id))
      OR (SELECT is_trial_secretary(club_id))
      OR (SELECT is_platform_admin())
    )
  );

-- Club admin/secretary for their shows
CREATE POLICY "trials_insert" ON trials
  FOR INSERT TO authenticated
  WITH CHECK (
    show_id IN (
      SELECT id FROM shows
      WHERE (SELECT is_club_admin(club_id))
         OR (SELECT is_trial_secretary(club_id))
         OR (SELECT is_platform_admin())
    )
  );

CREATE POLICY "trials_update" ON trials
  FOR UPDATE TO authenticated
  USING (
    show_id IN (
      SELECT id FROM shows
      WHERE (SELECT is_club_admin(club_id))
         OR (SELECT is_trial_secretary(club_id))
         OR (SELECT is_platform_admin())
    )
  );

CREATE POLICY "trials_delete" ON trials
  FOR DELETE TO authenticated
  USING (
    show_id IN (
      SELECT id FROM shows
      WHERE (SELECT is_club_admin(club_id))
         OR (SELECT is_platform_admin())
    )
  );

-- =============================================================================
-- CLASSES - Inherit access from parent trial/show
-- =============================================================================

DROP POLICY IF EXISTS "classes_select" ON classes;
DROP POLICY IF EXISTS "classes_insert" ON classes;
DROP POLICY IF EXISTS "classes_update" ON classes;
DROP POLICY IF EXISTS "classes_delete" ON classes;
DROP POLICY IF EXISTS "exhibitors_see_classes" ON classes;

-- Anyone can view classes for visible shows
CREATE POLICY "classes_select" ON classes
  FOR SELECT USING (
    deleted_at IS NULL
    AND trial_id IN (
      SELECT t.id FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE (
        s.status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
      )
      OR (SELECT is_club_admin(s.club_id))
      OR (SELECT is_trial_secretary(s.club_id))
      OR (SELECT is_platform_admin())
    )
  );

-- Club admin/secretary for their shows
CREATE POLICY "classes_insert" ON classes
  FOR INSERT TO authenticated
  WITH CHECK (
    trial_id IN (
      SELECT t.id FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE (SELECT is_club_admin(s.club_id))
         OR (SELECT is_trial_secretary(s.club_id))
         OR (SELECT is_platform_admin())
    )
  );

CREATE POLICY "classes_update" ON classes
  FOR UPDATE TO authenticated
  USING (
    trial_id IN (
      SELECT t.id FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE (SELECT is_club_admin(s.club_id))
         OR (SELECT is_trial_secretary(s.club_id))
         OR (SELECT is_platform_admin())
    )
  );

CREATE POLICY "classes_delete" ON classes
  FOR DELETE TO authenticated
  USING (
    trial_id IN (
      SELECT t.id FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE (SELECT is_club_admin(s.club_id))
         OR (SELECT is_platform_admin())
    )
  );

-- =============================================================================
-- ENTRIES - Fix the original permissive policies
-- =============================================================================
-- Note: Migration 009 added better policies, but we still have the original
-- permissive ones from 006. Drop those and keep the 009 ones.

DROP POLICY IF EXISTS "entries_select" ON entries;
DROP POLICY IF EXISTS "entries_insert" ON entries;
DROP POLICY IF EXISTS "entries_update" ON entries;
DROP POLICY IF EXISTS "entries_delete" ON entries;

-- Keep exhibitors_see_own_entries and exhibitors_update_own_entries from 009
-- Add additional policies for full coverage

-- Exhibitors can insert entries for their dogs
CREATE POLICY "entries_insert" ON entries
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Exhibitors can enter their own dogs
    dog_id IN (
      SELECT id FROM dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    -- Or trial secretary for the show
    OR class_id IN (
      SELECT c.id FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  );

-- Trial secretaries can delete entries for their shows
CREATE POLICY "entries_delete" ON entries
  FOR DELETE TO authenticated
  USING (
    class_id IN (
      SELECT c.id FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  );

-- =============================================================================
-- Grant execute on new functions
-- =============================================================================

GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_club_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_trial_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_person_id() TO authenticated;

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 016: Fixed permissive RLS policies with role-based access' as status;
