-- MYK9-1000 (migration 20261004235100): count_live_waitlist_entries(uuid[])
-- is the waitlist replica's independent empty-scope proof. It must tell
-- "really gone" apart from "the caller can't see it" (MYK9-880).
--
-- Properties asserted here:
--   A1  SECURITY DEFINER, search_path '', STABLE; EXECUTE for authenticated and
--       service_role, not anon or PUBLIC.
--   V1  The owner sees both rows through RLS and the function counts both.
--   V2  An outsider sees NEITHER row through RLS (the MYK9-880 gap: the
--       replica fetch and count read 0 of 0), yet the function still counts
--       both: "can't see" never reads as "empty".
--   V3  Unknown ids count zero; duplicates in the input do not double count.
--   D1  After one row is deleted the function counts one; after both, zero:
--       only rows that are really gone read as gone.
--   G1  No signed-in user (auth.uid() NULL) is refused with 42501.
--   G2  A NULL array is refused with 22004; more than 500 ids with 22023.
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

-- Fixture ids: 00000000-0000-0000-0000-000001000<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001000' || p_suffix)::uuid
$f$;

CREATE FUNCTION pg_temp.act_as(p_auth_suffix text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.fid(p_auth_suffix)::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.fid(p_auth_suffix), 'role', 'authenticated')::text, true);
END;
$f$;

-- ---------------------------------------------------------------------------
-- A1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn constant text := 'public.count_live_waitlist_entries(uuid[])';
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

-- ---------------------------------------------------------------------------
-- Fixtures: club 001, show 101, trial 201, class 301; exhibitor person 011
-- (auth 021) owns dogs 401-402, waiting as rows 501-502; outsider person 012
-- (auth 022) has no role and no rows.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-1000 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.fid('011'), 'MYK9-1000', 'Exhibitor', 'myk9-1000-exh@example.test'),
  (pg_temp.fid('012'), 'MYK9-1000', 'Outsider', 'myk9-1000-out@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT pg_temp.fid(v.auth_suffix), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email, '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM (VALUES
  ('021', 'myk9-1000-exh@example.test'),
  ('022', 'myk9-1000-out@example.test')
) AS v(auth_suffix, email);

UPDATE public.people p
SET auth_user_id = pg_temp.fid(v.auth_suffix)
FROM (VALUES ('011', '021'), ('012', '022')) AS v(person_suffix, auth_suffix)
WHERE p.id = pg_temp.fid(v.person_suffix);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.fid('011'), pg_temp.fid('021')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = pg_temp.fid('021'));

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (pg_temp.fid('101'), 'MYK9-1000 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

INSERT INTO public.trials (id, show_id, name, date)
VALUES (pg_temp.fid('201'), pg_temp.fid('101'), 'MYK9-1000 Trial', current_date + 30);

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES (pg_temp.fid('301'), pg_temp.fid('201'), 'Class Waitlist', 'upcoming', 'derived', 1, true);

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('011')
FROM generate_series(1, 2) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1000' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 2) AS n;

INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, status, joined_via)
SELECT pg_temp.fid(v.id), pg_temp.fid('301'), ep.id, pg_temp.fid(v.dog), v.pos, 'waiting', 'online'
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES ('501', '401', 1), ('502', '402', 2)) AS v(id, dog, pos)
WHERE ep.auth_user_id = pg_temp.fid('021');

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries
      WHERE id IN (pg_temp.fid('501'), pg_temp.fid('502'))),
    '2', 'fixture: two waitlist rows');
END;
$$;

-- ---------------------------------------------------------------------------
-- V1 / V2 / V3 / G1 / G2 as the authenticated role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ids constant uuid[] := ARRAY[pg_temp.fid('501'), pg_temp.fid('502')];
BEGIN
  PERFORM pg_temp.act_as('021');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries WHERE id = ANY (v_ids)),
    '2', 'V1 owner reads both rows through RLS');
  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(v_ids)::text, '2', 'V1 owner: function counts both');

  PERFORM pg_temp.act_as('022');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries WHERE id = ANY (v_ids)),
    '0', 'V2 outsider reads neither row through RLS (the MYK9-880 gap)');
  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(v_ids)::text, '2',
    'V2 outsider: function still counts both, so can''t-see is not empty');

  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(
      ARRAY[pg_temp.fid('999'), pg_temp.fid('501'), pg_temp.fid('501')])::text,
    '1', 'V3 unknown id counts zero, duplicate counts once');
  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(ARRAY[]::uuid[])::text, '0', 'V3 empty array counts zero');

  PERFORM pg_temp.expect_sqlstate(
    'SELECT public.count_live_waitlist_entries(NULL::uuid[])', '22004', 'G2 NULL array refused');
  PERFORM pg_temp.expect_sqlstate(
    'SELECT public.count_live_waitlist_entries(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 501)))',
    '22023', 'G2 more than 500 ids refused');

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  PERFORM pg_temp.expect_sqlstate(
    format('SELECT public.count_live_waitlist_entries(%L::uuid[])', v_ids),
    '42501', 'G1 no signed-in user refused');
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- D1. Only rows that are really gone read as gone
-- ---------------------------------------------------------------------------
DELETE FROM public.waitlist_entries WHERE id = pg_temp.fid('501');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ids constant uuid[] := ARRAY[pg_temp.fid('501'), pg_temp.fid('502')];
BEGIN
  PERFORM pg_temp.act_as('021');
  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(v_ids)::text, '1', 'D1 one deleted: counts one');
END;
$$;

RESET ROLE;

DELETE FROM public.waitlist_entries WHERE id = pg_temp.fid('502');

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM pg_temp.act_as('021');
  PERFORM pg_temp.expect_eq(
    public.count_live_waitlist_entries(ARRAY[pg_temp.fid('501'), pg_temp.fid('502')])::text,
    '0', 'D1 both deleted: counts zero');
END;
$$;

RESET ROLE;

ROLLBACK;
