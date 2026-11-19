-- MYK9-2211: a club admin invites an email with no account to become a club admin.
-- Everything rolls back.
--
-- Proves: inviting creates no role; the invite is consumed only when a confirmation step AFTER
-- sign-up proves the mailbox (email_confirmed_at > created_at) on an account created AFTER the
-- invite, and yields exactly one club-wide club_admin row for that club; an address with ANY
-- account (confirmed or not) is refused (pre-hijack); an account stamped confirmed at creation
-- never consumes; a deleted club grants nothing; an inactive club-wide row is reused; one person
-- invited by two clubs gets both in one confirmation; the five-send cap and the expired and
-- re-invite paths; an unrelated later auth.users update consumes nothing; cancel needs a fresh
-- sign-in confirmation; an unconfirmed sign-up, a cancelled invite and an expired invite grant
-- nothing; another club's invite grants nothing for
-- this club; a pending invite does not satisfy the last-admin guard; a second sign-in adds no
-- second row; an address with an account is refused; non-admins and another club's admin are
-- refused; anon cannot execute anything and the table is closed to clients; the step-up
-- re-authentication applies to inviting.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000221101', 'Invite Test Club A'),
  ('00000000-0000-0000-0000-000000221102', 'Invite Test Club B');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000221111', 'Alice', 'AdminA', 'alice.admin@example.test'),
  ('00000000-0000-0000-0000-000000221112', 'Bob', 'AdminB', 'bob.admin@example.test'),
  ('00000000-0000-0000-0000-000000221113', 'Plain', 'Bystander', 'bystander@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000221011', 'alice.admin@example.test'),
  ('00000000-0000-0000-0000-000000221012', 'bob.admin@example.test'),
  ('00000000-0000-0000-0000-000000221013', 'bystander@example.test')
) AS v(id, email);

-- Club A has exactly one admin who can sign in (Alice). Club B has Bob.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT v.person::uuid, r.id, v.club::uuid, true, v.auth::uuid
FROM public.roles r,
  (VALUES
    ('00000000-0000-0000-0000-000000221111', '00000000-0000-0000-0000-000000221101',
     '00000000-0000-0000-0000-000000221011'),
    ('00000000-0000-0000-0000-000000221112', '00000000-0000-0000-0000-000000221102',
     '00000000-0000-0000-0000-000000221012')
  ) AS v(person, club, auth)
WHERE r.name = 'club_admin';

-- Catalog privileges: anon cannot execute any RPC, authenticated can, the consumption function and
-- the table are closed to clients.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.invite_club_admin(uuid, text)',
    'public.resend_club_admin_invite(uuid)',
    'public.cancel_club_admin_invite(uuid)',
    'public.list_club_admin_invites(uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon can execute %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated cannot execute %', fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'private.consume_club_admin_invites(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.consume_club_admin_invites(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consume_club_admin_invites_trigger()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_club_admin_invites_trigger()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL a client can execute the consumption function';
  END IF;
  IF has_table_privilege('anon', 'public.club_admin_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'INSERT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'UPDATE')
     OR has_table_privilege('anon', 'public.club_admin_invites', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL a client has direct access to club_admin_invites';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_admin_invites'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS is off on club_admin_invites';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute, authenticated can, the table and consumption are closed';
END;
$$;

SET LOCAL ROLE authenticated;

-- Alice invites three addresses to club A and Bob invites one to club B. Nothing is granted.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
DECLARE
  v_club_a constant uuid := '00000000-0000-0000-0000-000000221101';
  v_roles_before bigint;
  v_res record;
  v_first uuid;
BEGIN
  SELECT count(*) INTO v_roles_before FROM public.user_roles;

  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, '  New.Person@Example.Test ');
  IF v_res.outcome IS DISTINCT FROM 'invited' OR v_res.invite_id IS NULL
     OR v_res.invite_email IS DISTINCT FROM 'new.person@example.test' THEN
    RAISE EXCEPTION 'FAIL first invite: %', v_res;
  END IF;
  v_first := v_res.invite_id;

  -- A second invite for the same live address reports it and creates nothing.
  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, 'new.person@example.test');
  IF v_res.outcome IS DISTINCT FROM 'already_invited' OR v_res.invite_id IS DISTINCT FROM v_first THEN
    RAISE EXCEPTION 'FAIL repeat invite: %', v_res;
  END IF;

  PERFORM public.invite_club_admin(v_club_a, 'cancelled.person@example.test');
  PERFORM public.invite_club_admin(v_club_a, 'expired.person@example.test');

  IF (SELECT count(*) FROM public.user_roles) <> v_roles_before THEN
    RAISE EXCEPTION 'FAIL inviting created a role row';
  END IF;

  -- An address that already has an account that can sign in is pointed to add_club_admin_by_email.
  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, 'Bystander@example.test');
  IF v_res.outcome IS DISTINCT FROM 'has_account' OR v_res.invite_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an address with an account was invited: %', v_res;
  END IF;

  BEGIN
    PERFORM * FROM public.invite_club_admin(v_club_a, 'not-an-email');
    RAISE EXCEPTION 'FAIL an invalid address was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.list_club_admin_invites(v_club_a)) <> 3 THEN
    RAISE EXCEPTION 'FAIL the pending list should hold three invites';
  END IF;
  RAISE NOTICE 'PASS inviting creates no role, repeats collapse, an existing account is refused';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221012', true);
DO $$
BEGIN
  PERFORM public.invite_club_admin('00000000-0000-0000-0000-000000221102', 'other.invitee@example.test');
END;
$$;

-- A non-admin and another club's admin are refused by all four. The table is closed to clients,
-- so the invite ids are read back as the owner first.
RESET ROLE;
CREATE TEMP TABLE _t (name text PRIMARY KEY, id uuid);
GRANT ALL ON _t TO PUBLIC;
INSERT INTO _t
SELECT email, id FROM public.club_admin_invites WHERE club_id = '00000000-0000-0000-0000-000000221101';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  who uuid;
  v_invite uuid := (SELECT id FROM _t WHERE name = 'new.person@example.test');
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000221013'::uuid,
    '00000000-0000-0000-0000-000000221012'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who::text, true);
    BEGIN
      PERFORM * FROM public.invite_club_admin(
        '00000000-0000-0000-0000-000000221101', 'sneaky@example.test');
      RAISE EXCEPTION 'FAIL % invited to a club they do not administer', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101');
      RAISE EXCEPTION 'FAIL % listed another club''s invites', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.resend_club_admin_invite(v_invite);
      RAISE EXCEPTION 'FAIL % resent another club''s invite', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.cancel_club_admin_invite(v_invite);
      RAISE EXCEPTION 'FAIL % cancelled another club''s invite', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS a non-admin and another club''s admin are refused by all four';
END;
$$;

-- Step-up: a missing or stale amr is refused with MKAUT; a fresh one passes.
DO $$
DECLARE
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('missing amr', false, NULL::integer),
      ('stale amr', false, 3600),
      ('fresh amr', true, 5)
    ) AS t(label, should_pass, age_seconds)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000221011', 'role', 'authenticated',
      'amr', CASE WHEN v_case.age_seconds IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object(
        'method', 'password',
        'timestamp', floor(extract(epoch FROM now())) - v_case.age_seconds)) END)::text, true);
    BEGIN
      PERFORM * FROM public.invite_club_admin(
        '00000000-0000-0000-0000-000000221101', 'stepup.check@example.test');
      IF NOT v_case.should_pass THEN
        RAISE EXCEPTION 'FAIL invite was allowed with a % token', v_case.label;
      END IF;
    EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
      IF v_case.should_pass THEN
        RAISE EXCEPTION 'FAIL invite was refused with a % token', v_case.label;
      END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PASS inviting needs a fresh sign-in confirmation';
END;
$$;

-- Pending invites do not satisfy the last-admin guard: Alice is the only admin who can sign in,
-- and invites are pending, yet she cannot remove herself.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.revoke_club_admin(
      '00000000-0000-0000-0000-000000221101', '00000000-0000-0000-0000-000000221111');
    RAISE EXCEPTION 'FAIL the last admin was removed while invites were pending';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  RAISE NOTICE 'PASS pending invites do not satisfy the last-admin guard';
END;
$$;

-- Resend: throttled, and cancel retires an invite.
DO $$
DECLARE
  v_invite uuid := (SELECT id FROM _t WHERE name = 'new.person@example.test');
  v_cancel uuid := (SELECT id FROM _t WHERE name = 'cancelled.person@example.test');
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.resend_club_admin_invite(v_invite);
  IF v_row.invite_email IS DISTINCT FROM 'new.person@example.test'
     OR v_row.club_name IS DISTINCT FROM 'Invite Test Club A'
     OR v_row.inviter_name IS DISTINCT FROM 'Alice AdminA' THEN
    RAISE EXCEPTION 'FAIL resend returned the wrong details: %', v_row;
  END IF;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_invite);
    RAISE EXCEPTION 'FAIL an immediate second resend was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;

  PERFORM public.cancel_club_admin_invite(v_cancel);
  PERFORM public.cancel_club_admin_invite(v_cancel); -- idempotent
  IF EXISTS (SELECT 1 FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101') l
             WHERE l.invite_email = 'cancelled.person@example.test') THEN
    RAISE EXCEPTION 'FAIL a cancelled invite is still listed';
  END IF;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_cancel);
    RAISE EXCEPTION 'FAIL a cancelled invite was resent';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  RAISE NOTICE 'PASS resend is throttled and refused once cancelled; cancel retires an invite';
END;
$$;

-- Expire one invite, as the owner.
RESET ROLE;
UPDATE public.club_admin_invites SET expires_at = now() - interval '1 hour'
WHERE email = 'expired.person@example.test';

-- Sign-ups. The invitee creates an account with the invited address, unconfirmed: nothing yet.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', NULL, NULL, now() + interval '1 hour', now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000221021', 'new.person@example.test'),
  ('00000000-0000-0000-0000-000000221022', 'cancelled.person@example.test'),
  ('00000000-0000-0000-0000-000000221023', 'expired.person@example.test'),
  ('00000000-0000-0000-0000-000000221024', 'other.invitee@example.test')
) AS v(id, email);

-- Everyone confirms the mailbox after sign-up. Only the live invites consume.
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id IN ('00000000-0000-0000-0000-000000221022', '00000000-0000-0000-0000-000000221023');

DO $$
DECLARE
  v_new uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221021');
  v_cancelled uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221022');
  v_expired uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221023');
BEGIN
  IF v_new IS NULL OR v_cancelled IS NULL OR v_expired IS NULL THEN
    RAISE EXCEPTION 'FAIL sign-up did not link a people row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_new) THEN
    RAISE EXCEPTION 'FAIL an unconfirmed sign-up was given a role';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email = 'new.person@example.test' AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL an invite was consumed by an unconfirmed email';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id IN (v_cancelled, v_expired)) THEN
    RAISE EXCEPTION 'FAIL a cancelled or expired invite granted a role';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email IN ('cancelled.person@example.test', 'expired.person@example.test')
               AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a cancelled or expired invite was consumed';
  END IF;
  RAISE NOTICE 'PASS unconfirmed, cancelled and expired invites grant nothing';
END;
$$;

-- The invitee confirms the email and signs in: exactly one club-wide row for club A, nothing else.
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours', last_sign_in_at = now()
WHERE id IN ('00000000-0000-0000-0000-000000221021', '00000000-0000-0000-0000-000000221024');
-- A second sign-in adds nothing.
UPDATE auth.users SET last_sign_in_at = now() + interval '1 minute'
WHERE id = '00000000-0000-0000-0000-000000221021';

DO $$
DECLARE
  v_new uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221021');
  v_row record;
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE user_id = v_new) <> 1 THEN
    RAISE EXCEPTION 'FAIL the invitee should hold exactly one role row, has %',
      (SELECT count(*) FROM public.user_roles WHERE user_id = v_new);
  END IF;
  SELECT ur.*, r.name AS role_name INTO v_row
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = v_new;
  IF v_row.role_name IS DISTINCT FROM 'club_admin'
     OR v_row.club_id IS DISTINCT FROM '00000000-0000-0000-0000-000000221101'::uuid
     OR v_row.show_id IS NOT NULL OR NOT v_row.is_active OR v_row.expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the consumed role is wrong: %', v_row;
  END IF;
  IF v_row.granted_by IS DISTINCT FROM '00000000-0000-0000-0000-000000221111'::uuid THEN
    RAISE EXCEPTION 'FAIL granted_by should be the inviter: %', v_row.granted_by;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_admin_invites
    WHERE email = 'new.person@example.test' AND consumed_at IS NOT NULL
      AND consumed_by_person = v_new) THEN
    RAISE EXCEPTION 'FAIL the invite was not stamped consumed by the invitee';
  END IF;
  RAISE NOTICE 'PASS consumption on first verified sign-in creates exactly one row for that club';
END;
$$;

-- Another club's invite grants nothing for this club, and this club's grants nothing for that one.
DO $$
DECLARE
  v_other uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221024');
  v_new uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221021');
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE user_id = v_other) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.user_roles
                    WHERE user_id = v_other AND club_id = '00000000-0000-0000-0000-000000221102') THEN
    RAISE EXCEPTION 'FAIL club B''s invitee should hold exactly one role, for club B';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = v_other AND club_id = '00000000-0000-0000-0000-000000221101') THEN
    RAISE EXCEPTION 'FAIL club B''s invite granted a role at club A';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = v_new AND club_id = '00000000-0000-0000-0000-000000221102') THEN
    RAISE EXCEPTION 'FAIL club A''s invite granted a role at club B';
  END IF;
  -- Alice's own row was never touched.
  IF (SELECT count(*) FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000221111') <> 1
     OR (SELECT expires_at FROM public.user_roles
         WHERE user_id = '00000000-0000-0000-0000-000000221111') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an existing admin row was changed';
  END IF;
  RAISE NOTICE 'PASS an invite grants only for its own club and touches no other row';
END;
$$;

-- ===========================================================================
-- Review round: pre-hijack, mailbox proof, creation order, club state, caps, cancel step-up.
-- Sign-ups below are created one hour after the invites (the transaction's now()) and their
-- mailbox is confirmed two hours after.
-- ===========================================================================
INSERT INTO public.clubs (id, name, deleted_at)
VALUES
  ('00000000-0000-0000-0000-000000221103', 'Invite Test Club C (deleted)', now());

-- Owner-made invites for the cases that need a particular shape.
INSERT INTO public.club_admin_invites (club_id, email, invited_by)
VALUES
  ('00000000-0000-0000-0000-000000221101', 'two.clubs@example.test', '00000000-0000-0000-0000-000000221111'),
  ('00000000-0000-0000-0000-000000221102', 'two.clubs@example.test', '00000000-0000-0000-0000-000000221112'),
  ('00000000-0000-0000-0000-000000221103', 'deleted.club@example.test', '00000000-0000-0000-0000-000000221111'),
  ('00000000-0000-0000-0000-000000221101', 'reuse.row@example.test', '00000000-0000-0000-0000-000000221111'),
  ('00000000-0000-0000-0000-000000221101', 'stamped@example.test', '00000000-0000-0000-0000-000000221111'),
  ('00000000-0000-0000-0000-000000221101', 'unrelated@example.test', '00000000-0000-0000-0000-000000221111');
-- An invite made AFTER the account existed (created_at later than the account's).
INSERT INTO public.club_admin_invites (club_id, email, invited_by, created_at)
VALUES
  ('00000000-0000-0000-0000-000000221101', 'late.invite@example.test',
   '00000000-0000-0000-0000-000000221111', now() + interval '90 minutes');

-- Pre-hijack: an unconfirmed account already holds the address. It is refused, no invite is made.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', v.confirmed, NULL, v.created, now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000221031', 'victim@example.test', NULL::timestamptz, now() - interval '1 day'),
  -- Confirmed at creation (OAuth, admin-created, confirmations off): created_at = confirmed_at.
  ('00000000-0000-0000-0000-000000221032', 'stamped@example.test', now() + interval '1 hour', now() + interval '1 hour'),
  -- Account older than its invite.
  ('00000000-0000-0000-0000-000000221033', 'late.invite@example.test', NULL, now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000221034', 'two.clubs@example.test', NULL, now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000221035', 'deleted.club@example.test', NULL, now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000221036', 'reuse.row@example.test', NULL, now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000221037', 'unrelated@example.test', NULL, now() + interval '1 hour')
) AS v(id, email, confirmed, created);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
DECLARE
  v_res record;
BEGIN
  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'Victim@example.test');
  IF v_res.outcome IS DISTINCT FROM 'has_account' OR v_res.invite_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an address with an unconfirmed account was invited: %', v_res;
  END IF;
  RAISE NOTICE 'PASS an address with any account, confirmed or not, is refused (pre-hijack)';
END;
$$;

-- Re-invite after a lapse; an expired invite is still listed, as expired, and cannot be resent.
RESET ROLE;
INSERT INTO public.club_admin_invites (club_id, email, invited_by, created_at, expires_at)
VALUES ('00000000-0000-0000-0000-000000221101', 'lapse@example.test',
        '00000000-0000-0000-0000-000000221111', now() - interval '20 days', now() - interval '6 days');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_old uuid;
  v_res record;
  v_hint text;
BEGIN
  RESET ROLE;
  SELECT id INTO v_old FROM public.club_admin_invites WHERE email = 'lapse@example.test';
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101')
                 WHERE invite_id = v_old AND is_expired) THEN
    RAISE EXCEPTION 'FAIL an expired invite is not listed as expired';
  END IF;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_old);
    RAISE EXCEPTION 'FAIL an expired invite was resent';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'expired' THEN
      RAISE EXCEPTION 'FAIL expired resend hint was %', v_hint;
    END IF;
  END;

  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'lapse@example.test');
  IF v_res.outcome IS DISTINCT FROM 'invited' OR v_res.invite_id IS NOT DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'FAIL re-inviting after a lapse did not create a new invite: %', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101')
             WHERE invite_id = v_old) THEN
    RAISE EXCEPTION 'FAIL the lapsed invite is still listed after re-inviting';
  END IF;
  RAISE NOTICE 'PASS expired invites are listed as expired; re-inviting after a lapse works';
END;
$$;

-- The five-send cap: the fifth send passes, the sixth is refused with the cap reason.
RESET ROLE;
UPDATE public.club_admin_invites SET send_count = 4, last_sent_at = NULL
WHERE email = 'lapse@example.test' AND cancelled_at IS NULL;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid;
  v_hint text;
BEGIN
  RESET ROLE;
  SELECT id INTO v_id FROM public.club_admin_invites
  WHERE email = 'lapse@example.test' AND cancelled_at IS NULL;
  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.resend_club_admin_invite(v_id); -- fifth send
  RESET ROLE;
  UPDATE public.club_admin_invites SET last_sent_at = now() - interval '1 minute' WHERE id = v_id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_id);
    RAISE EXCEPTION 'FAIL a sixth send was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM 'cap' THEN
      RAISE EXCEPTION 'FAIL the cap refusal hint was %', v_hint;
    END IF;
  END;
  RAISE NOTICE 'PASS the fifth send passes and the sixth is refused with the cap reason';
END;
$$;

-- Cancel needs a fresh sign-in confirmation; resend does not.
DO $$
DECLARE
  v_id uuid;
  v_case record;
BEGIN
  RESET ROLE;
  SELECT id INTO v_id FROM public.club_admin_invites
  WHERE email = 'stamped@example.test' AND cancelled_at IS NULL;
  SET LOCAL ROLE authenticated;
  FOR v_case IN
    SELECT * FROM (VALUES
      ('missing amr', false, NULL::integer),
      ('stale amr', false, 3600)
    ) AS t(label, should_pass, age_seconds)
  LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000221011', 'role', 'authenticated',
      'amr', CASE WHEN v_case.age_seconds IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object(
        'method', 'password',
        'timestamp', floor(extract(epoch FROM now())) - v_case.age_seconds)) END)::text, true);
    BEGIN
      PERFORM public.cancel_club_admin_invite(v_id);
      RAISE EXCEPTION 'FAIL cancel was allowed with a % token', v_case.label;
    EXCEPTION WHEN SQLSTATE 'MKAUT' THEN NULL;
    END;
    -- Resend grants nothing and stays available without a fresh confirmation.
    PERFORM * FROM public.resend_club_admin_invite(v_id);
    RESET ROLE;
    UPDATE public.club_admin_invites SET last_sent_at = NULL, send_count = 0 WHERE id = v_id;
    SET LOCAL ROLE authenticated;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.club_admin_invites WHERE id = v_id AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a refused cancel still cancelled the invite';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000221011', 'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password', 'timestamp', floor(extract(epoch FROM now())) - 5)))::text, true);
  PERFORM public.cancel_club_admin_invite(v_id);
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.club_admin_invites WHERE id = v_id AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL cancel with a fresh token did not cancel';
  END IF;
  RAISE NOTICE 'PASS cancel needs a fresh sign-in confirmation; resend does not';
END;
$$;
-- Re-open it for the mailbox-proof case below (the cancel above was only the step-up check).
RESET ROLE;
UPDATE public.club_admin_invites SET cancelled_at = NULL WHERE email = 'stamped@example.test';

-- Mailbox proof: an account stamped confirmed AT creation never consumes, however it later
-- changes; calling the function directly consumes nothing either.
UPDATE auth.users SET last_sign_in_at = now() + interval '3 hours'
WHERE id = '00000000-0000-0000-0000-000000221032';
UPDATE auth.users SET raw_user_meta_data = '{"x": 1}'
WHERE id = '00000000-0000-0000-0000-000000221032';
DO $$
BEGIN
  IF private.consume_club_admin_invites('00000000-0000-0000-0000-000000221032') <> 0 THEN
    RAISE EXCEPTION 'FAIL an account confirmed at creation consumed an invite';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email = 'stamped@example.test' AND consumed_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.people p ON p.id = ur.user_id
                WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221032') THEN
    RAISE EXCEPTION 'FAIL an account confirmed at creation was given a role';
  END IF;
  RAISE NOTICE 'PASS email_confirmed_at must come after created_at (mailbox proof)';
END;
$$;

-- An invite made after the account existed is not consumed by that account's confirmation.
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id = '00000000-0000-0000-0000-000000221033';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email = 'late.invite@example.test' AND consumed_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.people p ON p.id = ur.user_id
                WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221033') THEN
    RAISE EXCEPTION 'FAIL an invite made after the account existed was consumed';
  END IF;
  RAISE NOTICE 'PASS only an account created after the invite can consume it';
END;
$$;

-- No consumption on an unrelated later update, then the confirmation consumes.
UPDATE auth.users SET last_sign_in_at = now() + interval '90 minutes', raw_user_meta_data = '{"y": 2}'
WHERE id = '00000000-0000-0000-0000-000000221037';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email = 'unrelated@example.test' AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL an unrelated auth.users update consumed an invite';
  END IF;
  RAISE NOTICE 'PASS an unrelated later auth.users update consumes nothing';
END;
$$;
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id = '00000000-0000-0000-0000-000000221037';
UPDATE auth.users SET last_sign_in_at = now() + interval '3 hours'
WHERE id = '00000000-0000-0000-0000-000000221037';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.people p ON p.id = ur.user_id
      WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221037') <> 1 THEN
    RAISE EXCEPTION 'FAIL the confirmation did not consume exactly once';
  END IF;
END;
$$;

-- One person invited by two clubs: both consumed by one confirmation.
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id = '00000000-0000-0000-0000-000000221034';
DO $$
DECLARE
  v_person uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221034');
BEGIN
  IF (SELECT count(*) FROM public.user_roles
      WHERE user_id = v_person AND show_id IS NULL AND is_active
        AND club_id IN ('00000000-0000-0000-0000-000000221101', '00000000-0000-0000-0000-000000221102')) <> 2
     OR (SELECT count(*) FROM public.club_admin_invites
         WHERE email = 'two.clubs@example.test' AND consumed_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL two clubs'' invites were not both consumed in one sign-in';
  END IF;
  RAISE NOTICE 'PASS one person invited by two clubs gets both roles in one confirmation';
END;
$$;

-- A club deleted after the invite grants nothing, and its invite is not consumed.
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id = '00000000-0000-0000-0000-000000221035';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.people p ON p.id = ur.user_id
             WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221035')
     OR EXISTS (SELECT 1 FROM public.club_admin_invites
                WHERE email = 'deleted.club@example.test' AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL an invite to a deleted club was consumed';
  END IF;
  RAISE NOTICE 'PASS a deleted club grants nothing';
END;
$$;

-- An inactive club-wide club_admin row for the same person is reused, not duplicated.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active)
SELECT p.id, r.id, '00000000-0000-0000-0000-000000221101', false
FROM public.people p, public.roles r
WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221036' AND r.name = 'club_admin';
UPDATE auth.users SET email_confirmed_at = now() + interval '2 hours'
WHERE id = '00000000-0000-0000-0000-000000221036';
DO $$
DECLARE
  v_person uuid := (SELECT id FROM public.people WHERE auth_user_id = '00000000-0000-0000-0000-000000221036');
BEGIN
  IF (SELECT count(*) FROM public.user_roles
      WHERE user_id = v_person AND club_id = '00000000-0000-0000-0000-000000221101') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.user_roles
                    WHERE user_id = v_person AND club_id = '00000000-0000-0000-0000-000000221101'
                      AND is_active AND expires_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.club_admin_invites
                    WHERE email = 'reuse.row@example.test' AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the inactive club-wide row was not reused';
  END IF;
  RAISE NOTICE 'PASS an inactive club-wide club_admin row is revived, not duplicated';
END;
$$;

ROLLBACK;
