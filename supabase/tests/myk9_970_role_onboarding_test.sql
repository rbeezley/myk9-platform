-- MYK9-970 (migration 20261003173917): role-aware onboarding.
--
-- Properties asserted here:
--   * set_my_judge_numbers(jsonb) is SECURITY DEFINER, executable by
--     authenticated, never by anon or PUBLIC;
--   * a judge sets judge_number on their OWN existing qualification rows, per
--     organization (every row for that organization), and nothing else;
--   * the payload cannot reach another person: judge B's numbers are untouched
--     by judge A's save, and A cannot name an organization A holds no
--     qualification for (P0002, and no row is created — MYK9-354);
--   * a non-judge (exhibitor only) is refused 42501;
--   * the judge's direct table UPDATE is still blocked by the 068 policies
--     (the RPC is the only self-service path);
--   * exhibitor_profiles.onboarded_roles: self-writable, never another user's,
--     only known role names (23514), and anon has no access to the table.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People first, then auth.users; handle_new_user() adopts each row
-- and creates its exhibitor_profiles row.
--   970101 judge A      970102 judge B      970103 exhibitor C (no judge role)
-- people.id (9700xx) and auth uid (9701xx) are deliberately different.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000970011', NULL, 'MYK9-970', 'JudgeA', 'myk9970-a@example.test'),
  ('00000000-0000-0000-0000-000000970012', NULL, 'MYK9-970', 'JudgeB', 'myk9970-b@example.test'),
  ('00000000-0000-0000-0000-000000970013', NULL, 'MYK9-970', 'Exhibitor', 'myk9970-c@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000970101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9970-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000970102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9970-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000970103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9970-c@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

-- Belt and braces: the profile rows the onboarded_roles checks need.
INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000970011', '00000000-0000-0000-0000-000000970101'),
  ('00000000-0000-0000-0000-000000970012', '00000000-0000-0000-0000-000000970102'),
  ('00000000-0000-0000-0000-000000970013', '00000000-0000-0000-0000-000000970103')
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, true, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000970011'::uuid, '00000000-0000-0000-0000-000000970101'::uuid),
  ('00000000-0000-0000-0000-000000970012'::uuid, '00000000-0000-0000-0000-000000970102'::uuid)
) AS fixture(person_id, auth_id)
JOIN public.roles r ON r.name = 'judge';

-- Seed as the test owner (qualification writes are staff-only by policy).
-- Judge A: two AKC rows (different levels) and one UKC row. Judge B: one AKC row.
INSERT INTO public.judge_qualifications (person_id, organization, qualification_level, judge_number)
VALUES
  ('00000000-0000-0000-0000-000000970011', 'AKC', 'Novice', NULL),
  ('00000000-0000-0000-0000-000000970011', 'AKC', 'Advanced', NULL),
  ('00000000-0000-0000-0000-000000970011', 'UKC', 'All', 'OLD-UKC'),
  ('00000000-0000-0000-0000-000000970012', 'AKC', 'All', 'B-AKC-KEEP');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id::text LIKE '00000000-0000-0000-0000-0000009700%'
        AND auth_user_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user() did not adopt all three people rows';
  END IF;
  IF (SELECT count(*) FROM public.exhibitor_profiles
      WHERE auth_user_id::text LIKE '00000000-0000-0000-0000-0000009701%') <> 3 THEN
    RAISE EXCEPTION 'FIXTURE missing exhibitor_profiles rows';
  END IF;
END;
$$;

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

CREATE FUNCTION pg_temp.act_as(p_sub text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'is_anonymous', false)::text, true);
END;
$f$;

-- ---------------------------------------------------------------------------
-- 1. Grants: anon and PUBLIC cannot execute; authenticated can.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn constant text := 'public.set_my_judge_numbers(jsonb)';
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
    RAISE EXCEPTION 'FAIL % is not SECURITY DEFINER', fn;
  END IF;
  IF has_table_privilege('anon', 'public.exhibitor_profiles', 'SELECT')
     OR has_table_privilege('anon', 'public.exhibitor_profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL anon has access to exhibitor_profiles';
  END IF;
  RAISE NOTICE 'PASS set_my_judge_numbers is SECURITY DEFINER, authenticated-only; anon has no exhibitor_profiles access';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. anon cannot call the RPC at all.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.set_my_judge_numbers('[{"organization":"AKC","judge_number":"ANON"}]'::jsonb)$q$,
  '42501', 'anon cannot execute set_my_judge_numbers');
RESET ROLE;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 3. Non-judge refused.
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000970103');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.set_my_judge_numbers('[{"organization":"AKC","judge_number":"C-NOPE"}]'::jsonb)$q$,
  '42501', 'an exhibitor without the judge role is refused');

-- ---------------------------------------------------------------------------
-- 4. Judge A writes their own numbers.
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000970101');

DO $$
DECLARE
  v_count integer;
BEGIN
  v_count := public.set_my_judge_numbers(
    '[{"organization":"AKC","judge_number":"  A-AKC-1 "},{"organization":"UKC","judge_number":""}]'::jsonb
  );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL judge A save updated % rows, expected 3 (two AKC, one UKC)', v_count;
  END IF;
  RAISE NOTICE 'PASS judge A save reported 3 rows';
END;
$$;

-- An organization A holds no qualification for is refused, and creates nothing.
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.set_my_judge_numbers('[{"organization":"ASCA","judge_number":"A-ASCA"}]'::jsonb)$q$,
  'P0002', 'judge A cannot create a qualification for an organization they do not hold');

SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.set_my_judge_numbers('{"organization":"AKC"}'::jsonb)$q$,
  '22023', 'a non-array payload is refused');

-- Direct table UPDATE is still blocked by the staff-only policies.
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.judge_qualifications
  SET judge_number = 'DIRECT'
  WHERE person_id = '00000000-0000-0000-0000-000000970011';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL judge A updated % qualification rows directly', v_rows;
  END IF;
  RAISE NOTICE 'PASS judge direct UPDATE on judge_qualifications still affects 0 rows';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS judge direct UPDATE on judge_qualifications refused (42501)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. onboarded_roles is self-only and constrained.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.exhibitor_profiles
  SET onboarded_roles = ARRAY['judge']
  WHERE auth_user_id = '00000000-0000-0000-0000-000000970101';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL judge A could not record their own onboarded role (% rows)', v_rows;
  END IF;

  UPDATE public.exhibitor_profiles
  SET onboarded_roles = ARRAY['judge']
  WHERE auth_user_id = '00000000-0000-0000-0000-000000970102';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL judge A wrote judge B''s onboarded_roles (% rows)', v_rows;
  END IF;

  IF EXISTS (SELECT 1 FROM public.exhibitor_profiles
             WHERE auth_user_id = '00000000-0000-0000-0000-000000970102') THEN
    RAISE EXCEPTION 'FAIL judge A can read judge B''s exhibitor profile';
  END IF;
  RAISE NOTICE 'PASS onboarded_roles: own row writable, another user''s row neither readable nor writable';
END;
$$;

SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.exhibitor_profiles SET onboarded_roles = ARRAY['site_admin']
     WHERE auth_user_id = '00000000-0000-0000-0000-000000970101'$q$,
  '23514', 'onboarded_roles rejects a role name without an onboarding step');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. Final state, read as the owner.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.judge_qualifications
      WHERE person_id = '00000000-0000-0000-0000-000000970011'
        AND organization = 'AKC' AND judge_number = 'A-AKC-1') <> 2 THEN
    RAISE EXCEPTION 'FAIL judge A''s AKC number was not trimmed and written to both AKC rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.judge_qualifications
             WHERE person_id = '00000000-0000-0000-0000-000000970011'
               AND organization = 'UKC' AND judge_number IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL an empty UKC number did not clear the stored value';
  END IF;
  IF (SELECT count(*) FROM public.judge_qualifications
      WHERE person_id = '00000000-0000-0000-0000-000000970011') <> 3 THEN
    RAISE EXCEPTION 'FAIL judge A''s qualification row count changed';
  END IF;
  IF (SELECT judge_number FROM public.judge_qualifications
      WHERE person_id = '00000000-0000-0000-0000-000000970012') IS DISTINCT FROM 'B-AKC-KEEP' THEN
    RAISE EXCEPTION 'FAIL judge B''s number changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.judge_qualifications
             WHERE person_id = '00000000-0000-0000-0000-000000970013') THEN
    RAISE EXCEPTION 'FAIL the refused exhibitor gained a qualification row';
  END IF;
  IF (SELECT onboarded_roles FROM public.exhibitor_profiles
      WHERE auth_user_id = '00000000-0000-0000-0000-000000970102') <> '{}'::text[] THEN
    RAISE EXCEPTION 'FAIL judge B''s onboarded_roles changed';
  END IF;
  RAISE NOTICE 'PASS MYK9-970 final state: own rows only, no rows created, other users untouched';
END;
$$;

ROLLBACK;
