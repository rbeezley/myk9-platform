-- Migration 163: Mail-in enrollment RLS + club-scoped secretary recognition
--
-- Three independent fixes that together unblock the registration wizard's
-- mail-in flow (see docs/plans/2026-04-26-mailin-enrollment-fix.md):
--
--   1. Broaden is_show_secretary(check_show_id) to recognize a secretary role
--      granted at the club level (ur.show_id IS NULL, ur.club_id matches the
--      show's club_id).
--   2. Same broadening for is_show_official(check_show_id), covering
--      secretary / chairman / steward club-scoped roles.
--   3. Add three "show official" RLS policies on enrollments (INSERT/UPDATE/
--      SELECT) so secretaries and club admins can enroll exhibitors on behalf
--      of mail-in submissions. Existing self-service policies stay in place.
--
-- Both helpers continue to query user_roles.auth_user_id directly (denormalized
-- in migration 156) — no people-table join, no RLS recursion risk.

-- ============================================================================
-- 1. Broaden is_show_secretary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR (
          r.name = 'secretary'
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

-- ============================================================================
-- 2. Broaden is_show_official
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_show_official(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR (
          r.name IN ('secretary', 'chairman', 'steward')
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

-- ============================================================================
-- 3. Show-official RLS policies on enrollments
-- ============================================================================

CREATE POLICY enrollments_insert_show_official ON public.enrollments
  FOR INSERT
  WITH CHECK (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_update_show_official ON public.enrollments
  FOR UPDATE
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

CREATE POLICY enrollments_select_show_official ON public.enrollments
  FOR SELECT
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
  );

-- ============================================================================
-- Reload PostgREST schema cache so new policies + functions take effect
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- POST-DEPLOY VERIFICATION (run as the seeded secretary user)
-- ============================================================================
-- Spec requires the manual RLS verification block to live IN the migration
-- body so it stays alongside the SQL it's verifying. Run these curls after
-- `supabase db push` lands. Replace SUPABASE_URL / ANON if reusing in another
-- environment.
--
-- 1. is_show_secretary should now return true for a club-scoped secretary
--    on a show belonging to their club:
--
--      SUPABASE_URL="https://sojmvhhwsjxmfistvzbe.supabase.co"
--      ANON="<anon-key-from-apps/myk9show/.env>"
--      TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
--        -H "apikey: $ANON" -H "Content-Type: application/json" \
--        -d '{"email":"secretary@myk9t.com","password":"testpass123"}' \
--        | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
--      curl -s "$SUPABASE_URL/rest/v1/rpc/is_show_secretary" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
--        -H "Content-Type: application/json" \
--        -d '{"check_show_id":"4584f257-19b5-4016-aae6-5e7827b769cb"}'
--      Expected: true   (was: false before this migration)
--
-- 2. enrollments INSERT under handler_id of someone other than the secretary
--    themselves should now succeed (mail-in path):
--
--      curl -s -X POST "$SUPABASE_URL/rest/v1/enrollments" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
--        -H "Content-Type: application/json" \
--        -H "Prefer: return=representation" \
--        -d '{"show_id":"4584f257-19b5-4016-aae6-5e7827b769cb",
--             "handler_id":"<some-other-people-id>"}'
--      Expected: 201 with the new row     (was: 42501 RLS denial)
--      Cleanup the test row afterwards via DELETE.
--
-- 3. Negative test — sign in as a regular exhibitor and attempt the same
--    INSERT for someone else's handler_id. Expected: still 42501 (the
--    self-service _own policy doesn't satisfy the WITH CHECK, and the
--    new _show_official policy fails is_show_official() for a non-official).

-- ============================================================================
-- ROLLBACK (commented; safe — DROPs have no FKs / cascades)
-- ============================================================================
-- DROP POLICY IF EXISTS enrollments_insert_show_official ON public.enrollments;
-- DROP POLICY IF EXISTS enrollments_update_show_official ON public.enrollments;
-- DROP POLICY IF EXISTS enrollments_select_show_official ON public.enrollments;
-- Then re-CREATE OR REPLACE the helpers from migration 099 to restore the
-- show-only-scoped behavior.
