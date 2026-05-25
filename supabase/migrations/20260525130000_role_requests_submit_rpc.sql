-- Replace the policy-based rate limit with a SECURITY DEFINER RPC.
--
-- Why: the prior migration (20260525120000) added a WITH CHECK policy that
-- called a STABLE count helper to enforce "at most 5 pending per user."
-- This is bypassable by a single multi-row INSERT. PostgreSQL READ
-- COMMITTED gives every row in `INSERT INTO ... VALUES (...), (...), ...`
-- the same statement snapshot, so each per-row WITH CHECK invocation sees
-- the pre-statement count and returns true for every row. A 100-row
-- PostgREST array insert sails through.
--
-- Found by PR #342 code review (2026-05-25). The sibling
-- can_insert_club_access_request from 20260524120000 has the same bug;
-- tracked separately in OPEN-TODOS.md.
--
-- Fix: drop the INSERT policy and helper entirely. REVOKE INSERT from
-- authenticated. Add submit_role_request(...) SECURITY DEFINER, which
-- processes one request per call. Each call is its own statement → fresh
-- snapshot → count sees previously-committed inserts. A pg_advisory_xact_lock
-- on (auth_user_id) serializes concurrent calls from the same user so even
-- two parallel calls at count=4 can't both insert.
--
-- The signup trigger path (handle_new_user → insert_signup_role_requests)
-- is unaffected: insert_signup_role_requests is itself SECURITY DEFINER
-- and bypasses RLS. It writes role_requests directly without going through
-- the user-facing RPC; rate limiting is not needed there because the
-- signup flow runs exactly once per user.

BEGIN;

-- 1. Tear down the prior migration's INSERT path.
DROP POLICY IF EXISTS "Users can submit their own pending role requests"
  ON public.role_requests;
DROP FUNCTION IF EXISTS public.can_insert_role_request(uuid);

REVOKE INSERT ON public.role_requests FROM authenticated;

-- 2. New RPC. Only entry point for user-initiated role requests.
CREATE OR REPLACE FUNCTION public.submit_role_request(
  p_requested_role text,
  p_requested_scope text DEFAULT 'club',
  p_club_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL,
  p_requester_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth_uid uuid;
  v_person_id uuid;
  v_pending_count int;
  v_new_id uuid;
BEGIN
  v_caller_auth_uid := (SELECT auth.uid());
  IF v_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Role allowlist. Matches the table CHECK; explicitly excludes any
  -- platform-admin-equivalent role that may be added later.
  IF p_requested_role NOT IN ('club_admin', 'secretary') THEN
    RAISE EXCEPTION 'Invalid requested role: %', p_requested_role
      USING ERRCODE = '22023';
  END IF;

  -- Scope allowlist. Matches the table CHECK.
  IF p_requested_scope NOT IN ('club', 'show') THEN
    RAISE EXCEPTION 'Invalid requested scope: %', p_requested_scope
      USING ERRCODE = '22023';
  END IF;

  -- Strict mutual exclusion of scope columns. The prior policy only
  -- required the matching column; it allowed scope='club' with a
  -- simultaneous show_id (and vice versa), which left confusing
  -- admin-visible records and inflated the unique-index combinations.
  IF p_requested_scope = 'club' THEN
    IF p_club_id IS NULL THEN
      RAISE EXCEPTION 'club_id is required for club-scoped role requests'
        USING ERRCODE = '23502';
    END IF;
    IF p_show_id IS NOT NULL THEN
      RAISE EXCEPTION 'show_id must be NULL for club-scoped role requests'
        USING ERRCODE = '23514';
    END IF;
  ELSIF p_requested_scope = 'show' THEN
    IF p_show_id IS NULL THEN
      RAISE EXCEPTION 'show_id is required for show-scoped role requests'
        USING ERRCODE = '23502';
    END IF;
    IF p_club_id IS NOT NULL THEN
      RAISE EXCEPTION 'club_id must be NULL for show-scoped role requests'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Resolve caller's person record. Identity gate.
  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = v_caller_auth_uid
    AND deleted_at IS NULL;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'No person profile found for this user'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent calls from this user. Two parallel callers at
  -- count=4 would otherwise both pass the check and end at count=6. The
  -- lock is released at COMMIT (advisory_xact_lock). Cross-user calls
  -- proceed in parallel because the lock key includes the user id.
  PERFORM pg_advisory_xact_lock(
    hashtext('role_requests:submit:' || v_caller_auth_uid::text)
  );

  -- Row-by-row rate limit. Because the function is called once per
  -- invocation, each call's count sees previously-committed inserts (it's
  -- a new statement → new snapshot). The advisory lock above prevents
  -- two in-flight calls from racing past this check.
  SELECT count(*) INTO v_pending_count
  FROM public.role_requests
  WHERE auth_user_id = v_caller_auth_uid
    AND status = 'pending';

  IF v_pending_count >= 5 THEN
    RAISE EXCEPTION 'Too many pending role requests (max 5). Wait for review before submitting more.'
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.role_requests (
    auth_user_id,
    person_id,
    requested_role,
    requested_scope,
    club_id,
    show_id,
    requester_note
  ) VALUES (
    v_caller_auth_uid,
    v_person_id,
    p_requested_role,
    p_requested_scope,
    p_club_id,
    p_show_id,
    p_requester_note
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
