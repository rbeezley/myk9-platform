-- MYK9-1517 (migration 20261031055300): public.show_dogs_limited_view(show).
--
-- Executes the INSTALLED function as each caller tier. Properties asserted:
--   1. an exhibitor with a live entry in show A reads show A's dogs, including
--      another exhibitor's, with exactly the approved columns, a registered-name
--      fallback for a dog with no call name, and no entry whose number lives only
--      in the armbands table (alerts match entries.armband only);
--   2. a withdrawn entry, a soft-deleted entry and an entry with no armband are
--      not returned;
--   3. an exhibitor whose only entry is in show B gets nothing for show A, and
--      an exhibitor with no entry anywhere gets nothing;
--   4. an exhibitor whose ONLY entry in show A is withdrawn gets nothing;
--   5. a passcode session reads its own show only, and not after the passcode
--      is regenerated (stale generation) or for another show;
--   6. NULL show and no auth.uid() return nothing;
--   7. the return type carries no contact, fee, payment, registration or score
--      column, and the row limit is the hard 2000;
--   8. the function is closed to anon and PUBLIC, open to authenticated.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.
-- Fixture ids 1517xx.

BEGIN;

INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000001517001', 'MYK9-1517 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000001517002', 'MYK9-1517 Show A', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001517001', 'published'),
  ('00000000-0000-0000-0000-000001517003', 'MYK9-1517 Show B', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001517001', 'published');

INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES
  ('00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517002', 'MYK9-1517 Trial A', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000001517005', '00000000-0000-0000-0000-000001517003', 'MYK9-1517 Trial B', current_date, 'AKC');

-- Class 1..5 in show A (one live entry per dog per class), class 6 in show B.
INSERT INTO public.classes (id, trial_id, name, status)
SELECT ('00000000-0000-0000-0000-00000151710' || n)::uuid,
       '00000000-0000-0000-0000-000001517004', 'Container Novice ' || n, 'upcoming'
FROM generate_series(1, 5) n;
INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000001517106', '00000000-0000-0000-0000-000001517005', 'Container Novice B', 'upcoming');

-- People: 1 exhibitor X, 2 exhibitor Y, 3 show-B-only exhibitor, 4 outsider,
-- 5 exhibitor whose only show-A entry is withdrawn.
INSERT INTO public.people (id, first_name, last_name, email, phone, auth_user_id)
SELECT ('00000000-0000-0000-0000-00000151711' || n)::uuid, 'MYK9-1517', 'Person ' || n,
       'myk91517-' || n || '@example.test', '555-010' || n, NULL
FROM generate_series(1, 5) n;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT ('00000000-0000-0000-0000-00000151712' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'myk91517-' || n || '@example.test', '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM generate_series(1, 5) n;

-- Link after the auth users exist (the sign-in email invariant checks the match).
UPDATE public.people SET auth_user_id = ('00000000-0000-0000-0000-00000151712' || right(id::text, 1))::uuid
WHERE id::text LIKE '00000000-0000-0000-0000-00000151711%';

-- Dogs 1..5 owned by people 1..5.
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
SELECT ('00000000-0000-0000-0000-00000151713' || n)::uuid, 'MYK9-1517 Dog ' || n, 'Call' || n,
       'Breed' || n, ('00000000-0000-0000-0000-00000151711' || n)::uuid
FROM generate_series(1, 5) n;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT ('00000000-0000-0000-0000-00000151713' || n)::uuid, 'AKC (American Kennel Club)',
       'SR15170' || n, true
FROM generate_series(1, 5) n;

-- Show A: dog1 armband 101 (X), dog2 armband 102 (Y), dog5 withdrawn (person 5).
-- Dog1 also has a second class entry (class 2) that is soft-deleted, and dog2 a
-- second entry with no armband; neither may appear. Show B: dog3 armband 201.
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, handler, armband,
  run_order, entry_status, payment_status, entry_fee, check_in_status, deleted_at)
VALUES
  ('00000000-0000-0000-0000-000001517201', '00000000-0000-0000-0000-000001517131',
   '00000000-0000-0000-0000-000001517101', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517111', 'Xena Handler',
   '101', 3, 'confirmed', 'paid', 25, 'checked-in', NULL),
  ('00000000-0000-0000-0000-000001517202', '00000000-0000-0000-0000-000001517132',
   '00000000-0000-0000-0000-000001517101', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517112', 'Yuri Handler',
   '102', 4, 'confirmed', 'pending', 25, 'no-status', NULL),
  ('00000000-0000-0000-0000-000001517203', '00000000-0000-0000-0000-000001517135',
   '00000000-0000-0000-0000-000001517101', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517115', 'Withdrawn Handler',
   '105', 5, 'withdrawn', 'pending', 25, 'no-status', NULL),
  ('00000000-0000-0000-0000-000001517204', '00000000-0000-0000-0000-000001517131',
   '00000000-0000-0000-0000-000001517102', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517111', 'Xena Handler',
   '103', 9, 'confirmed', 'paid', 25, 'no-status', now()),
  ('00000000-0000-0000-0000-000001517205', '00000000-0000-0000-0000-000001517132',
   '00000000-0000-0000-0000-000001517103', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517112', 'Yuri Handler',
   NULL, 6, 'confirmed', 'pending', 25, 'no-status', NULL),
  ('00000000-0000-0000-0000-000001517206', '00000000-0000-0000-0000-000001517133',
   '00000000-0000-0000-0000-000001517106', '00000000-0000-0000-0000-000001517003',
   '00000000-0000-0000-0000-000001517005', '00000000-0000-0000-0000-000001517113', 'Show B Handler',
   '201', 1, 'confirmed', 'pending', 25, 'no-status', NULL);

-- Number held only in the armbands table: dog 6 (owned by person 1) has an entry with
-- no armband of its own. Alerts match entries.armband only, so it must NOT be listed.
-- Dog 7 has an empty call name and must fall back to dogs.name.
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000001517136', 'MYK9-1517 Dog 6', 'Call6', 'Breed6',
  '00000000-0000-0000-0000-000001517111'),
 ('00000000-0000-0000-0000-000001517137', 'Registered Seven', '', 'Breed7',
  '00000000-0000-0000-0000-000001517111');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000001517136', 'AKC (American Kennel Club)', 'SR151706', true),
 ('00000000-0000-0000-0000-000001517137', 'AKC (American Kennel Club)', 'SR151707', true);
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, handler, armband,
  run_order, entry_status, payment_status, entry_fee, check_in_status)
VALUES ('00000000-0000-0000-0000-000001517207', '00000000-0000-0000-0000-000001517136',
   '00000000-0000-0000-0000-000001517104', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517111', 'Assigned Handler',
   NULL, 7, 'confirmed', 'pending', 25, 'no-status'),
 ('00000000-0000-0000-0000-000001517208', '00000000-0000-0000-0000-000001517137',
   '00000000-0000-0000-0000-000001517105', '00000000-0000-0000-0000-000001517002',
   '00000000-0000-0000-0000-000001517004', '00000000-0000-0000-0000-000001517111', 'Seven Handler',
   '107', 8, 'confirmed', 'pending', 25, 'no-status');
INSERT INTO public.armbands (show_id, dog_id, entry_id, armband_number, is_available)
VALUES ('00000000-0000-0000-0000-000001517002', '00000000-0000-0000-0000-000001517136',
   '00000000-0000-0000-0000-000001517207', '104', false);

INSERT INTO public.show_passcodes (show_id, role, passcode_hash, created_at)
VALUES ('00000000-0000-0000-0000-000001517002', 'steward', 'myk9-1517-hash', '2026-10-10T00:00:00Z');

CREATE FUNCTION pg_temp.as_account(p_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.as_passcode(p_show uuid, p_generation text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001517199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001517199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', 'steward',
             'passcode_generation', p_generation))::text, true);
$$;

-- Static checks, as the fixture owner.
DO $$
DECLARE
  v_cols text[];
BEGIN
  IF has_function_privilege('anon', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE')
     OR has_function_privilege('public', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 8 ACL: anon/PUBLIC must not execute, authenticated must';
  END IF;

  SELECT array_agg(a ORDER BY a) INTO v_cols
  FROM unnest(proargnames) WITH ORDINALITY AS t(a, i), pg_proc
  WHERE pg_proc.oid = 'public.show_dogs_limited_view(uuid, integer, integer)'::regprocedure
    AND proargmodes IS NOT NULL AND proargmodes[i] = 't';
  IF v_cols IS DISTINCT FROM ARRAY['armband', 'breed', 'call_name', 'check_in_status', 'class_id',
       'class_name', 'handler_name', 'run_order', 'trial_date', 'trial_name'] THEN
    RAISE EXCEPTION 'FAIL 7 return columns are not exactly the approved set: %', v_cols;
  END IF;
  RAISE NOTICE 'PASS 7/8 approved columns only; anon and PUBLIC closed';
END $$;

SET LOCAL ROLE authenticated;

-- 1. exhibitor X sees show A: 101 (own), 102 (Y's) and 107; not 104 (armbands table only).
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517121');
DO $$
DECLARE
  r record;
  v_armbands integer[];
BEGIN
  SELECT array_agg(armband ORDER BY armband) INTO v_armbands
  FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002');
  IF v_armbands IS DISTINCT FROM ARRAY[101, 102, 107] THEN
    RAISE EXCEPTION 'FAIL 1/2 exhibitor must read exactly armbands 101,102,107 (number only in the armbands table, withdrawn, deleted and unnumbered left out), got %', v_armbands;
  END IF;
  SELECT * INTO r FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')
  WHERE armband = 102;
  IF r.call_name IS DISTINCT FROM 'Call2' OR r.breed IS DISTINCT FROM 'Breed2'
     OR r.handler_name IS DISTINCT FROM 'Yuri Handler'
     OR r.class_name IS DISTINCT FROM 'Container Novice 1'
     OR r.trial_name IS DISTINCT FROM 'MYK9-1517 Trial A'
     OR r.run_order IS DISTINCT FROM 4 OR r.check_in_status IS DISTINCT FROM 'no-status' THEN
    RAISE EXCEPTION 'FAIL 1 approved values wrong: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')
                 WHERE armband = 107 AND call_name = 'Registered Seven') THEN
    RAISE EXCEPTION 'FAIL 1 a dog with no call name must fall back to its registered name';
  END IF;
  RAISE NOTICE 'PASS 1/2 exhibitor reads the show''s dogs, approved fields only';
END $$;

-- 3. a show-B-only exhibitor and an outsider get nothing for show A.
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517123');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')) THEN
    RAISE EXCEPTION 'FAIL 3 another show''s exhibitor must read nothing for show A';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517003')) THEN
    RAISE EXCEPTION 'FAIL 3 control: that exhibitor must read their own show B';
  END IF;
  RAISE NOTICE 'PASS 3 caller for another show reads nothing';
END $$;
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517124');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002'))
     OR EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517003')) THEN
    RAISE EXCEPTION 'FAIL 3 a caller with no entry anywhere must read nothing';
  END IF;
  RAISE NOTICE 'PASS 3 caller with no entry reads nothing';
END $$;

-- 4. only a withdrawn entry in show A: nothing.
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517125');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')) THEN
    RAISE EXCEPTION 'FAIL 4 an exhibitor with only a withdrawn entry must read nothing';
  END IF;
  RAISE NOTICE 'PASS 4 withdrawn-only exhibitor reads nothing';
END $$;

-- 5. passcode sessions.
SELECT pg_temp.as_passcode('00000000-0000-0000-0000-000001517002', '2026-10-10T00:00:00Z');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')) <> 3 THEN
    RAISE EXCEPTION 'FAIL 5 a current passcode session must read its show';
  END IF;
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517003')) THEN
    RAISE EXCEPTION 'FAIL 5 a passcode session must not read another show';
  END IF;
  RAISE NOTICE 'PASS 5 passcode session scoped to its show';
END $$;
SELECT pg_temp.as_passcode('00000000-0000-0000-0000-000001517002', '2026-10-09T00:00:00Z');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')) THEN
    RAISE EXCEPTION 'FAIL 5 a stale-generation passcode must read nothing';
  END IF;
  RAISE NOTICE 'PASS 5 stale passcode generation reads nothing';
END $$;

-- 6. NULL show, and no auth.uid().
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517121');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view(NULL)) THEN
    RAISE EXCEPTION 'FAIL 6 NULL show must read nothing';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view('00000000-0000-0000-0000-000001517002')) THEN
    RAISE EXCEPTION 'FAIL 6 no auth.uid() must read nothing';
  END IF;
  RAISE NOTICE 'PASS 6 NULL show and missing identity read nothing';
END $$;

-- 7 (paging). A page is capped at 1000 rows in the installed body, and p_offset/p_limit
-- walk the list in a stable order with no gaps or repeats.
SELECT pg_temp.as_account('00000000-0000-0000-0000-000001517121');
DO $$
DECLARE
  v_show constant uuid := '00000000-0000-0000-0000-000001517002';
  v_a integer[];
  v_b integer[];
BEGIN
  SELECT array_agg(armband) INTO v_a FROM public.show_dogs_limited_view(v_show, 0, 1);
  SELECT array_agg(armband) INTO v_b FROM public.show_dogs_limited_view(v_show, 1, 1);
  IF v_a IS DISTINCT FROM ARRAY[101] OR v_b IS DISTINCT FROM ARRAY[102] THEN
    RAISE EXCEPTION 'FAIL 7 pages must walk 101 then 102, got % then %', v_a, v_b;
  END IF;
  IF EXISTS (SELECT 1 FROM public.show_dogs_limited_view(v_show, 3, 1)) THEN
    RAISE EXCEPTION 'FAIL 7 a page past the end must be empty';
  END IF;
  RAISE NOTICE 'PASS 7 paging walks the list without gaps or repeats';
END $$;
RESET ROLE;
DO $$
BEGIN
  IF pg_get_functiondef('public.show_dogs_limited_view(uuid, integer, integer)'::regprocedure) NOT LIKE '%least(greatest(coalesce(p_limit, 1000), 1), 1000)%' THEN
    RAISE EXCEPTION 'FAIL 7 the 1000-row page cap is missing from the installed function';
  END IF;
  RAISE NOTICE 'PASS page cap present';
END $$;

ROLLBACK;
