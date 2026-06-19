-- Fix waitlist_entries RLS policies — two bugs combined:
--
-- Bug 1 (from migration 020): policies used has_role('platform_admin', ...) and
--   has_role('trial_secretary', ...) — both role names were deleted from the roles
--   table (066 deleted 'trial_secretary'; platform_admin was replaced by site_admin).
--   All secretary and admin reads silently returned 0 rows.
--
-- Bug 2 (open question): is_trial_secretary(club_id) only covers club-scoped
--   secretaries. Show-scoped secretaries (ur.show_id = show_id) were excluded.
--
-- Fix: replace both checks with is_show_secretary(s.id), which covers
--   site_admin + show-scoped secretary + club-scoped secretary in one call
--   (see migration 163). The exhibitor self-access branch is unchanged.

DROP POLICY IF EXISTS "waitlist_entries_select" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_insert" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_update" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_delete" ON public.waitlist_entries;

CREATE POLICY "waitlist_entries_select" ON public.waitlist_entries
    FOR SELECT TO public
    USING (
        (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_show_secretary(s.id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_insert" ON public.waitlist_entries
    FOR INSERT TO public
    WITH CHECK (
        (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_show_secretary(s.id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_update" ON public.waitlist_entries
    FOR UPDATE TO public
    USING (
        class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_show_secretary(s.id)
        )
    );

CREATE POLICY "waitlist_entries_delete" ON public.waitlist_entries
    FOR DELETE TO public
    USING (
        (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE public.is_show_secretary(s.id)
        ))
        OR (
            exhibitor_id IN (
                SELECT exhibitor_profiles.id FROM exhibitor_profiles
                WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
            )
            AND status = 'waiting'
        )
    );
