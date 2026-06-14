-- Security advisor remediation — targeted triage fixes
--
-- Addresses the two highest-confidence categories from the Supabase security
-- advisor.  The remaining ~161 flagged "anon-callable SECURITY DEFINER
-- functions" are Supabase/extension internals (pg_catalog, extensions schema)
-- and are intentionally left alone.
--
-- == Category 1: RBAC functions incorrectly granted to anon (5 functions) ==
--
-- Migrations 012 and 017 granted EXECUTE to anon on SECURITY DEFINER functions
-- that look up roles/permissions by auth_user_id.  Anon sessions have no
-- auth.uid(), so calls return empty but still expose role-schema structure to
-- unauthenticated probing.  All callers are authenticated app hooks.
--
-- get_user_permissions(UUID) was dropped by migration 017 (superseded by 3-arg version)
-- so no revoke needed for the single-arg overload.

REVOKE EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID)
  FROM anon;

-- == Category 2: SECURITY DEFINER views (8 views) ==
--
-- By default PostgreSQL views run as the view owner (postgres), bypassing RLS.
-- Setting security_invoker = true makes each view execute as the calling role
-- so RLS on the underlying tables is enforced.  The entries table already has
-- correct RLS policies for both authenticated and anon (TV display) roles, so
-- this change improves security without breaking any app query.
--
-- view_myk9q_entries: additionally revoke the anon SELECT grant — anon was
-- reading handler names, dog names, and armband numbers for ALL shows without
-- RLS.  The TV display path uses the entries table directly (not this view),
-- so removing the anon view grant is safe.

ALTER VIEW public.view_myk9q_entries SET (security_invoker = true);
REVOKE SELECT ON public.view_myk9q_entries FROM anon;

ALTER VIEW public.view_entry_with_results SET (security_invoker = true);

-- Stats views (authenticated-only; security_invoker ensures RLS on the join
-- tables is respected rather than running as postgres)
ALTER VIEW public.view_stats_summary     SET (security_invoker = true);
ALTER VIEW public.view_breed_stats       SET (security_invoker = true);
ALTER VIEW public.view_judge_stats       SET (security_invoker = true);
ALTER VIEW public.view_clean_sweep_dogs  SET (security_invoker = true);
ALTER VIEW public.view_fastest_times     SET (security_invoker = true);
ALTER VIEW public.judge_day_summary      SET (security_invoker = true);
