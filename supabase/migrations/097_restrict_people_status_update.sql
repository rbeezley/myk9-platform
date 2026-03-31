-- Migration 097: Restrict people.status updates to admins only
--
-- Security fix: the people_update policy allowed any authenticated user to
-- update their own row including the `status` column. A suspended user could
-- run `UPDATE people SET status='active' WHERE auth_user_id=auth.uid()` to
-- bypass suspension. This migration splits the policy so only platform admins
-- (and show secretaries, who manage people records) can modify `status`.
--
-- Rollback:
--   DROP POLICY IF EXISTS "people_update_own" ON public.people;
--   DROP POLICY IF EXISTS "people_update_privileged" ON public.people;
--   CREATE POLICY "people_update" ON public.people
--     FOR UPDATE TO authenticated
--     USING (auth_user_id = (SELECT auth.uid()) OR is_show_secretary() OR is_platform_admin())
--     WITH CHECK (auth_user_id = (SELECT auth.uid()) OR is_show_secretary() OR is_platform_admin());

BEGIN;

-- Drop the permissive policy that allowed self-update of any column
DROP POLICY IF EXISTS "people_update" ON public.people;

-- Policy 1: Users can update their own row, but status must remain unchanged.
-- The WITH CHECK ensures that after the update, `status` still equals its
-- pre-update value. Postgres evaluates the subquery against the row being
-- checked, so `id` refers to the row's own primary key.
CREATE POLICY "people_update_own" ON public.people
    FOR UPDATE TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
    )
    WITH CHECK (
        auth_user_id = (SELECT auth.uid())
        AND status IS NOT DISTINCT FROM (
            SELECT p.status FROM public.people p WHERE p.id = people.id
        )
    );

-- Policy 2: Admins and secretaries can update any row including status.
CREATE POLICY "people_update_privileged" ON public.people
    FOR UPDATE TO authenticated
    USING (
        is_show_secretary() OR is_platform_admin()
    )
    WITH CHECK (
        is_show_secretary() OR is_platform_admin()
    );

COMMIT;
