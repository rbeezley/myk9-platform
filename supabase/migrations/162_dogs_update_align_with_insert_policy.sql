-- =============================================================================
-- Migration 162: Align dogs_update with dogs_insert (add club_admin, use canonical name)
-- =============================================================================
-- Migration 161 added is_show_secretary() to dogs_update so secretaries can
-- update any dog. Two follow-ups for parity with the dogs_insert policy
-- (migration 148):
--
-- 1. Add is_club_admin() — club admins can already INSERT dogs but couldn't
--    UPDATE them after creation. Mirroring the insert policy fixes that.
-- 2. Replace is_platform_admin() with is_site_admin(). is_platform_admin is
--    a deprecated alias (migration 124) — RLS policies should call the
--    canonical name.
--
-- Trust model: any active secretary or club admin can update any dog (incl.
-- owner_id) platform-wide. This matches the existing dogs_insert behavior
-- and the cross-club mail-in-entry workflow.
--
-- ROLLBACK: revert to the migration 161 policy (no is_club_admin clause).
-- =============================================================================

DROP POLICY IF EXISTS "dogs_update" ON public.dogs;

CREATE POLICY "dogs_update" ON public.dogs
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_show_secretary())
    OR (SELECT public.is_club_admin())
    OR (SELECT public.is_site_admin())
  )
  WITH CHECK (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_show_secretary())
    OR (SELECT public.is_club_admin())
    OR (SELECT public.is_site_admin())
  );

-- =============================================================================
SELECT 'Migration 162: dogs_update aligned with dogs_insert' as status;
