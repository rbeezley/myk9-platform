-- MYK9-2211: a club admin invites an email address that has no account to become a club admin.
--
-- Builds on MYK9-2209 (20261120004700): same caller check (private.can_administer_club), same
-- step-up re-authentication, same per-club advisory lock. An address that already has an account
-- is refused here and goes through add_club_admin_by_email.
--
-- An invite is NOT a role. It is a row in club_admin_invites and grants nothing by itself:
--   * invite time        : no user_roles row, so it never counts toward the last-admin guard
--                          (revoke_club_admin counts user_roles rows only).
--   * invite refused     : when ANY auth.users row exists for the address, confirmed or not,
--                          signed in or not; such an address goes through add_club_admin_by_email,
--                          which needs a real sign-in.
--   * mailbox proof      : an emailed one-time token. Each send mints a fresh random token, stores
--                          only its sha256 hash and puts the raw token in the emailed link
--                          (/club-invite/<token>). A resend rotates the token (the hash is all we
--                          keep, so the earlier link cannot be re-sent) and only ever goes to the
--                          address the invite already names. No auth.users trigger: email_confirmed_at
--                          proves nothing when sign-up auto-confirms.
--   * acceptance         : the signed-in invitee calls accept_club_admin_invite(token). The live
--                          invite matching the token's hash (not cancelled, expired or consumed,
--                          for a club that is not deleted) must name the caller's own auth email.
--                          Then, under the per-club advisory lock, ONE active club-wide club_admin
--                          row for that club is given (reusing an inactive one, as grant_club_admin
--                          does) and consumed_at / consumed_by_person are stamped. Other roles and
--                          other clubs are untouched.
--   * cancel / expiry    : a cancelled or expired invite is inert. Cancelling an invite that was
--                          already accepted says so ('already_accepted'); the admin uses Remove.
--
--   club_admin_invites                   the invites (RLS on, no client grants; RPCs only)
--   invite_club_admin(club, email)       create an invite (or report an existing live one)
--   resend_club_admin_invite(invite)     authorize + throttle a send; mints the token, returns what the email needs
--   cancel_club_admin_invite(invite)     cancel a live invite
--   list_club_admin_invites(club)        live invites for the club page
--   accept_club_admin_invite(token)      the invitee's acceptance
--
-- The email itself is sent by the send-club-admin-invite-email edge function, which calls
-- resend_club_admin_invite as the caller and then delivers through Resend.

BEGIN;

CREATE TABLE public.club_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  token_hash text,
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
  'MYK9-2211: an invitation for an email with no account to become a club admin. Grants nothing until the invitee accepts it with the emailed one-time token (only its sha256 hash is stored). Not a user_roles row.';

-- One live invite per club and address.
CREATE UNIQUE INDEX club_admin_invites_one_live_per_email
  ON public.club_admin_invites (club_id, email)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE UNIQUE INDEX club_admin_invites_token_hash_key
  ON public.club_admin_invites (token_hash)
  WHERE token_hash IS NOT NULL;

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

  -- An address with ANY account is added directly, not invited: confirmed or not, signed in or
  -- not. An unconfirmed account may be held by someone who does not own the mailbox, and the
  -- invite would hand it the role the moment the mailbox owner confirms it.
  IF EXISTS (
    SELECT 1
    FROM public.people p
    WHERE lower(p.email) = v_email
      AND p.deleted_at IS NULL
      AND public.person_can_sign_in(p.id)
  ) OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(btrim(u.email)) = v_email
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
-- Grants nothing and does not extend the invite. It deliberately skips require_recent_reauth:
-- it changes no access, is throttled (30 seconds apart, five sends) and can only email the address
-- the invite already names, so a stale session gains nothing from it. It mints the emailed token
-- (and so retires the one in an earlier email); the raw token is returned to the edge function
-- only and is never stored. Cancel is the opposite case
-- (see below).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resend_club_admin_invite(p_invite_id uuid)
RETURNS TABLE (
  invite_email text,
  club_name text,
  inviter_name text,
  expires_at timestamptz,
  invite_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite public.club_admin_invites%ROWTYPE;
  v_token text;
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

  -- HINT carries a machine-readable reason the edge function passes to the page.
  IF v_invite.consumed_at IS NOT NULL OR v_invite.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite is no longer pending.' USING ERRCODE = 'P0001', HINT = 'inactive';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite has expired.' USING ERRCODE = 'P0001', HINT = 'expired';
  END IF;

  IF v_invite.last_sent_at IS NOT NULL AND v_invite.last_sent_at > now() - interval '30 seconds' THEN
    RAISE EXCEPTION 'That invite was just sent. Wait a moment before sending it again.'
      USING ERRCODE = 'P0001', HINT = 'throttled';
  END IF;

  IF v_invite.send_count >= 5 THEN
    RAISE EXCEPTION 'That invite has been sent too many times. Cancel it and invite again.'
      USING ERRCODE = 'P0001', HINT = 'cap';
  END IF;

  -- 244 random bits from two v4 UUIDs; only the hash is stored, so a rotation replaces it.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  UPDATE public.club_admin_invites
  SET last_sent_at = now(),
      send_count = send_count + 1,
      token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
  WHERE id = p_invite_id;

  RETURN QUERY
  SELECT v_invite.email,
         c.name,
         NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
         v_invite.expires_at,
         v_token
  FROM public.clubs c
  LEFT JOIN public.people p ON p.id = v_invite.invited_by
  WHERE c.id = v_invite.club_id;
END;
$$;

COMMENT ON FUNCTION public.resend_club_admin_invite(uuid) IS
  'Authorizes and throttles one send of a pending club-admin invite (30 seconds apart, five sends in all), mints a fresh one-time token (storing only its hash; an earlier emailed token stops working) and returns the address, club name, inviter name, expiry and token for the email. Grants nothing and does not extend the invite.';

REVOKE ALL ON FUNCTION public.resend_club_admin_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_club_admin_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_club_admin_invite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_club_admin_invite(p_invite_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_actor_person_id uuid;
  v_invite public.club_admin_invites%ROWTYPE;
BEGIN
  SELECT club_id INTO v_club_id FROM public.club_admin_invites WHERE id = p_invite_id;

  IF v_club_id IS NULL OR NOT private.can_administer_club(v_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can cancel an invite'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: counterpart of revoke_club_admin, so a stale or hijacked session cannot cancel.
  PERFORM public.require_recent_reauth();

  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || v_club_id::text, 0));

  IF NOT private.can_administer_club(v_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can cancel an invite'
      USING ERRCODE = '42501';
  END IF;

  -- Read under the club lock: an accept that won the race is visible here.
  SELECT * INTO v_invite FROM public.club_admin_invites WHERE id = p_invite_id;

  IF v_invite.consumed_at IS NOT NULL THEN
    RETURN 'already_accepted';
  END IF;
  IF v_invite.cancelled_at IS NOT NULL THEN
    RETURN 'already_cancelled';
  END IF;

  SELECT id INTO v_actor_person_id FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.club_admin_invites SET cancelled_at = now() WHERE id = p_invite_id;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_invite_cancelled',
    'club_admin_invite',
    p_invite_id,
    jsonb_build_object('club_id', v_club_id)
  );

  RETURN 'cancelled';
END;
$$;

COMMENT ON FUNCTION public.cancel_club_admin_invite(uuid) IS
  'Cancels a pending club-admin invite so it can no longer be accepted. Returns cancelled, already_cancelled (idempotent) or already_accepted (the invitee got there first: the admin uses Remove). Caller must be a site admin or an admin of the invite''s club.';

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
  last_sent_at timestamptz,
  is_expired boolean
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
         i.last_sent_at,
         (i.expires_at <= now())
  FROM public.club_admin_invites i
  LEFT JOIN public.people p ON p.id = i.invited_by
  WHERE i.club_id = p_club_id
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
  ORDER BY i.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_club_admin_invites(uuid) IS
  'Club-admin invites for the club that are neither consumed nor cancelled, expired ones included (is_expired) so the page can say so. Caller must be a site admin or an admin of this club.';

REVOKE ALL ON FUNCTION public.list_club_admin_invites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_club_admin_invites(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_club_admin_invite
-- ---------------------------------------------------------------------------
-- Outcomes (a result, not an exception, so the page can say which):
--   accepted          the role was given (or was already active) and the invite is consumed
--   already_accepted  this same caller accepted it earlier (a reload or second click)
--   expired           the invite lapsed
--   wrong_account     a live invite, but for a different email than the caller's account
--   invalid           anything else: unknown token, cancelled, consumed by someone else, deleted
--                     club, or a caller with no usable profile. Deliberately one answer, so the
--                     token cannot be probed.
CREATE OR REPLACE FUNCTION public.accept_club_admin_invite(p_token text)
RETURNS TABLE (
  outcome text,
  club_id uuid,
  club_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.club_admin_invites%ROWTYPE;
  v_club_name text;
  v_email text;
  v_person_id uuid;
  v_role_id uuid;
  v_assignment_id uuid;
  v_was_active boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept an invitation' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR length(btrim(p_token)) NOT BETWEEN 32 AND 128 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  v_hash := encode(sha256(convert_to(btrim(p_token), 'UTF8')), 'hex');

  SELECT * INTO v_invite FROM public.club_admin_invites i WHERE i.token_hash = v_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Same per-club lock as every other club-admin change, then re-read the row under it.
  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || v_invite.club_id::text, 0));
  SELECT * INTO v_invite FROM public.club_admin_invites i WHERE i.id = v_invite.id;

  SELECT c.name INTO v_club_name
  FROM public.clubs c
  WHERE c.id = v_invite.club_id AND c.deleted_at IS NULL;
  IF v_club_name IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now());

  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = v_uid
    AND p.deleted_at IS NULL
    AND p.status IS DISTINCT FROM 'suspended'
  LIMIT 1;

  IF v_email IS NULL OR v_person_id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.consumed_at IS NOT NULL THEN
    IF v_invite.consumed_by_person = v_person_id AND v_invite.email = v_email THEN
      RETURN QUERY SELECT 'already_accepted'::text, v_invite.club_id, v_club_name;
    ELSE
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    END IF;
    RETURN;
  END IF;

  IF v_invite.cancelled_at IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, v_invite.club_id, v_club_name;
    RETURN;
  END IF;

  -- Possessing the emailed token is the mailbox proof; the account must also be that mailbox's.
  IF v_invite.email IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT 'wrong_account'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT ur.id, (ur.is_active AND (ur.expires_at IS NULL OR ur.expires_at > now()))
    INTO v_assignment_id, v_was_active
  FROM public.user_roles ur
  WHERE ur.user_id = v_person_id
    AND ur.role_id = v_role_id
    AND ur.club_id = v_invite.club_id
    AND ur.show_id IS NULL
  ORDER BY (ur.is_active AND (ur.expires_at IS NULL OR ur.expires_at > now())) DESC
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    VALUES (v_person_id, v_role_id, v_invite.club_id, v_invite.invited_by, true)
    RETURNING id INTO v_assignment_id;
  ELSIF NOT v_was_active THEN
    -- Same as grant_club_admin: revive the person's inactive club-wide row, no second row.
    UPDATE public.user_roles
    SET is_active = true, expires_at = NULL, granted_by = v_invite.invited_by, granted_at = now()
    WHERE id = v_assignment_id;
  END IF;

  UPDATE public.club_admin_invites
  SET consumed_at = now(), consumed_by_person = v_person_id
  WHERE id = v_invite.id;

  IF NOT COALESCE(v_was_active, false) THEN
    INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
    VALUES (
      v_invite.invited_by,
      'club_admin_invite_accepted',
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

  RETURN QUERY SELECT 'accepted'::text, v_invite.club_id, v_club_name;
END;
$$;

COMMENT ON FUNCTION public.accept_club_admin_invite(text) IS
  'MYK9-2211: the signed-in invitee presents the emailed one-time token. A live invite for a live club whose email equals the caller''s auth email becomes one active club-wide club_admin row (reusing an inactive one) and is stamped consumed. Returns accepted, already_accepted, expired, wrong_account or invalid. Touches no other role or club.';

REVOKE ALL ON FUNCTION public.accept_club_admin_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_club_admin_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
