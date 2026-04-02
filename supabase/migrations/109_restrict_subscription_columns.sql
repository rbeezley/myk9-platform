-- Migration 109: Restrict subscription column updates
--
-- Prevents authenticated users from updating subscription_tier,
-- subscription_expires_at, and stripe_customer_id on their own
-- exhibitor_profiles via the REST API. Only platform_admin and
-- service_role (edge functions / webhooks) may write these columns.

-- 1. Drop the existing catch-all policy
DROP POLICY IF EXISTS "exhibitor_profiles_policy" ON public.exhibitor_profiles;

-- 2. Create granular policies

-- SELECT: owners and platform_admin can read their row
CREATE POLICY "exhibitor_profiles_select"
    ON public.exhibitor_profiles
    FOR SELECT
    TO public
    USING (
        has_role('platform_admin'::text)
        OR (auth_user_id = (SELECT auth.uid()))
    );

-- INSERT: owners and platform_admin can insert
CREATE POLICY "exhibitor_profiles_insert"
    ON public.exhibitor_profiles
    FOR INSERT
    TO public
    WITH CHECK (
        has_role('platform_admin'::text)
        OR (auth_user_id = (SELECT auth.uid()))
    );

-- UPDATE: owners and platform_admin can update their row
-- (column restrictions enforced by trigger below)
CREATE POLICY "exhibitor_profiles_update"
    ON public.exhibitor_profiles
    FOR UPDATE
    TO public
    USING (
        has_role('platform_admin'::text)
        OR (auth_user_id = (SELECT auth.uid()))
    );

-- DELETE: platform_admin only
CREATE POLICY "exhibitor_profiles_delete"
    ON public.exhibitor_profiles
    FOR DELETE
    TO public
    USING (
        has_role('platform_admin'::text)
    );

-- 3. Trigger function to block non-privileged writes to subscription columns
CREATE OR REPLACE FUNCTION public.restrict_subscription_column_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow service_role (edge functions, webhooks) and platform_admin to bypass
    IF (SELECT current_setting('role', true)) = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF has_role('platform_admin'::text) THEN
        RETURN NEW;
    END IF;

    -- Block changes to protected columns
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    THEN
        RAISE EXCEPTION 'Subscription columns (subscription_tier, subscription_expires_at, stripe_customer_id) can only be modified by the service role or a platform admin';
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Attach the trigger
DROP TRIGGER IF EXISTS trg_restrict_subscription_columns ON public.exhibitor_profiles;

CREATE TRIGGER trg_restrict_subscription_columns
    BEFORE UPDATE ON public.exhibitor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.restrict_subscription_column_updates();
