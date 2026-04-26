-- =============================================================================
-- Migration 161: Allow secretary to update any dog (incl. owner_id)
-- =============================================================================
-- Problem: dogs_update RLS only allows owner / co_owner / platform_admin to
-- UPDATE a dog. Secretaries can CREATE dogs with any owner via the AddDogPanel
-- and can EDIT all dogs they have read access to via the UI, but the PATCH
-- silently affects 0 rows when they try to change a dog they don't own.
-- This causes "Save Changes" to appear to succeed but no fields persist.
--
-- Symptom: secretary opens Edit Dog → changes owner from Alice to Bob →
--          clicks Save Changes → toast says "Changes saved successfully" →
--          on reload, owner is still Alice. PATCH was sent but RLS filtered
--          out the row before the UPDATE applied.
--
-- Fix: Add `is_show_secretary()` to both USING and WITH CHECK so secretary
--      can update any dog. Mirrors the dogs_insert / clubs_update pattern
--      used elsewhere in the codebase.
--
-- ROLLBACK: drop and recreate without the is_show_secretary() clause.
-- =============================================================================

DROP POLICY IF EXISTS "dogs_update" ON public.dogs;

CREATE POLICY "dogs_update" ON public.dogs
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_platform_admin())
    OR (SELECT public.is_show_secretary())
  )
  WITH CHECK (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_platform_admin())
    OR (SELECT public.is_show_secretary())
  );

-- =============================================================================
SELECT 'Migration 161: dogs_update now allows secretary' as status;
