-- Migration 155: Fix infinite recursion in people RLS policies (take 2)
--
-- Migration 154's PL/pgSQL approach with SET LOCAL row_security = off didn't
-- work because PostgreSQL detects RLS policy recursion at PLAN TIME, before the
-- function body executes. Even with SECURITY DEFINER + superuser ownership,
-- the planner sees `is_trial_secretary()` references `public.people`, which is
-- the same table the policy guards, and throws the error.
--
-- Fix: use dynamic SQL (EXECUTE) so the planner cannot statically trace the
-- table reference. The string is opaque to the planner. At runtime, the
-- SECURITY DEFINER function bypasses RLS, so the inner query succeeds.
--
-- This is a known PostgreSQL workaround for RLS policy recursion when you need
-- a helper function to query the same table the policy guards.
--
-- Rollback: re-apply migration 102 / 124 versions of these functions.

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
  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.people p ON p.id = ur.user_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name IN ('secretary', 'trial_secretary')
        AND ur.is_active = true
        AND ($1 IS NULL OR ur.club_id = $1)
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  $sql$ INTO v_result USING check_club_id;
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
  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.people p ON p.id = ur.user_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name = 'club_admin'
        AND ur.is_active = true
        AND ($1 IS NULL OR ur.club_id = $1)
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  $sql$ INTO v_result USING check_club_id;
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
  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.people p ON p.id = ur.user_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name = 'site_admin'
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  $sql$ INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_trial_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;
