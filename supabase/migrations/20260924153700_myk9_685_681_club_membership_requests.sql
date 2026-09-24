-- MYK9-685 / MYK9-681: club membership requests, and a once-only guard for
-- access-request notification emails.
--
-- 1. public.club_membership_requests — an exhibitor asks an existing club to
--    add them to its roster as an ordinary member. Same rule as the
--    club-routed secretary request (20260915231500): a request is an ask and
--    never grants anything. Only the club's admin (or a site admin) approving
--    it writes the club_members row, and membership still grants no
--    secretary/show-management permission (20260830210000 decoupled the two).
--
--    A separate table rather than a third role_requests.requested_role:
--    membership is not a role (MYK9-169 kept the two apart on purpose), and
--    role_requests feeds the site-admin role inbox and approve_role_request,
--    which would both have to learn to refuse a "role" that is not one.
--
--    Writes happen only through the SECURITY DEFINER RPCs below. The table
--    carries one SELECT policy (own rows, or a site admin); club admins read
--    through list_club_membership_requests(p_club_id), which checks
--    is_club_admin(p_club_id) against a NOT NULL argument — never a bare
--    policy arm on a nullable column (the MYK9-571 round-1 P0).
--
-- 2. email_log_access_request_once_idx — send-access-request-email claims a
--    (email_type, related_id, recipient) row BEFORE it calls the provider, so
--    a retried call, a double click or a refresh can never send the same
--    access-request email twice. Scoped to the access_request_* email types
--    only: support notifications legitimately send many emails per ticket.

BEGIN;

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE public.club_membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.club_membership_requests IS
  'MYK9-685: an ask to join a club roster as an ordinary member. Never grants anything; approve_club_membership_request writes club_members. Written only through SECURITY DEFINER RPCs.';

-- One open ask per person per club.
CREATE UNIQUE INDEX club_membership_requests_one_pending_idx
  ON public.club_membership_requests (person_id, club_id)
  WHERE status = 'pending';

CREATE INDEX club_membership_requests_club_status_idx
  ON public.club_membership_requests (club_id, status, created_at DESC);
CREATE INDEX club_membership_requests_person_id_fk_idx
  ON public.club_membership_requests (person_id);
CREATE INDEX club_membership_requests_auth_user_id_fk_idx
  ON public.club_membership_requests (auth_user_id);
CREATE INDEX club_membership_requests_reviewed_by_fk_idx
  ON public.club_membership_requests (reviewed_by);

ALTER TABLE public.club_membership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_membership_requests FORCE ROW LEVEL SECURITY;

-- ALTER DEFAULT PRIVILEGES in this project grants anon AND authenticated full
-- CRUD on every new public table, so the narrow grant needs its REVOKE first.
REVOKE ALL ON TABLE public.club_membership_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.club_membership_requests TO authenticated;
GRANT ALL ON TABLE public.club_membership_requests TO service_role;

CREATE POLICY club_membership_requests_select_own_or_site_admin
  ON public.club_membership_requests
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.is_site_admin())
  );

-- ============================================================================
-- 2. submit_club_membership_request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_club_membership_request(
  p_club_id uuid,
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
  v_latest_status text;
  v_pending_count int;
  v_new_id uuid;
BEGIN
  v_caller_auth_uid := (SELECT auth.uid());
  IF v_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_club_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clubs WHERE id = p_club_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  -- Identity gate: the caller's own, live person row. Restated here because
  -- this function bypasses RLS.
  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = v_caller_auth_uid
    AND deleted_at IS NULL;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'No person profile found for this user' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND person_id = v_person_id
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are already a member of this club' USING ERRCODE = 'MK685';
  END IF;

  -- A suspension is the club's decision, not a lapse: a join request must not
  -- become a way around it. Same code as a standing denial (the club said no).
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND person_id = v_person_id
      AND membership_status = 'suspended'
  ) THEN
    RAISE EXCEPTION 'Your membership in this club is suspended. Contact the club directly.'
      USING ERRCODE = 'MK571';
  END IF;

  -- Standing denial, same shape and same code as the club-routed secretary
  -- ask (MK571): the club already said no, and only adding the person to the
  -- roster directly (the active-member check above) lifts it.
  SELECT status INTO v_latest_status
  FROM public.club_membership_requests
  WHERE person_id = v_person_id
    AND club_id = p_club_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_latest_status = 'denied' THEN
    RAISE EXCEPTION
      'A previous membership request for this club was denied. Contact the club directly.'
      USING ERRCODE = 'MK571';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('club_membership_requests:submit:' || v_caller_auth_uid::text)
  );

  SELECT count(*) INTO v_pending_count
  FROM public.club_membership_requests
  WHERE auth_user_id = v_caller_auth_uid
    AND status = 'pending';

  IF v_pending_count >= 5 THEN
    RAISE EXCEPTION 'Too many pending membership requests (max 5). Wait for review before submitting more.'
      USING ERRCODE = '53400';
  END IF;

  -- A duplicate pending ask returns NULL (club_membership_requests_one_pending_idx
  -- + ON CONFLICT DO NOTHING), which callers read as "already under review".
  INSERT INTO public.club_membership_requests (
    club_id, person_id, auth_user_id, requester_note
  ) VALUES (
    p_club_id, v_person_id, v_caller_auth_uid, NULLIF(btrim(coalesce(p_requester_note, '')), '')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.submit_club_membership_request(uuid, text) IS
  'MYK9-685: asks a club to add the caller to its roster. Never grants; NULL return = already pending; MK685 = already a member; MK571 = standing denial.';

REVOKE ALL ON FUNCTION public.submit_club_membership_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_club_membership_request(uuid, text) TO authenticated;

-- ============================================================================
-- 3. get_my_club_membership_request_status — the requester's own view.
--    club_members_select's own-row arm compares person_id to auth.uid(), which
--    never matches (people.id is not auth.uid()), so a member cannot read
--    their own roster row through RLS. This function answers "am I a member,
--    and where is my latest ask" for the caller only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_club_membership_request_status(p_club_id uuid)
RETURNS TABLE (
  is_member boolean,
  request_status text,
  reviewer_note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid())
    AND deleted_at IS NULL;

  IF v_person_id IS NULL OR p_club_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = p_club_id
        AND cm.person_id = v_person_id
        AND cm.membership_status = 'active'
    ),
    latest.status,
    latest.reviewer_note
  FROM (SELECT 1) AS one
  LEFT JOIN LATERAL (
    SELECT r.status, r.reviewer_note
    FROM public.club_membership_requests r
    WHERE r.club_id = p_club_id
      AND r.person_id = v_person_id
    ORDER BY r.created_at DESC
    LIMIT 1
  ) AS latest ON true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_club_membership_request_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_club_membership_request_status(uuid) TO authenticated;

-- ============================================================================
-- 4. list_club_membership_requests — club admin (or site admin) of p_club_id.
--    One 42501 verdict before any row is read, NULL club included.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_club_membership_requests(p_club_id uuid)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  person_id uuid,
  status text,
  requester_note text,
  created_at timestamptz,
  requester_name text,
  requester_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_club_id IS NULL OR NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can list its membership requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.club_id,
    r.person_id,
    r.status,
    r.requester_note,
    r.created_at,
    COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Unknown user'),
    p.email
  FROM public.club_membership_requests r
  JOIN public.people p ON p.id = r.person_id
  WHERE r.club_id = p_club_id
    AND r.status = 'pending'
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_club_membership_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_club_membership_requests(uuid) TO authenticated;

-- ============================================================================
-- 5. approve / deny — authorization and shape folded into one 42501 verdict,
--    read unlocked BEFORE the row lock, exactly as approve_club_role_request.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_club_membership_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_person_id uuid;
  v_status text;
  v_reviewer_person_id uuid;
BEGIN
  SELECT club_id, person_id, status
  INTO v_club_id, v_person_id, v_status
  FROM public.club_membership_requests
  WHERE id = p_request_id;

  IF v_club_id IS NULL
     OR NOT (public.is_site_admin() OR public.is_club_admin(v_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can approve this request'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending membership request was not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.club_membership_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending membership request was not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found' USING ERRCODE = '42501';
  END IF;

  -- A suspension that landed while the ask was pending is not lifted by it:
  -- the admin lifts a suspension from the member list, deliberately.
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_club_id
      AND person_id = v_person_id
      AND membership_status = 'suspended'
  ) THEN
    RAISE EXCEPTION 'This person''s membership is suspended. Lift the suspension from the member list instead.'
      USING ERRCODE = '23514';
  END IF;

  -- Reactivating an existing lapsed/resigned row keeps its type, dues and
  -- notes (same rule as the founder grant in 20260919205500). Only those two
  -- statuses are reactivated here; suspended was refused above.
  INSERT INTO public.club_members (club_id, person_id, membership_status)
  VALUES (v_club_id, v_person_id, 'active')
  ON CONFLICT (club_id, person_id) DO UPDATE
    SET membership_status = 'active'
    WHERE public.club_members.membership_status IN ('lapsed', 'resigned');

  UPDATE public.club_membership_requests
  SET status = 'approved',
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = NULLIF(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_club_membership_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_club_membership_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.deny_club_membership_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_status text;
  v_reviewer_person_id uuid;
BEGIN
  SELECT club_id, status
  INTO v_club_id, v_status
  FROM public.club_membership_requests
  WHERE id = p_request_id;

  IF v_club_id IS NULL
     OR NOT (public.is_site_admin() OR public.is_club_admin(v_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can deny this request'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending membership request was not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.club_membership_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending membership request was not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.club_membership_requests
  SET status = 'denied',
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = NULLIF(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deny_club_membership_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deny_club_membership_request(uuid, text) TO authenticated;

-- ============================================================================
-- 6. Once-only access-request emails (MYK9-681).
-- ============================================================================

CREATE UNIQUE INDEX email_log_access_request_once_idx
  ON public.email_log (email_type, related_id, lower(recipient_email))
  WHERE email_type LIKE 'access_request_%';

NOTIFY pgrst, 'reload schema';

COMMIT;
