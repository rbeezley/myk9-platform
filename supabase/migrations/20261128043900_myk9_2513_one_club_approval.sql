-- MYK9-2513: one approval, whichever door the owner uses.
--
-- Before: review_club_access_request (Onboarding "Approve") authorized the club,
-- closed the request, told the requester and asked for the password.
-- set_club_authorization (club page "Authorize Club") only stamped authorized_at, so a
-- club approved there left its request pending, the requester untold, and no password
-- asked. Owner decisions, 2026-11-27: "One list, one Approve" (the club page runs the same
-- approval), "Password on both", and "Offer delete in Decline".
--
-- The rule this migration states (it supersedes the comments at lines 38 and 248 of
-- 20261115184700_myk9_2046_request_new_club.sql, which say a decline removes the club):
--
--   * A decline removes nothing, UNLESS the owner asks for it (p_delete_club = true).
--     With the flag, the request is marked denied and the club is soft-deleted by
--     soft_delete_club in the same transaction: a club with live shows refuses (MK011) and
--     the whole decline rolls back, leaving the request pending. The club's role grants
--     are deactivated by the MYK9-1388 trigger and are not given back on a restore.
--   * Authorizing a club (unauthorized to authorized) through the public door asks for the
--     password (require_recent_reauth, MKAUT). A revoke never does.
--   * If a pending request created that club, authorizing it IS approving the request
--     (review_club_access_request), so the notice and email go out once, the roles are
--     granted and the request closes. A waiting club with no pending request (WALK TEST,
--     approved before approval authorized clubs) is simply authorized, and tells no one.
--
-- Shape, so nothing re-enters and the password is never asked twice:
--
--   public.set_club_authorization(club, true)   -- the club page door
--        |-- pending request for this club --> public.review_club_access_request(id, 'approved')
--        |                                           '--> private.authorize_club_core
--        '-- none -------------------------------> private.authorize_club_core
--   public.review_club_access_request            --> private.authorize_club_core (never the public door)
--   trigger authorize_club_created_by_site_admin --> private.authorize_club_core (no password, no request)
--
-- The core holds yesterday's set_club_authorization body unchanged (lock, idempotence, the
-- authorization-write GUC, the audit row). Copied from the latest definition,
-- 20260925072300_myk9_749_750_review_sweep_definer_fixes.sql. review_club_access_request is
-- copied from 20261115184700_myk9_2046_request_new_club.sql (latest body) and
-- 20261123221500_myk9_2341_server_only_column_guards.sql (latest grants).

BEGIN;

-- 1. The private core: no client role can call it.
CREATE OR REPLACE FUNCTION private.authorize_club_core(
  p_club_id uuid,
  p_authorized boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_current_authorized_at timestamptz;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can authorize or revoke a club'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-750: locked, so two site admins acting at once serialize here and
  -- the second sees the first's committed state.
  SELECT authorized_at INTO v_current_authorized_at
  FROM public.clubs
  WHERE id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club % not found', p_club_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already in the requested state. No authorized_at/authorized_by churn
  -- and no duplicate permission_audit_log row for the same action.
  IF (p_authorized AND v_current_authorized_at IS NOT NULL)
     OR (NOT p_authorized AND v_current_authorized_at IS NULL) THEN
    RETURN;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- The one sanctioned path through guard_club_authorization_write(): open the GUC only
  -- for this UPDATE, then close it (transaction-local, so a raise clears it too).
  PERFORM set_config('myk9.club_authorization_write', 'on', true);

  UPDATE public.clubs
  SET authorized_at = CASE WHEN p_authorized THEN now() ELSE NULL END,
      authorized_by = v_actor_person_id
  WHERE id = p_club_id;

  PERFORM set_config('myk9.club_authorization_write', '', true);

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    CASE WHEN p_authorized THEN 'club_authorized' ELSE 'club_authorization_revoked' END,
    'club',
    p_club_id,
    jsonb_build_object('club_id', p_club_id, 'authorized', p_authorized)
  );
END;
$$;

COMMENT ON FUNCTION private.authorize_club_core(uuid, boolean) IS
  'MYK9-2513: the only write to clubs.authorized_at/_by (the body of set_club_authorization before MYK9-2513). Site-admin only, idempotent, audited. Called by set_club_authorization, review_club_access_request and the site-admin club-creation trigger; no client role can call it, and it never reads club_access_requests or asks for a password, which is what keeps those three from calling each other in a loop.';

REVOKE ALL ON FUNCTION private.authorize_club_core(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.authorize_club_core(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION private.authorize_club_core(uuid, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION private.authorize_club_core(uuid, boolean) FROM service_role;

-- 2. The club page door. Authorizing a waiting club is approving its request.
CREATE OR REPLACE FUNCTION public.set_club_authorization(
  p_club_id uuid,
  p_authorized boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_authorized_at timestamptz;
  v_request_id uuid;
  v_has_pending boolean := false;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can authorize or revoke a club'
      USING ERRCODE = '42501';
  END IF;

  -- A NULL would fall through "IF NOT p_authorized" into an authorize.
  IF p_authorized IS NULL THEN
    RAISE EXCEPTION 'Authorized must be true or false' USING ERRCODE = '22023';
  END IF;

  -- A revoke removes access; it never asks for the password and never touches a request.
  IF NOT p_authorized THEN
    PERFORM private.authorize_club_core(p_club_id, false);
    RETURN;
  END IF;

  -- The reauth / no-op decision below is made from LOCKED rows, so a concurrent revoke
  -- cannot land between the read and the write and re-authorize the club with no password.
  -- Lock order is requests first, then the club: review_club_access_request locks its
  -- request row and then the club (through the core), so the opposite order here would
  -- deadlock against an Onboarding approve of the same club. Re-locking the same rows in
  -- review or the core, in this transaction, is a no-op.
  FOR v_request_id IN
    SELECT id FROM public.club_access_requests
    WHERE created_club_id = p_club_id AND status = 'pending'
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_has_pending := true;
  END LOOP;

  SELECT authorized_at INTO v_current_authorized_at
  FROM public.clubs
  WHERE id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club % not found', p_club_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Authorizing an unauthorized club, or closing a waiting request, needs a password
  -- confirmed in the last five minutes (MYK9-1208). An already-authorized club with no
  -- waiting request is a no-op and asks for nothing. review_club_access_request checks
  -- the same JWT again below; once this passes, that check passes too.
  IF v_current_authorized_at IS NULL OR v_has_pending THEN
    PERFORM public.require_recent_reauth();
  END IF;

  IF v_has_pending THEN
    -- Same approval as Onboarding: roles, request closed, notice and email, once. It
    -- authorizes through the core, never back through this function.
    FOR v_request_id IN
      SELECT id FROM public.club_access_requests
      WHERE created_club_id = p_club_id AND status = 'pending'
      ORDER BY created_at, id
    LOOP
      PERFORM public.review_club_access_request(v_request_id, 'approved');
    END LOOP;
  END IF;

  -- A club that was already authorized, or has no pending request: the plain write.
  PERFORM private.authorize_club_core(p_club_id, true);
END;
$$;

COMMENT ON FUNCTION public.set_club_authorization(uuid, boolean) IS
  'MYK9-572 / MYK9-2513: the club page''s Authorize and Revoke. Site-admin only. Authorizing asks for a recent password (MKAUT) when the club is unauthorized or has a pending request; if a pending club_access_requests row created this club, it runs review_club_access_request(id, approved) (roles, notice, email, request closed, once), otherwise it just authorizes. Revoking never asks for the password and never touches a request. The write itself is private.authorize_club_core.';

REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_club_authorization(uuid, boolean) TO authenticated;

-- 3. A site admin's own Add Club starts authorized: no password, no request touched.
CREATE OR REPLACE FUNCTION public.authorize_club_created_by_site_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- is_site_admin() reads auth.uid(): NULL for seeds and service_role, so those
  -- inserts fall through unchanged, as do inserts by secretaries and club admins.
  IF auth.uid() IS NULL OR NOT public.is_site_admin() THEN
    RETURN NEW;
  END IF;

  PERFORM private.authorize_club_core(NEW.id, true);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.authorize_club_created_by_site_admin() IS
  'MYK9-1310 / MYK9-2513: AFTER INSERT ON clubs. When the inserting account is a site admin, the club is authorized at creation through private.authorize_club_core (the one write, with its audit row). Creating a club is not approving a request, so this never asks for a password and never reads club_access_requests. Any other creator leaves the club unauthorized until a site admin acts (MYK9-572).';

REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM anon;
REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM authenticated;

-- 4. Review: authorizes through the core, and a decline may delete the club.
-- The old five-argument overload is dropped so the trailing flag does not leave two
-- candidates for a named-argument call (PostgREST would refuse the ambiguity).
DROP FUNCTION IF EXISTS public.review_club_access_request(uuid, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.review_club_access_request(
  p_request_id uuid,
  p_decision text,
  p_existing_club_id uuid DEFAULT NULL,
  p_club_name text DEFAULT NULL,
  p_review_note text DEFAULT NULL,
  p_delete_club boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.club_access_requests%rowtype;
  v_reviewer_person_id uuid;
  v_club_id uuid;
  v_club_name text;
  v_club_admin_role_id uuid;
  v_club_admin_assignment_id uuid;
  v_club_admin_reactivated boolean := false;
  v_secretary_assignment_id uuid;
  v_membership_id uuid;
  v_requester_auth_user_id uuid;
  v_club_deleted boolean := false;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can review club access requests' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'Decision must be approved or denied' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_delete_club, false) AND p_decision <> 'denied' THEN
    RAISE EXCEPTION 'Only a declined request can delete its club' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.club_access_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club access request not found' USING ERRCODE = 'P0002';
  END IF;

  -- A denied request cannot be changed. An approved request can be retried
  -- idempotently to restore the same grants if an operator retries the action.
  IF v_request.status = 'denied' THEN
    RAISE EXCEPTION 'Club access request has already been reviewed' USING ERRCODE = '23514';
  END IF;

  IF v_request.status = 'approved' THEN
    IF p_decision <> 'approved' OR v_request.approved_club_id IS NULL THEN
      RAISE EXCEPTION 'Club access request has already been approved' USING ERRCODE = '23514';
    END IF;
    v_club_id := v_request.approved_club_id;
  ELSIF v_request.created_club_id IS NOT NULL THEN
    -- MYK9-2046: request_new_club() already created this club and made the requester
    -- its admin and secretary. Approval confirms that club; it never makes a second one
    -- or swaps it for another.
    IF p_decision = 'approved' AND p_existing_club_id IS NOT NULL
       AND p_existing_club_id <> v_request.created_club_id THEN
      RAISE EXCEPTION 'This request already has its club. Approve it as it is, or decline it.'
        USING ERRCODE = '22023';
    END IF;
    -- Only approving needs a live club; declining a request whose club was deleted just
    -- marks it denied.
    IF p_decision = 'approved' AND NOT EXISTS (
      SELECT 1 FROM public.clubs WHERE id = v_request.created_club_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'This request''s club has been deleted, so it cannot be approved. Decline the request instead.'
        USING ERRCODE = '23514';
    END IF;
    v_club_id := v_request.created_club_id;
  ELSE
    v_club_id := p_existing_club_id;
  END IF;

  -- MYK9-2513: "also delete the club" needs a club this request created. A request that
  -- only asks to attach to an existing club never owns one, so there is nothing to delete.
  IF COALESCE(p_delete_club, false) AND v_request.created_club_id IS NULL THEN
    RAISE EXCEPTION 'This request did not create a club, so there is no club to delete'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Site admin profile not found' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'denied' THEN
    update public.club_access_requests
    set status = 'denied',
        reviewed_by = v_reviewer_person_id,
        reviewed_at = now(),
        review_note = p_review_note,
        updated_at = now()
    where id = p_request_id;

    -- MYK9-2513: only when the owner asks. soft_delete_club refuses (MK011) while the
    -- club has live shows, which rolls this whole decline back. A club that is already
    -- deleted needs nothing more.
    IF COALESCE(p_delete_club, false) AND EXISTS (
      SELECT 1 FROM public.clubs WHERE id = v_request.created_club_id AND deleted_at IS NULL
    ) THEN
      PERFORM public.soft_delete_club(v_request.created_club_id);
      v_club_deleted := true;
    END IF;

    insert into public.permission_audit_log (
      user_id,
      action,
      target_type,
      target_id,
      new_value
    )
    values (
      v_reviewer_person_id,
      'club_access_request_denied',
      'club_access_request',
      p_request_id,
      jsonb_build_object(
        'requester_person_id', v_request.requester_person_id,
        'club_deleted', v_club_deleted
      )
    );

    return null;
  end if;

  -- MYK9-1208: approving makes the requester a club admin and secretary, so it needs a
  -- password confirmed in the last five minutes. Denial (returned above) changes no role.
  PERFORM public.require_recent_reauth();

  IF v_club_id IS NULL THEN
    insert into public.clubs (name, website)
    values (
      coalesce(nullif(trim(p_club_name), ''), v_request.requested_club_name),
      v_request.requested_club_website
    )
    returning id into v_club_id;
  elsif not exists (select 1 from public.clubs where id = v_club_id) then
    raise exception 'Club % not found', v_club_id using errcode = 'P0002';
  end if;

  select name into v_club_name from public.clubs where id = v_club_id;

  -- MYK9-1310: the site admin approving this request is the human who decides the
  -- club may exist, so approval authorizes the club (MYK9-572's gate) in the same
  -- transaction. MYK9-2513: through the private core, not set_club_authorization(),
  -- because that public door now calls THIS function for a pending request and would
  -- re-enter it with the request still pending. The core restates is_site_admin(),
  -- is idempotent on an already-authorized club, and writes the club_authorized audit row.
  PERFORM private.authorize_club_core(v_club_id, true);

  select id into v_club_admin_role_id
  from public.roles
  where name = 'club_admin';

  if v_club_admin_role_id is null then
    raise exception 'club_admin role is missing' using errcode = 'P0002';
  end if;

  select
    id,
    (not is_active or (expires_at is not null and expires_at <= now()))
  into v_club_admin_assignment_id, v_club_admin_reactivated
  from public.user_roles
  where user_id = v_request.requester_person_id
    and role_id = v_club_admin_role_id
    and club_id = v_club_id
    and show_id is null
  limit 1;

  if v_club_admin_assignment_id is null then
    insert into public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    values (
      v_request.requester_person_id,
      v_club_admin_role_id,
      v_club_id,
      v_reviewer_person_id,
      true
    )
    returning id into v_club_admin_assignment_id;
  else
    update public.user_roles
    set is_active = true,
        expires_at = NULL,
        granted_by = v_reviewer_person_id,
        granted_at = now()
    where id = v_club_admin_assignment_id;

    if v_club_admin_reactivated then
      insert into public.permission_audit_log (
        user_id,
        action,
        target_type,
        target_id,
        new_value
      )
      values (
        v_reviewer_person_id,
        'club_admin_reactivated',
        'user_role',
        v_club_admin_assignment_id,
        jsonb_build_object(
          'person_id', v_request.requester_person_id,
          'club_id', v_club_id,
          'role', 'club_admin'
        )
      );
    end if;
  end if;

  -- Founding requesters are members of the club they asked to establish. Do
  -- not overwrite membership type, dues, or notes when reactivating a row.
  insert into public.club_members (club_id, person_id, membership_status)
  values (v_club_id, v_request.requester_person_id, 'active')
  on conflict (club_id, person_id) do update
    set membership_status = 'active'
  returning id into v_membership_id;

  -- This call is part of the same transaction. Membership is inserted first
  -- for compatibility with older grant implementations that required it.
  -- Skip an already-active, unexpired assignment so a true retry does not
  -- create a duplicate audit event; the established RPC handles reactivation
  -- and its audit event when the assignment is inactive or expired.
  select ur.id into v_secretary_assignment_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = v_request.requester_person_id
    and r.name = 'secretary'
    and ur.club_id = v_club_id
    and ur.show_id is null
    and ur.is_active = true
    and (ur.expires_at is null or ur.expires_at > now())
  limit 1;

  if v_secretary_assignment_id is null then
    v_secretary_assignment_id := public.grant_club_secretary(
      v_request.requester_person_id,
      v_club_id
    );
  end if;

  IF v_request.status = 'pending' THEN
    update public.club_access_requests
    set status = 'approved',
        approved_club_id = v_club_id,
        reviewed_by = v_reviewer_person_id,
        reviewed_at = now(),
        review_note = p_review_note,
        updated_at = now()
    where id = p_request_id;

    insert into public.permission_audit_log (
      user_id,
      action,
      target_type,
      target_id,
      new_value
    )
    values (
      v_reviewer_person_id,
      'club_access_request_approved',
      'club_access_request',
      p_request_id,
      jsonb_build_object(
        'requester_person_id', v_request.requester_person_id,
        'club_id', v_club_id,
        'roles', jsonb_build_object(
          'club_admin_assignment_id', v_club_admin_assignment_id,
          'secretary_assignment_id', v_secretary_assignment_id
        ),
        'membership_id', v_membership_id
      )
    );

    -- MYK9-859: in-app notice, gated to the first-time approval so a retried
    -- (idempotent) re-approval of an already-approved request never
    -- re-notifies. Email is already sent separately by the MYK9-681 job
    -- queue trigger on this same status flip; this is the in-app half only.
    select auth_user_id into v_requester_auth_user_id
    from public.people
    where id = v_request.requester_person_id;

    if v_requester_auth_user_id is not null then
      insert into public.notifications (user_id, type, message, deep_link_url)
      values (
        v_requester_auth_user_id,
        'club_access_approved',
        format(
          '%s is approved. You can now manage the club and create its shows.',
          v_club_name
        ),
        '/clubs/' || v_club_id
      );
    end if;
  END IF;

  return v_club_id;
end;
$$;

COMMENT ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text, boolean) IS
  'MYK9-2513: Onboarding''s Approve and Decline, and the body of the club page''s Authorize for a waiting club. Approve asks for a recent password (MKAUT), authorizes through private.authorize_club_core, grants the requester club admin and secretary, closes the request and tells them once. Decline marks the request denied and removes nothing, unless p_delete_club is true: then the club is soft-deleted in the same transaction through soft_delete_club (MK011 while it has live shows, which rolls the decline back).';

REVOKE ALL ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
