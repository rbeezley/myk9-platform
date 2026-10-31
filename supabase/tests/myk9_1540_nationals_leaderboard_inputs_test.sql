-- MYK9-1540 (migration 20261031053100): get_nationals_leaderboard_inputs.
--
-- Properties asserted:
--   1. a judge assigned to ONE class of the show receives the rows of EVERY
--      class (a complete field), with real points for released classes;
--   2. a show steward, whose results view masks points_earned, receives real
--      points for released classes;
--   3. an entry in an UNRELEASED class arrives with no score at all
--      (is_scored false, result_status / points / time NULL);
--   4. a ringside passcode claim for this show is admitted; a claim for
--      another show, an exhibitor, and a caller with no role get no rows;
--   5. a non-nationals show returns no rows, even to its staff;
--   6. anon cannot execute the function.
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000001540801', 'steward', 'MYK9-1540 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001540001', 'MYK9-1540 Club');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001540011', NULL, 'Judge', 'J', 'myk9-1540-j@example.test'),
  ('00000000-0000-0000-0000-000001540012', NULL, 'Steward', 'ST', 'myk9-1540-st@example.test'),
  ('00000000-0000-0000-0000-000001540013', NULL, 'Exhibitor', 'X', 'myk9-1540-x@example.test'),
  ('00000000-0000-0000-0000-000001540014', NULL, 'Owner', 'O', 'myk9-1540-o@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000001540111', 'myk9-1540-j@example.test'),
  ('00000000-0000-0000-0000-000001540112', 'myk9-1540-st@example.test'),
  ('00000000-0000-0000-0000-000001540113', 'myk9-1540-x@example.test')
) AS u(id, email);

-- S1 and S2 are nationals; S3 is not.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
VALUES
  ('00000000-0000-0000-0000-000001540002', 'MYK9-1540 Nationals', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', true),
  ('00000000-0000-0000-0000-000001540022', 'MYK9-1540 Other Nationals', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', true),
  ('00000000-0000-0000-0000-000001540032', 'MYK9-1540 Regular Show', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', false);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000001540003', '00000000-0000-0000-0000-000001540002',
   'MYK9-1540 Trial', current_date),
  ('00000000-0000-0000-0000-000001540033', '00000000-0000-0000-0000-000001540032',
   'MYK9-1540 Regular Trial', current_date);

-- A is released, B is not; R belongs to the non-nationals show.
INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-000001540003', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000b', '00000000-0000-0000-0000-000001540003', 'Interior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000c', '00000000-0000-0000-0000-000001540033', 'Container Novice', 'upcoming');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001540031', 'Alpha Registered', 'Alpha', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540032', 'Bravo Registered', 'Bravo', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540033', 'Charlie Registered', 'Charlie', 'Beagle', '00000000-0000-0000-0000-000001540013');

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler, entry_status, payment_status,
  entry_fee, armband, run_order, is_scored, result_status, search_time_seconds,
  points_earned
) VALUES
  ('00000000-0000-0000-0000-000001540041', '00000000-0000-0000-0000-000001540031',
   '00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-000001540002',
   '00000000-0000-0000-0000-000001540003', 'Hannah Handler', 'confirmed', 'paid', 25,
   '101', 1, true, 'qualified', 30.5, 10),
  ('00000000-0000-0000-0000-000001540042', '00000000-0000-0000-0000-000001540032',
   '00000000-0000-0000-0000-00000154000b', '00000000-0000-0000-0000-000001540002',
   '00000000-0000-0000-0000-000001540003', 'Hannah Handler', 'confirmed', 'paid', 25,
   '102', 1, true, 'qualified', 41.0, 99),
  ('00000000-0000-0000-0000-000001540043', '00000000-0000-0000-0000-000001540033',
   '00000000-0000-0000-0000-00000154000c', '00000000-0000-0000-0000-000001540032',
   '00000000-0000-0000-0000-000001540033', 'Hannah Handler', 'confirmed', 'paid', 25,
   '201', 1, true, 'qualified', 20.0, 7);

UPDATE public.classes
SET results_released_at = now()
WHERE id IN ('00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-00000154000c');

-- The judge is assigned to class A only.
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000001540051', '00000000-0000-0000-0000-000001540011',
        '00000000-0000-0000-0000-000001540002', '00000000-0000-0000-0000-000001540003',
        '00000000-0000-0000-0000-00000154000a', 'confirmed');

INSERT INTO public.show_passcodes (id, show_id, role, passcode_hash, passcode_ciphertext, created_at)
VALUES ('00000000-0000-0000-0000-000001540061', '00000000-0000-0000-0000-000001540002',
        'judge', 'myk9-1540-fixture-hash', NULL, '2026-10-30 15:00:00+00'::timestamptz);

-- Show-scoped steward rows are the ring-assignment grant; the S3 steward row
-- proves a nationals-only filter beats staff status.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, NULL, g.show_id::uuid, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000001540012', '00000000-0000-0000-0000-000001540112',
   '00000000-0000-0000-0000-000001540002'),
  ('00000000-0000-0000-0000-000001540012', '00000000-0000-0000-0000-000001540112',
   '00000000-0000-0000-0000-000001540032')
) AS g(person_id, auth_id, show_id)
JOIN public.roles r ON r.name = 'steward';

CREATE FUNCTION public.myk9_1540_act_as(p_auth uuid, p_app_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_auth IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', p_auth, 'role', 'authenticated',
                         'app_metadata', p_app_metadata)::text, true);
  END IF;
END;
$$;

DO $$
DECLARE
  s1 uuid := '00000000-0000-0000-0000-000001540002';
  s2 uuid := '00000000-0000-0000-0000-000001540022';
  s3 uuid := '00000000-0000-0000-0000-000001540032';
  judge uuid := '00000000-0000-0000-0000-000001540111';
  steward uuid := '00000000-0000-0000-0000-000001540112';
  exhibitor uuid := '00000000-0000-0000-0000-000001540113';
  nobody uuid := '00000000-0000-0000-0000-000001540199';
  n integer;
  r record;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1. Judge assigned to class A only: both classes' rows, real released points.
  PERFORM public.myk9_1540_act_as(judge);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL judge assigned to one class received % rows, expected 2', n;
  END IF;
  SELECT * INTO r FROM public.get_nationals_leaderboard_inputs(s1)
   WHERE class_id = '00000000-0000-0000-0000-00000154000a';
  IF r.points_earned IS DISTINCT FROM 10 OR r.is_scored IS NOT TRUE
     OR r.result_status IS DISTINCT FROM 'qualified'
     OR r.search_time_seconds IS DISTINCT FROM 30.5
     OR r.handler_name IS DISTINCT FROM 'Hannah Handler'
     OR r.dog_call_name IS DISTINCT FROM 'Alpha' THEN
    RAISE EXCEPTION 'FAIL judge did not receive the released class row intact: %', r;
  END IF;

  -- 3. The unreleased class arrives without its score.
  SELECT * INTO r FROM public.get_nationals_leaderboard_inputs(s1)
   WHERE class_id = '00000000-0000-0000-0000-00000154000b';
  IF r.entry_id IS NULL THEN
    RAISE EXCEPTION 'FAIL unreleased class row was not returned for its lifecycle';
  END IF;
  IF r.is_scored IS NOT FALSE OR r.result_status IS NOT NULL
     OR r.points_earned IS NOT NULL OR r.search_time_seconds IS NOT NULL
     OR r.class_results_released_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unreleased class leaked a score: %', r;
  END IF;

  -- 2. Steward: real points on the released class.
  PERFORM public.myk9_1540_act_as(steward);
  SELECT points_earned INTO n FROM public.get_nationals_leaderboard_inputs(s1)
   WHERE class_id = '00000000-0000-0000-0000-00000154000a';
  IF n IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'FAIL steward received points %, expected 10', n;
  END IF;

  -- 4a. Ringside judge claim for THIS show is admitted.
  PERFORM public.myk9_1540_act_as(nobody, jsonb_build_object('kind', 'ringside_passcode',
    'show_id', s1, 'ringside_role', 'judge',
    'passcode_generation', '2026-10-30T15:00:00+00:00'));
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL ringside judge claim received % rows, expected 2', n;
  END IF;

  -- 4b. A claim stamped for another show gets nothing here.
  PERFORM public.myk9_1540_act_as(nobody, jsonb_build_object('kind', 'ringside_passcode',
    'show_id', s2, 'ringside_role', 'judge',
    'passcode_generation', '2026-10-30T15:00:00+00:00'));
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL another show''s claim received % rows, expected 0', n;
  END IF;

  -- 4c. An exhibitor and a caller with no role get nothing.
  PERFORM public.myk9_1540_act_as(exhibitor);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor received % rows, expected 0', n;
  END IF;
  PERFORM public.myk9_1540_act_as(nobody);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL caller with no role received % rows, expected 0', n;
  END IF;

  -- 5. A non-nationals show returns nothing, even to its steward and judge claim.
  PERFORM public.myk9_1540_act_as(steward);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s3);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL non-nationals show returned % rows to its steward, expected 0', n;
  END IF;
  IF (SELECT count(*) FROM public.get_nationals_leaderboard_inputs(NULL)) <> 0 THEN
    RAISE EXCEPTION 'FAIL NULL show returned rows';
  END IF;

  EXECUTE 'RESET ROLE';

  -- 6. anon cannot execute.
  IF has_function_privilege('anon', 'public.get_nationals_leaderboard_inputs(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_nationals_leaderboard_inputs';
  END IF;
  IF has_function_privilege('public', 'public.get_nationals_leaderboard_inputs(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute get_nationals_leaderboard_inputs';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_nationals_leaderboard_inputs(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute get_nationals_leaderboard_inputs';
  END IF;

  RAISE NOTICE 'PASS MYK9-1540 leaderboard inputs: judge complete field, steward points, unreleased blanked, other callers denied';
END;
$$;

ROLLBACK;
