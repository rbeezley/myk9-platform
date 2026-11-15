-- MYK9-2046: the home page "Add your club" form creates the club at once.
--
-- Before: the form wrote an onboarding_requests row and nothing else, so the
-- requester waited for a person to build her club by hand. Now one RPC,
-- request_new_club(), does it in one transaction for the signed-in caller:
--   * checks the name is free (case-insensitive, whitespace-collapsed),
--   * creates the club in its existing unauthorized state (MYK9-572 gate stays:
--     nothing is public until the owner approves),
--   * makes the caller its club admin (the existing AFTER INSERT trigger
--     trg_grant_club_admin_to_club_creator does this) and its secretary
--     (grant_club_secretary, the same call approval makes), and an active member,
--   * stores the registry numbers on the club,
--   * files a club_access_requests row pointing at that club, so the owner's
--     existing "New club access requests" queue (review_club_access_request)
--     keeps working. No fourth intake table.
-- The AFTER INSERT triggers on clubs already notify every site admin
-- (MYK9-1315); the request row's own trigger queues the access-request email
-- (MYK9-681). Emails to the requester and phone alerts are MYK9-2047.
--
-- review_club_access_request() is replaced (body copied from
-- 20261020215300_myk9_1310_approval_authorizes_club.sql, the latest definition)
-- with two changes, both only for a request that carries created_club_id:
--   * approve confirms that club instead of creating or attaching another;
--   * decline soft-deletes the club and its draft shows (soft_delete_show /
--     soft_delete_club), and is refused while the club has a show that is not a
--     draft. Requests without created_club_id behave exactly as before.
--
-- NOT PUSHED by the authoring agent.

BEGIN;

-- 1. The request remembers the club it created.
ALTER TABLE public.club_access_requests
  ADD COLUMN IF NOT EXISTS created_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.club_access_requests.created_club_id IS
  'MYK9-2046: the club request_new_club() created for this request, waiting for approval. NULL for requests that ask the owner to create or pick a club (signup trigger, /request-access). Approve confirms it; decline removes it and its draft shows.';

CREATE INDEX IF NOT EXISTS club_access_requests_created_club_id_idx
  ON public.club_access_requests (created_club_id)
  WHERE created_club_id IS NOT NULL;

-- 2. The RPC.
CREATE OR REPLACE FUNCTION public.request_new_club(
  p_club_name text,
  p_club_numbers jsonb,
  p_request_note text DEFAULT NULL,
  p_club_website text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_person_id uuid;
  v_name text;
  v_website text;
  v_note text;
  v_numbers jsonb;
  v_pending_count int;
  v_existing public.club_access_requests%rowtype;
  v_club_id uuid;
  v_request_id uuid;
  v_secretary_role_id uuid;
  v_secretary_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to add your club' USING ERRCODE = '42501';
  END IF;

  v_name := nullif(regexp_replace(btrim(coalesce(p_club_name, '')), '\s+', ' ', 'g'), '');
  v_website := nullif(btrim(coalesce(p_club_website, '')), '');
  v_note := nullif(btrim(coalesce(p_request_note, '')), '');

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Club name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'Club name is too long' USING ERRCODE = '22023';
  END IF;

  v_numbers := public.normalize_club_numbers(p_club_numbers);
  IF v_numbers = '{}'::jsonb THEN
    RAISE EXCEPTION 'Enter at least one club number' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = v_uid AND deleted_at IS NULL;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'No person profile found for this user' USING ERRCODE = '42501';
  END IF;

  -- Serialize this caller and this name, so two submissions cannot both pass
  -- the name check below.
  PERFORM pg_advisory_xact_lock(hashtext('request_new_club:user:' || v_uid::text));
  PERFORM pg_advisory_xact_lock(hashtext('request_new_club:name:' || public.normalize_club_name(v_name)));

  -- A second tap on the same form returns the club she already asked for.
  SELECT * INTO v_existing
  FROM public.club_access_requests r
  WHERE r.requester_auth_user_id = v_uid
    AND r.status = 'pending'
    AND r.created_club_id IS NOT NULL
    AND public.normalize_club_name(r.requested_club_name) = public.normalize_club_name(v_name)
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = r.created_club_id AND c.deleted_at IS NULL
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'club_id', v_existing.created_club_id,
      'request_id', v_existing.id,
      'already_requested', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.deleted_at IS NULL
      AND public.normalize_club_name(c.name) = public.normalize_club_name(v_name)
  ) THEN
    RAISE EXCEPTION 'club_name_taken'
      USING ERRCODE = '23505',
            HINT = 'A club with this name is already on myK9Show. Ask its admin to add you, or email us.';
  END IF;

  SELECT count(*) INTO v_pending_count
  FROM public.club_access_requests
  WHERE requester_auth_user_id = v_uid AND status = 'pending';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending club requests (max 3). Wait for review before submitting more.'
      USING ERRCODE = '53400';
  END IF;

  -- Unauthorized (authorized_at NULL) is the column default. The AFTER INSERT
  -- triggers grant the creator club_admin and tell the site admins; a site admin
  -- caller gets an authorized club (MYK9-1310), which is the owner's own call.
  BEGIN
    INSERT INTO public.clubs (name, website)
    VALUES (v_name, v_website)
    RETURNING id INTO v_club_id;
  EXCEPTION WHEN unique_violation THEN
    -- clubs_live_normalized_name_unique: a name another request took a moment ago.
    RAISE EXCEPTION 'club_name_taken'
      USING ERRCODE = '23505',
            HINT = 'A club with this name is already on myK9Show. Ask its admin to add you, or email us.';
  END;

  IF NOT public.is_club_admin(v_club_id) THEN
    RAISE EXCEPTION 'Could not make you the club admin' USING ERRCODE = 'XX000';
  END IF;

  INSERT INTO public.club_members (club_id, person_id, membership_status)
  VALUES (v_club_id, v_person_id, 'active')
  ON CONFLICT (club_id, person_id) DO UPDATE SET membership_status = 'active';

  -- Not grant_club_secretary(): it demands a password confirmed in the last five
  -- minutes (MYK9-1208), which a caller signed in earlier cannot show, and she is
  -- giving herself a role on a club that does not exist yet and is not public. The
  -- row and audit entry are the ones grant_club_secretary writes (copied from
  -- 20261017163700_myk9_1208_step_up_reauth.sql, the latest definition).
  SELECT id INTO v_secretary_role_id FROM public.roles WHERE name = 'secretary';
  IF v_secretary_role_id IS NULL THEN
    RAISE EXCEPTION 'secretary role is missing' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, club_id, granted_by, is_active)
  VALUES (v_person_id, v_secretary_role_id, v_club_id, v_person_id, true)
  RETURNING id INTO v_secretary_assignment_id;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_person_id,
    'club_secretary_granted',
    'user_role',
    v_secretary_assignment_id,
    jsonb_build_object('person_id', v_person_id, 'club_id', v_club_id, 'role', 'secretary')
  );

  INSERT INTO public.club_registry_numbers (club_id, organization, number)
  SELECT v_club_id, kv.key, kv.value
  FROM jsonb_each_text(v_numbers) AS kv
  ON CONFLICT (club_id, organization) DO NOTHING;

  -- She may already have a pending request for this name from an older path (the
  -- signup trigger, submit_club_access_request). A second row would hit
  -- club_access_requests_pending_person_club_unique, so that row is upgraded to point
  -- at the new club instead; her note and numbers fill in only where it has none.
  UPDATE public.club_access_requests r
  SET created_club_id = v_club_id,
      request_note = coalesce(nullif(btrim(r.request_note), ''), v_note),
      requested_club_website = coalesce(r.requested_club_website, v_website),
      club_numbers = CASE WHEN r.club_numbers = '{}'::jsonb THEN v_numbers ELSE r.club_numbers END,
      updated_at = now()
  WHERE r.requester_person_id = v_person_id
    AND r.status = 'pending'
    AND r.created_club_id IS NULL
    AND lower(r.requested_club_name) = lower(v_name)
  RETURNING r.id INTO v_request_id;

  IF v_request_id IS NULL THEN
    INSERT INTO public.club_access_requests (
      requester_person_id,
      requester_auth_user_id,
      requested_club_name,
      requested_club_website,
      request_note,
      club_numbers,
      created_club_id
    ) VALUES (
      v_person_id, v_uid, v_name, v_website, v_note, v_numbers, v_club_id
    )
    RETURNING id INTO v_request_id;
  END IF;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_person_id,
    'club_requested',
    'club_access_request',
    v_request_id,
    jsonb_build_object('club_id', v_club_id, 'club_name', v_name)
  );

  RETURN jsonb_build_object(
    'club_id', v_club_id,
    'request_id', v_request_id,
    'already_requested', false
  );
END;
$$;

COMMENT ON FUNCTION public.request_new_club(text, jsonb, text, text) IS
  'MYK9-2046: the home page club form. For the signed-in caller, in one transaction: refuses a taken name (23505 club_name_taken), creates the club unauthorized, makes the caller club admin, secretary and active member, stores registry numbers, and files a pending club_access_requests row (created_club_id) for the owner. A repeat of the same pending request returns the same club.';

REVOKE ALL ON FUNCTION public.request_new_club(text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_new_club(text, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_new_club(text, jsonb, text, text) TO authenticated;

-- 3. Approve confirms the created club; decline removes it and its drafts.
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
  v_draft_show_id uuid;
  v_club_removed boolean := false;
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
  ELSIF v_request.created_club_id IS NOT NULL THEN
    -- MYK9-2046: request_new_club() already created this club and made the requester
    -- its admin and secretary. Approval confirms that club; it never makes a second one
    -- or swaps it for another.
    IF p_existing_club_id IS NOT NULL AND p_existing_club_id <> v_request.created_club_id THEN
      RAISE EXCEPTION 'This request already has its club. Approve it as it is, or decline it.'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.clubs WHERE id = v_request.created_club_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'This request''s club has been deleted, so it cannot be approved. Decline the request instead.'
        USING ERRCODE = '23514';
    END IF;
    v_club_id := v_request.created_club_id;
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
    -- MYK9-2046: a request that came with a club (request_new_club) takes the club and
    -- its draft shows with it. Refused while the club has any show that is not a draft:
    -- that is a show people may have seen or entered, and removing it is a separate,
    -- deliberate act. soft_delete_show / soft_delete_club are the established paths and
    -- are recoverable; the name frees up because name checks skip deleted clubs.
    -- A club already soft-deleted (the approve refusal sends the owner here) has nothing
    -- left to remove: the request is still marked denied below.
    IF v_request.status = 'pending'
       AND v_request.created_club_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.clubs
         WHERE id = v_request.created_club_id AND deleted_at IS NULL
       ) THEN
      IF EXISTS (
        SELECT 1 FROM public.shows s
        WHERE s.club_id = v_request.created_club_id
          AND s.deleted_at IS NULL
          AND s.status <> 'draft'
      ) THEN
        RAISE EXCEPTION 'This club has a show that is not a draft, so the request cannot be declined here. Move or remove that show first.'
          USING ERRCODE = '23514';
      END IF;

      -- A draft that already holds a paid or scored entry is not just a draft: removing
      -- it is soft_delete_show's MK010 refusal, so say so here in plain words.
      IF EXISTS (
        SELECT 1
        FROM public.entries e
        JOIN public.shows s ON s.id = e.show_id
        WHERE s.club_id = v_request.created_club_id
          AND s.deleted_at IS NULL
          AND e.deleted_at IS NULL
          AND private.is_blocking_entry(
            e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status
          )
      ) THEN
        RAISE EXCEPTION 'This club has a draft show with a paid or scored entry, so the request cannot be declined here. Move or remove that show first.'
          USING ERRCODE = '23514';
      END IF;

      FOR v_draft_show_id IN
        SELECT s.id FROM public.shows s
        WHERE s.club_id = v_request.created_club_id AND s.deleted_at IS NULL
      LOOP
        BEGIN
          PERFORM public.soft_delete_show(v_draft_show_id, false, NULL);
        EXCEPTION WHEN SQLSTATE 'MK010' THEN
          RAISE EXCEPTION 'This club has a draft show with a paid or scored entry, so the request cannot be declined here. Move or remove that show first.'
            USING ERRCODE = '23514';
        END;
      END LOOP;

      PERFORM public.soft_delete_club(v_request.created_club_id);
      v_club_removed := true;
    END IF;

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
      jsonb_build_object(
        'requester_person_id', v_request.requester_person_id,
        'club_removed', v_club_removed
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



NOTIFY pgrst, 'reload schema';

COMMIT;
