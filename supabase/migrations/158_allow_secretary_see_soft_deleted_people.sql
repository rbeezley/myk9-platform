-- Migration 158: Allow secretaries to see soft-deleted people rows
--
-- Bug: Secretary clicks "Delete" on a person → soft-delete PATCH sets
-- deleted_at = NOW() → fails with 403 "new row violates row-level security
-- policy for table people".
--
-- Root cause: When updating a row with FORCE ROW LEVEL SECURITY, PostgreSQL
-- applies the SELECT policy's USING expression to the new row in addition to
-- the UPDATE policy's WITH CHECK (the "row must remain visible after update"
-- rule). Migration 119 restricted people_select so deleted_at != NULL is only
-- visible to is_platform_admin(). Secretaries can update people but cannot
-- see the row after deleted_at is set → SELECT-derived WITH CHECK fails →
-- the entire UPDATE fails.
--
-- Fix: include is_trial_secretary() in the deleted_at visibility branch of
-- people_select. Secretaries already have full live-row visibility (PII)
-- via the existing privileged branch, so allowing them to see deleted rows
-- adds no new PII exposure — and unblocks the soft-delete write path.
--
-- Rollback: re-apply migration 119's people_select definition.

DROP POLICY IF EXISTS "people_select" ON public.people;

CREATE POLICY "people_select" ON public.people
  FOR SELECT TO authenticated
  USING (
    (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT public.is_trial_secretary())
      OR (SELECT public.is_platform_admin())
    )
    AND (
      deleted_at IS NULL
      OR (SELECT public.is_trial_secretary())
      OR (SELECT public.is_platform_admin())
    )
  );
