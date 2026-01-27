-- Fix RLS Performance Warnings
-- 1. Fix auth.uid() calls to use (select auth.uid()) for better performance
-- 2. Remove duplicate permissive policies
-- 3. Remove duplicate index

-- ============================================
-- PART 1: Remove duplicate policies
-- ============================================

-- Classes: Keep classes_select (more comprehensive), drop classes_select_policy
DROP POLICY IF EXISTS "classes_select_policy" ON public.classes;

-- Clubs: Keep clubs_select (simpler true check), drop clubs_select_policy
DROP POLICY IF EXISTS "clubs_select_policy" ON public.clubs;

-- Shows: Keep shows_select (more comprehensive), drop shows_select_policy
DROP POLICY IF EXISTS "shows_select_policy" ON public.shows;

-- Trials: Keep trials_select (more comprehensive), drop trials_select_policy
DROP POLICY IF EXISTS "trials_select_policy" ON public.trials;

-- Entries: Keep exhibitors_see_own_entries (more specific), drop entries_select_policy
DROP POLICY IF EXISTS "entries_select_policy" ON public.entries;

-- entry_carts: Remove user-specific policies and consolidate into combined policies
DROP POLICY IF EXISTS "users_select_own_carts" ON public.entry_carts;
DROP POLICY IF EXISTS "users_insert_own_carts" ON public.entry_carts;
DROP POLICY IF EXISTS "users_update_own_carts" ON public.entry_carts;
DROP POLICY IF EXISTS "users_delete_own_carts" ON public.entry_carts;
DROP POLICY IF EXISTS "admins_manage_all_carts" ON public.entry_carts;

-- entry_cart_items: Remove user-specific policies and consolidate
DROP POLICY IF EXISTS "users_select_own_cart_items" ON public.entry_cart_items;
DROP POLICY IF EXISTS "users_insert_own_cart_items" ON public.entry_cart_items;
DROP POLICY IF EXISTS "users_update_own_cart_items" ON public.entry_cart_items;
DROP POLICY IF EXISTS "users_delete_own_cart_items" ON public.entry_cart_items;
DROP POLICY IF EXISTS "admins_manage_all_cart_items" ON public.entry_cart_items;

-- exhibitor_profiles: Remove duplicate policies
DROP POLICY IF EXISTS "users_select_own_profile" ON public.exhibitor_profiles;
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.exhibitor_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.exhibitor_profiles;
DROP POLICY IF EXISTS "admins_manage_all_profiles" ON public.exhibitor_profiles;
DROP POLICY IF EXISTS "admins_select_all_profiles" ON public.exhibitor_profiles;

-- waitlist_entries: Remove individual policies and consolidate
DROP POLICY IF EXISTS "users_select_own_waitlist" ON public.waitlist_entries;
DROP POLICY IF EXISTS "users_insert_own_waitlist" ON public.waitlist_entries;
DROP POLICY IF EXISTS "users_delete_own_waitlist" ON public.waitlist_entries;
DROP POLICY IF EXISTS "admins_manage_all_waitlist" ON public.waitlist_entries;
DROP POLICY IF EXISTS "secretaries_manage_waitlist" ON public.waitlist_entries;

-- ============================================
-- PART 2: Recreate policies with optimized auth.uid() calls
-- ============================================

-- people table policies
DROP POLICY IF EXISTS "people_insert" ON public.people;
CREATE POLICY "people_insert" ON public.people
    FOR INSERT TO authenticated
    WITH CHECK (
        (auth_user_id = (select auth.uid()))
        OR is_show_secretary()
        OR is_platform_admin()
    );

DROP POLICY IF EXISTS "people_update" ON public.people;
CREATE POLICY "people_update" ON public.people
    FOR UPDATE TO authenticated
    USING (
        (auth_user_id = (select auth.uid()))
        OR is_show_secretary()
        OR is_platform_admin()
    )
    WITH CHECK (
        (auth_user_id = (select auth.uid()))
        OR is_show_secretary()
        OR is_platform_admin()
    );

-- performance_metrics table policy
DROP POLICY IF EXISTS "performance_metrics_insert" ON public.performance_metrics;
CREATE POLICY "performance_metrics_insert" ON public.performance_metrics
    FOR INSERT TO authenticated
    WITH CHECK (
        (auth_user_id IS NULL)
        OR (auth_user_id = (select auth.uid()))
    );

-- entry_carts: Consolidated policy with optimized auth.uid()
CREATE POLICY "entry_carts_policy" ON public.entry_carts
    FOR ALL TO public
    USING (
        has_role('platform_admin'::text)
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (select auth.uid())
        ))
    )
    WITH CHECK (
        has_role('platform_admin'::text)
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (select auth.uid())
        ))
    );

-- entry_cart_items: Consolidated policy with optimized auth.uid()
CREATE POLICY "entry_cart_items_policy" ON public.entry_cart_items
    FOR ALL TO public
    USING (
        has_role('platform_admin'::text)
        OR (cart_id IN (
            SELECT ec.id
            FROM entry_carts ec
            JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
            WHERE ep.auth_user_id = (select auth.uid())
        ))
    )
    WITH CHECK (
        has_role('platform_admin'::text)
        OR (cart_id IN (
            SELECT ec.id
            FROM entry_carts ec
            JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
            WHERE ep.auth_user_id = (select auth.uid())
        ))
    );

-- exhibitor_profiles: Consolidated policy with optimized auth.uid()
CREATE POLICY "exhibitor_profiles_policy" ON public.exhibitor_profiles
    FOR ALL TO public
    USING (
        has_role('platform_admin'::text)
        OR (auth_user_id = (select auth.uid()))
    )
    WITH CHECK (
        has_role('platform_admin'::text)
        OR (auth_user_id = (select auth.uid()))
    );

-- waitlist_entries: Consolidated policy with optimized auth.uid()
CREATE POLICY "waitlist_entries_select" ON public.waitlist_entries
    FOR SELECT TO public
    USING (
        has_role('platform_admin'::text)
        OR (class_id IN (
            SELECT c.id
            FROM classes c
            JOIN trials t ON t.id = c.trial_id
            JOIN shows s ON s.id = t.show_id
            WHERE has_role('trial_secretary'::text, s.club_id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (select auth.uid())
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
            WHERE has_role('trial_secretary'::text, s.club_id)
        ))
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (select auth.uid())
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
            WHERE has_role('trial_secretary'::text, s.club_id)
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
            WHERE has_role('trial_secretary'::text, s.club_id)
        ))
        OR (
            (exhibitor_id IN (
                SELECT exhibitor_profiles.id
                FROM exhibitor_profiles
                WHERE exhibitor_profiles.auth_user_id = (select auth.uid())
            ))
            AND (status = 'waiting'::text)
        )
    );

-- entries: Update exhibitors_see_own_entries with optimized auth.uid()
DROP POLICY IF EXISTS "exhibitors_see_own_entries" ON public.entries;
CREATE POLICY "exhibitors_see_own_entries" ON public.entries
    FOR SELECT TO public
    USING (
        (
            (handler_id IN (
                SELECT people.id
                FROM people
                WHERE people.auth_user_id = (select auth.uid())
            ))
            OR (dog_id IN (
                SELECT d.id
                FROM dogs d
                JOIN people p ON p.id = d.owner_id
                WHERE p.auth_user_id = (select auth.uid())
            ))
            OR (class_id IN (
                SELECT c.id
                FROM classes c
                JOIN trials t ON t.id = c.trial_id
                JOIN shows s ON s.id = t.show_id
                WHERE has_role('trial_secretary'::text, s.club_id)
            ))
            OR has_role('platform_admin'::text)
        )
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "exhibitors_update_own_entries" ON public.entries;
CREATE POLICY "exhibitors_update_own_entries" ON public.entries
    FOR UPDATE TO public
    USING (
        (
            (handler_id IN (
                SELECT people.id
                FROM people
                WHERE people.auth_user_id = (select auth.uid())
            ))
            OR (dog_id IN (
                SELECT d.id
                FROM dogs d
                JOIN people p ON p.id = d.owner_id
                WHERE p.auth_user_id = (select auth.uid())
            ))
        )
        AND entry_status NOT IN ('confirmed', 'checked-in', 'competing', 'completed')
        AND deleted_at IS NULL
    );

-- ============================================
-- PART 3: Remove duplicate index
-- ============================================
DROP INDEX IF EXISTS public.exhibitor_profiles_auth_user_id_idx;
