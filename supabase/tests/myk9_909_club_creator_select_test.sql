-- MYK9-909: a secretary who is not yet a club admin must be able to
-- INSERT ... RETURNING a new (unauthorized) club. RETURNING evaluates
-- clubs_select before trg_grant_club_admin_to_club_creator's grant exists, so
-- clubs_select admits `created_by = auth.uid()`; clubs.created_by is
-- server-assigned (guard_club_created_by_write) and immutable.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations; everything rolls back.
-- Fixtures follow club_authorization_gate_test.sql: the people row goes in
-- first with the address, then auth.users, and handle_new_user() adopts it.

BEGIN;

-- secretary/club_admin roles must be scoped to a club (enforce_club_id_for_scoped_roles),
-- so both secretaries belong to this existing authorized club and are NOT club_admin of
-- the clubs they create until the AFTER INSERT trigger grants it.
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000000909000', 'MYK9-909 Home Club', now());

DO $$
DECLARE
  v_role_id uuid;
  v_i integer;
  v_auth uuid;
  v_person uuid;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'secretary';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'FAIL wiring: secretary role missing';
  END IF;

  FOR v_i IN 1..2 LOOP
    v_auth := gen_random_uuid();
    v_person := gen_random_uuid();

    INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
    VALUES (v_person, NULL, 'MYK9-909', 'Secretary' || v_i, 'myk9909-sec' || v_i || '@example.test');

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, is_anonymous
    )
    VALUES (
      v_auth, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'myk9909-sec' || v_i || '@example.test', '', now(),
      now(), now(), '{}', '{}', false, false, false
    );

    IF (SELECT auth_user_id FROM public.people WHERE id = v_person) IS DISTINCT FROM v_auth THEN
      RAISE EXCEPTION 'FAIL wiring: handle_new_user() did not adopt secretary fixture %', v_i;
    END IF;

    INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
    VALUES (v_person, v_role_id, '00000000-0000-0000-0000-000000909000', NULL, true, now(), v_person, v_auth);

    PERFORM set_config('myk9909.auth_' || v_i, v_auth::text, false);
    PERFORM set_config('myk9909.person_' || v_i, v_person::text, false);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Secretary 1 inserts a club with RETURNING; it succeeds and created_by is
--    the caller, even though the club is unauthorized and no club_admin grant
--    exists yet at RETURNING time.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9909.auth_1'), true);

DO $$
DECLARE
  v_id uuid;
  v_created_by uuid;
BEGIN
  INSERT INTO public.clubs (id, name)
  VALUES ('00000000-0000-0000-0000-000000909001', 'MYK9-909 Creator Club')
  RETURNING id, created_by INTO v_id, v_created_by;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL returning: INSERT ... RETURNING returned no row';
  END IF;
  IF v_created_by IS DISTINCT FROM current_setting('myk9909.auth_1')::uuid THEN
    RAISE EXCEPTION 'FAIL created-by-assigned: created_by = %, expected the caller', v_created_by;
  END IF;
  RAISE NOTICE 'PASS secretary-insert-returning: succeeds, created_by = caller';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL secretary-insert-returning: % (%)', SQLERRM, SQLSTATE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. A client-supplied created_by is overwritten with the caller.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_created_by uuid;
BEGIN
  INSERT INTO public.clubs (id, name, created_by)
  VALUES (
    '00000000-0000-0000-0000-000000909002',
    'MYK9-909 Spoofed Creator Club',
    current_setting('myk9909.auth_2')::uuid
  )
  RETURNING created_by INTO v_created_by;

  IF v_created_by IS DISTINCT FROM current_setting('myk9909.auth_1')::uuid THEN
    RAISE EXCEPTION 'FAIL created-by-spoof: client-supplied created_by survived (%)', v_created_by;
  END IF;
  RAISE NOTICE 'PASS created-by-spoof: client-supplied created_by overwritten';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. created_by cannot be changed by UPDATE (the creator is now club_admin of
--    club 001 via the AFTER INSERT trigger, so the UPDATE itself is allowed).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_created_by uuid;
BEGIN
  UPDATE public.clubs
     SET created_by = current_setting('myk9909.auth_2')::uuid,
         city = 'MYK9-909 City'
   WHERE id = '00000000-0000-0000-0000-000000909001'
  RETURNING created_by INTO v_created_by;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'FAIL created-by-immutable: UPDATE matched no row (creator lost access?)';
  END IF;
  IF v_created_by IS DISTINCT FROM current_setting('myk9909.auth_1')::uuid THEN
    RAISE EXCEPTION 'FAIL created-by-immutable: UPDATE changed created_by to %', v_created_by;
  END IF;
  RAISE NOTICE 'PASS created-by-immutable: UPDATE cannot change created_by';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The club_admin grant exists (trigger still ran).
-- ---------------------------------------------------------------------------
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE r.name = 'club_admin'
       AND ur.club_id = '00000000-0000-0000-0000-000000909001'
       AND ur.user_id = current_setting('myk9909.person_1')::uuid
       AND ur.is_active
  ) THEN
    RAISE EXCEPTION 'FAIL club-admin-grant: creator has no club_admin row on the new club';
  END IF;
  RAISE NOTICE 'PASS club-admin-grant: creator was granted club_admin';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. A different secretary and anon cannot see the unauthorized clubs.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9909.auth_2'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id IN ('00000000-0000-0000-0000-000000909001', '00000000-0000-0000-0000-000000909002');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL other-secretary-hidden: a different secretary saw % unauthorized club(s)', v_count;
  END IF;
  RAISE NOTICE 'PASS other-secretary-hidden';
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id IN ('00000000-0000-0000-0000-000000909001', '00000000-0000-0000-0000-000000909002');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL anon-hidden: anon saw % unauthorized club(s)', v_count;
  END IF;
  RAISE NOTICE 'PASS anon-hidden';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. service_role inserts (no JWT subject) keep the supplied created_by.
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_created_by uuid;
BEGIN
  INSERT INTO public.clubs (id, name, created_by)
  VALUES (
    '00000000-0000-0000-0000-000000909003',
    'MYK9-909 Seeded Club',
    current_setting('myk9909.auth_2')::uuid
  )
  RETURNING created_by INTO v_created_by;

  IF v_created_by IS DISTINCT FROM current_setting('myk9909.auth_2')::uuid THEN
    RAISE EXCEPTION 'FAIL service-role-keeps-value: created_by = %', v_created_by;
  END IF;
  RAISE NOTICE 'PASS service-role-keeps-value';
END;
$$;

RESET ROLE;

ROLLBACK;
