-- MYK9-727: serialize submit_role_request's standing-denial check with admin
-- review (the same race MYK9-685 closed for club membership requests in
-- 20260924213100).
--
-- The race: submit_role_request read the requester's latest (person, club,
-- secretary) request, found it 'pending', and moved on to the pending count
-- and the INSERT. A club admin denying that request in between left no
-- pending row, so ON CONFLICT no longer fired and a fresh pending request was
-- inserted -- a resubmission the standing-denial rule (MK571) exists to stop.
-- The only lock submit took was per requester (the rate limit), which never
-- serialized it against a reviewer.
--
-- The fix mirrors 20260924213100: one transaction-scoped advisory lock per
-- (person, club), taken by submit before its standing-denial read and by all
-- four review RPCs (approve/deny_club_role_request, approve/deny_role_request)
-- before they lock and change the row. Under READ COMMITTED every statement
-- submit runs after the lock sees a review that committed while it waited.
--
-- Every function body is copied from its LATEST defining migration:
--   submit_role_request, approve_club_role_request, deny_club_role_request,
--   approve_role_request                       -- 20260915231500
--   deny_role_request                          -- 20260524195251
-- with only the lines marked MYK9-727 added. ACLs are restated per function.
--
-- Behavioral coverage: supabase/tests/myk9_727_role_request_review_lock_test.sql

BEGIN;

-- ============================================================================
-- 1. The shared (person, club) lock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_role_request_pair(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext('role_requests:' || p_club_id::text || ':' || p_person_id::text)
  );
$$;

COMMENT ON FUNCTION public.lock_role_request_pair(uuid, uuid) IS
  'MYK9-727: transaction-scoped lock shared by submit_role_request and the four role-request review RPCs for one (person, club). Internal; no client grant.';

REVOKE ALL ON FUNCTION public.lock_role_request_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. submit_role_request -- takes the lock before the standing-denial read.
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

  -- MYK9-727: one lock per (person, club), shared with approve/deny. Every
  -- read below -- the standing-denial check included -- runs after it, so a
  -- concurrent deny of this person's ask at this club has either committed
  -- (and the latest-status read sees 'denied') or not started. Before this,
  -- a deny landing between the latest-status read and the INSERT let a fresh
  -- pending row through, bypassing the standing denial.
  IF p_requested_scope = 'club' THEN
    PERFORM public.lock_role_request_pair(v_person_id, p_club_id);
  END IF;

  -- MYK9-571 addition: a standing denial blocks re-requesting club-scoped
  -- SECRETARY at the same club (round 2 lens A: scoped to
  -- p_requested_role = 'secretary' only — a denied club_admin ask is a
  -- club-governance decision with its own, separate review path today, not
  -- one this migration's standing-denial guard was designed against).
  -- "Standing" means the MOST RECENT request for this exact (person, club,
  -- role) was denied; an approved or still-pending later request would
  -- never reach here anyway (pending is blocked by the unique index below;
  -- approved usually means the person already holds the role). The block
  -- lifts the moment the club appoints them directly
  -- (grant_club_secretary), which is why this checks CURRENT role
  -- membership, not just request history.
  IF p_requested_scope = 'club' AND p_requested_role = 'secretary' THEN
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

REVOKE ALL ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_role_request(text, text, uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 3. Club-admin review RPCs.
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

  -- MYK9-727: take the (person, club) lock submit_role_request takes before
  -- its standing-denial read, so this review and a resubmission can never
  -- interleave. The FOR UPDATE re-select below runs after it.
  PERFORM public.lock_role_request_pair(v_person_id, v_club_id);

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

  -- MYK9-727: take the (person, club) lock submit_role_request takes before
  -- its standing-denial read, so this review and a resubmission can never
  -- interleave. The FOR UPDATE re-select below runs after it.
  PERFORM public.lock_role_request_pair(v_person_id, v_club_id);

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

REVOKE ALL ON FUNCTION public.deny_club_role_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deny_club_role_request(uuid, text) TO authenticated;

-- ============================================================================
-- 4. Site-admin review RPCs.
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
  v_lock_person_id uuid;
  v_lock_club_id uuid;
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

  -- MYK9-727: the (person, club) lock submit_role_request takes, keyed on
  -- the club the request row names (the standing-denial rule's key), taken
  -- before the row is locked. A row with no club (show-scoped) has no
  -- standing-denial rule to serialize against.
  SELECT person_id, club_id INTO v_lock_person_id, v_lock_club_id
  FROM public.role_requests
  WHERE id = p_request_id;

  IF v_lock_club_id IS NOT NULL THEN
    PERFORM public.lock_role_request_pair(v_lock_person_id, v_lock_club_id);
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

CREATE OR REPLACE FUNCTION public.deny_role_request(
  p_request_id uuid,
  p_reviewer_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reviewer_person_id uuid;
  v_lock_person_id uuid;
  v_lock_club_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can deny role requests'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-727: same (person, club) lock as submit_role_request, taken before
  -- the denial is written. See approve_role_request.
  SELECT person_id, club_id INTO v_lock_person_id, v_lock_club_id
  FROM public.role_requests
  WHERE id = p_request_id;

  IF v_lock_club_id IS NOT NULL THEN
    PERFORM public.lock_role_request_pair(v_lock_person_id, v_lock_club_id);
  END IF;

  UPDATE public.role_requests
  SET status = 'denied',
      reviewer_note = p_reviewer_note,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now()
  WHERE id = p_request_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.deny_role_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deny_role_request(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
