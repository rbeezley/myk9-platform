-- MYK9-2211: a club admin invites an email with no account to become a club admin, and the
-- invitee accepts with an emailed one-time token. Everything rolls back.
--
-- Failure sentinels raise SQLSTATE ZZ999 so no expected-refusal handler (P0001, 42501, MKAUT,
-- 22023) can swallow them. Role assertions are scoped to club_admin because handle_new_user
-- gives every sign-up the global exhibitor role. Invite state is read as the owner, never as
-- authenticated (the table is closed to clients).
--
-- Proves: inviting creates no role and no token; each send mints a random token of which only the
-- sha256 hash is stored, and a resend rotates it; accept with the right token and the matching
-- account gives exactly one club-wide club_admin row for that club (other roles and clubs
-- untouched); a wrong account, a reused token, a cancelled invite, an expired invite, a deleted
-- club, a rotated-out token and a malformed token grant nothing; a stale session cannot accept
-- for someone else; accepting works even when the account's email was never confirmed (the token
-- is the mailbox proof); cancel after accept reports already_accepted, cancel of a cancelled
-- invite is idempotent; an address with ANY account is refused at invite time (pre-hijack); the
-- five-send cap, expiry and re-invite paths; a pending invite does not satisfy the last-admin
-- guard; cancel needs a fresh sign-in confirmation; non-admins and another club's admin are
-- refused; anon cannot execute anything and the table is closed to clients; no auth.users
-- trigger consumes invites.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000221101', 'Invite Test Club A'),
  ('00000000-0000-0000-0000-000000221102', 'Invite Test Club B'),
  ('00000000-0000-0000-0000-000000221103', 'Invite Test Club C');

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

-- Scratch tables the authenticated role may write: minted tokens and recorded accept outcomes.
CREATE TEMP TABLE _t (name text PRIMARY KEY, id uuid, token text);
CREATE TEMP TABLE _r (label text PRIMARY KEY, outcome text, club_id uuid);
GRANT ALL ON _t, _r TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Catalog privileges and the absence of any auth.users trigger.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.invite_club_admin(uuid, text)',
    'public.resend_club_admin_invite(uuid)',
    'public.cancel_club_admin_invite(uuid)',
    'public.list_club_admin_invites(uuid)',
    'public.accept_club_admin_invite(text)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon can execute %', fn USING ERRCODE = 'ZZ999';
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated cannot execute %', fn USING ERRCODE = 'ZZ999';
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.club_admin_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'INSERT')
     OR has_table_privilege('authenticated', 'public.club_admin_invites', 'UPDATE')
     OR has_table_privilege('anon', 'public.club_admin_invites', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL a client has direct access to club_admin_invites'
      USING ERRCODE = 'ZZ999';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.club_admin_invites'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS is off on club_admin_invites' USING ERRCODE = 'ZZ999';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname LIKE '%club_admin_invite%'
  ) THEN
    RAISE EXCEPTION 'FAIL an auth.users trigger consumes club admin invites'
      USING ERRCODE = 'ZZ999';
  END IF;
  IF to_regprocedure('private.consume_club_admin_invites(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the trigger-era consume function still exists' USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute, authenticated can, the table is closed, no trigger';
END;
$$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Alice invites addresses to club A and Bob one to club B. Inviting creates no role and no token.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
DECLARE
  v_club_a constant uuid := '00000000-0000-0000-0000-000000221101';
  v_roles_before bigint;
  v_res record;
  v_first uuid;
  v_email text;
BEGIN
  SELECT count(*) INTO v_roles_before FROM public.user_roles;

  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, '  New.Person@Example.Test ');
  IF v_res.outcome IS DISTINCT FROM 'invited' OR v_res.invite_id IS NULL
     OR v_res.invite_email IS DISTINCT FROM 'new.person@example.test' THEN
    RAISE EXCEPTION 'FAIL first invite: %', v_res USING ERRCODE = 'ZZ999';
  END IF;
  v_first := v_res.invite_id;

  -- A second invite for the same live address reports it and creates nothing.
  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, 'new.person@example.test');
  IF v_res.outcome IS DISTINCT FROM 'already_invited' OR v_res.invite_id IS DISTINCT FROM v_first THEN
    RAISE EXCEPTION 'FAIL repeat invite: %', v_res USING ERRCODE = 'ZZ999';
  END IF;

  FOREACH v_email IN ARRAY ARRAY[
    'cancelled.person@example.test', 'expired.person@example.test', 'right.person@example.test',
    'reuse.row@example.test', 'two.clubs@example.test', 'race.person@example.test',
    'rotated.person@example.test', 'unconfirmed@example.test'
  ] LOOP
    PERFORM public.invite_club_admin(v_club_a, v_email);
  END LOOP;

  IF (SELECT count(*) FROM public.user_roles) <> v_roles_before THEN
    RAISE EXCEPTION 'FAIL inviting created a role row' USING ERRCODE = 'ZZ999';
  END IF;

  -- An address that already has an account that can sign in is pointed to add_club_admin_by_email.
  SELECT * INTO v_res FROM public.invite_club_admin(v_club_a, 'Bystander@example.test');
  IF v_res.outcome IS DISTINCT FROM 'has_account' OR v_res.invite_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an address with an account was invited: %', v_res USING ERRCODE = 'ZZ999';
  END IF;

  BEGIN
    PERFORM * FROM public.invite_club_admin(v_club_a, 'not-an-email');
    RAISE EXCEPTION 'FAIL an invalid address was accepted' USING ERRCODE = 'ZZ999';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.list_club_admin_invites(v_club_a)) <> 9 THEN
    RAISE EXCEPTION 'FAIL the pending list should hold nine invites' USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS inviting creates no role, repeats collapse, an existing account is refused';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221012', true);
DO $$
BEGIN
  PERFORM public.invite_club_admin('00000000-0000-0000-0000-000000221102', 'two.clubs@example.test');
END;
$$;

-- Owner view: no token has been minted by inviting alone.
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_admin_invites WHERE token_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL inviting stored a token hash before any send' USING ERRCODE = 'ZZ999';
  END IF;
END;
$$;
INSERT INTO _t (name, id)
SELECT email || '|' || club_id::text, id FROM public.club_admin_invites;
SET LOCAL ROLE authenticated;

-- A non-admin and another club's admin are refused by all four admin RPCs.
DO $$
DECLARE
  who uuid;
  v_invite uuid := (SELECT id FROM _t WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101');
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000221013'::uuid,
    '00000000-0000-0000-0000-000000221012'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who::text, true);
    BEGIN
      PERFORM * FROM public.invite_club_admin(
        '00000000-0000-0000-0000-000000221101', 'sneaky@example.test');
      RAISE EXCEPTION 'FAIL % invited to a club they do not administer', who USING ERRCODE = 'ZZ999';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101');
      RAISE EXCEPTION 'FAIL % listed another club''s invites', who USING ERRCODE = 'ZZ999';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.resend_club_admin_invite(v_invite);
      RAISE EXCEPTION 'FAIL % resent another club''s invite', who USING ERRCODE = 'ZZ999';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.cancel_club_admin_invite(v_invite);
      RAISE EXCEPTION 'FAIL % cancelled another club''s invite', who USING ERRCODE = 'ZZ999';
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
        RAISE EXCEPTION 'FAIL invite was allowed with a % token', v_case.label
          USING ERRCODE = 'ZZ999';
      END IF;
    EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
      IF v_case.should_pass THEN
        RAISE EXCEPTION 'FAIL invite was refused with a % token', v_case.label
          USING ERRCODE = 'ZZ999';
      END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PASS inviting needs a fresh sign-in confirmation';
END;
$$;

-- Pending invites do not satisfy the last-admin guard: Alice is the only admin who can sign in,
-- and invites are pending, yet she cannot remove herself. The refusal is asserted by its message
-- outside the handler's reach: a wrongly successful revoke is the only way to reach the sentinel.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM public.revoke_club_admin(
      '00000000-0000-0000-0000-000000221101', '00000000-0000-0000-0000-000000221111');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL the last admin was removed while invites were pending'
      USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS pending invites do not satisfy the last-admin guard';
END;
$$;

-- ---------------------------------------------------------------------------
-- Sends mint tokens. Only the hash is stored; a repeat send is throttled; a resend rotates.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_email text;
  v_id uuid;
  v_row record;
  v_refused boolean;
BEGIN
  FOREACH v_email IN ARRAY ARRAY[
    'new.person@example.test', 'cancelled.person@example.test', 'expired.person@example.test',
    'right.person@example.test', 'reuse.row@example.test', 'two.clubs@example.test',
    'race.person@example.test', 'rotated.person@example.test', 'unconfirmed@example.test'
  ] LOOP
    v_id := (SELECT id FROM _t
             WHERE name = v_email || '|00000000-0000-0000-0000-000000221101');
    SELECT * INTO v_row FROM public.resend_club_admin_invite(v_id);
    IF v_row.invite_email IS DISTINCT FROM v_email
       OR v_row.club_name IS DISTINCT FROM 'Invite Test Club A'
       OR v_row.inviter_name IS DISTINCT FROM 'Alice AdminA'
       OR v_row.invite_token IS NULL OR v_row.invite_token !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'FAIL send returned the wrong details: %', v_row USING ERRCODE = 'ZZ999';
    END IF;
    UPDATE _t SET token = v_row.invite_token WHERE id = v_id;
  END LOOP;

  -- An immediate second send is throttled.
  v_refused := false;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(
      (SELECT id FROM _t WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101'));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL an immediate second send was allowed' USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS each send mints a token and the throttle holds';
END;
$$;

-- Bob sends club B's invite for the two-clubs person.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221012', true);
DO $$
DECLARE
  v_id uuid := (SELECT id FROM _t
                WHERE name = 'two.clubs@example.test|00000000-0000-0000-0000-000000221102');
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.resend_club_admin_invite(v_id);
  INSERT INTO _t (name, id, token)
  VALUES ('two.clubs@example.test|B-token', v_id, v_row.invite_token);
END;
$$;

-- Owner view: the table holds only hashes, never a raw token.
RESET ROLE;
DO $$
DECLARE
  v_token text := (SELECT token FROM _t
                   WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101');
BEGIN
  IF (SELECT count(*) FROM public.club_admin_invites WHERE token_hash IS NOT NULL) <> 10 THEN
    RAISE EXCEPTION 'FAIL ten sends should leave ten token hashes' USING ERRCODE = 'ZZ999';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_admin_invites
                 WHERE token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')) THEN
    RAISE EXCEPTION 'FAIL the stored value is not the sha256 of the emailed token'
      USING ERRCODE = 'ZZ999';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_admin_invites i, _t
             WHERE _t.token IS NOT NULL AND i.token_hash = _t.token) THEN
    RAISE EXCEPTION 'FAIL a raw token is stored' USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS only the sha256 of the emailed token is stored';
END;
$$;

-- Rotation: a second send (after the throttle) mints a new token and the old one stops working.
UPDATE public.club_admin_invites SET last_sent_at = now() - interval '1 minute'
WHERE email = 'rotated.person@example.test';
INSERT INTO _t (name, id, token)
SELECT 'rotated.person@example.test|old', id, (SELECT token FROM _t t2
  WHERE t2.name = 'rotated.person@example.test|00000000-0000-0000-0000-000000221101')
FROM _t WHERE name = 'rotated.person@example.test|00000000-0000-0000-0000-000000221101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.resend_club_admin_invite(
    (SELECT id FROM _t WHERE name = 'rotated.person@example.test|00000000-0000-0000-0000-000000221101'));
  IF v_row.invite_token = (SELECT token FROM _t WHERE name = 'rotated.person@example.test|old') THEN
    RAISE EXCEPTION 'FAIL a resend re-used the earlier token' USING ERRCODE = 'ZZ999';
  END IF;
  UPDATE _t SET token = v_row.invite_token
  WHERE name = 'rotated.person@example.test|00000000-0000-0000-0000-000000221101';
END;
$$;

-- Cancel one invite (cancelled.person) and expire another (as the owner below).
DO $$
DECLARE
  v_cancel uuid := (SELECT id FROM _t
                    WHERE name = 'cancelled.person@example.test|00000000-0000-0000-0000-000000221101');
  v_out text;
BEGIN
  v_out := public.cancel_club_admin_invite(v_cancel);
  IF v_out IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'FAIL cancel returned %', v_out USING ERRCODE = 'ZZ999';
  END IF;
  v_out := public.cancel_club_admin_invite(v_cancel);
  IF v_out IS DISTINCT FROM 'already_cancelled' THEN
    RAISE EXCEPTION 'FAIL a second cancel returned %', v_out USING ERRCODE = 'ZZ999';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101') l
             WHERE l.invite_email = 'cancelled.person@example.test') THEN
    RAISE EXCEPTION 'FAIL a cancelled invite is still listed' USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS cancel retires an invite and is idempotent';
END;
$$;

DO $$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(
      (SELECT id FROM _t WHERE name = 'cancelled.person@example.test|00000000-0000-0000-0000-000000221101'));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL a cancelled invite was sent' USING ERRCODE = 'ZZ999';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.club_admin_invites SET expires_at = now() - interval '1 hour'
WHERE email = 'expired.person@example.test';

-- A deleted club: the invite exists with a known token, then the club is soft-deleted.
INSERT INTO public.club_admin_invites (club_id, email, invited_by, token_hash, expires_at)
VALUES (
  '00000000-0000-0000-0000-000000221103', 'deleted.club@example.test',
  '00000000-0000-0000-0000-000000221111',
  encode(sha256(convert_to('deleted-club-token-0123456789abcdef0123', 'UTF8')), 'hex'),
  now() + interval '14 days'
);
UPDATE public.clubs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000221103';

-- ---------------------------------------------------------------------------
-- Sign-ups. Every invitee creates an account with the invited address and NEVER confirms it
-- (email_confirmed_at NULL): the token, not the confirmation, is the mailbox proof.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', NULL, NULL, now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000221021', 'new.person@example.test'),
  ('00000000-0000-0000-0000-000000221022', 'cancelled.person@example.test'),
  ('00000000-0000-0000-0000-000000221023', 'expired.person@example.test'),
  ('00000000-0000-0000-0000-000000221024', 'right.person@example.test'),
  ('00000000-0000-0000-0000-000000221025', 'wrong.person@example.test'),
  ('00000000-0000-0000-0000-000000221026', 'deleted.club@example.test'),
  ('00000000-0000-0000-0000-000000221027', 'reuse.row@example.test'),
  ('00000000-0000-0000-0000-000000221028', 'two.clubs@example.test'),
  ('00000000-0000-0000-0000-000000221029', 'race.person@example.test'),
  ('00000000-0000-0000-0000-000000221030', 'rotated.person@example.test'),
  ('00000000-0000-0000-0000-000000221031', 'Unconfirmed@Example.Test')
) AS v(id, email);

-- reuse.row's person already holds an INACTIVE club-wide row for club A.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active)
SELECT p.id, r.id, '00000000-0000-0000-0000-000000221101', false
FROM public.people p, public.roles r
WHERE p.auth_user_id = '00000000-0000-0000-0000-000000221027' AND r.name = 'club_admin';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE auth_user_id BETWEEN '00000000-0000-0000-0000-000000221021'::uuid
                             AND '00000000-0000-0000-0000-000000221031'::uuid) <> 11 THEN
    RAISE EXCEPTION 'FAIL sign-up did not link every people row' USING ERRCODE = 'ZZ999';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE r.name = 'club_admin' AND ur.is_active
      AND p.auth_user_id BETWEEN '00000000-0000-0000-0000-000000221021'::uuid
                             AND '00000000-0000-0000-0000-000000221031'::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL signing up alone gave a club_admin role' USING ERRCODE = 'ZZ999';
  END IF;
END;
$$;

-- Snapshot non-club_admin roles so "other roles untouched" can be proven after accepting.
CREATE TEMP TABLE _other_roles AS
SELECT ur.user_id, ur.role_id, ur.club_id
FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
WHERE r.name <> 'club_admin';

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Accept: every case records its outcome as the caller; state is asserted as the owner after.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_case record;
  v_res record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      -- label, signed-in account, token source (invite name or a literal)
      ('right token, right account', '00000000-0000-0000-0000-000000221021',
        (SELECT token FROM _t WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('reused token, same account', '00000000-0000-0000-0000-000000221021',
        (SELECT token FROM _t WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('reused token, other account', '00000000-0000-0000-0000-000000221025',
        (SELECT token FROM _t WHERE name = 'new.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('wrong account', '00000000-0000-0000-0000-000000221025',
        (SELECT token FROM _t WHERE name = 'right.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('cancelled', '00000000-0000-0000-0000-000000221022',
        (SELECT token FROM _t WHERE name = 'cancelled.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('expired', '00000000-0000-0000-0000-000000221023',
        (SELECT token FROM _t WHERE name = 'expired.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('deleted club', '00000000-0000-0000-0000-000000221026',
        'deleted-club-token-0123456789abcdef0123'),
      ('rotated out token', '00000000-0000-0000-0000-000000221030',
        (SELECT token FROM _t WHERE name = 'rotated.person@example.test|old')),
      ('rotated new token', '00000000-0000-0000-0000-000000221030',
        (SELECT token FROM _t WHERE name = 'rotated.person@example.test|00000000-0000-0000-0000-000000221101')),
      ('malformed token', '00000000-0000-0000-0000-000000221024', 'short'),
      ('unknown token', '00000000-0000-0000-0000-000000221024',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
      ('unconfirmed account, mixed case', '00000000-0000-0000-0000-000000221031',
        (SELECT token FROM _t WHERE name = 'unconfirmed@example.test|00000000-0000-0000-0000-000000221101')),
      ('reuse inactive row', '00000000-0000-0000-0000-000000221027',
        (SELECT token FROM _t WHERE name = 'reuse.row@example.test|00000000-0000-0000-0000-000000221101')),
      ('two clubs, club A', '00000000-0000-0000-0000-000000221028',
        (SELECT token FROM _t WHERE name = 'two.clubs@example.test|00000000-0000-0000-0000-000000221101')),
      ('two clubs, club B', '00000000-0000-0000-0000-000000221028',
        (SELECT token FROM _t WHERE name = 'two.clubs@example.test|B-token')),
      ('right account after the wrong one tried', '00000000-0000-0000-0000-000000221024',
        (SELECT token FROM _t WHERE name = 'right.person@example.test|00000000-0000-0000-0000-000000221101'))
    ) AS t(label, who, token)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_case.who, true);
    SELECT * INTO v_res FROM public.accept_club_admin_invite(v_case.token);
    INSERT INTO _r VALUES (v_case.label, v_res.outcome, v_res.club_id);
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

-- No session: refused outright, and the malformed and anon paths grant nothing.
DO $$
DECLARE
  v_refused boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM * FROM public.accept_club_admin_invite(
      (SELECT token FROM _t WHERE name = 'race.person@example.test|00000000-0000-0000-0000-000000221101'));
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL accepting without a session was allowed' USING ERRCODE = 'ZZ999';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancel vs accept race: the invitee accepts, then the admin's stale page cancels.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_res record;
  v_invite uuid := (SELECT id FROM _t
                    WHERE name = 'race.person@example.test|00000000-0000-0000-0000-000000221101');
  v_out text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221029', true);
  SELECT * INTO v_res FROM public.accept_club_admin_invite(
    (SELECT token FROM _t WHERE name = 'race.person@example.test|00000000-0000-0000-0000-000000221101'));
  INSERT INTO _r VALUES ('race: accept first', v_res.outcome, v_res.club_id);

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
  v_out := public.cancel_club_admin_invite(v_invite);
  INSERT INTO _r VALUES ('race: cancel after accept', v_out, NULL);
  v_out := public.cancel_club_admin_invite(v_invite);
  INSERT INTO _r VALUES ('race: cancel again', v_out, NULL);
END;
$$;

-- Cancel needs a fresh sign-in confirmation; resend does not. Uses the unconfirmed@ invite, which
-- the account above has already accepted, so a fresh live invite is made for a new address.
DO $$
DECLARE
  v_res record;
  v_id uuid;
  v_case record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'stamped@example.test');
  v_id := v_res.invite_id;
  FOR v_case IN
    SELECT * FROM (VALUES ('missing amr', NULL::integer), ('stale amr', 3600)) AS t(label, age_seconds)
  LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000221011', 'role', 'authenticated',
      'amr', CASE WHEN v_case.age_seconds IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object(
        'method', 'password',
        'timestamp', floor(extract(epoch FROM now())) - v_case.age_seconds)) END)::text, true);
    BEGIN
      PERFORM public.cancel_club_admin_invite(v_id);
      RAISE EXCEPTION 'FAIL cancel was allowed with a % token', v_case.label USING ERRCODE = 'ZZ999';
    EXCEPTION WHEN SQLSTATE 'MKAUT' THEN NULL;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _t (name, id) VALUES ('stamped', v_id);
  -- Resend grants nothing and stays available without a fresh confirmation.
  PERFORM * FROM public.resend_club_admin_invite(v_id);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000221011', 'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password', 'timestamp', floor(extract(epoch FROM now())) - 5)))::text, true);
  INSERT INTO _r VALUES ('cancel with fresh token', public.cancel_club_admin_invite(v_id), NULL);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- Five-send cap, expiry and re-invite after a lapse.
DO $$
DECLARE
  v_res record;
BEGIN
  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'capped@example.test');
  INSERT INTO _t (name, id) VALUES ('capped', v_res.invite_id);
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_id uuid := (SELECT id FROM _t WHERE name = 'capped');
  v_i integer;
  v_refused boolean;
  v_hint text;
BEGIN
  FOR v_i IN 1..5 LOOP
    UPDATE public.club_admin_invites SET last_sent_at = NULL WHERE id = v_id;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
    PERFORM * FROM public.resend_club_admin_invite(v_id);
    RESET ROLE;
  END LOOP;
  UPDATE public.club_admin_invites SET last_sent_at = NULL WHERE id = v_id;
  SET LOCAL ROLE authenticated;
  v_refused := false;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    v_refused := true;
  END;
  RESET ROLE;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL a sixth send was allowed' USING ERRCODE = 'ZZ999';
  END IF;
  IF v_hint IS DISTINCT FROM 'cap' THEN
    RAISE EXCEPTION 'FAIL the cap refusal hint was %', v_hint USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS the sixth send is refused with the cap reason';
END;
$$;

-- Expired: listed as expired, cannot be sent, and re-inviting after the lapse makes a new invite.
UPDATE public.club_admin_invites SET expires_at = now() - interval '1 hour'
WHERE id = (SELECT id FROM _t WHERE name = 'capped');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (SELECT id FROM _t WHERE name = 'capped');
  v_refused boolean := false;
  v_hint text;
  v_res record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
  IF NOT EXISTS (SELECT 1 FROM public.list_club_admin_invites('00000000-0000-0000-0000-000000221101') l
                 WHERE l.invite_id = v_id AND l.is_expired) THEN
    RAISE EXCEPTION 'FAIL an expired invite is not listed as expired' USING ERRCODE = 'ZZ999';
  END IF;
  BEGIN
    PERFORM * FROM public.resend_club_admin_invite(v_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    v_refused := true;
  END;
  IF NOT v_refused OR v_hint IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'FAIL an expired invite was sent (hint %)', v_hint USING ERRCODE = 'ZZ999';
  END IF;
  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'capped@example.test');
  IF v_res.outcome IS DISTINCT FROM 'invited' OR v_res.invite_id = v_id THEN
    RAISE EXCEPTION 'FAIL re-inviting after a lapse did not create a new invite: %', v_res
      USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS expired invites are listed, refused for sending and replaced on re-invite';
END;
$$;

-- Pre-hijack: an unconfirmed account already holds the address. It is refused, no invite is made.
RESET ROLE;
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000221041', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'squatter@example.test', '', NULL, NULL, now(), now(),
  '{}', '{}', false, false, false
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_res record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000221011', true);
  SELECT * INTO v_res FROM public.invite_club_admin(
    '00000000-0000-0000-0000-000000221101', 'squatter@example.test');
  IF v_res.outcome IS DISTINCT FROM 'has_account' OR v_res.invite_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an address with an unconfirmed account was invited: %', v_res
      USING ERRCODE = 'ZZ999';
  END IF;
  RAISE NOTICE 'PASS an address with an unconfirmed account is refused';
END;
$$;

-- ---------------------------------------------------------------------------
-- Assertions on the recorded outcomes and on role state, as the owner.
-- ---------------------------------------------------------------------------
RESET ROLE;
DO $$
DECLARE
  c_a constant uuid := '00000000-0000-0000-0000-000000221101';
  c_b constant uuid := '00000000-0000-0000-0000-000000221102';
  v_case record;
  v_person uuid;
  v_count bigint;
  v_active boolean;
  v_row record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('right token, right account', 'accepted'),
      ('reused token, same account', 'already_accepted'),
      ('reused token, other account', 'invalid'),
      ('wrong account', 'wrong_account'),
      ('cancelled', 'invalid'),
      ('expired', 'expired'),
      ('deleted club', 'invalid'),
      ('rotated out token', 'invalid'),
      ('rotated new token', 'accepted'),
      ('malformed token', 'invalid'),
      ('unknown token', 'invalid'),
      ('unconfirmed account, mixed case', 'accepted'),
      ('reuse inactive row', 'accepted'),
      ('two clubs, club A', 'accepted'),
      ('two clubs, club B', 'accepted'),
      ('right account after the wrong one tried', 'accepted'),
      ('race: accept first', 'accepted'),
      ('race: cancel after accept', 'already_accepted'),
      ('race: cancel again', 'already_accepted'),
      ('cancel with fresh token', 'cancelled')
    ) AS t(label, expected)
  LOOP
    IF (SELECT outcome FROM _r WHERE label = v_case.label) IS DISTINCT FROM v_case.expected THEN
      RAISE EXCEPTION 'FAIL "%": expected %, got %', v_case.label, v_case.expected,
        (SELECT outcome FROM _r WHERE label = v_case.label) USING ERRCODE = 'ZZ999';
    END IF;
  END LOOP;

  -- Right token and account: exactly one active club-wide club_admin row, for club A only,
  -- granted by the inviter, and the invite stamped consumed.
  SELECT id INTO v_person FROM public.people
  WHERE auth_user_id = '00000000-0000-0000-0000-000000221021';
  SELECT count(*) INTO v_count
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_person AND r.name = 'club_admin';
  SELECT ur.* INTO v_row
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_person AND r.name = 'club_admin';
  IF v_count <> 1 OR v_row.club_id IS DISTINCT FROM c_a OR v_row.show_id IS NOT NULL
     OR NOT v_row.is_active OR v_row.granted_by IS DISTINCT FROM '00000000-0000-0000-0000-000000221111' THEN
    RAISE EXCEPTION 'FAIL the invitee should hold exactly one active club-wide club_admin row for club A: % rows, %',
      v_count, v_row USING ERRCODE = 'ZZ999';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_admin_invites
                 WHERE email = 'new.person@example.test' AND consumed_by_person = v_person
                   AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the invite was not stamped consumed by the invitee' USING ERRCODE = 'ZZ999';
  END IF;

  -- Their other roles are untouched: the exhibitor role from sign-up is still there, and no
  -- non-club_admin role anywhere was added or removed.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE ur.user_id = v_person AND r.name = 'exhibitor') THEN
    RAISE EXCEPTION 'FAIL accepting removed the invitee''s other role' USING ERRCODE = 'ZZ999';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name <> 'club_admin'
      AND NOT EXISTS (SELECT 1 FROM _other_roles o
                      WHERE o.user_id = ur.user_id AND o.role_id = ur.role_id
                        AND o.club_id IS NOT DISTINCT FROM ur.club_id)
  ) THEN
    RAISE EXCEPTION 'FAIL accepting added a non-club_admin role' USING ERRCODE = 'ZZ999';
  END IF;

  -- Failed cases granted no club_admin role at all.
  SELECT count(*) INTO v_count
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'club_admin'
    AND p.auth_user_id IN (
      '00000000-0000-0000-0000-000000221022', '00000000-0000-0000-0000-000000221023',
      '00000000-0000-0000-0000-000000221025', '00000000-0000-0000-0000-000000221026');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused accept granted a club_admin role (% rows)', v_count
      USING ERRCODE = 'ZZ999';
  END IF;

  -- The wrong account did not burn the invite: the right account accepted it afterwards (above).
  -- A rotated-out token granted nothing, the rotated-in one did, exactly once.
  SELECT count(*) INTO v_count
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'club_admin' AND p.auth_user_id = '00000000-0000-0000-0000-000000221030';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL the rotated invitee should hold exactly one club_admin row, has %', v_count
      USING ERRCODE = 'ZZ999';
  END IF;

  -- An inactive club-wide row is reused, not duplicated.
  SELECT count(*), bool_and(ur.is_active) INTO v_count, v_active
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'club_admin' AND ur.club_id = c_a
    AND p.auth_user_id = '00000000-0000-0000-0000-000000221027';
  IF v_count <> 1 OR NOT v_active THEN
    RAISE EXCEPTION 'FAIL the inactive club-wide row was not reused (% rows)', v_count
      USING ERRCODE = 'ZZ999';
  END IF;

  -- One person invited by two clubs holds one row for each, and only those.
  SELECT id INTO v_person FROM public.people
  WHERE auth_user_id = '00000000-0000-0000-0000-000000221028';
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'club_admin' AND ur.user_id = v_person) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                    WHERE r.name = 'club_admin' AND ur.user_id = v_person AND ur.club_id = c_a)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                    WHERE r.name = 'club_admin' AND ur.user_id = v_person AND ur.club_id = c_b) THEN
    RAISE EXCEPTION 'FAIL the two-clubs invitee should hold one club_admin row per club'
      USING ERRCODE = 'ZZ999';
  END IF;

  -- The accept-then-cancel race left the accepted invite consumed, not cancelled, and the
  -- invitee an admin.
  IF NOT EXISTS (SELECT 1 FROM public.club_admin_invites
                 WHERE email = 'race.person@example.test' AND consumed_at IS NOT NULL
                   AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL cancel after accept changed the accepted invite' USING ERRCODE = 'ZZ999';
  END IF;

  -- The cancelled invite was not consumed; the refused-cancel invite was only cancelled by the
  -- fresh-token call, never by the stale ones.
  IF EXISTS (SELECT 1 FROM public.club_admin_invites
             WHERE email IN ('cancelled.person@example.test', 'expired.person@example.test',
                             'deleted.club@example.test')
               AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a cancelled, expired or deleted-club invite was consumed'
      USING ERRCODE = 'ZZ999';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_admin_invites
                 WHERE id = (SELECT id FROM _t WHERE name = 'stamped') AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL cancel with a fresh token did not cancel' USING ERRCODE = 'ZZ999';
  END IF;

  -- An existing admin row was not touched by anyone's accept.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE r.name = 'club_admin' AND ur.club_id = c_a AND ur.is_active
                   AND ur.user_id = '00000000-0000-0000-0000-000000221111') THEN
    RAISE EXCEPTION 'FAIL an existing admin row was changed' USING ERRCODE = 'ZZ999';
  END IF;

  RAISE NOTICE 'PASS token accept, wrong account, reuse, cancel, expiry, deleted club, rotation, race';
END;
$$;

ROLLBACK;
