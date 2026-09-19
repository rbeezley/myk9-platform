BEGIN;

-- MYK9-682: the person who asks the site admin to establish a new club is
-- normally the person who will set up and run that club's first shows. Keep
-- all three grants in the site-admin approval transaction:
--   * club_admin — administer the club;
--   * secretary — operate the club's shows; and
--   * active club_members — appear in the club roster.
--
-- The secretary appointment remains club-scoped and uses the established RPC,
-- so professional secretaries appointed for an existing club may still be
-- non-members. This automatic membership is only for the founding requester.

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
  v_club_admin_role_id uuid;
  v_club_admin_assignment_id uuid;
  v_secretary_assignment_id uuid;
  v_membership_id uuid;
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

  select id into v_club_admin_role_id
  from public.roles
  where name = 'club_admin';

  if v_club_admin_role_id is null then
    raise exception 'club_admin role is missing' using errcode = 'P0002';
  end if;

  select id into v_club_admin_assignment_id
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
  END IF;

  return v_club_id;
end;
$$;

COMMENT ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text) IS
  'Site-admin approval grants the requester club-scoped club_admin, secretary/show-manager access, and active membership for a new club. Re-approval is idempotent for an already-approved request.';

REVOKE EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
