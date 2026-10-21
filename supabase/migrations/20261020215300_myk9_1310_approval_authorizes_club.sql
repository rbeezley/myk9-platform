-- MYK9-1310: approving a club access request authorizes the club, and a club a
-- site admin creates starts authorized.
--
-- MYK9-572 made club authorization (clubs.authorized_at) a separate site-admin
-- action because a secretary can create a club from the show wizard with no human
-- in the loop. MYK9-855 kept it separate everywhere. That is right for the
-- self-service path and wrong where a site admin is already the human deciding:
--   1. review_club_access_request(..., 'approved', ...) now calls
--      set_club_authorization(club, true) after the club exists and before the
--      request flips to approved. Denial is unchanged.
--   2. trg_authorize_club_created_by_site_admin (AFTER INSERT ON clubs) calls the
--      same RPC when the inserting account is a site admin. A secretary's or
--      club admin's self-created club, and seed/service_role inserts (no auth.uid()),
--      are unchanged: still unauthorized until a site admin acts.
-- Both reuse set_club_authorization() so authorized_at/_by still have one write
-- path, one idempotency rule and one audit row shape (club_authorized).
--
-- Function body copied from 20261017163700_myk9_1208_step_up_reauth.sql (the latest
-- definition); the only change is the PERFORM block after v_club_name is read.

-- 1. Approval authorizes the club.
CREATE OR REPLACE FUNCTION public.review_club_access_request(
  p_request_id uuid,
  p_decision text,
  p_existing_club_id uuid DEFAULT NULL,
  p_club_name text DEFAULT NULL,
  p_review_note text DEFAULT NULL
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
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can review club access requests' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'Decision must be approved or denied' USING ERRCODE = '22023';
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
  ELSE
    v_club_id := p_existing_club_id;
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
      jsonb_build_object('requester_person_id', v_request.requester_person_id)
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
  -- transaction instead of handing the admin a second step on /clubs/:id (MYK9-855).
  -- set_club_authorization() is the one write path: it restates is_site_admin(),
  -- opens the authorization-write GUC for its own UPDATE, is idempotent on an
  -- already-authorized club (an attached club, or an operator's retry), and writes
  -- the club_authorized audit row.
  PERFORM public.set_club_authorization(v_club_id, true);

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

REVOKE EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text) TO authenticated;


-- 2. A site admin's own Add Club starts authorized.
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

  PERFORM public.set_club_authorization(NEW.id, true);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.authorize_club_created_by_site_admin() IS
  'MYK9-1310: AFTER INSERT ON clubs. When the inserting account is a site admin, the club is authorized at creation through set_club_authorization() (the one write path, with its audit row). Any other creator leaves the club unauthorized until a site admin acts (MYK9-572).';

-- Trigger-only: fired by the trigger as its owner, never callable by a client role.
REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM anon;
REVOKE ALL ON FUNCTION public.authorize_club_created_by_site_admin() FROM authenticated;

DROP TRIGGER IF EXISTS trg_authorize_club_created_by_site_admin ON public.clubs;
CREATE TRIGGER trg_authorize_club_created_by_site_admin
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.authorize_club_created_by_site_admin();
