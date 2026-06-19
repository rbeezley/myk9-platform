-- Fix waitlist_entries RLS policies — two bugs combined:
--
-- Bug 1 (migration 020): policies used has_role('platform_admin') and
--   has_role('trial_secretary', club_id). Both role names were deleted from the
--   roles table (066 deleted 'trial_secretary'; platform_admin replaced by
--   site_admin). All secretary and admin reads silently returned 0 rows.
--
-- Bug 2: is_trial_secretary(club_id) only covers club-scoped secretaries.
--   Show-scoped secretaries (ur.show_id = show_id) were excluded.
--
-- Fix: inline EXISTS join replacing both broken checks. Matches the same logic
-- as is_show_secretary(UUID) in migration 163 but expressed as a direct join
-- so the planner can use index scans without a per-row function call.

DROP POLICY IF EXISTS "waitlist_entries_select" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_insert" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_update" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_delete" ON public.waitlist_entries;

-- Secretary check reused across all 4 policies:
--   site_admin OR show-scoped secretary OR club-scoped secretary
--   for the show that owns the class_id on this row.
CREATE POLICY "waitlist_entries_select" ON public.waitlist_entries
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1
            FROM public.classes c
            JOIN public.trials t ON t.id = c.trial_id
            JOIN public.shows s ON s.id = t.show_id
            JOIN public.user_roles ur ON (
                ur.show_id = s.id
                OR (ur.show_id IS NULL AND ur.club_id = s.club_id)
            )
            JOIN public.roles r ON r.id = ur.role_id
            WHERE c.id = waitlist_entries.class_id
              AND ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('site_admin', 'secretary')
        )
        OR (exhibitor_id IN (
            SELECT ep.id FROM public.exhibitor_profiles ep
            WHERE ep.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_insert" ON public.waitlist_entries
    FOR INSERT TO public
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.classes c
            JOIN public.trials t ON t.id = c.trial_id
            JOIN public.shows s ON s.id = t.show_id
            JOIN public.user_roles ur ON (
                ur.show_id = s.id
                OR (ur.show_id IS NULL AND ur.club_id = s.club_id)
            )
            JOIN public.roles r ON r.id = ur.role_id
            WHERE c.id = waitlist_entries.class_id
              AND ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('site_admin', 'secretary')
        )
        OR (exhibitor_id IN (
            SELECT ep.id FROM public.exhibitor_profiles ep
            WHERE ep.auth_user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY "waitlist_entries_update" ON public.waitlist_entries
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1
            FROM public.classes c
            JOIN public.trials t ON t.id = c.trial_id
            JOIN public.shows s ON s.id = t.show_id
            JOIN public.user_roles ur ON (
                ur.show_id = s.id
                OR (ur.show_id IS NULL AND ur.club_id = s.club_id)
            )
            JOIN public.roles r ON r.id = ur.role_id
            WHERE c.id = waitlist_entries.class_id
              AND ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('site_admin', 'secretary')
        )
    );

CREATE POLICY "waitlist_entries_delete" ON public.waitlist_entries
    FOR DELETE TO public
    USING (
        EXISTS (
            SELECT 1
            FROM public.classes c
            JOIN public.trials t ON t.id = c.trial_id
            JOIN public.shows s ON s.id = t.show_id
            JOIN public.user_roles ur ON (
                ur.show_id = s.id
                OR (ur.show_id IS NULL AND ur.club_id = s.club_id)
            )
            JOIN public.roles r ON r.id = ur.role_id
            WHERE c.id = waitlist_entries.class_id
              AND ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('site_admin', 'secretary')
        )
        OR (
            exhibitor_id IN (
                SELECT ep.id FROM public.exhibitor_profiles ep
                WHERE ep.auth_user_id = (SELECT auth.uid())
            )
            AND status = 'waiting'
        )
    );
