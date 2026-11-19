-- MYK9-2209: a club admin adds another admin by email (an existing account), and can remove one.
--
-- Until now a club admin was made only by the club-creator trigger or by a site admin, and
-- nothing ever removed one. Modelled on grant_club_secretary / revoke_club_secretary (latest
-- definitions: 20261017163700 and 20261104172300). New functions, nothing replaced.
-- Inviting an address that has no account yet is MYK9-2211, not this change.
--
--   person_can_sign_in(person)       internal: has an auth user that has signed in, not suspended
--   get_club_admins(club)            who the club's admins are (user_roles is not readable cross-user)
--   grant_club_admin(club, person)   make a person who can sign in an admin
--   add_club_admin_by_email(club, email)
--                                    find the account by email and grant, or say 'no_account'
--   revoke_club_admin(club, person)  remove every admin assignment the person has at the club,
--                                    never the last admin who can sign in
--
-- "Admin" means what is_club_admin / is_show_club_admin count (20261113222900): any active,
-- unexpired club_admin row for the club, show-pinned or not. Every function here uses that rule.
-- Authorization: a site admin or an admin of THAT club (42501 otherwise). Both writers also need
-- the step-up re-authentication every role change needs (MYK9-1208).

BEGIN;

CREATE OR REPLACE FUNCTION public.person_can_sign_in(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.people p
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE p.id = p_person_id
      AND p.deleted_at IS NULL
      AND p.status IS DISTINCT FROM 'suspended'
      AND u.last_sign_in_at IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.person_can_sign_in(uuid) IS
  'True when the person has an auth user that has signed in before, is not deleted and is not suspended. Internal helper for the club-admin functions.';

REVOKE ALL ON FUNCTION public.person_can_sign_in(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_admins(p_club_id uuid)
RETURNS TABLE (
  person_id uuid,
  person_name text,
  person_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can list its admins'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id,
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    p.email
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE ur.club_id = p_club_id
    AND r.name = 'club_admin'
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND p.deleted_at IS NULL
  ORDER BY p.id;
END;
$$;

COMMENT ON FUNCTION public.get_club_admins(uuid) IS
  'The club''s admins, one row per person (show-pinned assignments count, as in is_club_admin). Caller must be a site admin or an admin of this club.';

REVOKE ALL ON FUNCTION public.get_club_admins(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_admins(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_club_admin(
  p_club_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_role_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can add an admin'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.person_can_sign_in(p_person_id) THEN
    RAISE EXCEPTION 'That person does not have a myK9 account yet.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'club_admin role is missing' USING ERRCODE = 'P0002';
  END IF;

  -- Already an admin by the rule is_club_admin uses (a show-pinned row counts): nothing to add.
  SELECT ur.id INTO v_assignment_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_person_id
    AND ur.role_id = v_role_id
    AND ur.club_id = p_club_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ORDER BY (ur.show_id IS NULL) DESC
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    RETURN v_assignment_id;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_assignment_id
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_role_id
    AND club_id = p_club_id
    AND show_id IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    VALUES (p_person_id, v_role_id, p_club_id, v_actor_person_id, true)
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        expires_at = NULL,
        granted_by = v_actor_person_id,
        granted_at = now()
    WHERE id = v_assignment_id;
  END IF;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'club_admin')
  );

  RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION public.grant_club_admin(uuid, uuid) IS
  'Makes a person who can sign in an admin of a club. A person who already counts as an admin (including a show-pinned grant) is left as is. Caller must be a site admin or an admin of this club; needs a recent password confirmation.';

REVOKE ALL ON FUNCTION public.grant_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_admin(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_club_admin_by_email(
  p_club_id uuid,
  p_email text
)
RETURNS TABLE (
  outcome text,
  person_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_person_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can add an admin'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING ERRCODE = '22023';
  END IF;

  -- Same key handle_new_user uses to match a person to an account: lower(email).
  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE lower(p.email) = v_email
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_person_id IS NULL OR NOT public.person_can_sign_in(v_person_id) THEN
    RETURN QUERY SELECT 'no_account'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM public.grant_club_admin(p_club_id, v_person_id);

  RETURN QUERY SELECT 'added'::text, v_person_id;
END;
$$;

COMMENT ON FUNCTION public.add_club_admin_by_email(uuid, text) IS
  'Adds an existing account as a club admin by email. Returns outcome added, or no_account (and grants nothing) when no person with that email has signed in. Same authorization and re-authentication as grant_club_admin.';

REVOKE ALL ON FUNCTION public.add_club_admin_by_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_club_admin_by_email(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_club_admin(
  p_club_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_role_id uuid;
  v_assignment_ids uuid[];
  v_is_effective boolean;
  v_others integer;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can remove an admin'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'club_admin role is missing' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize removals for one club so two admins removing each other cannot both pass the
  -- last-admin check below.
  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || p_club_id::text, 0));

  -- Every active assignment the person holds at this club, club-wide or show-pinned: removing
  -- only one would leave is_club_admin true.
  SELECT array_agg(ur.id), COALESCE(bool_or(ur.expires_at IS NULL OR ur.expires_at > now()), false)
    INTO v_assignment_ids, v_is_effective
  FROM public.user_roles ur
  WHERE ur.user_id = p_person_id
    AND ur.club_id = p_club_id
    AND ur.role_id = v_role_id
    AND ur.is_active = true;

  IF v_assignment_ids IS NULL THEN
    RETURN;
  END IF;

  -- The club must keep another admin who can actually sign in: not an unclaimed address, not
  -- someone who never signed in, not a suspended account, not a lapsed grant.
  IF v_is_effective THEN
    SELECT count(DISTINCT ur.user_id) INTO v_others
    FROM public.user_roles ur
    WHERE ur.club_id = p_club_id
      AND ur.role_id = v_role_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND ur.user_id <> p_person_id
      AND public.person_can_sign_in(ur.user_id);

    IF v_others = 0 THEN
      RAISE EXCEPTION 'A club needs at least one admin. Add another admin first.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  UPDATE public.user_roles
  SET is_active = false, deactivated_at = now()
  WHERE id = ANY (v_assignment_ids);

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_revoked',
    'user_role',
    v_assignment_ids[1],
    jsonb_build_object(
      'person_id', p_person_id,
      'club_id', p_club_id,
      'role', 'club_admin',
      'assignments_removed', cardinality(v_assignment_ids)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_club_admin(uuid, uuid) IS
  'Removes a person as a club admin: deactivates every club_admin assignment they hold at the club (stamping deactivated_at). Refuses to remove the last admin who can sign in. Caller must be a site admin or an admin of this club; needs a recent password confirmation.';

REVOKE ALL ON FUNCTION public.revoke_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_admin(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
