-- M1 + M2 from the 2026-05-25 nightly commit review of PR #333.
--
-- M1: approve_role_request didn't validate that p_show_id belongs to
--     p_club_id. A site admin (or anyone who somehow bypasses the
--     is_site_admin gate via a future bug) could grant a club-scoped role
--     where show_id references a show under a different club. Trust
--     boundary is "site admin" so impact today is low operationally, but
--     the RPC is the right place to enforce the invariant.
--
-- M2: role_requests.status CHECK allows 'cancelled', but only the admin
--     UPDATE policy exists — requesters cannot withdraw their own pending
--     requests. The grep survey confirmed no user-facing UI today shows a
--     user their own pending role_requests, so adding a cancel RPC would
--     be a half-built feature (per SLC: no half-built features). Dropping
--     'cancelled' from the CHECK removes the dead surface. If a future
--     surface needs user-side withdrawal, re-add the status value AND a
--     cancel_role_request SECURITY DEFINER RPC at that time.

BEGIN;

-- ============================================================================
-- M2: drop 'cancelled' from the status CHECK
-- ============================================================================

-- Defensive normalization in case any row was manually set to 'cancelled'
-- (no path to it from app code, but admins have raw UPDATE access via
-- their RLS policy + database console).
UPDATE public.role_requests
SET status = 'denied'
WHERE status = 'cancelled';

ALTER TABLE public.role_requests
  DROP CONSTRAINT IF EXISTS role_requests_status_check;

ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_status_check
  CHECK (status IN ('pending', 'approved', 'denied'));

-- ============================================================================
-- M1: approve_role_request — add show↔club consistency check
-- ============================================================================

-- The rest of the function is verbatim from migration 20260524195251 (only
-- the new IF NOT EXISTS check on shows.club_id and the comment about it
-- are additions). CREATE OR REPLACE is the standard Postgres pattern for
-- this kind of additive edit; the signature stays identical so the
-- existing GRANT EXECUTE survives.
CREATE OR REPLACE FUNCTION public.approve_role_request(
  p_request_id uuid,
  p_club_id uuid,
  p_show_id uuid DEFAULT NULL,
  p_reviewer_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.role_requests%ROWTYPE;
  v_reviewer_person_id uuid;
  v_role_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can approve role requests'
      USING ERRCODE = '42501';
  END IF;

  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'A club is required before approving this role request'
      USING ERRCODE = '23514';
  END IF;

  -- M1 fix: if a show is named, it must belong to the named club. Without
  -- this check, an admin could grant a club-scoped role where show_id
  -- references a show under a different club, leaving an inconsistent
  -- user_roles row that's hard to audit.
  IF p_show_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shows
    WHERE id = p_show_id
      AND club_id = p_club_id
  ) THEN
    RAISE EXCEPTION 'Show % does not belong to club %', p_show_id, p_club_id
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_request
  FROM public.role_requests
  WHERE id = p_request_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = v_request.requested_role;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Requested role "%" does not exist', v_request.requested_role
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_roles
  SET is_active = true,
      granted_at = now(),
      granted_by = v_reviewer_person_id
  WHERE user_id = v_request.person_id
    AND role_id = v_role_id
    AND club_id = p_club_id
    AND ((show_id IS NULL AND p_show_id IS NULL) OR show_id = p_show_id);

  IF NOT FOUND THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      show_id,
      is_active,
      granted_at,
      granted_by
    ) VALUES (
      v_request.person_id,
      v_role_id,
      p_club_id,
      p_show_id,
      true,
      now(),
      v_reviewer_person_id
    );
  END IF;

  UPDATE public.role_requests
  SET status = 'approved',
      club_id = p_club_id,
      show_id = p_show_id,
      reviewer_note = p_reviewer_note,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
