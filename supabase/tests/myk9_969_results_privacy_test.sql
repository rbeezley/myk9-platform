-- MYK9-969 (migration 20261004152300): results privacy.
--
-- Properties asserted here, each against the views that gate result
-- visibility for non-staff readers (view_public_entry_results,
-- view_authenticated_entry_results and its _replication wrapper):
--   1. a new account starts PRIVATE (handle_new_user's profile row has
--      results_public = false);
--   2. the people tied to an entry (owner, co-owner, handler) see its results;
--   3. another exhibitor at the show sees the entry but none of its results,
--      and results_private says why; the public view shows it as an anonymous
--      "Private entry" at its place;
--   4. anon sees the same anonymised row, and the standings keep every place;
--   5. show staff (secretary, club admin, the class judge, a steward, a
--      ringside staff passcode session, a site admin) see every result,
--      unmasked, on the staff path (view_authenticated_entry_results), and
--      the PUBLIC answer on the public view -- 5b: a secretary signed in on
--      the venue TV must not unmask the show;
--   6. most private wins: an entry is public only when EVERY tied person
--      opted in; a tied person with no account keeps it private;
--   7. the club's show-wide switch makes even fully opted-in entries private,
--      and never makes a private one public;
--   8. reports are unaffected: what staff read equals the entries table, under
--      every privacy setting, and placements are never rewritten;
--   9. the opt-in cannot be forged through exhibitor_profiles.person_id;
--  10. anon cannot read exhibitor_profiles at all;
--  11. every input to the privacy decision (opt-in flip, profile deleted,
--      account linked, dog ownership, handler, the club switch even with a
--      stale client clock, release, and the migration's own epoch) moves the
--      updated_at that replication's incremental pull reads.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People ids 9690xx, auth uids 9691xx (deliberately different).
--   969011 owner O      969012 co-owner CO   969013 handler H
--   969014 exhibitor X  969015 opted-in P    969016 mail-in M (no account)
--   969017 secretary S  969018 judge J       969019 steward ST
--   969020 site admin A 969021 club admin CA
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000969801', 'site_admin', 'MYK9-969 fixture', true),
  ('00000000-0000-0000-0000-000000969802', 'secretary', 'MYK9-969 fixture', true),
  ('00000000-0000-0000-0000-000000969804', 'club_admin', 'MYK9-969 fixture', true),
  ('00000000-0000-0000-0000-000000969805', 'steward', 'MYK9-969 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000969001', 'MYK9-969 Test Club');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000969011', NULL, 'Owner', 'O', 'myk9969-o@example.test'),
  ('00000000-0000-0000-0000-000000969012', NULL, 'CoOwner', 'CO', 'myk9969-co@example.test'),
  ('00000000-0000-0000-0000-000000969013', NULL, 'Handler', 'H', 'myk9969-h@example.test'),
  ('00000000-0000-0000-0000-000000969014', NULL, 'Other', 'X', 'myk9969-x@example.test'),
  ('00000000-0000-0000-0000-000000969015', NULL, 'Public', 'P', 'myk9969-p@example.test'),
  ('00000000-0000-0000-0000-000000969016', NULL, 'Mailin', 'M', 'myk9969-m@example.test'),
  ('00000000-0000-0000-0000-000000969017', NULL, 'Secretary', 'S', 'myk9969-s@example.test'),
  ('00000000-0000-0000-0000-000000969018', NULL, 'Judge', 'J', 'myk9969-j@example.test'),
  ('00000000-0000-0000-0000-000000969019', NULL, 'Steward', 'ST', 'myk9969-st@example.test'),
  ('00000000-0000-0000-0000-000000969020', NULL, 'Site', 'Admin', 'myk9969-a@example.test'),
  ('00000000-0000-0000-0000-000000969021', NULL, 'Club', 'Admin', 'myk9969-ca@example.test');

-- handle_new_user() adopts each person by email and creates its
-- exhibitor_profiles row. M deliberately gets no account.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000969111', 'myk9969-o@example.test'),
  ('00000000-0000-0000-0000-000000969112', 'myk9969-co@example.test'),
  ('00000000-0000-0000-0000-000000969113', 'myk9969-h@example.test'),
  ('00000000-0000-0000-0000-000000969114', 'myk9969-x@example.test'),
  ('00000000-0000-0000-0000-000000969115', 'myk9969-p@example.test'),
  ('00000000-0000-0000-0000-000000969117', 'myk9969-s@example.test'),
  ('00000000-0000-0000-0000-000000969118', 'myk9969-j@example.test'),
  ('00000000-0000-0000-0000-000000969119', 'myk9969-st@example.test'),
  ('00000000-0000-0000-0000-000000969120', 'myk9969-a@example.test'),
  ('00000000-0000-0000-0000-000000969121', 'myk9969-ca@example.test')
) AS u(id, email);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000969001', '00000000-0000-0000-0000-000000969017', 'active'),
  ('00000000-0000-0000-0000-000000969001', '00000000-0000-0000-0000-000000969021', 'active');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000969002', 'MYK9-969 Privacy Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000969001', 'published');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000969003', '00000000-0000-0000-0000-000000969002',
        'MYK9-969 Trial', current_date);

-- Every field on manual release, and the class is released below, so the
-- cascade shows everything and any NULL below is the privacy mask's doing.
INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing, time_timing, faults_timing
) VALUES ('00000000-0000-0000-0000-000000969002', 'review',
          'manual_release', 'manual_release', 'manual_release', 'manual_release');

INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000000969004', '00000000-0000-0000-0000-000000969003',
        'Container Novice', 'upcoming');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
VALUES
  ('00000000-0000-0000-0000-000000969031', 'Alpha Registered', 'Alpha', 'Beagle',
   '00000000-0000-0000-0000-000000969011', '00000000-0000-0000-0000-000000969012'),
  ('00000000-0000-0000-0000-000000969032', 'Xray Registered', 'Xray', 'Beagle',
   '00000000-0000-0000-0000-000000969014', NULL),
  ('00000000-0000-0000-0000-000000969033', 'Papa Registered', 'Papa', 'Beagle',
   '00000000-0000-0000-0000-000000969015', NULL),
  ('00000000-0000-0000-0000-000000969034', 'Mike Registered', 'Mike', 'Beagle',
   '00000000-0000-0000-0000-000000969016', NULL);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR969' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-00000096903_';

-- A: owner O, co-owner CO, handled by H.  X: X's own dog.  P: opted-in P.
-- M: mail-in owner M, no account.
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, payment_status,
  entry_fee, armband, run_order, is_scored, result_status, search_time_seconds,
  total_faults, total_score, final_placement
) VALUES
  ('00000000-0000-0000-0000-000000969041', '00000000-0000-0000-0000-000000969031',
   '00000000-0000-0000-0000-000000969004', '00000000-0000-0000-0000-000000969002',
   '00000000-0000-0000-0000-000000969003', '00000000-0000-0000-0000-000000969013',
   'confirmed', 'paid', 25, '101', 1, true, 'qualified', 30.5, 0, 100, 1),
  ('00000000-0000-0000-0000-000000969042', '00000000-0000-0000-0000-000000969032',
   '00000000-0000-0000-0000-000000969004', '00000000-0000-0000-0000-000000969002',
   '00000000-0000-0000-0000-000000969003', '00000000-0000-0000-0000-000000969014',
   'confirmed', 'paid', 25, '102', 2, true, 'qualified', 41.25, 0, 100, 2),
  ('00000000-0000-0000-0000-000000969043', '00000000-0000-0000-0000-000000969033',
   '00000000-0000-0000-0000-000000969004', '00000000-0000-0000-0000-000000969002',
   '00000000-0000-0000-0000-000000969003', '00000000-0000-0000-0000-000000969015',
   'confirmed', 'paid', 25, '103', 3, true, 'qualified', 52.0, 1, 100, 3),
  ('00000000-0000-0000-0000-000000969044', '00000000-0000-0000-0000-000000969034',
   '00000000-0000-0000-0000-000000969004', '00000000-0000-0000-0000-000000969002',
   '00000000-0000-0000-0000-000000969003', '00000000-0000-0000-0000-000000969016',
   'confirmed', 'paid', 25, '104', 4, true, 'nq', 90.0, 3, 0, NULL);

UPDATE public.classes
SET results_released_at = now()
WHERE id = '00000000-0000-0000-0000-000000969004';

INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000000969051', '00000000-0000-0000-0000-000000969018',
        '00000000-0000-0000-0000-000000969002', '00000000-0000-0000-0000-000000969003',
        '00000000-0000-0000-0000-000000969004', 'confirmed');

INSERT INTO public.show_passcodes (id, show_id, role, passcode_hash, passcode_ciphertext, created_at)
VALUES ('00000000-0000-0000-0000-000000969061', '00000000-0000-0000-0000-000000969002',
        'steward', 'myk9-969-fixture-hash', NULL, '2026-10-04 15:00:00+00'::timestamptz);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, g.show_id::uuid, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000969017', '00000000-0000-0000-0000-000000969117', 'secretary',
   '00000000-0000-0000-0000-000000969001', NULL),
  ('00000000-0000-0000-0000-000000969021', '00000000-0000-0000-0000-000000969121', 'club_admin',
   '00000000-0000-0000-0000-000000969001', NULL),
  ('00000000-0000-0000-0000-000000969019', '00000000-0000-0000-0000-000000969119', 'steward',
   NULL, '00000000-0000-0000-0000-000000969002'),
  ('00000000-0000-0000-0000-000000969020', '00000000-0000-0000-0000-000000969120', 'site_admin',
   NULL, NULL)
) AS g(person_id, auth_id, role_name, club_id, show_id)
JOIN public.roles r ON r.name = g.role_name;

-- What the entries table holds, for the "reports unaffected" comparisons.
CREATE TEMP TABLE myk9_969_truth ON COMMIT DROP AS
SELECT id, result_status, search_time_seconds, total_faults, total_score, final_placement
FROM public.entries
WHERE class_id = '00000000-0000-0000-0000-000000969004';
GRANT SELECT ON myk9_969_truth TO anon, authenticated;

-- Act as an account (NULL = anon). Claims are transaction-local.
CREATE FUNCTION pg_temp.act_as(p_auth uuid, p_app_metadata jsonb DEFAULT '{}'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 1. Default private.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_profiles integer;
  n_public integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE results_public)
    INTO n_profiles, n_public
  FROM public.exhibitor_profiles
  WHERE auth_user_id::text LIKE '00000000-0000-0000-0000-0000009691__';
  IF n_profiles <> 10 OR n_public <> 0 THEN
    RAISE EXCEPTION 'FAIL new accounts must start private: % profiles, % public', n_profiles, n_public;
  END IF;
  RAISE NOTICE 'PASS 1 every new account starts private (results_public = false)';
END;
$$;

-- P opts in. Every other account stays private.
UPDATE public.exhibitor_profiles SET results_public = true
WHERE auth_user_id = '00000000-0000-0000-0000-000000969115';

-- ---------------------------------------------------------------------------
-- 2. The tied people see their own entry's results, on both views.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  viewer uuid;
  r record;
  p record;
BEGIN
  FOREACH viewer IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000969111'::uuid,  -- owner
    '00000000-0000-0000-0000-000000969112'::uuid,  -- co-owner
    '00000000-0000-0000-0000-000000969113'::uuid   -- handler
  ] LOOP
    PERFORM pg_temp.act_as(viewer);
    SELECT * INTO r FROM public.view_authenticated_entry_results
    WHERE id = '00000000-0000-0000-0000-000000969041';
    IF r.id IS NULL OR r.result_status IS DISTINCT FROM 'qualified'
       OR r.final_placement IS DISTINCT FROM 1 OR r.search_time_seconds IS DISTINCT FROM 30.5
       OR r.result_text IS DISTINCT FROM 'Q' OR r.results_private IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'FAIL tied person % cannot see own results: %', viewer, row_to_json(r);
    END IF;
    SELECT * INTO p FROM public.view_public_entry_results
    WHERE id = '00000000-0000-0000-0000-000000969041';
    IF p.id IS NULL OR p.dog_call_name IS DISTINCT FROM 'Alpha'
       OR p.search_time_seconds IS DISTINCT FROM 30.5 OR p.results_private IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'FAIL tied person % gets an anonymised public row: %', viewer, row_to_json(p);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 2 owner, co-owner and handler see their own private results on both views';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Another exhibitor at the show sees the entry, none of its results.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  p record;
  rep record;
  own record;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969114');
  SELECT * INTO r FROM public.view_authenticated_entry_results
  WHERE id = '00000000-0000-0000-0000-000000969041';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'FAIL other exhibitor lost the entry row itself (run order is not a result)';
  END IF;
  IF r.result_status IS NOT NULL OR r.final_placement IS NOT NULL
     OR r.search_time_seconds IS NOT NULL OR r.total_faults IS NOT NULL
     OR r.total_score IS NOT NULL OR r.result_text IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL other exhibitor sees a private result: %', row_to_json(r);
  END IF;
  IF r.results_private IS DISTINCT FROM true OR r.dog_call_name IS DISTINCT FROM 'Alpha' THEN
    RAISE EXCEPTION 'FAIL masked authenticated row must keep identity and say results_private: %',
      row_to_json(r);
  END IF;

  SELECT * INTO rep FROM public.view_authenticated_entry_results_replication
  WHERE id = '00000000-0000-0000-0000-000000969041';
  IF rep.result_status IS NOT NULL OR rep.final_placement IS NOT NULL
     OR rep.search_time_seconds IS NOT NULL OR rep.results_private IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL replication feed carries a private result to another device: %',
      row_to_json(rep);
  END IF;

  SELECT * INTO own FROM public.view_authenticated_entry_results
  WHERE id = '00000000-0000-0000-0000-000000969042';
  IF own.result_status IS DISTINCT FROM 'qualified' OR own.results_private IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL X lost their own results: %', row_to_json(own);
  END IF;

  -- The public view: still there, at its place, but anonymous.
  IF EXISTS (SELECT 1 FROM public.view_public_entry_results
             WHERE id = '00000000-0000-0000-0000-000000969041') THEN
    RAISE EXCEPTION 'FAIL the public view leaks the private entry''s real id';
  END IF;
  SELECT * INTO p FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004' AND final_placement = 1;
  IF p.dog_call_name IS DISTINCT FROM 'Private entry' OR p.dog_name IS DISTINCT FROM 'Private entry'
     OR p.dog_id IS NOT NULL OR p.armband IS NOT NULL OR p.handler IS NOT NULL
     OR p.run_order IS NOT NULL OR p.dog_breed IS NOT NULL OR p.dog_image_url IS NOT NULL
     OR p.scoring_completed_at IS NOT NULL OR p.created_at IS NOT NULL
     OR p.search_time_seconds IS NOT NULL OR p.total_score IS NOT NULL
     OR p.total_faults IS NOT NULL OR p.results_private IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL the public row for a private entry is not anonymous: %', row_to_json(p);
  END IF;
  RAISE NOTICE 'PASS 3 another exhibitor sees the entry but not its results; public row is "Private entry" at its place';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Anon: the same anonymised row, and every place in the standings.
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE
  places integer[];
  n_rows integer;
  n_q integer;
  n_private integer;
  leaked integer;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  SELECT array_agg(final_placement ORDER BY final_placement) FILTER (WHERE final_placement IS NOT NULL),
         count(*), count(*) FILTER (WHERE result_status = 'qualified'),
         count(*) FILTER (WHERE results_private)
    INTO places, n_rows, n_q, n_private
  FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  IF n_rows <> 4 OR places IS DISTINCT FROM ARRAY[1, 2, 3] OR n_q <> 3 THEN
    RAISE EXCEPTION 'FAIL anon standings changed: rows %, places %, Q %', n_rows, places, n_q;
  END IF;
  -- A (owner O private), X (X private) and M (no account) are private; P opted in.
  IF n_private <> 3 THEN
    RAISE EXCEPTION 'FAIL anon expected 3 private rows, got %', n_private;
  END IF;
  SELECT count(*) INTO leaked FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004'
    AND results_private
    AND (dog_call_name <> 'Private entry' OR search_time_seconds IS NOT NULL OR armband IS NOT NULL
         OR dog_id IS NOT NULL OR handler IS NOT NULL);
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'FAIL anon reads identity or time on % private row(s)', leaked;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.view_public_entry_results
                 WHERE id = '00000000-0000-0000-0000-000000969043'
                   AND dog_call_name = 'Papa' AND search_time_seconds = 52.0
                   AND NOT results_private) THEN
    RAISE EXCEPTION 'FAIL anon cannot see the opted-in entry';
  END IF;
  RAISE NOTICE 'PASS 4 anon sees private entries anonymised at their places and the opted-in one in full';
END;
$$;

-- 10. anon has no access to exhibitor_profiles at all.
DO $$
BEGIN
  BEGIN
    PERFORM results_public FROM public.exhibitor_profiles LIMIT 1;
    RAISE EXCEPTION 'FAIL anon read exhibitor_profiles.results_public';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 10 anon cannot read exhibitor_profiles';
  END;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5 + 8. Staff see everything, and what they see is the entries table.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.assert_staff_sees_all(p_label text, p_public_masked integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  viewer record;
  mismatches integer;
  masked integer;
  pub_masked integer;
BEGIN
  FOR viewer IN
    SELECT * FROM (VALUES
      ('secretary', '00000000-0000-0000-0000-000000969117'::uuid, '{}'::jsonb),
      ('club admin', '00000000-0000-0000-0000-000000969121'::uuid, '{}'::jsonb),
      ('class judge', '00000000-0000-0000-0000-000000969118'::uuid, '{}'::jsonb),
      ('steward', '00000000-0000-0000-0000-000000969119'::uuid, '{}'::jsonb),
      ('site admin', '00000000-0000-0000-0000-000000969120'::uuid, '{}'::jsonb)
    ) AS v(label, auth_id, app_metadata)
  LOOP
    PERFORM pg_temp.act_as(viewer.auth_id, viewer.app_metadata);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) FILTER (WHERE v.id IS NULL
             OR v.result_status IS DISTINCT FROM t.result_status
             OR v.search_time_seconds IS DISTINCT FROM t.search_time_seconds
             OR v.total_faults IS DISTINCT FROM t.total_faults
             OR v.total_score IS DISTINCT FROM t.total_score
             OR v.final_placement IS DISTINCT FROM t.final_placement),
           count(*) FILTER (WHERE v.results_private)
      INTO mismatches, masked
    FROM myk9_969_truth t
    LEFT JOIN public.view_authenticated_entry_results v ON v.id = t.id;
    SELECT count(*) FILTER (WHERE results_private) INTO pub_masked
    FROM public.view_public_entry_results
    WHERE class_id = '00000000-0000-0000-0000-000000969004';
    EXECUTE 'RESET ROLE';
    -- The steward is admitted with cascade-visible (not judge) columns, which
    -- here are all released, so the comparison holds for every staff role.
    -- Staff paths: every result, unmasked. The PUBLIC view: the public answer,
    -- even signed in as staff (a venue TV must not unmask the show).
    IF mismatches <> 0 OR masked <> 0 OR pub_masked <> p_public_masked THEN
      RAISE EXCEPTION 'FAIL [%] % : % mismatched, % masked on the staff path, % public masked (want %)',
        p_label, viewer.label, mismatches, masked, pub_masked, p_public_masked;
    END IF;
  END LOOP;

  -- A ringside steward passcode session (an anonymous auth user with a show
  -- claim). The steward claim is the arm privacy adds beyond can_view_scores.
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969199',
    jsonb_build_object('kind', 'ringside_passcode',
                       'show_id', '00000000-0000-0000-0000-000000969002',
                       'ringside_role', 'steward',
                       'passcode_generation', '2026-10-04T15:00:00+00:00'));
  IF public.ringside_claim_generation_current() IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL fixture: the ringside steward claim is not current';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), count(*) FILTER (WHERE results_private) INTO mismatches, masked
  FROM public.view_authenticated_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  SELECT count(*) FILTER (WHERE results_private) INTO pub_masked
  FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  EXECUTE 'RESET ROLE';
  IF mismatches <> 4 OR masked <> 0 OR pub_masked <> p_public_masked THEN
    RAISE EXCEPTION 'FAIL [%] ringside steward session: % rows, % masked, % public masked (want %)',
      p_label, mismatches, masked, pub_masked, p_public_masked;
  END IF;

  -- Placements are server-authoritative and privacy never writes them.
  IF EXISTS (SELECT 1 FROM public.entries e JOIN myk9_969_truth t ON t.id = e.id
             WHERE e.final_placement IS DISTINCT FROM t.final_placement
                OR e.result_status IS DISTINCT FROM t.result_status) THEN
    RAISE EXCEPTION 'FAIL [%] a placement or result was rewritten', p_label;
  END IF;
END;
$$;

SELECT pg_temp.assert_staff_sees_all('person settings', 3);
DO $$ BEGIN RAISE NOTICE 'PASS 5/8 staff see every result unmasked and equal to the entries table on staff paths, and the public answer on the public view'; END $$;

-- 5b. The venue TV: a secretary signed in on the TV display reads the PUBLIC
--     view, and must get the anonymised row, not the dog.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  p record;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969117');
  SELECT * INTO p FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004' AND final_placement = 1;
  IF p.dog_call_name IS DISTINCT FROM 'Private entry' OR p.handler IS NOT NULL
     OR p.search_time_seconds IS NOT NULL OR p.armband IS NOT NULL
     OR p.results_private IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 5b a signed-in secretary unmasks the public view (venue TV): %',
      row_to_json(p);
  END IF;
  RAISE NOTICE 'PASS 5b a secretary signed in on the public TV gets the anonymised row';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. Most private wins.
-- ---------------------------------------------------------------------------
-- Owner and handler opt in; the co-owner has not. Still private.
UPDATE public.exhibitor_profiles SET results_public = true
WHERE auth_user_id IN ('00000000-0000-0000-0000-000000969111',
                       '00000000-0000-0000-0000-000000969113');

CREATE FUNCTION pg_temp.other_sees_a() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  auth_row record;
  anon_row record;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969114');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT result_status, results_private INTO auth_row
  FROM public.view_authenticated_entry_results
  WHERE id = '00000000-0000-0000-0000-000000969041';
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.act_as(NULL);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT dog_call_name, results_private INTO anon_row
  FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004' AND final_placement = 1;
  EXECUTE 'RESET ROLE';
  IF (auth_row.result_status IS NOT NULL) <> (anon_row.dog_call_name = 'Alpha')
     OR auth_row.results_private <> anon_row.results_private THEN
    RAISE EXCEPTION 'FAIL the two views disagree about entry A: % vs %',
      row_to_json(auth_row), row_to_json(anon_row);
  END IF;
  RETURN auth_row.result_status IS NOT NULL;
END;
$$;

DO $$
BEGIN
  IF pg_temp.other_sees_a() THEN
    RAISE EXCEPTION 'FAIL entry A went public while its co-owner is still private';
  END IF;
  -- The co-owner opts in: now every tied person has, and A is public.
  UPDATE public.exhibitor_profiles SET results_public = true
  WHERE auth_user_id = '00000000-0000-0000-0000-000000969112';
  IF NOT pg_temp.other_sees_a() THEN
    RAISE EXCEPTION 'FAIL entry A stayed private after all three tied people opted in';
  END IF;
  RAISE NOTICE 'PASS 6 an entry is public only when every tied person opted in (most private wins)';
END;
$$;

-- A tied person with no account (M) keeps the entry private.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  IF EXISTS (SELECT 1 FROM public.view_public_entry_results
             WHERE dog_call_name = 'Mike') THEN
    RAISE EXCEPTION 'FAIL an entry whose owner has no account went public';
  END IF;
  RAISE NOTICE 'PASS 6b a tied person with no account keeps the entry private';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 9. The opt-in cannot be forged through exhibitor_profiles.person_id.
--    X points their OWN profile at M's person row (the self-only UPDATE policy
--    allows it) and opts in. M's entry must stay private.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969114');
  UPDATE public.exhibitor_profiles
  SET person_id = '00000000-0000-0000-0000-000000969016', results_public = true
  WHERE auth_user_id = '00000000-0000-0000-0000-000000969114';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL fixture: X could not update their own profile (% rows)', n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.view_authenticated_entry_results
             WHERE id = '00000000-0000-0000-0000-000000969044' AND result_status IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a forged exhibitor_profiles.person_id opted a stranger in';
  END IF;
  RAISE NOTICE 'PASS 9 the opt-in is read through the person''s own account, not a rewritable person_id';
END;
$$;
RESET ROLE;
UPDATE public.exhibitor_profiles
SET person_id = '00000000-0000-0000-0000-000000969014', results_public = false
WHERE auth_user_id = '00000000-0000-0000-0000-000000969114';

-- ---------------------------------------------------------------------------
-- 7. The club's show-wide switch. P (and now A) are fully opted in; the switch
--    makes them private to others, and staff and the tied people still see.
-- ---------------------------------------------------------------------------
UPDATE public.show_visibility_settings SET results_private = true
WHERE show_id = '00000000-0000-0000-0000-000000969002';

DO $$
DECLARE
  n_private integer;
  own record;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  SET LOCAL ROLE anon;
  SELECT count(*) FILTER (WHERE results_private) INTO n_private
  FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  RESET ROLE;
  IF n_private <> 4 THEN
    RAISE EXCEPTION 'FAIL a private show still publishes % entries to anon', 4 - n_private;
  END IF;
  IF pg_temp.other_sees_a() THEN
    RAISE EXCEPTION 'FAIL a private show still shows a fully opted-in entry to another exhibitor';
  END IF;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969115');
  SET LOCAL ROLE authenticated;
  SELECT result_status, results_private INTO own FROM public.view_authenticated_entry_results
  WHERE id = '00000000-0000-0000-0000-000000969043';
  RESET ROLE;
  IF own.result_status IS DISTINCT FROM 'qualified' OR own.results_private THEN
    RAISE EXCEPTION 'FAIL a private show hid P''s own result from P: %', row_to_json(own);
  END IF;
  RAISE NOTICE 'PASS 7 the club''s private switch hides opted-in entries from others, not from their own people';
END;
$$;

SELECT pg_temp.assert_staff_sees_all('private show', 4);
DO $$ BEGIN RAISE NOTICE 'PASS 7/8 staff results are unchanged under the club''s private switch'; END $$;

-- Switching it back restores exactly the per-person outcome: the club layer
-- only ever adds privacy.
UPDATE public.show_visibility_settings SET results_private = false
WHERE show_id = '00000000-0000-0000-0000-000000969002';
DO $$
DECLARE
  n_private integer;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  SET LOCAL ROLE anon;
  SELECT count(*) FILTER (WHERE results_private) INTO n_private
  FROM public.view_public_entry_results
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  RESET ROLE;
  -- A and P opted in fully; X and M are private.
  IF n_private <> 2 THEN
    RAISE EXCEPTION 'FAIL with the club switch off anon should see 2 private rows, got %', n_private;
  END IF;
  RAISE NOTICE 'PASS 7b the club switch never makes a private entry public';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Every input to the privacy decision moves the row's updated_at, which is
--     what a warm replica's incremental pull reads (updated_at > watermark).
--
--     now() is frozen for the whole transaction, so "moves" is measured by
--     first backdating every timestamp the row could read to 2000-01-01
--     (triggers bypassed), making ONE input change the normal way (triggers
--     on), and requiring the row's updated_at to reach now().
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.backdate() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE public.entries SET updated_at = '2000-01-01'
  WHERE class_id = '00000000-0000-0000-0000-000000969004';
  UPDATE public.classes SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000969004';
  UPDATE public.shows SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000969002';
  UPDATE public.show_visibility_settings SET updated_at = '2000-01-01'
  WHERE show_id = '00000000-0000-0000-0000-000000969002';
  UPDATE public.dogs SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-00000096903_';
  UPDATE public.people SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-0000009690__';
  UPDATE public.exhibitor_profiles SET updated_at = '2000-01-01'
  WHERE auth_user_id::text LIKE '00000000-0000-0000-0000-0000009691__';
  IF to_regclass('private.results_privacy_epoch') IS NOT NULL THEN
    EXECUTE 'UPDATE private.results_privacy_epoch SET updated_at = ''2000-01-01''';
  END IF;
  SET LOCAL session_replication_role = origin;
END;
$$;

-- The row's updated_at as a replica reads it (the replication wrapper, as staff).
CREATE FUNCTION pg_temp.replica_ts(p_entry uuid) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE
  ts timestamptz;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000969117');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO ts FROM public.view_authenticated_entry_results_replication
  WHERE id = p_entry;
  EXECUTE 'RESET ROLE';
  RETURN ts;
END;
$$;

CREATE FUNCTION pg_temp.assert_moved(p_entry uuid, p_input text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  ts timestamptz := pg_temp.replica_ts(p_entry);
BEGIN
  IF ts IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'FAIL 11 [%] did not move the replica watermark column: updated_at = %',
      p_input, ts;
  END IF;
  RAISE NOTICE 'PASS 11 [%] moves the entry row''s updated_at', p_input;
END;
$$;

-- Control: with everything backdated, the row reads 2000-01-01.
DO $$
BEGIN
  PERFORM pg_temp.backdate();
  IF pg_temp.replica_ts('00000000-0000-0000-0000-000000969043') <> '2000-01-01'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 11 control: backdating did not reach every GREATEST input (%)',
      pg_temp.replica_ts('00000000-0000-0000-0000-000000969043');
  END IF;
  RAISE NOTICE 'PASS 11 control: a fully backdated row reads 2000-01-01';
END;
$$;

-- a. A tied person's opt-in flip (P turns private).
SELECT pg_temp.backdate();
UPDATE public.exhibitor_profiles SET results_public = false
WHERE auth_user_id = '00000000-0000-0000-0000-000000969115';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969043', 'opt-in flip');

-- b. A tied person's profile deleted (site admin only): O's entry A.
SELECT pg_temp.backdate();
DELETE FROM public.exhibitor_profiles WHERE auth_user_id = '00000000-0000-0000-0000-000000969111';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969041', 'profile deleted');

-- c. A tied person's account linked: M (mail-in, no account) signs up, and
--    handle_new_user adopts the people row and creates the profile.
SELECT pg_temp.backdate();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES ('00000000-0000-0000-0000-000000969116', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'myk9969-m@example.test', '', now(), now(), now(),
          '{}', '{}', false, false, false);
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969044', 'account linked');

-- d. The dog gains a co-owner (an opted-in dog's ownership changes).
SELECT pg_temp.backdate();
UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000969014'
WHERE id = '00000000-0000-0000-0000-000000969033';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969043', 'dog co-owner changed');

-- e. The entry's handler changes.
SELECT pg_temp.backdate();
UPDATE public.entries SET handler_id = '00000000-0000-0000-0000-000000969014'
WHERE id = '00000000-0000-0000-0000-000000969043';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969043', 'handler changed');

-- f. The club's switch, written with a STALE client timestamp (the app sends
--    its own clock): the server must stamp it.
SELECT pg_temp.backdate();
UPDATE public.show_visibility_settings
SET results_private = true, updated_at = '2000-01-01'
WHERE show_id = '00000000-0000-0000-0000-000000969002';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969042', 'show switch (stale client clock)');

-- g. Results released / unreleased.
SELECT pg_temp.backdate();
UPDATE public.classes SET results_released_at = NULL
WHERE id = '00000000-0000-0000-0000-000000969004';
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969042', 'results unreleased');

-- h. This migration itself: every entry turned private at once. Its epoch row
--    must lift a row that nothing else touched.
SELECT pg_temp.backdate();
DO $$
BEGIN
  IF to_regclass('private.results_privacy_epoch') IS NULL THEN
    RAISE EXCEPTION 'FAIL 11 [migration epoch] private.results_privacy_epoch does not exist';
  END IF;
  EXECUTE 'UPDATE private.results_privacy_epoch SET updated_at = now()';
END;
$$;
SELECT pg_temp.assert_moved('00000000-0000-0000-0000-000000969042', 'migration epoch');

-- The epoch table is unreachable by app roles.
DO $$
BEGIN
  IF has_table_privilege('anon', 'private.results_privacy_epoch', 'SELECT')
     OR has_table_privilege('authenticated', 'private.results_privacy_epoch', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 11 an app role can read private.results_privacy_epoch';
  END IF;
  RAISE NOTICE 'PASS 11 the epoch table is owner-only';
END;
$$;

-- Views kept their owner-run reloptions (CREATE OR REPLACE resets them).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN ('public.view_public_entry_results'::regclass,
                  'public.view_authenticated_entry_results'::regclass,
                  'public.view_authenticated_entry_results_replication'::regclass)
      AND COALESCE(reloptions, '{}'::text[]) <> ARRAY['security_invoker=false']
  ) THEN
    RAISE EXCEPTION 'FAIL a results view lost WITH (security_invoker = false)';
  END IF;
  RAISE NOTICE 'PASS the three results views remain owner-run';
END;
$$;

ROLLBACK;
