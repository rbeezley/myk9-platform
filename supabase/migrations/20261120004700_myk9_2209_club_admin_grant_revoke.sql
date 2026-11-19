-- MYK9-2209: a club admin adds another admin by email, and can remove one.
--
-- Until now a club admin was made only by the club-creator trigger or by a site admin, and
-- nothing ever removed one. Modelled on grant_club_secretary / revoke_club_secretary (latest
-- definitions: 20261017163700 and 20261104172300). New functions, nothing replaced.
--
--   get_club_admins(club)            who the club's admins are (user_roles is not readable cross-user)
--   grant_club_admin(club, person)   insert or reactivate the club_admin row
--   add_club_admin_by_email(club, email)
--                                    find the person by email (or create an unclaimed people row),
--                                    grant, and say whether an invite is still needed. The invite
--                                    itself is the admin-invite-user edge function; handle_new_user
--                                    adopts the unclaimed row on sign-up and
--                                    propagate_people_auth_user_id_trigger (migration 159) carries the
--                                    role to the new auth id, exactly as for a site-admin invite.
--   revoke_club_admin(club, person)  deactivate (stamps deactivated_at), never the last active admin
--
-- Authorization for all four: a site admin or an admin of THAT club (42501 otherwise).
-- Both writers also need the step-up re-authentication every role change needs (MYK9-1208).
-- is_club_admin / is_show_club_admin read user_roles live, so Payments access follows the grant
-- and the revoke with no further work in the database.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_club_admins(p_club_id uuid)
RETURNS TABLE (
  person_id uuid,
  person_name text,
  person_email text,
  has_account boolean,
  expires_at timestamptz
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
  SELECT
    p.id,
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    p.email,
    (p.auth_user_id IS NOT NULL),
    ur.expires_at
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND r.name = 'club_admin'
    AND p.deleted_at IS NULL
  ORDER BY 2 NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_club_admins(uuid) IS
  'The club''s active admins, with whether each has signed in yet. Caller must be a site admin or an admin of this club.';

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

  IF NOT EXISTS (
    SELECT 1 FROM public.people WHERE id = p_person_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person % not found', p_person_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'club_admin role is missing' USING ERRCODE = 'P0002';
  END IF;

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
  'Makes a person an admin of a club (inserts or reactivates the club_admin grant). Caller must be a site admin or an admin of this club; needs a recent password confirmation.';

REVOKE ALL ON FUNCTION public.grant_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_admin(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_club_admin_by_email(
  p_club_id uuid,
  p_email text
)
RETURNS TABLE (
  person_id uuid,
  has_account boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_person_id uuid;
  v_auth_user_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can add an admin'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.auth_user_id INTO v_person_id, v_auth_user_id
  FROM public.people p
  WHERE lower(btrim(p.email)) = v_email
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_person_id IS NULL THEN
    -- No one has this address yet. An unclaimed row (auth_user_id NULL) is what
    -- handle_new_user adopts when the invite is accepted; the grant below rides on it.
    INSERT INTO public.people (first_name, last_name, email)
    VALUES (split_part(v_email, '@', 1), '', v_email)
    RETURNING id INTO v_person_id;
  END IF;

  PERFORM public.grant_club_admin(p_club_id, v_person_id);

  -- An unclaimed row is adopted by whoever first signs up with this address, so the grant on it
  -- lapses after a week. people_clear_admin_expiry_on_claim clears the clock when the invited
  -- person actually signs up; an existing account's grant never expires.
  IF v_auth_user_id IS NULL THEN
    UPDATE public.user_roles ur
    SET expires_at = now() + interval '7 days'
    FROM public.roles r
    WHERE r.id = ur.role_id
      AND r.name = 'club_admin'
      AND ur.user_id = v_person_id
      AND ur.club_id = p_club_id
      AND ur.show_id IS NULL;
  END IF;

  RETURN QUERY SELECT v_person_id, (v_auth_user_id IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.add_club_admin_by_email(uuid, text) IS
  'Adds an admin to a club by email. An existing person gets the role at once; an unknown address gets an unclaimed people row that holds the role until they sign up. has_account false means the caller should send an invite (admin-invite-user). Same authorization and re-authentication as grant_club_admin.';

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
  v_assignment_id uuid;
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

  SELECT ur.id INTO v_assignment_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_person_id
    AND ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.role_id = v_role_id
    AND ur.is_active = true
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    RETURN;
  END IF;

  -- Someone who has signed in has to remain: an invited address that never signed up cannot
  -- run the club. Expired grants do not count either, matching is_club_admin.
  SELECT count(*) INTO v_others
  FROM public.user_roles ur
  JOIN public.people p ON p.id = ur.user_id
  WHERE ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.role_id = v_role_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND ur.user_id <> p_person_id
    AND p.deleted_at IS NULL
    AND p.auth_user_id IS NOT NULL;

  IF v_others = 0 THEN
    RAISE EXCEPTION 'A club needs at least one admin. Add another admin first.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  UPDATE public.user_roles
  SET is_active = false, deactivated_at = now()
  WHERE id = v_assignment_id;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_revoked',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'club_admin')
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_club_admin(uuid, uuid) IS
  'Removes a person as a club admin (deactivates the grant, stamping deactivated_at). Refuses to remove the last admin who has signed in. Caller must be a site admin or an admin of this club; needs a recent password confirmation.';

REVOKE ALL ON FUNCTION public.revoke_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_admin(uuid, uuid) TO authenticated;

-- When an invited person signs up (people.auth_user_id NULL -> value), their still-valid
-- club_admin grants stop expiring. Same shape as propagate_people_auth_user_id_to_user_roles
-- (migration 159). An already-lapsed grant stays lapsed: it needs a fresh add.
CREATE OR REPLACE FUNCTION public.people_clear_admin_expiry_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL THEN
    UPDATE public.user_roles ur
    SET expires_at = NULL
    FROM public.roles r
    WHERE r.id = ur.role_id
      AND r.name = 'club_admin'
      AND ur.user_id = NEW.id
      AND ur.is_active = true
      AND ur.expires_at IS NOT NULL
      AND ur.expires_at > now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.people_clear_admin_expiry_on_claim() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS people_clear_admin_expiry_on_claim_trigger ON public.people;
CREATE TRIGGER people_clear_admin_expiry_on_claim_trigger
  AFTER UPDATE OF auth_user_id ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.people_clear_admin_expiry_on_claim();

NOTIFY pgrst, 'reload schema';

COMMIT;
