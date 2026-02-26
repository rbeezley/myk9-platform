-- =============================================================================
-- Migration 027: Fix dogs soft-delete RLS policy
-- =============================================================================
-- Problem: The live dogs_update policy's implicit WITH CHECK blocks soft deletes.
-- When setting deleted_at = now(), the new row fails the WITH CHECK because
-- the policy may include deleted_at IS NULL (from the dogs_select policy context).
--
-- Fix: Explicitly set WITH CHECK to match USING — only ownership check, no
-- deleted_at constraint — so owners can soft-delete their own dogs.
-- =============================================================================

DROP POLICY IF EXISTS "dogs_update" ON dogs;

CREATE POLICY "dogs_update" ON dogs
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  )
  WITH CHECK (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_platform_admin())
  );
