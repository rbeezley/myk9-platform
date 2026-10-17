-- MYK9-1208: step-up re-authentication for role changes.
--
-- A signed-in session can be weeks old on an unlocked club laptop. Granting or revoking a
-- role now needs a password (or, for an account with no password, an emailed code)
-- confirmed in the last five minutes. The proof is the session JWT's `amr` claim: GoTrue
-- signs `[{ method, timestamp }]` into every access token and keeps the timestamps through
-- refreshes, and signing in again mints a session whose timestamp is now. Plan and the
-- inventory of every gated entry point: docs/plan-step-up-reauth.md.
--
-- The edge-function twin is apps/myk9show/supabase/functions/_shared/stepUpReauth.ts (the
-- refund functions). Keep the method list, the window and the 60 s skew in step with it.
--
-- What changes:
--   1. public.require_recent_reauth(): raises SQLSTATE MKAUT (hint step_up_required) unless
--      the request's JWT re-authenticated within p_max_age_seconds. The browser recognises
--      the code, asks for the password, and replays the request.
--   2. An AFTER ROW trigger on user_roles, roles and role_permissions gates DIRECT client
--      writes (the site-admin role editors). AFTER, so RLS has already admitted the row: a
--      non-admin's refused write still reads as 42501, never as a password prompt.
--   3. grant_club_secretary, revoke_club_secretary, approve_role_request and
--      review_club_access_request (approval only) call the helper after their own
--      authorization and validation. approve_club_role_request is gated through
--      grant_club_secretary, which it always PERFORMs with no exception handler.
--
-- Exempt, deliberately:
--   - No request JWT (auth.jwt() IS NULL): migrations, pg_cron, GoTrue hooks
--     (handle_new_user, grant_early_access_secretary_role), psql. None is a browser.
--   - service_role tokens: edge functions acting as the system. No service-role caller of
--     the gated RPCs exists today; this keeps one from breaking later.
--   - Writes made inside a SECURITY DEFINER function run as its owner, so the direct-write
--     trigger ignores them: club-creator grant, auth-id propagation, soft_delete_person,
--     and the steward ring assignment inside grant_show_official (a show-day action).

BEGIN;

CREATE OR REPLACE FUNCTION public.require_recent_reauth(p_max_age_seconds integer DEFAULT 300)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_now numeric := extract(epoch FROM now());
  v_reauth_at numeric;
BEGIN
  IF v_claims IS NULL OR v_claims ->> 'role' = 'service_role' THEN
    RETURN;
  END IF;

  IF jsonb_typeof(v_claims -> 'amr') = 'array' THEN
    -- CASE, not WHERE, guards the cast: WHERE gives no evaluation order.
    SELECT max(t.reauth_at)
      INTO v_reauth_at
      FROM (
        SELECT CASE
                 WHEN jsonb_typeof(entry) = 'object'
                  AND jsonb_typeof(entry -> 'timestamp') = 'number'
                  AND entry ->> 'method' IN (
                    'password', 'otp', 'magiclink', 'totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn'
                  )
                 THEN (entry ->> 'timestamp')::numeric
               END AS reauth_at
          FROM jsonb_array_elements(v_claims -> 'amr') AS entry
      ) t
     WHERE t.reauth_at > 0;
  END IF;

  IF v_reauth_at IS NULL
     OR v_reauth_at > v_now + 60
     OR v_now - v_reauth_at > COALESCE(p_max_age_seconds, 300) THEN
    RAISE EXCEPTION 'Confirm your password to continue.'
      USING ERRCODE = 'MKAUT', HINT = 'step_up_required';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.require_recent_reauth(integer) IS
  'MYK9-1208: raises MKAUT (hint step_up_required) unless the request JWT''s amr shows a password, emailed code or MFA confirmation within p_max_age_seconds. No JWT (system) and service_role are exempt.';

REVOKE ALL ON FUNCTION public.require_recent_reauth(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_recent_reauth(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_recent_reauth_for_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- PostgREST runs a direct table write as the request's role. A write made inside a
  -- SECURITY DEFINER function runs as the function's owner and is that function's call.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_recent_reauth();
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.require_recent_reauth_for_client_write() IS
  'MYK9-1208: AFTER ROW trigger on user_roles, roles and role_permissions. A direct client write that RLS admitted needs a recent re-authentication.';

REVOKE ALL ON FUNCTION public.require_recent_reauth_for_client_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_recent_reauth_for_client_write() TO authenticated;

DROP TRIGGER IF EXISTS trg_user_roles_require_recent_reauth ON public.user_roles;
CREATE TRIGGER trg_user_roles_require_recent_reauth
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.require_recent_reauth_for_client_write();

DROP TRIGGER IF EXISTS trg_roles_require_recent_reauth ON public.roles;
CREATE TRIGGER trg_roles_require_recent_reauth
  AFTER INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.require_recent_reauth_for_client_write();

DROP TRIGGER IF EXISTS trg_role_permissions_require_recent_reauth ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_require_recent_reauth
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.require_recent_reauth_for_client_write();

-- grant_club_secretary: copied verbatim from 20260830210000_appointment_grants_show_access.sql (the latest definition;
-- docs/lessons/README.md#replace-function-latest). Only the require_recent_reauth call is new.
CREATE OR REPLACE FUNCTION public.grant_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_secretary_role_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can grant secretary access'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Person % not found', p_person_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  -- Membership is deliberately NOT checked. A professional secretary hired by a
  -- club is typically a member of none of the clubs they work for.

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_secretary_role_id
  FROM public.roles
  WHERE name = 'secretary';

  IF v_secretary_role_id IS NULL THEN
    RAISE EXCEPTION 'secretary role is missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_secretary_role_id
    AND club_id = p_club_id
    AND show_id IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      granted_by,
      is_active
    )
    VALUES (
      p_person_id,
      v_secretary_role_id,
      p_club_id,
      v_actor_person_id,
      true
    )
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        expires_at = NULL,
        granted_by = v_actor_person_id,
        granted_at = now()
    WHERE id = v_assignment_id;
  END IF;

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    'club_secretary_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object(
      'person_id', p_person_id,
      'club_id', p_club_id,
      'role', 'secretary'
    )
  );

  RETURN v_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) TO authenticated;

-- revoke_club_secretary: copied verbatim from 20260830230000_revoke_club_secretary_covers_trial_secretary.sql (the latest definition;
-- docs/lessons/README.md#replace-function-latest). Only the require_recent_reauth call is new.
CREATE OR REPLACE FUNCTION public.revoke_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can revoke secretary access'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- Match every role the read side honours, not just the one the grant path writes.
  -- The UPDATE is unbounded on purpose: if a person somehow holds both rows, revoking
  -- one and leaving the other is the bug this migration exists to fix.
  WITH updated AS (
    UPDATE public.user_roles ur
    SET is_active = false
    WHERE ur.user_id = p_person_id
      AND ur.club_id = p_club_id
      AND ur.show_id IS NULL
      AND ur.is_active = true
      AND ur.role_id IN (
        SELECT r.id FROM public.roles r WHERE r.name IN ('secretary', 'trial_secretary')
      )
    RETURNING ur.id
  )
  SELECT id INTO v_assignment_id
  FROM updated
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    'club_secretary_revoked',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'secretary')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) TO authenticated;

-- approve_role_request: copied verbatim from 20260925033700_myk9_727_role_request_review_lock.sql (the latest definition;
-- docs/lessons/README.md#replace-function-latest). Only the require_recent_reauth call is new.
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

  -- MYK9-1208: granting a role needs a password confirmed in the last five minutes.
  -- After every validation, so a request that cannot be approved never prompts.
  PERFORM public.require_recent_reauth();

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

-- review_club_access_request: copied verbatim from 20260927221500_myk9_859_club_approved_notification.sql (the latest definition;
-- docs/lessons/README.md#replace-function-latest). Only the require_recent_reauth call is new.
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

COMMIT;
