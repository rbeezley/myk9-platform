-- MYK9-2080 (migration 20261117051700): count_paperwork_prints(uuid) is the
-- paperwork-print replica's empty-scope proof. SECURITY DEFINER with the select
-- policy's access check written in: a caller with access gets the true count, a
-- caller without it gets NULL ("can't tell"), never 0.
--
--   A1  SECURITY DEFINER, search_path '', STABLE; EXECUTE for authenticated and
--       service_role, not anon or PUBLIC.
--   V1  A secretary of the show's club counts the print.
--   V2  An outsider reads none through RLS and gets NULL, not 0.
--   V3  A secretary of an empty show gets 0.
--   G1  No signed-in user is refused with 42501; a NULL show id with 22004.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RAISE NOTICE 'PASS % (% %)', p_label, p_state, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
END;
$f$;

-- Fixture ids: 00000000-0000-0000-0000-000002080<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000002080' || p_suffix)::uuid
$f$;

CREATE FUNCTION pg_temp.act_as(p_auth_suffix text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.fid(p_auth_suffix)::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.fid(p_auth_suffix), 'role', 'authenticated')::text, true);
END;
$f$;

DO $$
DECLARE
  v_fn constant text := 'public.count_paperwork_prints(uuid)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',') || ' ' || p.provolatile::text
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path="" s', 'A1 SECURITY DEFINER, empty search_path, STABLE');

  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false true true', 'A1 EXECUTE: authenticated and service_role, not anon');

  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = v_fn::regprocedure AND a.grantee = 0),
    '0', 'A1 no PUBLIC grant');
END;
$$;

-- Fixtures: club 001, show 101; secretary person 011 (auth 021); outsider
-- person 012 (auth 022) with no role; one print row 501 on the show.
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-2080 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.fid('011'), 'MYK9-2080', 'Secretary', 'myk9-2080-sec@example.test'),
  (pg_temp.fid('012'), 'MYK9-2080', 'Outsider', 'myk9-2080-out@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT pg_temp.fid(v.auth_suffix), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email, '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM (VALUES
  ('021', 'myk9-2080-sec@example.test'),
  ('022', 'myk9-2080-out@example.test')
) AS v(auth_suffix, email);

UPDATE public.people p
SET auth_user_id = pg_temp.fid(v.auth_suffix)
FROM (VALUES ('011', '021'), ('012', '022')) AS v(person_suffix, auth_suffix)
WHERE p.id = pg_temp.fid(v.person_suffix);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT pg_temp.fid('011'), id, pg_temp.fid('001'), true, pg_temp.fid('021')
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (pg_temp.fid('101'), 'MYK9-2080 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (pg_temp.fid('102'), 'MYK9-2080 Empty Show', 'AKC',
        current_date + 31, current_date + 31, 'draft', pg_temp.fid('001'));

INSERT INTO public.paperwork_prints (
  id, show_id, scope_kind, report_id, coverage, fingerprint,
  printed_by, printed_by_name, printed_at
)
VALUES (pg_temp.fid('501'), pg_temp.fid('101'), 'show', 'armband-labels', '{}',
        'sha256:2080', pg_temp.fid('021'), 'Sec', now());

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM pg_temp.act_as('021');
  PERFORM pg_temp.expect_eq(
    public.count_paperwork_prints(pg_temp.fid('101'))::text, '1',
    'V1 secretary counts the show''s print');

  PERFORM pg_temp.act_as('022');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.paperwork_prints WHERE show_id = pg_temp.fid('101')),
    '0', 'V2 outsider reads no print through RLS');
  PERFORM pg_temp.expect_eq(
    coalesce(public.count_paperwork_prints(pg_temp.fid('101'))::text, 'NULL'), 'NULL',
    'V2 outsider gets NULL (unproven), not zero');

  PERFORM pg_temp.act_as('021');
  PERFORM pg_temp.expect_eq(
    public.count_paperwork_prints(pg_temp.fid('102'))::text, '0',
    'V3 secretary of an empty show gets zero');

  PERFORM pg_temp.expect_sqlstate(
    'SELECT public.count_paperwork_prints(NULL::uuid)', '22004', 'G1 NULL show refused');

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  PERFORM pg_temp.expect_sqlstate(
    format('SELECT public.count_paperwork_prints(%L::uuid)', pg_temp.fid('101')),
    '42501', 'G1 no signed-in user refused');
END;
$$;

RESET ROLE;

ROLLBACK;
