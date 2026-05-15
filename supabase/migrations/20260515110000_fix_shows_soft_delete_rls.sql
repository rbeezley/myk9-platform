-- Fix shows soft-delete RLS.
--
-- Symptom:
-- site_admin can insert a draft show, but the app-layer soft delete
-- (`UPDATE shows SET deleted_at = ...`) fails with:
--   42501 new row violates row-level security policy for table "shows"
--
-- Root cause:
-- The existing update policy has no explicit WITH CHECK. PostgreSQL applies a
-- new-row check for UPDATE, and the soft-deleted row can fail that check even
-- though the actor is allowed to manage the existing show. Make the update
-- policy explicit and align it with the current canonical role helper names.

DROP POLICY IF EXISTS "shows_update" ON public.shows;

CREATE POLICY "shows_update" ON public.shows
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_club_admin(club_id))
    OR (SELECT public.is_trial_secretary(club_id))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (SELECT public.is_club_admin(club_id))
    OR (SELECT public.is_trial_secretary(club_id))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  );

COMMENT ON POLICY "shows_update" ON public.shows IS
  'Club admins, trial secretaries, site admins, and platform admins may update or soft-delete managed shows.';
