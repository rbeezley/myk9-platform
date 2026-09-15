-- Club-routed show-access requests (MYK9-571).
--
-- Today a signed-in exhibitor whose club is already on the platform but has not
-- appointed them has no in-app way to ask for show (secretary) access. Signup
-- already writes role_requests rows via insert_signup_role_requests, and
-- submit_role_request (20260525130000) has existed since May with nothing
-- calling it. This migration wires a club-routed request flow on top of both,
-- without changing the one rule 20260830210000 established:
--
--   Appointment (grant_club_secretary) is the only thing that grants access.
--   A request is an ask. It never grants anything on its own.
--
-- What changes:
--
--   1. submit_role_request gains a "standing denial" guard: if the caller's
--      most recent request for this exact (person, club, role, scope='club')
--      was denied and they still do not hold that role at the club, block a
--      resubmission with a distinct error code (MK571) rather than silently
--      re-queuing something a club admin already said no to. A direct
--      appointment by the club (grant_club_secretary) is the only thing that
--      clears this — matching the design note in the issue. It also now
--      requires a non-empty p_requester_note for a club-scoped secretary
--      request specifically: signup's own inserts go through
--      insert_signup_role_requests (a separate, direct INSERT), so they never
--      call this function and are unaffected.
--
--      Duplicate PENDING requests are already handled: the existing partial
--      unique index role_requests_one_pending_scope_idx
--      (person_id, requested_role, requested_scope, club_id, show_id)
--      WHERE status = 'pending' already covers "one open request per person
--      per club per role" for exactly this flow (requested_scope is always
--      'club' here), and submit_role_request already resolves the resulting
--      23505 via `ON CONFLICT DO NOTHING`, returning NULL instead of raising.
--      Adding a second, coarser (person_id, club_id) index as the issue
--      sketched would be redundant with this one and would wrongly block a
--      person from having an open club_admin request AND an open secretary
--      request at the same club at once — narrower is correct here, so no
--      new index is added.
--
--   2. Two new club-admin-facing RPCs, approve_club_role_request and
--      deny_club_role_request, scoped to requested_scope='club' AND
--      requested_role='secretary' only. Approval calls grant_club_secretary
--      (same permission_audit_log row a direct appointment gets); nothing
--      else grants. Authorization — is_site_admin() OR
--      is_club_admin(request.club_id), restated inside the function, never
--      trusted from the caller — is folded into ONE verdict together with
--      the shape check (requested_scope='club' AND requested_role=
--      'secretary' AND club_id IS NOT NULL), checked BEFORE the row is
--      locked FOR UPDATE, off a plain, unlocked read of those columns. A
--      non-admin therefore always gets the same 42501 whether the request
--      is missing, the wrong shape, already reviewed, or belongs to another
--      club — never a P0002 or 22023 that would let a non-admin distinguish
--      those cases from "not yours" by probing ids (round 2, R4: round 1
--      raised 22023 for the shape check before ever checking who was
--      asking, which is the same class of oracle, just smaller, as the P0
--      the club-admin SELECT arm had).
--
--   3. role_requests_select (the one live SELECT policy on this table since
--      20260728130000 consolidated "Site admins can view role requests" and
--      "Users can view their own role requests" into it) gains a third OR
--      arm so a club admin can read pending — and reviewed — club-scoped
--      secretary requests for their own club: requested_scope = 'club' AND
--      requested_role = 'secretary' AND club_id IS NOT NULL AND
--      is_club_admin(club_id). Dropped and recreated rather than added-to as
--      a second policy, matching the "one SELECT policy per table" shape
--      20260728130000 established. The requester's own-row arm and the
--      site-admin arm are copied verbatim; a requester still sees only their
--      own request and a site admin still sees everything — including clubs
--      with zero admins, which keeps the /admin/role-requests fallback
--      intact.
--
--   4. approve_role_request (the site-admin inbox path) is fixed to route
--      EVERY secretary grant through grant_club_secretary instead of only
--      the ones whose row still carries requested_scope='club'. Before this,
--      a site admin approving a SHOW-scoped secretary request (the UI never
--      passes p_show_id, so p_show_id is NULL at the RPC even though the
--      original ask named a show) fell into the manual-UPSERT ELSE branch —
--      same unaudited-grant bug as the club-scoped case, just reached from a
--      different requested_scope. The discriminator is now what grant is
--      actually being made (requested_role = 'secretary' AND p_show_id IS
--      NULL), not what scope the original ask carried. Every other
--      combination (club_admin requests, requests approved WITH a show_id)
--      is untouched: same manual UPSERT as before, copied verbatim from the
--      latest definition (20260830240000).
--
-- Round 2 restructure (same-day follow-up, before this migration ever
-- shipped): review found a P1 in round 1's own fix, on the exact path this
-- migration touches (role_requests_select <-> is_club_admin) — the nullable
-- club_id meeting the argument-less-helper trap this project has hit five
-- times before (MYK9-258/329/457/470/474). Round 1's club-admin arm passed
-- is_club_admin(club_id) with club_id NULL for every signup-generated
-- secretary request, which means "club admin anywhere", not "admin of the
-- request's club" — every club admin could read every signup secretary
-- request platform-wide. Rather than bolt on another guard, this drops the
-- source: show-scoped secretary is not a permission any more
-- (20260830240000 retired it), so submit_role_request now REJECTS
-- requested_scope='show' for requested_role='secretary' at the door
-- (ERRCODE 22023). That makes every secretary request club-scoped by
-- construction, and the club-admin SELECT arm above restates
-- requested_scope='club' AND club_id IS NOT NULL explicitly rather than
-- relying on that invariant holding forever. approve_club_role_request and
-- deny_club_role_request also collapse their shape check and authorization
-- check into one 42501 verdict (previously a caller could get 22023 for a
-- malformed id/shape before ever being checked for authorization, which is
-- itself a smaller information leak than round 1's, but the same class of
-- bug: a code path that answers a question before checking who's asking).

BEGIN;

-- ============================================================================
-- 1. submit_role_request — standing-denial guard + required note for a
--    club-scoped secretary ask. Copied from 20260525130000 (the only
--    migration that has ever defined it) with the additions marked below.
-- ============================================================================

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
  v_latest_status text;
  v_already_holds_role boolean;
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

  -- MYK9-571 restructure (round 2): show-scoped secretary is not a
  -- permission any more (20260830240000 retired it -- a show_officials row
  -- is paperwork only, grant_club_secretary is club-scoped, and
  -- approve_role_request already raises for p_show_id IS NOT NULL on this
  -- role). Reject the ask itself rather than let it sit as a row nobody can
  -- legitimately grant: this also means every secretary request that
  -- reaches the note/standing-denial guards below is club-scoped, so those
  -- guards no longer need a scope='club' condition of their own to cover
  -- every secretary request.
  IF p_requested_role = 'secretary' AND p_requested_scope = 'show' THEN
    RAISE EXCEPTION 'Secretary access is club-scoped; request it at the club'
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

  -- MYK9-571 addition: the club-routed ask (RequestShowAccessCard) requires
  -- the requester to say why. insert_signup_role_requests bypasses this
  -- function entirely (a direct INSERT), so signup's note-less requests are
  -- unaffected.
  IF p_requested_scope = 'club'
     AND p_requested_role = 'secretary'
     AND btrim(coalesce(p_requester_note, '')) = '' THEN
    RAISE EXCEPTION 'A note is required when asking a club to appoint you as secretary'
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

  -- MYK9-571 addition: a standing denial blocks re-requesting the same
  -- club-scoped role at the same club. "Standing" means the MOST RECENT
  -- request for this exact (person, club, role) was denied; an approved or
  -- still-pending later request would never reach here anyway (pending is
  -- blocked by the unique index below; approved usually means the person
  -- already holds the role). The block lifts the moment the club appoints
  -- them directly (grant_club_secretary), which is why this checks CURRENT
  -- role membership, not just request history.
  IF p_requested_scope = 'club' THEN
    SELECT rr.status INTO v_latest_status
    FROM public.role_requests rr
    WHERE rr.person_id = v_person_id
      AND rr.requested_role = p_requested_role
      AND rr.requested_scope = 'club'
      AND rr.club_id = p_club_id
    ORDER BY rr.created_at DESC
    LIMIT 1;

    IF v_latest_status = 'denied' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = v_person_id
          AND ur.club_id = p_club_id
          AND ur.show_id IS NULL
          AND ur.is_active
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
          AND r.name = p_requested_role
      ) INTO v_already_holds_role;

      IF NOT v_already_holds_role THEN
        RAISE EXCEPTION
          'A previous request for this role at this club was denied. Ask the club to appoint you directly.'
          USING ERRCODE = 'MK571';
      END IF;
    END IF;
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

  -- role_requests_one_pending_scope_idx (person_id, requested_role,
  -- requested_scope, club_id, show_id) WHERE status = 'pending' rejects a
  -- second open request for the same (person, role, scope, club, show); the
  -- ON CONFLICT DO NOTHING below turns that 23505 into a NULL return instead
  -- of an exception. Callers must treat a NULL id as "already under review",
  -- not as a failed insert.
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

-- Explicit grant decision restated in THIS migration (the grant-decision
-- contract requires it per file, even though CREATE OR REPLACE preserves the
-- ACL from 20260525130000 unchanged): no anon, authenticated only.
REVOKE ALL ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 2. Club-admin approve/deny RPCs, scoped to club-scoped secretary requests
--    only. Both restate is_site_admin() OR is_club_admin(club_id) from the
--    request row itself, never from a caller-supplied club id — and both
--    check authorization BEFORE locking the row, off a plain, unlocked read
--    of the columns the check needs. A non-admin always gets 42501, never a
--    P0002 that would tell them the request no longer exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_club_role_request(
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
  v_requested_role text;
  v_requested_scope text;
  v_status text;
  v_person_id uuid;
  v_reviewer_person_id uuid;
BEGIN
  -- Unlocked read first: the verdict below must not depend on having taken
  -- the row lock, or a non-admin could distinguish "missing" from "not
  -- yours" by probing ids.
  SELECT club_id, requested_role, requested_scope, status, person_id
  INTO v_club_id, v_requested_role, v_requested_scope, v_status, v_person_id
  FROM public.role_requests
  WHERE id = p_request_id;

  -- MYK9-571 restructure (round 2, R4): one verdict, not two. Round 1 raised
  -- 22023 ("not a club-scoped secretary request") for a missing/malformed
  -- row BEFORE checking who is asking, then 42501 for an unauthorized
  -- caller — which meant a non-admin could tell "no such request" (22023)
  -- apart from "not yours" (42501) by probing ids, a smaller version of the
  -- same oracle the P0 in role_requests_select exposed. A caller who is not
  -- this club's admin (or a site admin) now gets 42501 regardless of
  -- whether p_request_id is missing, the row is the wrong shape, or it
  -- belongs to another club.
  IF v_club_id IS NULL
     OR v_requested_scope IS DISTINCT FROM 'club'
     OR v_requested_role IS DISTINCT FROM 'secretary'
     OR NOT (public.is_site_admin() OR public.is_club_admin(v_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can approve this request'
      USING ERRCODE = '42501';
  END IF;

  -- P0002 (missing/non-pending) only AFTER the verdict above, and only for
  -- an authorized caller.
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Re-select and lock now that the caller is authorized.
  PERFORM 1 FROM public.role_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  -- The grant, and its permission_audit_log row, are identical to a direct
  -- appointment made from the Show Access tab. This is still the only thing
  -- that grants; approval just routes to it.
  PERFORM public.grant_club_secretary(v_person_id, v_club_id);

  UPDATE public.role_requests
  SET status = 'approved',
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = p_note
  WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.approve_club_role_request(uuid, text) IS
  'Approves a pending club-scoped secretary request by calling grant_club_secretary. Club-admin or site-admin only, restated from the request row''s own club_id, checked before the row is locked.';

REVOKE ALL ON FUNCTION public.approve_club_role_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_club_role_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.deny_club_role_request(
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
  v_requested_role text;
  v_requested_scope text;
  v_status text;
  v_reviewer_person_id uuid;
BEGIN
  -- Unlocked read first: the verdict below must not depend on having taken
  -- the row lock, or a non-admin could distinguish "missing" from "not
  -- yours" by probing ids.
  SELECT club_id, requested_role, requested_scope, status
  INTO v_club_id, v_requested_role, v_requested_scope, v_status
  FROM public.role_requests
  WHERE id = p_request_id;

  -- MYK9-571 restructure (round 2, R4): one verdict, not two — see
  -- approve_club_role_request above for the full rationale. A caller who is
  -- not this club's admin (or a site admin) gets 42501 regardless of
  -- whether p_request_id is missing, the row is the wrong shape, or it
  -- belongs to another club.
  IF v_club_id IS NULL
     OR v_requested_scope IS DISTINCT FROM 'club'
     OR v_requested_role IS DISTINCT FROM 'secretary'
     OR NOT (public.is_site_admin() OR public.is_club_admin(v_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can deny this request'
      USING ERRCODE = '42501';
  END IF;

  -- P0002 (missing/non-pending) only AFTER the verdict above, and only for
  -- an authorized caller.
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Re-select and lock now that the caller is authorized.
  PERFORM 1 FROM public.role_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.role_requests
  SET status = 'denied',
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = p_note
  WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.deny_club_role_request(uuid, text) IS
  'Denies a pending club-scoped secretary request. Club-admin or site-admin only, restated from the request row''s own club_id, checked before the row is locked.';

REVOKE ALL ON FUNCTION public.deny_club_role_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deny_club_role_request(uuid, text) TO authenticated;

-- ============================================================================
-- 3. role_requests_select is UNCHANGED. Round 1 dropped and recreated it with
--    a third OR arm — requested_role = 'secretary' AND is_club_admin(club_id)
--    — so a club admin could read pending club-scoped secretary requests for
--    their own club directly. Review found a P0 in that arm: club_id is
--    nullable on this table (insert_signup_role_requests never sets it), and
--    is_club_admin(club_id) with a NULL argument answers "club admin
--    anywhere?", not "club admin of THIS request's club?" — the
--    nullable-club_id-meets-argument-less-helper trap this project has hit
--    before (MYK9-258/329/457/470/474; see
--    nullClubShowAuthorizationContract.test.ts). Every signup-generated
--    secretary request has club_id NULL, so round 1's arm let ANY club
--    admin, anywhere on the platform, read EVERY signup secretary request.
--
--    Rather than restate the guard inline on a bare RLS policy (where the
--    next edit can drop it silently — that is exactly how round 1 happened),
--    round 2 removes the arm and moves club-admin visibility into RPC #4
--    below: public.list_club_role_requests(p_club_id). A SECURITY DEFINER
--    function has one predictable authorization check at its top, so the
--    same nullable-club_id trap cannot recur here without an explicit
--    `p_club_id IS NULL OR ...` — and the scanner extended in
--    nullClubShowAuthorizationContract.test.ts now fails if a future PR adds
--    an unguarded is_club_admin(<nullable column>) arm back onto this
--    policy. role_requests_select therefore keeps exactly its
--    20260728130000 shape (own rows, or a site admin) — this migration does
--    not touch it at all.
--
-- 4. NEW: public.list_club_role_requests(p_club_id) — a club-admin-facing
--    RPC, not a policy arm. Restates `p_club_id IS NULL OR NOT
--    (is_site_admin() OR is_club_admin(p_club_id))` as one 42501 verdict
--    before running any query, then returns that club's pending club-scoped
--    secretary requests joined to the requester's (and reviewer's) name/
--    email — the fields the Show Access tab renders. Client's
--    listClubRoleRequests switches from a direct `.from('role_requests')`
--    read (which depended on the now-removed policy arm) to this RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_club_role_requests(p_club_id uuid)
RETURNS TABLE (
  id uuid,
  auth_user_id uuid,
  person_id uuid,
  requested_role text,
  requested_scope text,
  club_id uuid,
  club_name text,
  show_id uuid,
  status text,
  requester_note text,
  reviewer_note text,
  reviewed_by uuid,
  reviewer_name text,
  reviewer_email text,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  requester_name text,
  requester_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- One verdict, checked before any row is touched: a caller who is not
  -- this club's admin (or a site admin) gets 42501 whether p_club_id is
  -- NULL, malformed, or simply someone else's club — same shape as the
  -- approve/deny RPCs above, and the same reason (round 2, R4 below).
  IF p_club_id IS NULL OR NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only this club''s admins or a site admin can list its role requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    rr.id,
    rr.auth_user_id,
    rr.person_id,
    rr.requested_role,
    rr.requested_scope,
    rr.club_id,
    c.name,
    rr.show_id,
    rr.status,
    rr.requester_note,
    rr.reviewer_note,
    rr.reviewed_by,
    NULLIF(btrim(concat_ws(' ', rev.first_name, rev.last_name)), ''),
    rev.email,
    rr.reviewed_at,
    rr.created_at,
    rr.updated_at,
    COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Unknown user'),
    p.email
  FROM public.role_requests rr
  JOIN public.people p ON p.id = rr.person_id
  LEFT JOIN public.people rev ON rev.id = rr.reviewed_by
  LEFT JOIN public.clubs c ON c.id = rr.club_id
  WHERE rr.club_id = p_club_id
    AND rr.requested_scope = 'club'
    AND rr.requested_role = 'secretary'
    AND rr.status = 'pending'
  ORDER BY rr.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_club_role_requests(uuid) IS
  'Lists a club''s pending club-scoped secretary requests. Club-admin or site-admin only, checked in one verdict before any row is read — replaces a role_requests_select policy arm that leaked platform-wide on a NULL club_id (round 2, P0).';

REVOKE ALL ON FUNCTION public.list_club_role_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_club_role_requests(uuid) TO authenticated;

-- ============================================================================
-- 5. approve_role_request (site-admin inbox) — every secretary approval that
--    is not itself scoped to a show (p_show_id IS NULL) now routes through
--    grant_club_secretary, regardless of what requested_scope the original
--    ask carried. Copied verbatim from the latest definition
--    (20260830240000) except the branch marked below.
-- ============================================================================

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
AS $function$
DECLARE
  v_request public.role_requests%ROWTYPE;
  v_reviewer_person_id uuid;
  v_role_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can approve role requests' USING ERRCODE = '42501';
  END IF;

  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'A club is required before approving this role request'
      USING ERRCODE = '23514';
  END IF;

  IF p_show_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shows WHERE id = p_show_id AND club_id = p_club_id
  ) THEN
    RAISE EXCEPTION 'Show % does not belong to club %', p_show_id, p_club_id
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.role_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found' USING ERRCODE = 'P0002';
  END IF;

  -- A show-scoped official row no longer grants anything, so creating one here would
  -- report success and change nothing the requester can feel.
  IF p_show_id IS NOT NULL
     AND v_request.requested_role IN ('secretary', 'trial_secretary', 'chairman', 'steward') THEN
    RAISE EXCEPTION
      'Show-scoped "%" grants no access. Appoint them at the club with grant_club_secretary, and name them on the show with grant_show_official.',
      v_request.requested_role
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-571 fix: EVERY secretary approval made without a show (p_show_id IS
  -- NULL) routes through grant_club_secretary, the one function that writes
  -- permission_audit_log for this grant — not just the ones whose row still
  -- carries requested_scope='club'. Before this, a show-scoped secretary
  -- request (requested_scope='show') approved with a club and no show
  -- (RoleRequestsPage.tsx never passes showId) fell into the manual-UPSERT
  -- ELSE branch and left no audit row: a second, unaudited door to the same
  -- grant, reachable from a different requested_scope than the club-scoped
  -- case this branch originally covered.
  IF v_request.requested_role = 'secretary' AND p_show_id IS NULL THEN
    PERFORM public.grant_club_secretary(v_request.person_id, p_club_id);
  ELSE
    SELECT id INTO v_role_id FROM public.roles WHERE name = v_request.requested_role;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'Requested role "%" does not exist', v_request.requested_role
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.user_roles
    SET is_active = true, granted_at = now(), granted_by = v_reviewer_person_id
    WHERE user_id = v_request.person_id
      AND role_id = v_role_id
      AND club_id = p_club_id
      AND ((show_id IS NULL AND p_show_id IS NULL) OR show_id = p_show_id);

    IF NOT FOUND THEN
      INSERT INTO public.user_roles (
        user_id, role_id, club_id, show_id, is_active, granted_at, granted_by
      ) VALUES (
        v_request.person_id, v_role_id, p_club_id, p_show_id, true, now(), v_reviewer_person_id
      );
    END IF;
  END IF;

  UPDATE public.role_requests
  SET status = 'approved',
      club_id = p_club_id,
      show_id = p_show_id,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = COALESCE(p_reviewer_note, reviewer_note)
  WHERE id = p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_role_request(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_role_request(uuid, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
