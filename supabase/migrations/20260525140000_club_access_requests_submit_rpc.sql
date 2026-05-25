-- Replace the policy-based rate limit on club_access_requests with a
-- SECURITY DEFINER RPC.
--
-- Why: same shape as the role_requests fix in 20260525130000. The original
-- migration 20260524120000 used a WITH CHECK policy that called the STABLE
-- helper `can_insert_club_access_request(uuid)` to enforce "at most 3 pending
-- per user." This is bypassable by a single multi-row INSERT — every row in
-- `INSERT INTO ... VALUES (...), (...), ...` shares the same statement
-- snapshot under READ COMMITTED, so each per-row count(*) check sees the
-- pre-statement count and returns true for every row.
--
-- Found while fixing the sibling vulnerability in PR #342 (role_requests).
-- The two tables follow the same pattern; this migration applies the same
-- fix shape to club_access_requests.
--
-- Fix: drop the INSERT policy and helper entirely. REVOKE INSERT from
-- authenticated. Add submit_club_access_request(...) SECURITY DEFINER that
-- processes one request per call. Each call is its own statement → fresh
-- snapshot → count sees previously-committed inserts. A pg_advisory_xact_lock
-- on the auth_user_id serializes concurrent calls from the same user.
--
-- The signup trigger path
-- (zz_materialize_club_access_request on auth.users
--   → materialize_club_access_request_from_auth_user
--   → insert_club_access_request_from_signup)
-- is unaffected: insert_club_access_request_from_signup is itself
-- SECURITY DEFINER and bypasses RLS. It writes directly to
-- club_access_requests without going through the user-facing RPC; rate
-- limiting is not needed there because the signup flow runs exactly once
-- per user.

BEGIN;

-- 1. Tear down the prior migration's INSERT path.
DROP POLICY IF EXISTS club_access_requests_insert_own ON public.club_access_requests;
DROP FUNCTION IF EXISTS public.can_insert_club_access_request(uuid);

REVOKE INSERT ON public.club_access_requests FROM authenticated;

-- 2. New RPC. Only entry point for user-initiated club access requests
-- outside of the signup trigger.
CREATE OR REPLACE FUNCTION public.submit_club_access_request(
  p_requested_club_name text,
  p_requested_club_website text DEFAULT NULL,
  p_request_note text DEFAULT NULL
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
  v_normalized_name text;
  v_normalized_website text;
  v_normalized_note text;
  v_new_id uuid;
BEGIN
  v_caller_auth_uid := (SELECT auth.uid());
  IF v_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Normalize inputs. Matches the table CHECK on requested_club_name
  -- (length(trim(...)) > 1) and the signup trigger's nullif(trim(...), '')
  -- pattern for optional fields.
  v_normalized_name := nullif(trim(coalesce(p_requested_club_name, '')), '');
  v_normalized_website := nullif(trim(coalesce(p_requested_club_website, '')), '');
  v_normalized_note := nullif(trim(coalesce(p_request_note, '')), '');

  IF v_normalized_name IS NULL OR length(v_normalized_name) < 2 THEN
    RAISE EXCEPTION 'Club name must be at least 2 characters'
      USING ERRCODE = '22023';
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
  -- count=2 would otherwise both pass the check and end at count=4. The
  -- lock is released at COMMIT. Cross-user calls proceed in parallel
  -- because the lock key includes the user id.
  PERFORM pg_advisory_xact_lock(
    hashtext('club_access_requests:submit:' || v_caller_auth_uid::text)
  );

  -- Row-by-row rate limit. Cap at 3 pending — matches the original intent
  -- of can_insert_club_access_request. Because the function is called once
  -- per invocation, the count sees previously-committed inserts.
  SELECT count(*) INTO v_pending_count
  FROM public.club_access_requests
  WHERE requester_auth_user_id = v_caller_auth_uid
    AND status = 'pending';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending club access requests (max 3). Wait for review before submitting more.'
      USING ERRCODE = '53400';
  END IF;

  -- The partial unique index club_access_requests_pending_person_club_unique
  -- on (requester_person_id, lower(requested_club_name)) where status=pending
  -- enforces no duplicate pending request for the same club name from this
  -- user. ON CONFLICT DO NOTHING swallows the duplicate quietly; v_new_id
  -- will be NULL in that case and the caller can interpret it as a no-op.
  INSERT INTO public.club_access_requests (
    requester_person_id,
    requester_auth_user_id,
    requested_club_name,
    requested_club_website,
    request_note
  ) VALUES (
    v_person_id,
    v_caller_auth_uid,
    v_normalized_name,
    v_normalized_website,
    v_normalized_note
  )
  ON CONFLICT (requester_person_id, (lower(requested_club_name))) WHERE status = 'pending'
  DO NOTHING
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_club_access_request(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
