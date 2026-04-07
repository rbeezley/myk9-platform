-- Migration 124: Establish is_site_admin() as canonical admin helper
--
-- Context: Migration 047 created is_platform_admin() accepting both 'platform_admin'
-- and 'site_admin' role names as a compatibility shim. 86 RLS policies call
-- is_platform_admin(). Rather than recreating all 86 policies, we:
--   1. Create is_site_admin() as the real implementation (site_admin only)
--   2. Replace is_platform_admin() with a deprecated wrapper calling is_site_admin()
--   3. Defensively clean up any lingering platform_admin role rows
--
-- Convention: All new RLS policies must use is_site_admin(). The deprecated
-- wrapper will be removed in a future migration once old policies cycle through rewrites.

-- Step 1: Create canonical function
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- Step 2: Replace is_platform_admin() with a deprecated wrapper
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_site_admin();
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'DEPRECATED — delegates to is_site_admin(). Use is_site_admin() in all new RLS policies.';

-- Step 3: Defensive cleanup — remove platform_admin role if it still exists.
-- Migration 066 already performed this; these are no-ops if that ran correctly.
DELETE FROM public.user_roles
WHERE role_id IN (SELECT id FROM public.roles WHERE name = 'platform_admin');

DELETE FROM public.roles WHERE name = 'platform_admin';

-- Step 4: Grant EXECUTE to authenticated role (parity with is_platform_admin)
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;
