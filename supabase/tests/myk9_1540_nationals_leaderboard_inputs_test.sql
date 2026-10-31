-- MYK9-1540 (migration 20261031053100): get_nationals_leaderboard_inputs.
--
-- Properties asserted:
--   1. a judge assigned to ONE class of the show receives the rows of EVERY
--      class (a complete field), with real points for released classes;
--   1b. a judge assigned only to a class with no entries is admitted too;
--   2. a show steward, whose results view masks points_earned, receives real
--      points for released classes;
--   3. an entry in an UNRELEASED class arrives with no score at all
--      (is_scored false, result_status / points / time NULL);
--   4. a ringside passcode claim for this show is admitted; a claim for
--      another show, an exhibitor, and a caller with no role get no rows;
--   4d. a steward granted another show only reads that show (positive control) and none of this one;
--   4e. soft-deleted entries, classes, trials and shows never rank;
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
  ('00000000-0000-0000-0000-000001540014', NULL, 'Owner', 'O', 'myk9-1540-o@example.test'),
  ('00000000-0000-0000-0000-000001540015', NULL, 'Empty', 'J', 'myk9-1540-ej@example.test'),
  ('00000000-0000-0000-0000-000001540016', NULL, 'Other', 'ST', 'myk9-1540-st2@example.test');

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
  ('00000000-0000-0000-0000-000001540113', 'myk9-1540-x@example.test'),
  ('00000000-0000-0000-0000-000001540115', 'myk9-1540-ej@example.test'),
  ('00000000-0000-0000-0000-000001540116', 'myk9-1540-st2@example.test')
) AS u(id, email);

-- The caller context resolves a person by people.auth_user_id = auth.uid(); without this link a
-- judge's assigned classes come back empty.
UPDATE public.people AS person
SET auth_user_id = link.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000001540011'::uuid, '00000000-0000-0000-0000-000001540111'::uuid),
  ('00000000-0000-0000-0000-000001540012'::uuid, '00000000-0000-0000-0000-000001540112'::uuid),
  ('00000000-0000-0000-0000-000001540013'::uuid, '00000000-0000-0000-0000-000001540113'::uuid),
  ('00000000-0000-0000-0000-000001540015'::uuid, '00000000-0000-0000-0000-000001540115'::uuid),
  ('00000000-0000-0000-0000-000001540016'::uuid, '00000000-0000-0000-0000-000001540116'::uuid)
) AS link(person_id, auth_id)
WHERE person.id = link.person_id;

-- S1 and S2 are nationals; S3 is not.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
VALUES
  ('00000000-0000-0000-0000-000001540002', 'MYK9-1540 Nationals', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', true),
  ('00000000-0000-0000-0000-000001540022', 'MYK9-1540 Other Nationals', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', true),
  ('00000000-0000-0000-0000-000001540032', 'MYK9-1540 Regular Show', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', false),
  ('00000000-0000-0000-0000-000001540042', 'MYK9-1540 Deleted Nationals', 'AKC',
   current_date, current_date + 2, '00000000-0000-0000-0000-000001540001', 'published', true);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000001540003', '00000000-0000-0000-0000-000001540002',
   'MYK9-1540 Trial', current_date),
  ('00000000-0000-0000-0000-000001540033', '00000000-0000-0000-0000-000001540032',
   'MYK9-1540 Regular Trial', current_date),
  ('00000000-0000-0000-0000-000001540023', '00000000-0000-0000-0000-000001540022',
   'MYK9-1540 Other Trial', current_date),
  ('00000000-0000-0000-0000-000001540034', '00000000-0000-0000-0000-000001540002',
   'MYK9-1540 Deleted Trial', current_date),
  ('00000000-0000-0000-0000-000001540043', '00000000-0000-0000-0000-000001540042',
   'MYK9-1540 Deleted Show Trial', current_date);

-- A is released, B is not; R belongs to the non-nationals show.
INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-000001540003', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000b', '00000000-0000-0000-0000-000001540003', 'Interior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000c', '00000000-0000-0000-0000-000001540033', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000d', '00000000-0000-0000-0000-000001540003', 'Exterior Novice', 'upcoming'),
  -- S2's own released class, a deleted class, a class in a deleted trial, a class in a deleted show.
  ('00000000-0000-0000-0000-00000154000e', '00000000-0000-0000-0000-000001540023', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-00000154000f', '00000000-0000-0000-0000-000001540003', 'Buried Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001540010', '00000000-0000-0000-0000-000001540034', 'Trial-Deleted Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001540020', '00000000-0000-0000-0000-000001540043', 'Show-Deleted Novice', 'upcoming');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001540031', 'Alpha Registered', 'Alpha', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540032', 'Bravo Registered', 'Bravo', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540033', 'Charlie Registered', 'Charlie', 'Beagle', '00000000-0000-0000-0000-000001540013'),
  ('00000000-0000-0000-0000-000001540034', 'Delta Registered', 'Delta', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540035', 'Echo Registered', 'Echo', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540036', 'Foxtrot Registered', 'Foxtrot', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540037', 'Golf Registered', 'Golf', 'Beagle', '00000000-0000-0000-0000-000001540014'),
  ('00000000-0000-0000-0000-000001540038', 'Hotel Registered', 'Hotel', 'Beagle', '00000000-0000-0000-0000-000001540014');

-- entries_require_dog_registration() refuses an entry for a dog with no registration number.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR1540' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-00000154003_';

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
   '201', 1, true, 'qualified', 20.0, 7),
  -- S2: one scored entry in a released class (the positive control for the cross-show check).
  ('00000000-0000-0000-0000-000001540044', '00000000-0000-0000-0000-000001540034',
   '00000000-0000-0000-0000-00000154000e', '00000000-0000-0000-0000-000001540022',
   '00000000-0000-0000-0000-000001540023', 'Hannah Handler', 'confirmed', 'paid', 25,
   '301', 1, true, 'qualified', 22.0, 5),
  -- S1 entries that must never rank: a soft-deleted entry in a live released class, and live
  -- entries in a soft-deleted class and a soft-deleted trial.
  ('00000000-0000-0000-0000-000001540045', '00000000-0000-0000-0000-000001540035',
   '00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-000001540002',
   '00000000-0000-0000-0000-000001540003', 'Hannah Handler', 'confirmed', 'paid', 25,
   '103', 2, true, 'qualified', 10.0, 50),
  ('00000000-0000-0000-0000-000001540046', '00000000-0000-0000-0000-000001540036',
   '00000000-0000-0000-0000-00000154000f', '00000000-0000-0000-0000-000001540002',
   '00000000-0000-0000-0000-000001540003', 'Hannah Handler', 'confirmed', 'paid', 25,
   '104', 1, true, 'qualified', 10.0, 60),
  ('00000000-0000-0000-0000-000001540047', '00000000-0000-0000-0000-000001540037',
   '00000000-0000-0000-0000-000001540010', '00000000-0000-0000-0000-000001540002',
   '00000000-0000-0000-0000-000001540034', 'Hannah Handler', 'confirmed', 'paid', 25,
   '105', 1, true, 'qualified', 10.0, 70),
  -- A deleted nationals show the steward holds a grant for.
  ('00000000-0000-0000-0000-000001540048', '00000000-0000-0000-0000-000001540038',
   '00000000-0000-0000-0000-000001540020', '00000000-0000-0000-0000-000001540042',
   '00000000-0000-0000-0000-000001540043', 'Hannah Handler', 'confirmed', 'paid', 25,
   '401', 1, true, 'qualified', 10.0, 80);

UPDATE public.entries SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000001540045';
UPDATE public.classes SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-00000154000f';
UPDATE public.trials SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000001540034';
UPDATE public.shows SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000001540042';

UPDATE public.classes
SET results_released_at = now()
WHERE id IN ('00000000-0000-0000-0000-00000154000a', '00000000-0000-0000-0000-00000154000c',
             '00000000-0000-0000-0000-00000154000e', '00000000-0000-0000-0000-00000154000f',
             '00000000-0000-0000-0000-000001540010', '00000000-0000-0000-0000-000001540020');

-- The judge is assigned to class A only.
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000001540051', '00000000-0000-0000-0000-000001540011',
        '00000000-0000-0000-0000-000001540002', '00000000-0000-0000-0000-000001540003',
        '00000000-0000-0000-0000-00000154000a', 'confirmed');

-- A second judge is assigned only to class D, which has no entries at all.
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000001540052', '00000000-0000-0000-0000-000001540015',
        '00000000-0000-0000-0000-000001540002', '00000000-0000-0000-0000-000001540003',
        '00000000-0000-0000-0000-00000154000d', 'confirmed');

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
   '00000000-0000-0000-0000-000001540032'),
  ('00000000-0000-0000-0000-000001540012', '00000000-0000-0000-0000-000001540112',
   '00000000-0000-0000-0000-000001540042'),
  -- Grants for S2 ONLY: the cross-show subject.
  ('00000000-0000-0000-0000-000001540016', '00000000-0000-0000-0000-000001540116',
   '00000000-0000-0000-0000-000001540022')
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
  other_steward uuid := '00000000-0000-0000-0000-000001540116';
  s4 uuid := '00000000-0000-0000-0000-000001540042';
  deleted_ids uuid[] := ARRAY[
    '00000000-0000-0000-0000-000001540045', '00000000-0000-0000-0000-000001540046',
    '00000000-0000-0000-0000-000001540047', '00000000-0000-0000-0000-000001540048']::uuid[];
  empty_judge uuid := '00000000-0000-0000-0000-000001540115';
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

  -- 1b. A judge assigned only to a class with NO entries is still admitted to the show.
  PERFORM public.myk9_1540_act_as(empty_judge);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL judge assigned to an empty class received % rows, expected 2', n;
  END IF;
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s2);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL judge received % rows from a show they are not assigned to', n;
  END IF;

  -- 3b. Deleted entries, classes and trials never rank (S1 still has exactly the 2 live rows).
  PERFORM public.myk9_1540_act_as(judge);
  IF EXISTS (SELECT 1 FROM public.get_nationals_leaderboard_inputs(s1) r
             WHERE r.entry_id = ANY(deleted_ids)) THEN
    RAISE EXCEPTION 'FAIL a soft-deleted entry, class or trial ranked';
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

  -- 4d. Cross-show with a positive control: a steward granted S2 ONLY reads S2's row and nothing of S1.
  PERFORM public.myk9_1540_act_as(other_steward);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s2);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL steward granted S2 received % rows from S2, expected 1', n;
  END IF;
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s1);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL steward granted only S2 received % rows from S1, expected 0', n;
  END IF;

  -- 4e. A soft-deleted show returns nothing even to a steward granted it.
  PERFORM public.myk9_1540_act_as(steward);
  SELECT count(*) INTO n FROM public.get_nationals_leaderboard_inputs(s4);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL soft-deleted show returned % rows, expected 0', n;
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
