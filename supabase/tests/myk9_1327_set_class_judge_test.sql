-- MYK9-1327: public.set_class_judge(p_class_id, p_person_id), the atomic class-judge pick.
-- SECURITY INVOKER, so every caller case below runs as role authenticated with the JWT sub set.
--
-- Cases: 1 replace A with B (one confirmed row, version up, return shape); 2 replay is a no-op
-- (same version, same assignment id); 3 NULL removes the judge; 4 another club's secretary, a
-- plain user and a judge get 42501 and nothing changes; 5 deleted class P0002, deleted or
-- missing person 22023; 6 club_admin and site_admin succeed, site_admin also on a DRAFT show;
-- 7 invited/declined class-level rows are all replaced; 8 show-level rows are untouched;
-- 9 anon has no EXECUTE.
--
-- Cases 1-4 and 7-8 use a PUBLISHED show on purpose: its classes are visible to every caller, so
-- a denied caller reaches the explicit 42501 rather than P0002 from an invisible class.
--
-- NOT exercised: two concurrent transactions picking one class. One psql session cannot
-- interleave them; that rests on pg_advisory_xact_lock keyed on the class.
--
-- Conventions match myk9_1395_club_awaiting_authorization_rate_limit_test.sql: run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back. Runs only in CI.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001327001', 'MYK9-1327 Club A'),
  ('00000000-0000-0000-0000-000001327002', 'MYK9-1327 Club B');

-- People first (handle_new_user adopts an existing person by LOWER(email)).
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001327011', 'Sam', 'Secretary', 'myk9-1327-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000001327012', 'Cleo', 'ClubAdmin', 'myk9-1327-club-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001327013', 'Sia', 'SiteAdmin', 'myk9-1327-site-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001327014', 'Olga', 'OtherSecretary', 'myk9-1327-other-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000001327015', 'Pat', 'PlainUser', 'myk9-1327-plain@example.test', NULL),
  ('00000000-0000-0000-0000-000001327016', 'Jude', 'JudgeCaller', 'myk9-1327-judge-caller@example.test', NULL),
  ('00000000-0000-0000-0000-000001327021', 'Alice', 'JudgeA', 'myk9-1327-judge-a@example.test', NULL),
  ('00000000-0000-0000-0000-000001327022', 'Bob', 'JudgeB', 'myk9-1327-judge-b@example.test', NULL),
  ('00000000-0000-0000-0000-000001327023', 'Dana', 'DeletedJudge', 'myk9-1327-deleted-judge@example.test', NULL);

UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000001327023';

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001327101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001327102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-club-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001327103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-site-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001327104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-other-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001327105', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-plain@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001327106', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-judge-caller@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000001327011')
     IS DISTINCT FROM '00000000-0000-0000-0000-000001327101'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.0 handle_new_user did not adopt the seeded person by email';
  END IF;
  RAISE NOTICE 'PASS 0.0 seeded people adopted by handle_new_user';
END $adopt$;

-- is_trial_secretary additionally requires active club membership.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000001327001', '00000000-0000-0000-0000-000001327011', 'active'),
  ('00000000-0000-0000-0000-000001327001', '00000000-0000-0000-0000-000001327012', 'active'),
  ('00000000-0000-0000-0000-000001327002', '00000000-0000-0000-0000-000001327014', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001327011', id, '00000000-0000-0000-0000-000001327001', true,
       '00000000-0000-0000-0000-000001327101'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001327012', id, '00000000-0000-0000-0000-000001327001', true,
       '00000000-0000-0000-0000-000001327102'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001327013', id, true, '00000000-0000-0000-0000-000001327103'
FROM public.roles WHERE name = 'site_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001327014', id, '00000000-0000-0000-0000-000001327002', true,
       '00000000-0000-0000-0000-000001327104'
FROM public.roles WHERE name = 'secretary';

-- Fixture rows insert as the migration owner, so the publish gate does not apply.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000001327031', 'MYK9-1327 Published Show', 'AKC',
   current_date, current_date + 1, 'published', '00000000-0000-0000-0000-000001327001'),
  ('00000000-0000-0000-0000-000001327032', 'MYK9-1327 Draft Show', 'AKC',
   current_date, current_date + 1, 'draft', '00000000-0000-0000-0000-000001327001');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000001327041', '00000000-0000-0000-0000-000001327031',
   'MYK9-1327 Published Trial', current_date),
  ('00000000-0000-0000-0000-000001327042', '00000000-0000-0000-0000-000001327032',
   'MYK9-1327 Draft Trial', current_date);

-- One class per case so each case's version and row assertions are independent.
INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000001327051', '00000000-0000-0000-0000-000001327041', 'C1 replace/replay/remove'),
  ('00000000-0000-0000-0000-000001327052', '00000000-0000-0000-0000-000001327041', 'C2 denied callers'),
  ('00000000-0000-0000-0000-000001327053', '00000000-0000-0000-0000-000001327041', 'C3 deleted class'),
  ('00000000-0000-0000-0000-000001327054', '00000000-0000-0000-0000-000001327041', 'C4 club admin'),
  ('00000000-0000-0000-0000-000001327055', '00000000-0000-0000-0000-000001327042', 'C5 draft site admin'),
  ('00000000-0000-0000-0000-000001327056', '00000000-0000-0000-0000-000001327041', 'C6 non-confirmed rows'),
  ('00000000-0000-0000-0000-000001327057', '00000000-0000-0000-0000-000001327041', 'C7 show-level untouched'),
  ('00000000-0000-0000-0000-000001327058', '00000000-0000-0000-0000-000001327042', 'C8 draft secretary'),
  ('00000000-0000-0000-0000-000001327059', '00000000-0000-0000-0000-000001327041', 'C9 bad person');

UPDATE public.classes SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000001327053';

-- A starting judge (A) on C1, C2 and C4, and a show-level assignment for the judge caller.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000001327021', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327051', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001327021', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327052', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001327021', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327054', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001327016', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327052', 'confirmed', now());

-- Helpers. They run as the fixture owner; only t1327_call switches to role authenticated, and it
-- switches back before returning, so no pg_temp object is ever touched as `authenticated`.
CREATE FUNCTION pg_temp.t1327_version(p_class uuid) RETURNS integer
LANGUAGE sql AS $$ SELECT version FROM public.classes WHERE id = p_class $$;

CREATE FUNCTION pg_temp.t1327_rows(p_class uuid) RETURNS integer
LANGUAGE sql AS $$ SELECT count(*)::integer FROM public.judge_assignments WHERE class_id = p_class $$;

CREATE FUNCTION pg_temp.t1327_confirmed_person(p_class uuid) RETURNS uuid
LANGUAGE sql AS $$
  SELECT person_id FROM public.judge_assignments
  WHERE class_id = p_class AND status = 'confirmed' ORDER BY id LIMIT 1
$$;

CREATE FUNCTION pg_temp.t1327_assignment_id(p_class uuid) RETURNS uuid
LANGUAGE sql AS $$ SELECT id FROM public.judge_assignments WHERE class_id = p_class ORDER BY id LIMIT 1 $$;

-- Calls set_class_judge as `authenticated` with the JWT sub set. Returns the RPC's jsonb, or
-- {"error": "<SQLSTATE>"} when it raised.
CREATE FUNCTION pg_temp.t1327_call(p_sub text, p_class uuid, p_person uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_result := public.set_class_judge(p_class, p_person);
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('error', SQLSTATE);
  END;
  RESET ROLE;
  RETURN v_result;
END;
$$;

CREATE TEMP TABLE t1327_results (label text PRIMARY KEY, payload jsonb);

-- 1. Secretary of the show's club replaces A with B.
CREATE TEMP TABLE t1327_snap AS
SELECT pg_temp.t1327_assignment_id('00000000-0000-0000-0000-000001327051') AS id_a,
       pg_temp.t1327_version('00000000-0000-0000-0000-000001327051') AS ver;

INSERT INTO t1327_results
SELECT 'case1', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327051', '00000000-0000-0000-0000-000001327022');

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327051';
  v_payload jsonb := (SELECT payload FROM t1327_results WHERE label = 'case1');
BEGIN
  IF pg_temp.t1327_rows(v_class) <> 1
     OR pg_temp.t1327_confirmed_person(v_class) IS DISTINCT FROM '00000000-0000-0000-0000-000001327022'::uuid THEN
    RAISE EXCEPTION 'FAIL 1.0 expected exactly one confirmed class-level row for B, found % rows (payload %)', pg_temp.t1327_rows(v_class), v_payload;
  END IF;
  IF EXISTS (SELECT 1 FROM public.judge_assignments WHERE id = (SELECT id_a FROM t1327_snap)) THEN
    RAISE EXCEPTION 'FAIL 1.1 the old assignment row for A survived';
  END IF;
  IF pg_temp.t1327_version(v_class) <= (SELECT ver FROM t1327_snap) THEN
    RAISE EXCEPTION 'FAIL 1.2 classes.version did not increase (% -> %)', (SELECT ver FROM t1327_snap), pg_temp.t1327_version(v_class);
  END IF;
  IF (v_payload ->> 'version')::integer IS DISTINCT FROM pg_temp.t1327_version(v_class) THEN
    RAISE EXCEPTION 'FAIL 1.3 returned version % is not the post-write class version %', v_payload ->> 'version', pg_temp.t1327_version(v_class);
  END IF;
  IF v_payload ->> 'updated_at' IS NULL THEN
    RAISE EXCEPTION 'FAIL 1.4 returned updated_at is missing';
  END IF;
  IF v_payload -> 'judge' IS DISTINCT FROM jsonb_build_object(
       'person_id', '00000000-0000-0000-0000-000001327022', 'first_name', 'Bob', 'last_name', 'JudgeB') THEN
    RAISE EXCEPTION 'FAIL 1.5 returned judge is wrong: %', v_payload -> 'judge';
  END IF;
  IF (SELECT status FROM public.judge_assignments WHERE class_id = v_class) <> 'confirmed'
     OR (SELECT trial_id FROM public.judge_assignments WHERE class_id = v_class) IS NOT NULL
     OR (SELECT confirmed_at FROM public.judge_assignments WHERE class_id = v_class) IS NULL
     OR (SELECT show_id FROM public.judge_assignments WHERE class_id = v_class) <> '00000000-0000-0000-0000-000001327031'::uuid THEN
    RAISE EXCEPTION 'FAIL 1.6 inserted row must be confirmed, trial_id NULL, confirmed_at set, show derived from the class';
  END IF;
  RAISE NOTICE 'PASS 1 secretary replaces A with B: one confirmed row, version bumped, {version, updated_at, judge} returned';
END;
$$;

-- 2. Replay of B is a no-op: same version, same assignment id.
CREATE TEMP TABLE t1327_snap2 AS
SELECT pg_temp.t1327_assignment_id('00000000-0000-0000-0000-000001327051') AS id_b,
       pg_temp.t1327_version('00000000-0000-0000-0000-000001327051') AS ver;

INSERT INTO t1327_results
SELECT 'case2', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327051', '00000000-0000-0000-0000-000001327022');

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327051';
  v_payload jsonb := (SELECT payload FROM t1327_results WHERE label = 'case2');
BEGIN
  IF pg_temp.t1327_version(v_class) <> (SELECT ver FROM t1327_snap2) THEN
    RAISE EXCEPTION 'FAIL 2.0 a replay bumped classes.version (% -> %)', (SELECT ver FROM t1327_snap2), pg_temp.t1327_version(v_class);
  END IF;
  IF pg_temp.t1327_assignment_id(v_class) IS DISTINCT FROM (SELECT id_b FROM t1327_snap2) THEN
    RAISE EXCEPTION 'FAIL 2.1 a replay churned the assignment id';
  END IF;
  IF (v_payload ->> 'version')::integer IS DISTINCT FROM (SELECT ver FROM t1327_snap2)
     OR v_payload -> 'judge' ->> 'person_id' IS DISTINCT FROM '00000000-0000-0000-0000-000001327022' THEN
    RAISE EXCEPTION 'FAIL 2.2 a replay must still return the current version and judge: %', v_payload;
  END IF;
  RAISE NOTICE 'PASS 2 replaying B is a no-op: same version, same assignment id';
END;
$$;

-- 3. NULL removes the judge.
INSERT INTO t1327_results
SELECT 'case3', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327051', NULL);

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327051';
  v_payload jsonb := (SELECT payload FROM t1327_results WHERE label = 'case3');
BEGIN
  IF pg_temp.t1327_rows(v_class) <> 0 THEN
    RAISE EXCEPTION 'FAIL 3.0 NULL must leave zero class-level rows, found % (payload %)', pg_temp.t1327_rows(v_class), v_payload;
  END IF;
  IF jsonb_typeof(v_payload -> 'judge') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'FAIL 3.1 judge must be JSON null after removal: %', v_payload;
  END IF;
  IF pg_temp.t1327_version(v_class) <= (SELECT ver FROM t1327_snap2) THEN
    RAISE EXCEPTION 'FAIL 3.2 removal did not bump classes.version';
  END IF;
  RAISE NOTICE 'PASS 3 NULL removes the judge: zero rows, judge null, version bumped';
END;
$$;

-- 4. Denied callers: another club's secretary, a plain user, a judge. 42501, no change.
CREATE TEMP TABLE t1327_before AS
SELECT pg_temp.t1327_version('00000000-0000-0000-0000-000001327052') AS ver,
       (SELECT array_agg(id ORDER BY id) FROM public.judge_assignments
        WHERE class_id = '00000000-0000-0000-0000-000001327052') AS ids;

INSERT INTO t1327_results
SELECT 'case4-' || c.label, pg_temp.t1327_call(c.sub, '00000000-0000-0000-0000-000001327052',
  '00000000-0000-0000-0000-000001327022')
FROM (VALUES
  ('other-club-secretary', '00000000-0000-0000-0000-000001327104'),
  ('plain-user', '00000000-0000-0000-0000-000001327105'),
  ('judge', '00000000-0000-0000-0000-000001327106')
) AS c(label, sub);

DO $$
DECLARE
  v_got text;
BEGIN
  SELECT string_agg(label || '=' || coalesce(payload ->> 'error', 'NO-ERROR'), ', ' ORDER BY label)
    INTO v_got FROM t1327_results WHERE label LIKE 'case4-%';
  IF v_got IS DISTINCT FROM 'case4-judge=42501, case4-other-club-secretary=42501, case4-plain-user=42501' THEN
    RAISE EXCEPTION 'FAIL 4.0 every denied caller must get 42501; got %', v_got;
  END IF;
  IF pg_temp.t1327_version('00000000-0000-0000-0000-000001327052') <> (SELECT ver FROM t1327_before)
     OR (SELECT array_agg(id ORDER BY id) FROM public.judge_assignments WHERE class_id = '00000000-0000-0000-0000-000001327052')
        IS DISTINCT FROM (SELECT ids FROM t1327_before) THEN
    RAISE EXCEPTION 'FAIL 4.1 a denied pick changed the class version or its assignments';
  END IF;
  RAISE NOTICE 'PASS 4 other-club secretary, plain user and judge get 42501 and nothing changes';
END;
$$;

-- 5. Deleted class P0002; deleted or missing person 22023.
INSERT INTO t1327_results
SELECT 'case5-' || c.label, pg_temp.t1327_call('00000000-0000-0000-0000-000001327101', c.class_id, c.person_id)
FROM (VALUES
  ('deleted-class', '00000000-0000-0000-0000-000001327053'::uuid, '00000000-0000-0000-0000-000001327022'::uuid),
  ('missing-class', '00000000-0000-0000-0000-000001327999'::uuid, '00000000-0000-0000-0000-000001327022'::uuid),
  ('deleted-person', '00000000-0000-0000-0000-000001327059'::uuid, '00000000-0000-0000-0000-000001327023'::uuid),
  ('missing-person', '00000000-0000-0000-0000-000001327059'::uuid, '00000000-0000-0000-0000-000001327998'::uuid)
) AS c(label, class_id, person_id);

DO $$
DECLARE
  v_got text;
BEGIN
  SELECT string_agg(label || '=' || coalesce(payload ->> 'error', 'NO-ERROR'), ', ' ORDER BY label)
    INTO v_got FROM t1327_results WHERE label LIKE 'case5-%';
  IF v_got IS DISTINCT FROM 'case5-deleted-class=P0002, case5-deleted-person=22023, case5-missing-class=P0002, case5-missing-person=22023' THEN
    RAISE EXCEPTION 'FAIL 5.0 wrong error codes: %', v_got;
  END IF;
  IF pg_temp.t1327_rows('00000000-0000-0000-0000-000001327059') <> 0 THEN
    RAISE EXCEPTION 'FAIL 5.1 a rejected person wrote an assignment';
  END IF;
  RAISE NOTICE 'PASS 5 deleted/missing class P0002, deleted/missing person 22023, no writes';
END;
$$;

-- 6. club_admin succeeds; site_admin succeeds on the published show AND on a DRAFT show
--    (settles whether SECURITY INVOKER can read the class there); the club's own secretary
--    also reaches its DRAFT show.
INSERT INTO t1327_results
SELECT 'case6-' || c.label, pg_temp.t1327_call(c.sub, c.class_id, c.person_id)
FROM (VALUES
  ('club-admin', '00000000-0000-0000-0000-000001327102', '00000000-0000-0000-0000-000001327054'::uuid, '00000000-0000-0000-0000-000001327022'::uuid),
  ('site-admin-draft', '00000000-0000-0000-0000-000001327103', '00000000-0000-0000-0000-000001327055'::uuid, '00000000-0000-0000-0000-000001327021'::uuid),
  ('site-admin-published', '00000000-0000-0000-0000-000001327103', '00000000-0000-0000-0000-000001327054'::uuid, '00000000-0000-0000-0000-000001327021'::uuid),
  ('secretary-draft', '00000000-0000-0000-0000-000001327101', '00000000-0000-0000-0000-000001327058'::uuid, '00000000-0000-0000-0000-000001327022'::uuid)
) AS c(label, sub, class_id, person_id);

DO $$
BEGIN
  IF (SELECT payload -> 'judge' ->> 'person_id' FROM t1327_results WHERE label = 'case6-club-admin')
     IS DISTINCT FROM '00000000-0000-0000-0000-000001327022' THEN
    RAISE EXCEPTION 'FAIL 6.0 club_admin pick did not return B: %', (SELECT payload FROM t1327_results WHERE label = 'case6-club-admin');
  END IF;
  IF pg_temp.t1327_confirmed_person('00000000-0000-0000-0000-000001327055') IS DISTINCT FROM '00000000-0000-0000-0000-000001327021'::uuid
     OR (SELECT payload -> 'judge' ->> 'person_id' FROM t1327_results WHERE label = 'case6-site-admin-draft')
        IS DISTINCT FROM '00000000-0000-0000-0000-000001327021' THEN
    RAISE EXCEPTION 'FAIL 6.1 site_admin could not pick on a DRAFT show: %', (SELECT payload FROM t1327_results WHERE label = 'case6-site-admin-draft');
  END IF;
  IF pg_temp.t1327_confirmed_person('00000000-0000-0000-0000-000001327054') IS DISTINCT FROM '00000000-0000-0000-0000-000001327021'::uuid THEN
    RAISE EXCEPTION 'FAIL 6.2 site_admin pick on the published show did not land: %', (SELECT payload FROM t1327_results WHERE label = 'case6-site-admin-published');
  END IF;
  IF pg_temp.t1327_confirmed_person('00000000-0000-0000-0000-000001327058') IS DISTINCT FROM '00000000-0000-0000-0000-000001327022'::uuid THEN
    RAISE EXCEPTION 'FAIL 6.3 the club secretary could not pick on its own DRAFT show: %', (SELECT payload FROM t1327_results WHERE label = 'case6-secretary-draft');
  END IF;
  RAISE NOTICE 'PASS 6 club_admin, site_admin (published and draft) and the club secretary (draft) succeed';
END;
$$;

-- 7. Non-confirmed class-level rows (invited, declined) are all replaced.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status)
VALUES
  ('00000000-0000-0000-0000-000001327021', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327056', 'invited'),
  ('00000000-0000-0000-0000-000001327022', '00000000-0000-0000-0000-000001327031', NULL,
   '00000000-0000-0000-0000-000001327056', 'declined');

INSERT INTO t1327_results
SELECT 'case7', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327056', '00000000-0000-0000-0000-000001327021');

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327056';
BEGIN
  IF pg_temp.t1327_rows(v_class) <> 1
     OR (SELECT status FROM public.judge_assignments WHERE class_id = v_class) <> 'confirmed'
     OR pg_temp.t1327_confirmed_person(v_class) IS DISTINCT FROM '00000000-0000-0000-0000-000001327021'::uuid THEN
    RAISE EXCEPTION 'FAIL 7.0 invited/declined rows were not all replaced by one confirmed row (% rows, payload %)', pg_temp.t1327_rows(v_class), (SELECT payload FROM t1327_results WHERE label = 'case7');
  END IF;
  RAISE NOTICE 'PASS 7 invited and declined class-level rows are replaced by a single confirmed row';
END;
$$;

-- 8. Show-level rows (class_id NULL) are untouched by a pick and by a removal.
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status, confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000001327081', '00000000-0000-0000-0000-000001327021',
   '00000000-0000-0000-0000-000001327031', NULL, NULL, 'confirmed', now());

INSERT INTO t1327_results
SELECT 'case8-pick', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327057', '00000000-0000-0000-0000-000001327022');
INSERT INTO t1327_results
SELECT 'case8-remove', pg_temp.t1327_call('00000000-0000-0000-0000-000001327101',
  '00000000-0000-0000-0000-000001327057', NULL);

DO $$
BEGIN
  IF (SELECT payload ->> 'error' FROM t1327_results WHERE label IN ('case8-pick', 'case8-remove') AND payload ? 'error' LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8.0 the case 8 calls raised, so the assertion below would be vacuous';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.judge_assignments
    WHERE id = '00000000-0000-0000-0000-000001327081' AND class_id IS NULL
      AND person_id = '00000000-0000-0000-0000-000001327021' AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'FAIL 8.1 the show-level assignment was changed or deleted';
  END IF;
  RAISE NOTICE 'PASS 8 show-level judge_assignments rows are untouched by pick and removal';
END;
$$;

-- 9. ACL: anon has no EXECUTE (and PUBLIC does not leak it); authenticated does.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.set_class_judge(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 9.0 anon can EXECUTE set_class_judge';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_class_judge(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 9.1 authenticated cannot EXECUTE set_class_judge';
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.set_class_judge(uuid,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'FAIL 9.2 set_class_judge must be SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'PASS 9 anon has no EXECUTE, authenticated does, function is SECURITY INVOKER';
END;
$$;

ROLLBACK;
