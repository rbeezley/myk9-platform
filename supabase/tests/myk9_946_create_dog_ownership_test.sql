-- MYK9-946 (migration 20261002191547): create_dog_with_registrations must fail
-- closed when the caller has no people row. get_my_person_id() is NULL for an
-- anonymous ringside-passcode session, and `IF NOT (NULL OR NULL OR false)`
-- skipped the refusal, so such a caller could create a dog plus registrations
-- under any owner_id. The same migration drops the co-owner arm (owner
-- decision): naming yourself as co_owner_id admitted any owner_id.
--
-- Properties asserted here:
--   * the function stays SECURITY DEFINER, executable by authenticated, never
--     by anon or PUBLIC;
--   * FIXTURE CHECK: the anonymous session really has no people row
--     (get_my_person_id() IS NULL), so its refusals are the NULL arm's doing;
--   * 42501, and no dogs or dog_registrations rows, for:
--       - the anonymous caller creating a dog for someone else's owner_id;
--       - the anonymous caller naming that owner as co_owner_id (the
--         `co_owner_id IS NOT NULL AND NULL` arm);
--       - the anonymous caller re-using an existing dog's registration number
--         under that dog's owner_id (the duplicate branch used to RETURN the
--         existing dog id to it);
--       - an unrelated caller WITH a people row, both plain and via the
--         duplicate-registration branch;
--       - a caller WITH a people row naming themself as co_owner_id for
--         someone else's owner_id (the removed co-owner arm);
--   * POSITIVE CONTROLS: the owner creating their own dog and a trial
--     secretary creating a dog for someone else both succeed and write the dog
--     and its registration; the owner re-using their existing dog's
--     registration number gets that dog back.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People first, then auth.users; handle_new_user() adopts each row.
--   946101 owner O                    946102 unrelated U
--   946103 trial secretary S          946104 self-named co-owner C
--   946105 anonymous session (is_anonymous = true): handle_new_user() skips it,
--          so it has NO people row, exactly like a ringside-passcode session.
-- people.id (9460xx) and auth uid (9461xx) are deliberately different.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000946011', NULL, 'MYK9-946', 'Owner', 'myk9946-own@example.test'),
  ('00000000-0000-0000-0000-000000946012', NULL, 'MYK9-946', 'Unrelated', 'myk9946-unr@example.test'),
  ('00000000-0000-0000-0000-000000946013', NULL, 'MYK9-946', 'Secretary', 'myk9946-sec@example.test'),
  ('00000000-0000-0000-0000-000000946014', NULL, 'MYK9-946', 'CoOwner', 'myk9946-coo@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000946101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9946-own@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000946102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9946-unr@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000946103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9946-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000946104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9946-coo@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000946105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '', now(), now(), now(), '{}', '{}', false, false, true);

INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000000946021', 'MYK9-946 Club', now());

-- A club-level secretary (show_id NULL) is what is_trial_secretary() admits.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000946013', r.id, '00000000-0000-0000-0000-000000946021', true,
       '00000000-0000-0000-0000-000000946103'
FROM public.roles r WHERE r.name = 'secretary';

-- The owner's existing dog, with a registration the duplicate branch can match.
-- Registration numbers are unique to this file (dog_registrations_live_org_number_unique).
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000946060', 'MYK9-946 Existing', 'Border Collie',
        '00000000-0000-0000-0000-000000946011');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES ('00000000-0000-0000-0000-000000946060', 'AKC', 'MYK9946EXIST', 'MYK9-946 Existing');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id::text LIKE '00000000-0000-0000-0000-0000009460%'
        AND auth_user_id IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user() did not adopt all four people rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.people
             WHERE auth_user_id = '00000000-0000-0000-0000-000000946105') THEN
    RAISE EXCEPTION 'FIXTURE the anonymous session has a people row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000946103'
                   AND r.name = 'secretary' AND ur.is_active AND ur.show_id IS NULL) THEN
    RAISE EXCEPTION 'FIXTURE the secretary role row was not created';
  END IF;
END;
$$;

-- Runs p_sql as the CURRENT role and requires exactly p_state ('ok' = no error).
CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RAISE NOTICE 'PASS % (%)', p_label, p_state;
    RETURN;
  END;
  IF p_state <> 'ok' THEN
    RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
  END IF;
  RAISE NOTICE 'PASS % (ok)', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.act_as(p_sub text, p_anonymous boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
END;
$f$;

-- The SQL for one create call. p_co_owner and p_reg_number may be NULL.
CREATE FUNCTION pg_temp.create_sql(p_dog_id text, p_owner text, p_co_owner text, p_reg_number text)
RETURNS text
LANGUAGE sql
AS $f$
  SELECT format(
    'SELECT public.create_dog_with_registrations(%L::jsonb, %L::jsonb)',
    jsonb_strip_nulls(jsonb_build_object(
      'id', p_dog_id,
      'owner_id', p_owner,
      'co_owner_id', p_co_owner,
      'call_name', 'MYK9-946 ' || right(p_dog_id, 3),
      'breed', 'Border Collie'
    )),
    CASE WHEN p_reg_number IS NULL THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object(
           'organization', 'AKC',
           'registration_number', p_reg_number,
           'registered_name', 'MYK9-946 ' || right(p_dog_id, 3)))
    END
  );
$f$;

-- ---------------------------------------------------------------------------
-- 1. Grants unchanged: anon and PUBLIC cannot execute; authenticated can.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn constant text := 'public.create_dog_with_registrations(jsonb, jsonb)';
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute %', fn;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = fn::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute %', fn;
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute %', fn;
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn::regprocedure) THEN
    RAISE EXCEPTION 'FAIL % is no longer SECURITY DEFINER', fn;
  END IF;
  RAISE NOTICE 'PASS create_dog_with_registrations stays SECURITY DEFINER and executable by authenticated only';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Refusals. Dog ids 946071..946076 must never be written.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

-- 2a. The anonymous session: no people row.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000946105', true);

DO $$
BEGIN
  IF public.get_my_person_id() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE the anonymous session resolves to a person';
  END IF;
  IF public.is_trial_secretary() OR public.is_club_admin() OR public.is_site_admin() THEN
    RAISE EXCEPTION 'FIXTURE the anonymous session holds a privileged role';
  END IF;
END;
$$;

SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946071', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946ANON1'),
  '42501', 'no people row: a dog for someone else''s owner_id is refused');
SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946072', '00000000-0000-0000-0000-000000946011',
                     '00000000-0000-0000-0000-000000946011', 'MYK9946ANON2'),
  '42501', 'no people row: naming a co_owner_id does not admit the caller');
SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946073', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946EXIST'),
  '42501', 'no people row: an existing dog''s registration under its owner is refused, not returned');

-- 2b. An unrelated caller who does have a people row.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000946102');

DO $$
BEGIN
  IF public.get_my_person_id() IS DISTINCT FROM '00000000-0000-0000-0000-000000946012'::uuid THEN
    RAISE EXCEPTION 'FIXTURE the unrelated caller does not resolve to their people row';
  END IF;
END;
$$;

SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946074', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946UNR1'),
  '42501', 'unrelated person: a dog for someone else''s owner_id is refused');
SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946075', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946EXIST'),
  '42501', 'unrelated person: an existing dog''s registration under its owner is refused');

-- 2c. A caller with a people row naming themself as co-owner of someone
--     else's dog: the co-owner arm is gone.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000946104');
SELECT pg_temp.expect_sqlstate(
  pg_temp.create_sql('00000000-0000-0000-0000-000000946076', '00000000-0000-0000-0000-000000946011',
                     '00000000-0000-0000-0000-000000946014', 'MYK9946COO1'),
  '42501', 'self-named co-owner: a dog for someone else''s owner_id is refused');

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.dogs
    WHERE id IN ('00000000-0000-0000-0000-000000946071', '00000000-0000-0000-0000-000000946072',
                 '00000000-0000-0000-0000-000000946073', '00000000-0000-0000-0000-000000946074',
                 '00000000-0000-0000-0000-000000946075', '00000000-0000-0000-0000-000000946076')
  ) THEN
    RAISE EXCEPTION 'FAIL a refused call still created a dog';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dog_registrations
    WHERE dog_id IN ('00000000-0000-0000-0000-000000946071', '00000000-0000-0000-0000-000000946072',
                     '00000000-0000-0000-0000-000000946073', '00000000-0000-0000-0000-000000946074',
                     '00000000-0000-0000-0000-000000946075', '00000000-0000-0000-0000-000000946076')
       OR registration_number IN ('MYK9946ANON1', 'MYK9946ANON2', 'MYK9946UNR1', 'MYK9946COO1')
  ) THEN
    RAISE EXCEPTION 'FAIL a refused call still created a dog registration';
  END IF;
  IF (SELECT count(*) FROM public.dog_registrations WHERE registration_number = 'MYK9946EXIST') <> 1 THEN
    RAISE EXCEPTION 'FAIL the existing registration was duplicated or removed';
  END IF;
  RAISE NOTICE 'PASS no dog or registration rows were written by any refused call';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Positive controls: owner, owner duplicate, trial secretary.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Owner O creates their own dog.
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000946101');
  EXECUTE pg_temp.create_sql('00000000-0000-0000-0000-000000946081', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946OWN1')
    INTO v_id;
  IF v_id IS DISTINCT FROM '00000000-0000-0000-0000-000000946081'::uuid THEN
    RAISE EXCEPTION 'FAIL owner: expected the new dog id, got %', v_id;
  END IF;
  RAISE NOTICE 'PASS owner: creating their own dog succeeds';

  -- Owner O re-uses their existing dog's registration: the duplicate branch
  -- still hands back the existing dog.
  EXECUTE pg_temp.create_sql('00000000-0000-0000-0000-000000946082', '00000000-0000-0000-0000-000000946011', NULL, 'MYK9946EXIST')
    INTO v_id;
  IF v_id IS DISTINCT FROM '00000000-0000-0000-0000-000000946060'::uuid THEN
    RAISE EXCEPTION 'FAIL owner: a duplicate registration should return the existing dog, got %', v_id;
  END IF;
  RAISE NOTICE 'PASS owner: a duplicate registration returns the existing dog';

  -- Trial secretary S creates a dog for the unrelated person U.
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000946103');
  IF NOT public.is_trial_secretary() THEN
    RAISE EXCEPTION 'FIXTURE the secretary is not a trial secretary';
  END IF;
  EXECUTE pg_temp.create_sql('00000000-0000-0000-0000-000000946084', '00000000-0000-0000-0000-000000946012', NULL, 'MYK9946SEC1')
    INTO v_id;
  IF v_id IS DISTINCT FROM '00000000-0000-0000-0000-000000946084'::uuid THEN
    RAISE EXCEPTION 'FAIL secretary: expected the new dog id, got %', v_id;
  END IF;
  RAISE NOTICE 'PASS trial secretary: creating a dog for someone else succeeds';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.dogs d
      JOIN public.dog_registrations dr ON dr.dog_id = d.id
      WHERE (d.id, d.owner_id, dr.registration_number) IN (
        ('00000000-0000-0000-0000-000000946081'::uuid, '00000000-0000-0000-0000-000000946011'::uuid, 'MYK9946OWN1'),
        ('00000000-0000-0000-0000-000000946084'::uuid, '00000000-0000-0000-0000-000000946012'::uuid, 'MYK9946SEC1')
      )) <> 2 THEN
    RAISE EXCEPTION 'FAIL a positive control did not write its dog and registration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000946082') THEN
    RAISE EXCEPTION 'FAIL the duplicate-registration call created a second dog';
  END IF;
  RAISE NOTICE 'PASS every positive control wrote its dog and registration';
END;
$$;

ROLLBACK;
