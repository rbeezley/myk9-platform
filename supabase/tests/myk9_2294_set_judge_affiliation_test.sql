-- MYK9-2294: set_judge_affiliation lets a show's manager set one judge's affiliation and nothing
-- else. Run with psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.
--
-- Asserts, against the migrated database:
--   1. effective EXECUTE: authenticated yes; anon and PUBLIC no (has_function_privilege);
--   2. a manager sets and clears the affiliation of an assigned judge (blank and spaces clear);
--   3. 42501, with one message, for a manager of another show, an unassigned person, declined
--      and cancelled assignments, a soft-deleted show, a soft-deleted person, an unknown person
--      and anon;
--   4. no other people column changes, version advances and updated_at moves (the fixture seeds
--      an older updated_at, because now() is constant inside one transaction);
--   5. the 200-character limit holds;
--   6. person_edit_allowed's definition is the same before and after.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('club_admin', 'MYK9-2294 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000000229401', 'MYK9-2294 Club A'),
  ('00000000-0000-0000-0000-000000229402', 'MYK9-2294 Club B');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000229411', 'MYK9-2294 Show A', 'ASCA', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000229401', 'published'),
  ('00000000-0000-0000-0000-000000229412', 'MYK9-2294 Show B', 'ASCA', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000229402', 'published'),
  ('00000000-0000-0000-0000-000000229413', 'MYK9-2294 Show A deleted', 'ASCA', current_date,
   current_date + 1, '00000000-0000-0000-0000-000000229401', 'published');

-- people: 21 manager of club A, 22 manager of club B, 31 assigned judge, 32 unassigned,
-- 33 declined, 34 cancelled, 35 assigned on the soft-deleted show, 36 soft-deleted judge.
INSERT INTO public.people (id, first_name, last_name, email, city, state, phone, updated_at) VALUES
  ('00000000-0000-0000-0000-000000229421', 'Mgr', 'A', 'myk9-2294-a@example.test', NULL, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000229422', 'Mgr', 'B', 'myk9-2294-b@example.test', NULL, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000229431', 'Jan', 'Judge', 'myk9-2294-j1@example.test', 'Austin', 'TX', '555-0101', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000229432', 'Una', 'Assigned', 'myk9-2294-j2@example.test', 'Reno', 'NV', NULL, now()),
  ('00000000-0000-0000-0000-000000229433', 'Dee', 'Declined', 'myk9-2294-j3@example.test', NULL, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000229434', 'Cal', 'Cancelled', 'myk9-2294-j4@example.test', NULL, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000229435', 'Sam', 'Showgone', 'myk9-2294-j5@example.test', NULL, NULL, NULL, now()),
  ('00000000-0000-0000-0000-000000229436', 'Gus', 'Gone', 'myk9-2294-j6@example.test', NULL, NULL, NULL, now());

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES
  ('00000000-0000-0000-0000-000000229441', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2294-a@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000229442', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2294-b@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000229441'
 WHERE id = '00000000-0000-0000-0000-000000229421';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000229442'
 WHERE id = '00000000-0000-0000-0000-000000229422';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000229421', roles.id,
       '00000000-0000-0000-0000-000000229401', true,
       '00000000-0000-0000-0000-000000229441'
FROM public.roles WHERE roles.name = 'club_admin';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000229422', roles.id,
       '00000000-0000-0000-0000-000000229402', true,
       '00000000-0000-0000-0000-000000229442'
FROM public.roles WHERE roles.name = 'club_admin';

INSERT INTO public.judge_assignments (person_id, show_id, status) VALUES
  ('00000000-0000-0000-0000-000000229431', '00000000-0000-0000-0000-000000229411', 'confirmed'),
  ('00000000-0000-0000-0000-000000229433', '00000000-0000-0000-0000-000000229411', 'declined'),
  ('00000000-0000-0000-0000-000000229434', '00000000-0000-0000-0000-000000229411', 'cancelled'),
  ('00000000-0000-0000-0000-000000229435', '00000000-0000-0000-0000-000000229413', 'invited'),
  ('00000000-0000-0000-0000-000000229436', '00000000-0000-0000-0000-000000229411', 'invited');

UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000229413';
UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000229436';

CREATE TEMP TABLE myk9_2294_before AS
SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.oid::regprocedure::text) AS def
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('person_edit_allowed', 'update_person_details');

-- 1. Effective grants.
DO $$
DECLARE
  fn CONSTANT regprocedure := 'public.set_judge_affiliation(uuid, uuid, text)'::regprocedure;
BEGIN
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute set_judge_affiliation';
  END IF;
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute set_judge_affiliation';
  END IF;
  IF has_function_privilege('public', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute set_judge_affiliation';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  mgr_a CONSTANT uuid := '00000000-0000-0000-0000-000000229441';
  mgr_b CONSTANT uuid := '00000000-0000-0000-0000-000000229442';
  show_a CONSTANT uuid := '00000000-0000-0000-0000-000000229411';
  show_deleted CONSTANT uuid := '00000000-0000-0000-0000-000000229413';
  judge CONSTANT uuid := '00000000-0000-0000-0000-000000229431';
  before_row public.people%ROWTYPE;
  after_row public.people%ROWTYPE;
  msgs text[] := '{}';
  msg text;
  attempt record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', mgr_a::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', mgr_a, 'role', 'authenticated')::text, true);

  -- 2. Set: only judge_affiliation changes; version advances; updated_at moves.
  SELECT * INTO before_row FROM public.people WHERE id = judge;
  PERFORM public.set_judge_affiliation(judge, show_a, '  ASCA-approved judge, Region 4  ');
  SELECT * INTO after_row FROM public.people WHERE id = judge;
  IF after_row.judge_affiliation IS DISTINCT FROM 'ASCA-approved judge, Region 4' THEN
    RAISE EXCEPTION 'FAIL affiliation was not saved trimmed (got %)', after_row.judge_affiliation;
  END IF;
  IF after_row.version <= before_row.version THEN
    RAISE EXCEPTION 'FAIL version did not advance (% -> %)', before_row.version, after_row.version;
  END IF;
  IF after_row.updated_at <= before_row.updated_at THEN
    RAISE EXCEPTION 'FAIL updated_at did not move (% -> %)', before_row.updated_at, after_row.updated_at;
  END IF;
  IF (to_jsonb(after_row) - 'judge_affiliation' - 'version' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(before_row) - 'judge_affiliation' - 'version' - 'updated_at') THEN
    RAISE EXCEPTION 'FAIL another people column changed';
  END IF;

  -- Clear: blank, and whitespace only, store NULL.
  PERFORM public.set_judge_affiliation(judge, show_a, '');
  SELECT * INTO after_row FROM public.people WHERE id = judge;
  IF after_row.judge_affiliation IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a blank affiliation did not clear it';
  END IF;
  PERFORM public.set_judge_affiliation(judge, show_a, 'x');
  PERFORM public.set_judge_affiliation(judge, show_a, '   ');
  SELECT * INTO after_row FROM public.people WHERE id = judge;
  IF after_row.judge_affiliation IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a whitespace affiliation did not clear it';
  END IF;

  -- 5. The 200-character limit.
  PERFORM public.set_judge_affiliation(judge, show_a, repeat('a', 200));
  BEGIN
    PERFORM public.set_judge_affiliation(judge, show_a, repeat('a', 201));
    RAISE EXCEPTION 'FAIL a 201-character affiliation was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3. Refusals, each 42501 with the same message.
  FOR attempt IN
    SELECT * FROM (VALUES
      ('manager of another show', mgr_b, judge, show_a),
      ('unassigned person', mgr_a, '00000000-0000-0000-0000-000000229432'::uuid, show_a),
      ('declined', mgr_a, '00000000-0000-0000-0000-000000229433'::uuid, show_a),
      ('cancelled', mgr_a, '00000000-0000-0000-0000-000000229434'::uuid, show_a),
      ('soft-deleted show', mgr_a, '00000000-0000-0000-0000-000000229435'::uuid, show_deleted),
      ('soft-deleted person', mgr_a, '00000000-0000-0000-0000-000000229436'::uuid, show_a),
      ('unknown person', mgr_a, '00000000-0000-0000-0000-0000000fffff'::uuid, show_a)
    ) AS t(label, caller, person, show)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', attempt.caller::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', attempt.caller, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.set_judge_affiliation(attempt.person, attempt.show, 'Intruder');
      RAISE EXCEPTION 'FAIL % was allowed', attempt.label;
    EXCEPTION WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      msgs := msgs || msg;
    END;
  END LOOP;
  IF (SELECT count(DISTINCT m) FROM unnest(msgs) AS m) <> 1 THEN
    RAISE EXCEPTION 'FAIL refusals reveal different messages: %', msgs;
  END IF;
  RAISE NOTICE 'PASS set and clear, 42501 for every refusal, one message';
END $$;

-- anon is refused by privilege (42501) before the body runs.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.set_judge_affiliation(
      '00000000-0000-0000-0000-000000229431',
      '00000000-0000-0000-0000-000000229411', 'Intruder');
    RAISE EXCEPTION 'FAIL anon called set_judge_affiliation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- 6. No refused call wrote anything (checked as postgres, so RLS hides no row), and
-- person_edit_allowed and update_person_details are untouched.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.people WHERE judge_affiliation = 'Intruder') THEN
    RAISE EXCEPTION 'FAIL a refused call still wrote the affiliation';
  END IF;
  IF (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.oid::regprocedure::text) FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.proname IN ('person_edit_allowed', 'update_person_details'))
     IS DISTINCT FROM (SELECT def FROM myk9_2294_before) THEN
    RAISE EXCEPTION 'FAIL person_edit_allowed or update_person_details changed';
  END IF;
  RAISE NOTICE 'PASS anon refused, no refused write, person edit functions unchanged';
END $$;

ROLLBACK;
