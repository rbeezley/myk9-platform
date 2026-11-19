-- MYK9-2211: a club admin invites an email address that has no account to become a club admin.
--
-- Builds on MYK9-2209 (20261120004700): same caller check (private.can_administer_club), same
-- step-up re-authentication, same per-club advisory lock. An address that already has an account
-- is refused here and goes through add_club_admin_by_email.
--
-- An invite is NOT a role. It is a row in club_admin_invites and grants nothing by itself:
--   * invite time        : no user_roles row, so it never counts toward the last-admin guard
--                          (revoke_club_admin counts user_roles rows only).
--   * consumption        : when the invitee's account first has a VERIFIED email equal to the
--                          invited address (email confirmed on sign-up, or an OAuth sign-in), a
--                          live invite (not consumed, cancelled or expired) inserts ONE active
--                          club-wide club_admin row for that club only and stamps consumed_at.
--                          It never updates an existing row, never touches other roles or other
--                          clubs, and an invite for club A grants nothing at club B.
--   * cancel / expiry    : a cancelled or expired invite is inert.
--
--   club_admin_invites                   the invites (RLS on, no client grants; RPCs only)
--   invite_club_admin(club, email)       create an invite (or report an existing live one)
--   resend_club_admin_invite(invite)     authorize + throttle a (re)send; returns what the email needs
--   cancel_club_admin_invite(invite)     cancel a live invite
--   list_club_admin_invites(club)        live invites for the club page
--   private.consume_club_admin_invites   the consumption step, called by the auth.users triggers
--
-- The email itself is sent by the send-club-admin-invite-email edge function, which calls
-- resend_club_admin_invite as the caller and then delivers through Resend.

BEGIN;

CREATE TABLE public.club_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  invited_by uuid REFERENCES public.people (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  cancelled_at timestamptz,
  consumed_at timestamptz,
  consumed_by_person uuid REFERENCES public.people (id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.club_admin_invites IS
  'MYK9-2211: an invitation for an email with no account to become a club admin. Grants nothing until consumed on the invitee''s first verified sign-in. Not a user_roles row.';

-- One live invite per club and address.
CREATE UNIQUE INDEX club_admin_invites_one_live_per_email
  ON public.club_admin_invites (club_id, email)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX club_admin_invites_email_live
  ON public.club_admin_invites (email)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX club_admin_invites_invited_by_idx ON public.club_admin_invites (invited_by);
CREATE INDEX club_admin_invites_consumed_by_idx ON public.club_admin_invites (consumed_by_person);

ALTER TABLE public.club_admin_invites ENABLE ROW LEVEL SECURITY;

-- No policy: clients never read or write the table. Every access is a SECURITY DEFINER function.
REVOKE ALL ON TABLE public.club_admin_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.club_admin_invites TO service_role;

-- ---------------------------------------------------------------------------
-- invite_club_admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_club_admin(
  p_club_id uuid,
  p_email text
)
RETURNS TABLE (
  outcome text,
  invite_id uuid,
  invite_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_actor_person_id uuid;
  v_invite_id uuid;
BEGIN
  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can invite an admin'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING ERRCODE = '22023';
  END IF;

  -- Same per-club lock grant_club_admin and revoke_club_admin take.
  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || p_club_id::text, 0));

  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can change its admins'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  -- An address that already has an account that can sign in is added directly, not invited.
  IF EXISTS (
    SELECT 1
    FROM public.people p
    WHERE lower(p.email) = v_email
      AND p.deleted_at IS NULL
      AND public.person_can_sign_in(p.id)
  ) OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = v_email
      AND u.last_sign_in_at IS NOT NULL
      AND u.deleted_at IS NULL
  ) THEN
    RETURN QUERY SELECT 'has_account'::text, NULL::uuid, v_email;
    RETURN;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- A lapsed invite is retired so the address can be invited again.
  UPDATE public.club_admin_invites
  SET cancelled_at = now()
  WHERE club_id = p_club_id
    AND email = v_email
    AND consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= now();

  SELECT i.id INTO v_invite_id
  FROM public.club_admin_invites i
  WHERE i.club_id = p_club_id
    AND i.email = v_email
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL;

  IF v_invite_id IS NOT NULL THEN
    RETURN QUERY SELECT 'already_invited'::text, v_invite_id, v_email;
    RETURN;
  END IF;

  INSERT INTO public.club_admin_invites (club_id, email, invited_by)
  VALUES (p_club_id, v_email, v_actor_person_id)
  RETURNING id INTO v_invite_id;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_invited',
    'club_admin_invite',
    v_invite_id,
    jsonb_build_object('club_id', p_club_id, 'email', v_email)
  );

  RETURN QUERY SELECT 'invited'::text, v_invite_id, v_email;
END;
$$;

COMMENT ON FUNCTION public.invite_club_admin(uuid, text) IS
  'Invites an address with no account to become a club admin. Returns invited, already_invited (a live invite exists) or has_account (use add_club_admin_by_email). Creates no role. Same authorization, re-authentication and club lock as grant_club_admin.';

REVOKE ALL ON FUNCTION public.invite_club_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_club_admin(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- resend_club_admin_invite: authorizes and throttles a send, returns what the email needs.
-- Grants nothing and does not extend the invite.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resend_club_admin_invite(p_invite_id uuid)
RETURNS TABLE (
  invite_email text,
  club_name text,
  inviter_name text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.club_admin_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.club_admin_invites WHERE id = p_invite_id;

  IF NOT FOUND OR NOT private.can_administer_club(v_invite.club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can send an invite'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || v_invite.club_id::text, 0));

  IF NOT private.can_administer_club(v_invite.club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can send an invite'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invite FROM public.club_admin_invites WHERE id = p_invite_id;

  IF v_invite.consumed_at IS NOT NULL OR v_invite.cancelled_at IS NOT NULL
     OR v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite is no longer pending.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.last_sent_at IS NOT NULL AND v_invite.last_sent_at > now() - interval '30 seconds' THEN
    RAISE EXCEPTION 'That invite was just sent. Wait a moment before sending it again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.send_count >= 5 THEN
    RAISE EXCEPTION 'That invite has been sent too many times. Cancel it and invite again.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.club_admin_invites
  SET last_sent_at = now(), send_count = send_count + 1
  WHERE id = p_invite_id;

  RETURN QUERY
  SELECT v_invite.email,
         c.name,
         NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
         v_invite.expires_at
  FROM public.clubs c
  LEFT JOIN public.people p ON p.id = v_invite.invited_by
  WHERE c.id = v_invite.club_id;
END;
$$;

COMMENT ON FUNCTION public.resend_club_admin_invite(uuid) IS
  'Authorizes and throttles one send of a pending club-admin invite (30 seconds apart, five sends in all) and returns the address, club name, inviter name and expiry for the email. Grants nothing and does not extend the invite.';

REVOKE ALL ON FUNCTION public.resend_club_admin_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_club_admin_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_club_admin_invite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_club_admin_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_actor_person_id uuid;
BEGIN
  SELECT club_id INTO v_club_id FROM public.club_admin_invites WHERE id = p_invite_id;

  IF v_club_id IS NULL OR NOT private.can_administer_club(v_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can cancel an invite'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || v_club_id::text, 0));

  IF NOT private.can_administer_club(v_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can cancel an invite'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_actor_person_id FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.club_admin_invites
  SET cancelled_at = now()
  WHERE id = p_invite_id
    AND consumed_at IS NULL
    AND cancelled_at IS NULL;

  IF FOUND THEN
    INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
    VALUES (
      v_actor_person_id,
      'club_admin_invite_cancelled',
      'club_admin_invite',
      p_invite_id,
      jsonb_build_object('club_id', v_club_id)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cancel_club_admin_invite(uuid) IS
  'Cancels a pending club-admin invite so it can no longer be consumed. Idempotent. Caller must be a site admin or an admin of the invite''s club.';

REVOKE ALL ON FUNCTION public.cancel_club_admin_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_club_admin_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_club_admin_invites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_club_admin_invites(p_club_id uuid)
RETURNS TABLE (
  invite_id uuid,
  invite_email text,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz,
  last_sent_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can list its invites'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.email,
         NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
         i.created_at,
         i.expires_at,
         i.last_sent_at
  FROM public.club_admin_invites i
  LEFT JOIN public.people p ON p.id = i.invited_by
  WHERE i.club_id = p_club_id
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
    AND i.expires_at > now()
  ORDER BY i.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_club_admin_invites(uuid) IS
  'Pending (not consumed, cancelled or expired) club-admin invites for the club. Caller must be a site admin or an admin of this club.';

REVOKE ALL ON FUNCTION public.list_club_admin_invites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_club_admin_invites(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Consumption
-- ---------------------------------------------------------------------------
-- Returns how many invites were consumed. Requires a VERIFIED email on a live account that is
-- linked to a live, unsuspended person; anything else consumes nothing and leaves the invite
-- pending. Inserts at most one club-wide club_admin row per invite and never updates a row.
CREATE OR REPLACE FUNCTION private.consume_club_admin_invites(p_auth_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_person_id uuid;
  v_role_id uuid;
  v_invite record;
  v_consumed_id uuid;
  v_assignment_id uuid;
  v_count integer := 0;
BEGIN
  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = p_auth_user_id
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now());

  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = p_auth_user_id
    AND p.deleted_at IS NULL
    AND p.status IS DISTINCT FROM 'suspended'
  LIMIT 1;

  IF v_person_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_invite IN
    SELECT i.id, i.club_id, i.invited_by
    FROM public.club_admin_invites i
    WHERE i.email = v_email
      AND i.consumed_at IS NULL
      AND i.cancelled_at IS NULL
      AND i.expires_at > now()
    ORDER BY i.created_at
  LOOP
    BEGIN
      -- Same lock order as the RPCs: club lock first, then the invite row.
      PERFORM pg_advisory_xact_lock(
        hashtextextended('club_admin_revoke:' || v_invite.club_id::text, 0));

      -- Claim under the lock: a cancel that won the race leaves nothing to consume.
      v_consumed_id := NULL;
      UPDATE public.club_admin_invites
      SET consumed_at = now(), consumed_by_person = v_person_id
      WHERE id = v_invite.id
        AND consumed_at IS NULL
        AND cancelled_at IS NULL
        AND expires_at > now()
      RETURNING id INTO v_consumed_id;

      CONTINUE WHEN v_consumed_id IS NULL;

      SELECT ur.id INTO v_assignment_id
      FROM public.user_roles ur
      WHERE ur.user_id = v_person_id
        AND ur.role_id = v_role_id
        AND ur.club_id = v_invite.club_id
        AND ur.show_id IS NULL
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
      LIMIT 1;

      IF v_assignment_id IS NULL THEN
        INSERT INTO public.user_roles (user_id, role_id, club_id, granted_by, is_active)
        VALUES (v_person_id, v_role_id, v_invite.club_id, v_invite.invited_by, true)
        RETURNING id INTO v_assignment_id;

        INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
        VALUES (
          v_invite.invited_by,
          'club_admin_invite_consumed',
          'user_role',
          v_assignment_id,
          jsonb_build_object(
            'person_id', v_person_id,
            'club_id', v_invite.club_id,
            'invite_id', v_invite.id,
            'role', 'club_admin'
          )
        );
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One invite that cannot be applied (for example its club was deleted since) rolls back
      -- only its own step: the invite stays pending and the other invites still apply.
      RAISE WARNING 'club admin invite % not consumed: %', v_invite.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.consume_club_admin_invites(uuid) IS
  'MYK9-2211: for an account with a verified email, turns each live invite for that address into one club-wide club_admin row for the invite''s club, stamping consumed_at. Never updates an existing row.';

REVOKE ALL ON FUNCTION private.consume_club_admin_invites(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Trigger wrapper: never lets an invite problem break sign-up or sign-in.
CREATE OR REPLACE FUNCTION public.consume_club_admin_invites_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM private.consume_club_admin_invites(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consume_club_admin_invites failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_club_admin_invites_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_club_admin_invites_trigger() TO supabase_auth_admin;

-- zz_ sorts after on_auth_user_created, so handle_new_user has linked the people row first.
-- Insert covers an OAuth sign-up (email already verified); the update covers the email
-- confirmation and the first sign-in of an account that was created unconfirmed.
DROP TRIGGER IF EXISTS zz_consume_club_admin_invites_ins ON auth.users;
CREATE TRIGGER zz_consume_club_admin_invites_ins
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.consume_club_admin_invites_trigger();

DROP TRIGGER IF EXISTS zz_consume_club_admin_invites_upd ON auth.users;
CREATE TRIGGER zz_consume_club_admin_invites_upd
  AFTER UPDATE OF email_confirmed_at, last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (
    NEW.email_confirmed_at IS NOT NULL
    AND (OLD.email_confirmed_at IS NULL OR OLD.last_sign_in_at IS NULL)
  )
  EXECUTE FUNCTION public.consume_club_admin_invites_trigger();

NOTIFY pgrst, 'reload schema';

COMMIT;
