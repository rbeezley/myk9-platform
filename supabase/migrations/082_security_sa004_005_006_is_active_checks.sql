-- =============================================================================
-- Migration 082: SA-004/005/006 — Add is_active check to role functions
--
-- HIGH: is_platform_admin(), is_club_admin(), and has_role() did not check
-- ur.is_active, allowing deactivated roles to retain full access.
--
-- is_trial_secretary() already has this check (migration 074) — not touched.
-- =============================================================================

-- SA-004: is_platform_admin() — add is_active check
CREATE OR REPLACE FUNCTION is_platform_admin()
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
      AND r.name IN ('platform_admin', 'site_admin')
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- SA-005: is_club_admin() — add is_active check
CREATE OR REPLACE FUNCTION is_club_admin(check_club_id UUID DEFAULT NULL)
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
      AND r.name = 'club_admin'
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- SA-006: has_role() — add is_active check
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
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
      AND r.name = role_name
      AND ur.is_active = true
      AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;
