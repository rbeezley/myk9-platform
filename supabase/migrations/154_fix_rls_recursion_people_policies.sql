-- Migration 154: Fix infinite recursion in people RLS policies
--
-- Root cause: FORCE ROW LEVEL SECURITY on public.people causes PostgreSQL to
-- evaluate RLS policies even inside SECURITY DEFINER functions owned by postgres.
-- Policies people_select and people_update_privileged call is_trial_secretary()
-- and is_site_admin(), which JOIN public.people — triggering the same policies
-- again → "infinite recursion detected in policy for relation 'people'".
--
-- Fix: rewrite is_trial_secretary(), is_club_admin(), and is_site_admin() using
-- PL/pgSQL with SET LOCAL row_security = off. This temporarily disables RLS for
-- the duration of the function call (SET LOCAL scopes to the current subtransaction).
-- Only superusers can SET row_security = off, and these functions are SECURITY
-- DEFINER owned by postgres (superuser), so this is safe.
--
-- Rollback: re-apply prior versions from migrations 102 and 124.

CREATE OR REPLACE FUNCTION public.is_trial_secretary(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SET LOCAL row_security = off;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SET LOCAL row_security = off;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'club_admin'
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SET LOCAL row_security = off;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- is_platform_admin() delegates to is_site_admin() — no change needed.
-- Grant execute to authenticated (should already be granted, but be explicit).
GRANT EXECUTE ON FUNCTION public.is_trial_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;
