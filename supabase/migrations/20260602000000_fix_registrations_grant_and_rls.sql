-- Migration: Fix enrollments table secretary access + people query performance
--
-- Problems fixed:
-- 1. No secretary SELECT policy on enrollments — secretaries got no rows from the
--    registration:registration_id(...) join, causing Entry Management to fail. The
--    existing policies (handler's own + site_admin) don't cover show-managing secretaries.
-- 2. enrollments RLS subquery to people triggers can_manage_show_person() per row
--    (O(N) calls), causing statement timeouts on all enrollments access. A direct
--    user_roles-based policy bypasses the people→can_manage_show_person cascade.
-- 3. Add partial index on people(last_name, first_name) WHERE deleted_at IS NULL to
--    speed up the sorted all-people query used by PeopleStore (no LIMIT, ORDER BY name).
--
-- Note: "registrations" was renamed to "enrollments" in migration 130. All policies
-- on the table kept their original names (PostgreSQL preserves them on RENAME).

-- ==========================================================================
-- 1. SECRETARY / SHOW-OFFICIAL SELECT POLICY ON enrollments
--    Uses user_roles.auth_user_id directly — avoids the people→entries cascade.
-- ==========================================================================

CREATE POLICY enrollments_select_show_secretary ON public.enrollments
  FOR SELECT USING (
    exists (
      select 1
      from public.user_roles ur
      where ur.auth_user_id = auth.uid()
        and (
          ur.show_id = enrollments.show_id    -- show-scoped secretary/club_admin
          or ur.show_id is null               -- global roles (site_admin, platform_admin)
        )
        and (ur.expires_at is null or ur.expires_at > now())
    )
  );

-- ==========================================================================
-- 2. PARTIAL INDEX for people sorted query
--    Speeds up: SELECT ... FROM people WHERE deleted_at IS NULL ORDER BY last_name, first_name
--    Used by PeopleStore.loadUsers() without a LIMIT.
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_people_deleted_name
  ON public.people (last_name ASC NULLS LAST, first_name ASC NULLS LAST)
  WHERE deleted_at IS NULL;
