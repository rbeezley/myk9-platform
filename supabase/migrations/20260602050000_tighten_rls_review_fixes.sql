-- Migration: Tighten RLS policies from PR #489 self-review
--
-- Fix 1 (high): enrollments_select_show_secretary was missing is_active and
-- role-name checks, so ANY authenticated user with any show-scoped user_roles
-- row (including judges, stewards) could read all enrollment records. Restrict
-- to secretary/club_admin/site_admin role names with is_active = true.
--
-- Fix 2 (medium): dogs_insert_secretary allowed any authenticated user to
-- insert a dog with an arbitrary owner_id (any person ID). Restrict to users
-- who have a secretary/admin role in ANY show (broad but still role-gated).

-- ==========================================================================
-- Fix 1: Tighten enrollments secretary SELECT policy
-- ==========================================================================

DROP POLICY IF EXISTS enrollments_select_show_secretary ON public.enrollments;

CREATE POLICY enrollments_select_show_secretary ON public.enrollments
  FOR SELECT USING (
    exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.auth_user_id = auth.uid()
        and ur.is_active = true
        and (ur.expires_at is null or ur.expires_at > now())
        and r.name in ('secretary', 'club_admin', 'site_admin', 'platform_admin')
        and (
          ur.show_id = enrollments.show_id   -- show-scoped secretary
          or ur.show_id is null              -- global admin role
        )
    )
  );

-- ==========================================================================
-- Fix 2: Tighten dogs secretary INSERT policy
-- ==========================================================================

DROP POLICY IF EXISTS dogs_insert_secretary ON public.dogs;

CREATE POLICY dogs_insert_secretary ON public.dogs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Own dog (own person ID as owner)
      owner_id = ( SELECT get_my_person_id() )
      -- OR secretary/admin inserting for someone else
      OR exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.auth_user_id = auth.uid()
          and ur.is_active = true
          and (ur.expires_at is null or ur.expires_at > now())
          and r.name in ('secretary', 'club_admin', 'site_admin', 'platform_admin')
      )
    )
  );
