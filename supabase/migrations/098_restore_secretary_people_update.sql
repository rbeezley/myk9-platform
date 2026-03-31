-- Migration 098: Restore secretary access to people_update_privileged policy
--
-- Migration 097 removed is_show_secretary() from the privileged update policy
-- due to a function overload ambiguity error. This migration restores secretary
-- access by using is_trial_secretary() directly (the underlying function that
-- is_show_secretary() wraps), which has no ambiguity.
--
-- Rollback:
--   DROP POLICY IF EXISTS "people_update_privileged" ON public.people;
--   CREATE POLICY "people_update_privileged" ON public.people
--     FOR UPDATE TO authenticated
--     USING (is_platform_admin())
--     WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "people_update_privileged" ON public.people;

CREATE POLICY "people_update_privileged" ON public.people
    FOR UPDATE TO authenticated
    USING (
        (SELECT is_trial_secretary()) OR is_platform_admin()
    )
    WITH CHECK (
        (SELECT is_trial_secretary()) OR is_platform_admin()
    );
