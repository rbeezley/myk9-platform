-- MYK9-87: replace dead has_role('platform_admin') predicates with is_site_admin()
--
-- Migration 124 renamed the 'platform_admin' role to 'site_admin' AND deleted any
-- lingering 'platform_admin' rows from public.roles. has_role(name) resolves the
-- role by joining public.roles ON r.name = role_name, so every surviving
-- has_role('platform_admin') predicate is now UNCONDITIONALLY FALSE.
--
-- Verified against the applied database (pg_policies / pg_proc), not migration text:
--   * public.roles has 0 rows named 'platform_admin'
--   * six live policies + one trigger function still call has_role('platform_admin')
--
-- Impact: a site admin could not SELECT/UPDATE/DELETE any exhibitor_profiles row
-- other than their own (confirmed live on staging via the admin Complimentary
-- Premium panel), nor read/write another exhibitor's cart.
--
-- Fix: swap each dead predicate for (SELECT public.is_site_admin()). The
-- (SELECT ...) wrapper is mandatory — it makes Postgres evaluate the helper once
-- as an InitPlan instead of once per row, which is the whole point of migration
-- 020's RLS performance pass. is_site_admin() is SECURITY DEFINER STABLE with no
-- arguments and already has EXECUTE granted to anon/authenticated/service_role.
--
-- No tables are created here, so no GRANT/REVOKE work is required (see CLAUDE.md
-- § Database Migrations — new public tables auto-grant anon full CRUD and must
-- REVOKE explicitly; that does not apply to a policy-only migration).
--
-- Semantics are preserved exactly apart from the admin branch becoming reachable:
-- policies keep their existing command, role (TO public), and owner branches.

-- ---------------------------------------------------------------------------
-- 1. exhibitor_profiles (migration 109 granular policies; supersedes 020's
--    single exhibitor_profiles_policy)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "exhibitor_profiles_select" ON public.exhibitor_profiles;
CREATE POLICY "exhibitor_profiles_select"
    ON public.exhibitor_profiles
    FOR SELECT
    TO public
    USING (
        (SELECT public.is_site_admin())
        OR (auth_user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "exhibitor_profiles_insert" ON public.exhibitor_profiles;
CREATE POLICY "exhibitor_profiles_insert"
    ON public.exhibitor_profiles
    FOR INSERT
    TO public
    WITH CHECK (
        (SELECT public.is_site_admin())
        OR (auth_user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "exhibitor_profiles_update" ON public.exhibitor_profiles;
CREATE POLICY "exhibitor_profiles_update"
    ON public.exhibitor_profiles
    FOR UPDATE
    TO public
    USING (
        (SELECT public.is_site_admin())
        OR (auth_user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "exhibitor_profiles_delete" ON public.exhibitor_profiles;
CREATE POLICY "exhibitor_profiles_delete"
    ON public.exhibitor_profiles
    FOR DELETE
    TO public
    USING (
        (SELECT public.is_site_admin())
    );

-- ---------------------------------------------------------------------------
-- 2. Subscription-column write guard (migration 109 trigger function)
--    Without this the admin bypass branch is dead, so even a site admin whose
--    RLS now passes would be blocked from writing subscription columns.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restrict_subscription_column_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
    -- Allow service_role (edge functions, webhooks) and site admins to bypass
    IF (SELECT current_setting('role', true)) = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF (SELECT public.is_site_admin()) THEN
        RETURN NEW;
    END IF;

    -- Block changes to protected columns
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    THEN
        RAISE EXCEPTION 'Subscription columns (subscription_tier, subscription_expires_at, stripe_customer_id) can only be modified by the service role or a site admin';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. entry_carts (migration 020)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "entry_carts_policy" ON public.entry_carts;
CREATE POLICY "entry_carts_policy"
    ON public.entry_carts
    FOR ALL
    TO public
    USING (
        (SELECT public.is_site_admin())
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM public.exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    )
    WITH CHECK (
        (SELECT public.is_site_admin())
        OR (exhibitor_id IN (
            SELECT exhibitor_profiles.id
            FROM public.exhibitor_profiles
            WHERE exhibitor_profiles.auth_user_id = (SELECT auth.uid())
        ))
    );

-- ---------------------------------------------------------------------------
-- 4. entry_cart_items (migration 020, WITH CHECK tightened by
--    20260611250000_entry_cart_items_dog_ownership)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "entry_cart_items_policy" ON public.entry_cart_items;
CREATE POLICY "entry_cart_items_policy"
    ON public.entry_cart_items
    FOR ALL
    TO public
    USING (
        (SELECT public.is_site_admin())
        OR (cart_id IN (
            SELECT ec.id
            FROM public.entry_carts ec
            JOIN public.exhibitor_profiles ep ON ep.id = ec.exhibitor_id
            WHERE ep.auth_user_id = (SELECT auth.uid())
        ))
    )
    WITH CHECK (
        (SELECT public.is_site_admin())
        OR (
            (cart_id IN (
                SELECT ec.id
                FROM public.entry_carts ec
                JOIN public.exhibitor_profiles ep ON ep.id = ec.exhibitor_id
                WHERE ep.auth_user_id = (SELECT auth.uid())
            ))
            AND (dog_id IN (
                SELECT d.id
                FROM public.dogs d
                WHERE d.owner_id = (SELECT public.get_my_person_id())
                   OR d.co_owner_id = (SELECT public.get_my_person_id())
            ))
        )
    );

COMMENT ON POLICY "exhibitor_profiles_select" ON public.exhibitor_profiles IS
  'MYK9-87: admin branch uses is_site_admin(); has_role(''platform_admin'') was always false after migration 124.';
