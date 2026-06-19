-- Fix waitlist_entries RLS policies: migration 066 deleted the 'trial_secretary'
-- role name from the roles table, but migration 020's policies still reference
-- has_role('trial_secretary', club_id). This causes secretaries to always see
-- 0 waitlist entries because the role lookup always fails.
--
-- Replace has_role('trial_secretary', ...) with is_trial_secretary(club_id)
-- which checks name IN ('secretary', 'trial_secretary') — forward compatible.

DROP POLICY IF EXISTS "waitlist_entries_select" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_insert" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_update" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_delete" ON public.waitlist_entries;

CREATE POLICY "waitlist_entries_select" ON public.waitlist_entries
    FOR SELECT TO public
    USING (
        has_role('platform_admin'::text)
        OR (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_trial_secretary(s.club_id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_insert" ON public.waitlist_entries
    FOR INSERT TO public
    WITH CHECK (
        has_role('platform_admin'::text)
        OR (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_trial_secretary(s.club_id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_update" ON public.waitlist_entries
    FOR UPDATE TO public
    USING (
        has_role('platform_admin'::text)
        OR (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_trial_secretary(s.club_id)
        ))
    );

CREATE POLICY "waitlist_entries_delete" ON public.waitlist_entries
    FOR DELETE TO public
    USING (
        has_role('platform_admin'::text)
        OR (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_trial_secretary(s.club_id)
        ))
        OR (
            exhibitor_id IN (
                SELECT exhibitor_profiles.id
                FROM exhibitor_profiles
                WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
            )
            AND status = 'waiting'
        )
    );
