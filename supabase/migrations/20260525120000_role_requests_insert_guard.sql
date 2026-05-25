-- Tighten the user-facing INSERT path on role_requests.
--
-- Background: migration 20260524195251 created role_requests with an INSERT
-- policy that constrained WHO can insert (auth_user_id = auth.uid()) but not
-- WHAT they can insert. A regular authenticated user could call
--   supabase.from('role_requests').insert({
--     requested_role: 'secretary',
--     requested_scope: 'club',
--     club_id: <any club>,
--   })
-- with any (role, club_id, show_id) combination. The partial unique index
-- prevents exact duplicates per tuple, but an attacker could enumerate
-- different clubs/shows to flood the admin review queue. This was flagged as
-- H1 in the 2026-05-25 nightly commit review.
--
-- Fix: mirror the sibling can_insert_club_access_request pattern from
-- 20260524120000_club_access_requests.sql:31-56. The policy WITH CHECK now
-- enforces:
--   1. Role allowlist (matches the table CHECK; future role additions are
--      opt-in here too — silent block until policy is updated).
--   2. Scope consistency — 'club' scope requires club_id; 'show' requires
--      show_id. The signup trigger path is unaffected because
--      insert_signup_role_requests is SECURITY DEFINER and bypasses RLS.
--   3. Rate limit — at most 5 pending requests per authenticated user (admin
--      queue flood guard).
--
-- Out of scope (tracked in OPEN-TODOS as PR C): M1 show↔club consistency in
-- approve_role_request; M2 self-cancel policy or dropping 'cancelled' from
-- the status CHECK.

BEGIN;

-- Helper: per-user pending-request count cap. Mirrors
-- can_insert_club_access_request in shape and purpose.
CREATE OR REPLACE FUNCTION public.can_insert_role_request(p_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT count(*) < 5
  FROM public.role_requests
  WHERE auth_user_id = p_auth_user_id
    AND status = 'pending'
$$;

REVOKE ALL ON FUNCTION public.can_insert_role_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_insert_role_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_insert_role_request(uuid) TO authenticated;

-- Replace the permissive INSERT policy.
DROP POLICY IF EXISTS "Users can submit their own pending role requests"
  ON public.role_requests;

CREATE POLICY "Users can submit their own pending role requests"
  ON public.role_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Identity gate (unchanged from original policy)
    (SELECT auth.uid()) = auth_user_id
    AND person_id = (SELECT public.get_my_person_id())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL

    -- Role allowlist — must match the table CHECK and explicitly exclude
    -- any platform-admin-equivalent role that may be added later.
    AND requested_role IN ('club_admin', 'secretary')

    -- Scope consistency — club-scoped requests must name a club, show-scoped
    -- must name a show. Signup trigger path is unaffected (SECURITY DEFINER
    -- bypasses RLS) so signup-time club_id IS NULL inserts keep working.
    AND requested_scope IN ('club', 'show')
    AND (requested_scope <> 'club' OR club_id IS NOT NULL)
    AND (requested_scope <> 'show' OR show_id IS NOT NULL)

    -- Rate limit: at most 5 pending per user (admin queue flood guard).
    AND public.can_insert_role_request((SELECT auth.uid()))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
