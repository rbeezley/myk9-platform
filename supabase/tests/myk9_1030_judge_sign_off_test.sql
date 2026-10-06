-- MYK9-1030 (migration 20261006154700): the judge's end-of-day sign-off and
-- the results check against the paper score sheets.
--
-- Properties asserted here:
--   1. grants: anon and PUBLIC cannot execute either RPC, authenticated can;
--      authenticated may read the two new columns, anon may not;
--   2. an exhibitor, and a secretary of ANOTHER club, are refused (42501) by
--      both RPCs and write nothing;
--   3. a class that is not complete is refused (55000) and the whole call
--      writes nothing, even for the complete class beside it;
--   4. a missing class is refused (P0002);
--   5. the show's secretary signs off a set of classes in one call: each is
--      stamped with the time and with the CALLER's auth uid (never a people
--      id), a two-class call returns NULL;
--   6. signing off again keeps the first stamp and returns the class version;
--   7. a signed-off-at in the future is clamped to now;
--   8. the per-class undo clears one class only; the club admin may use it;
--   9. anon calling it at all is refused.
--  10. results checked against the paper (set_class_results_verified, same
--      migration): grants as above; exhibitor / other club refused (42501);
--      an incomplete class refused (55000); missing P0002; the secretary marks
--      one class (stamped with the caller's auth uid, version returned, first
--      stamp kept) and clears it; anon refused.
--  11. a changed RESULT clears the check (trigger on entries, SECURITY
--      DEFINER): a result column change, a scored insert and a scored delete
--      clear a verified class; check-in, run order and a no-op placement
--      rewrite do not; an unverified class is never written.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People ids 10300x, auth uids 10301x (deliberately different).
--   103001 secretary of club A (S)   103002 secretary of club B (SB)
--   103003 exhibitor (X)             103004 club admin of club A (CA)
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000001030801', 'secretary', 'MYK9-1030 fixture', true),
  ('00000000-0000-0000-0000-000001030802', 'club_admin', 'MYK9-1030 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001030901', 'MYK9-1030 Club A'),
  ('00000000-0000-0000-0000-000001030902', 'MYK9-1030 Club B');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000103001', NULL, 'Sec', 'A', 'myk91030-s@example.test'),
  ('00000000-0000-0000-0000-000000103002', NULL, 'Sec', 'B', 'myk91030-sb@example.test'),
  ('00000000-0000-0000-0000-000000103003', NULL, 'Exhib', 'X', 'myk91030-x@example.test'),
  ('00000000-0000-0000-0000-000000103004', NULL, 'Club', 'Admin', 'myk91030-ca@example.test');

-- handle_new_user() adopts each person by email. judge_signed_off_by
-- references auth.users, so the callers must be real accounts.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000103011', 'myk91030-s@example.test'),
  ('00000000-0000-0000-0000-000000103012', 'myk91030-sb@example.test'),
  ('00000000-0000-0000-0000-000000103013', 'myk91030-x@example.test'),
  ('00000000-0000-0000-0000-000000103014', 'myk91030-ca@example.test')
) AS u(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, NULL, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000103001', '00000000-0000-0000-0000-000000103011', 'secretary',
   '00000000-0000-0000-0000-000001030901'),
  ('00000000-0000-0000-0000-000000103002', '00000000-0000-0000-0000-000000103012', 'secretary',
   '00000000-0000-0000-0000-000001030902'),
  ('00000000-0000-0000-0000-000000103004', '00000000-0000-0000-0000-000000103014', 'club_admin',
   '00000000-0000-0000-0000-000001030901')
) AS g(person_id, auth_id, role_name, club_id)
JOIN public.roles r ON r.name = g.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000001030002', 'MYK9-1030 Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001030901', 'published');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000001030003', '00000000-0000-0000-0000-000001030002',
        'MYK9-1030 Trial', current_date);

--   c1, c2, c4 completed; c3 still in progress.
INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-000001030041', '00000000-0000-0000-0000-000001030003', 'Container Novice', 'completed'),
  ('00000000-0000-0000-0000-000001030042', '00000000-0000-0000-0000-000001030003', 'Interior Novice', 'completed'),
  ('00000000-0000-0000-0000-000001030043', '00000000-0000-0000-0000-000001030003', 'Exterior Novice', 'in_progress'),
  ('00000000-0000-0000-0000-000001030044', '00000000-0000-0000-0000-000001030003', 'Buried Novice', 'completed');

-- Act as an account (NULL = anon). Claims are transaction-local.
CREATE FUNCTION pg_temp.act_as(p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_auth IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  END IF;
END;
$$;

-- How many fixture classes carry a sign-off, read as the test's owner role
-- (SECURITY DEFINER), so a refused caller's RLS cannot hide a stray write.
CREATE FUNCTION pg_temp.verified_count()
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::integer FROM public.classes
  WHERE id::text LIKE '00000000-0000-0000-0000-00000103004_'
    AND (results_verified_at IS NOT NULL OR results_verified_by IS NOT NULL);
$$;

CREATE FUNCTION pg_temp.signed_count()
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::integer FROM public.classes
  WHERE id::text LIKE '00000000-0000-0000-0000-00000103004_'
    AND (judge_signed_off_at IS NOT NULL OR judge_signed_off_by IS NOT NULL);
$$;

-- ---------------------------------------------------------------------------
-- 1. Grants.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.mark_classes_judge_signed_off(uuid[], timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.clear_class_judge_sign_off(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon may execute a sign-off RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.mark_classes_judge_signed_off(uuid[], timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.clear_class_judge_sign_off(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute a sign-off RPC';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('public.mark_classes_judge_signed_off(uuid[], timestamptz)'::regprocedure,
                    'public.clear_class_judge_sign_off(uuid)'::regprocedure)
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC keeps EXECUTE on a sign-off RPC';
  END IF;
  IF has_function_privilege('anon', 'public.set_class_results_verified(uuid, boolean, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_class_results_verified(uuid, boolean, timestamptz)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.set_class_results_verified(uuid, boolean, timestamptz)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'FAIL set_class_results_verified EXECUTE grants are wrong';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.classes', 'results_verified_at', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.classes', 'results_verified_by', 'SELECT')
     OR has_column_privilege('anon', 'public.classes', 'results_verified_at', 'SELECT')
     OR has_column_privilege('anon', 'public.classes', 'results_verified_by', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL results_verified columns: authenticated must read them, anon must not';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.classes', 'judge_signed_off_at', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.classes', 'judge_signed_off_by', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read the sign-off columns (replication would 42501)';
  END IF;
  IF has_column_privilege('anon', 'public.classes', 'judge_signed_off_at', 'SELECT')
     OR has_column_privilege('anon', 'public.classes', 'judge_signed_off_by', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon may read the sign-off columns';
  END IF;
  RAISE NOTICE 'PASS 1 anon/PUBLIC cannot execute, authenticated can; columns readable by authenticated only';
END;
$$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 2. An exhibitor and another club's secretary are refused, both RPCs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  caller uuid;
BEGIN
  FOREACH caller IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000103013'::uuid,  -- exhibitor
    '00000000-0000-0000-0000-000000103012'::uuid   -- club B secretary
  ] LOOP
    PERFORM pg_temp.act_as(caller);
    BEGIN
      PERFORM public.mark_classes_judge_signed_off(
        ARRAY['00000000-0000-0000-0000-000001030041'::uuid]);
      RAISE EXCEPTION 'FAIL % signed off a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.clear_class_judge_sign_off('00000000-0000-0000-0000-000001030041');
      RAISE EXCEPTION 'FAIL % cleared a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF pg_temp.signed_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused call wrote a sign-off';
  END IF;
  RAISE NOTICE 'PASS 2 exhibitor and other club''s secretary refused by both RPCs, nothing written';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3 and 4. Incomplete or missing classes refuse the whole call.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000103011');
  BEGIN
    PERFORM public.mark_classes_judge_signed_off(ARRAY[
      '00000000-0000-0000-0000-000001030041'::uuid,
      '00000000-0000-0000-0000-000001030043'::uuid]);
    RAISE EXCEPTION 'FAIL an in-progress class was signed off';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  IF pg_temp.signed_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused set still stamped its complete class';
  END IF;

  BEGIN
    PERFORM public.mark_classes_judge_signed_off(ARRAY[
      '00000000-0000-0000-0000-000001030041'::uuid,
      '00000000-0000-0000-0000-0000010309ff'::uuid]);
    RAISE EXCEPTION 'FAIL a missing class was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF pg_temp.signed_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a set with a missing class still stamped';
  END IF;
  RAISE NOTICE 'PASS 3-4 incomplete (55000) and missing (P0002) classes refuse the whole call';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5-7. The secretary signs off the judge's day.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result integer;
  v_at timestamptz;
  v_by uuid;
  v_version integer;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000103011');
  v_result := public.mark_classes_judge_signed_off(
    ARRAY['00000000-0000-0000-0000-000001030041'::uuid,
          '00000000-0000-0000-0000-000001030042'::uuid],
    now() - interval '5 minutes');
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a two-class sign-off returned %, expected NULL', v_result;
  END IF;
  IF pg_temp.signed_count() <> 2 THEN
    RAISE EXCEPTION 'FAIL expected 2 classes signed, found %', pg_temp.signed_count();
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.classes
    WHERE id IN ('00000000-0000-0000-0000-000001030041', '00000000-0000-0000-0000-000001030042')
      AND (judge_signed_off_by IS DISTINCT FROM '00000000-0000-0000-0000-000000103011'::uuid
           OR judge_signed_off_at IS DISTINCT FROM now() - interval '5 minutes')
  ) THEN
    RAISE EXCEPTION 'FAIL sign-off not stamped with the caller''s auth uid and the pressed time';
  END IF;
  RAISE NOTICE 'PASS 5 secretary signs off a set; stamped with the time and the caller''s auth uid';

  SELECT judge_signed_off_at, judge_signed_off_by INTO v_at, v_by
  FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030041';
  v_result := public.mark_classes_judge_signed_off(
    ARRAY['00000000-0000-0000-0000-000001030041'::uuid], now());
  SELECT version INTO v_version FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030041';
  IF v_result IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'FAIL a one-class call returned %, the class version is %', v_result, v_version;
  END IF;
  IF (SELECT judge_signed_off_at FROM public.classes
      WHERE id = '00000000-0000-0000-0000-000001030041') IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'FAIL signing off again replaced the first stamp';
  END IF;
  RAISE NOTICE 'PASS 6 a second sign-off keeps the first stamp and returns the class version';

  PERFORM public.mark_classes_judge_signed_off(
    ARRAY['00000000-0000-0000-0000-000001030044'::uuid], now() + interval '1 day');
  IF (SELECT judge_signed_off_at FROM public.classes
      WHERE id = '00000000-0000-0000-0000-000001030044') > now() THEN
    RAISE EXCEPTION 'FAIL a future signed-off-at was stored';
  END IF;
  RAISE NOTICE 'PASS 7 a future signed-off-at is clamped to now';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Per-class undo, by the club admin.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result integer;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000103014');
  v_result := public.clear_class_judge_sign_off('00000000-0000-0000-0000-000001030041');
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'FAIL the undo returned no version';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030041'
             AND (judge_signed_off_at IS NOT NULL OR judge_signed_off_by IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL the undo left the sign-off on its class';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030042'
                 AND judge_signed_off_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the undo cleared another class';
  END IF;
  RAISE NOTICE 'PASS 8 the per-class undo clears one class only (club admin)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Results checked against the paper score sheets.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  caller uuid;
  v_result integer;
  v_at timestamptz;
BEGIN
  FOREACH caller IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000103013'::uuid,  -- exhibitor
    '00000000-0000-0000-0000-000000103012'::uuid   -- club B secretary
  ] LOOP
    PERFORM pg_temp.act_as(caller);
    BEGIN
      PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030041', true);
      RAISE EXCEPTION 'FAIL % marked results checked on a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030041', false);
      RAISE EXCEPTION 'FAIL % cleared a results check on a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused results check wrote something';
  END IF;

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000103011');
  BEGIN
    PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030043', true);
    RAISE EXCEPTION 'FAIL an in-progress class was marked checked';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_results_verified('00000000-0000-0000-0000-0000010309ff', true);
    RAISE EXCEPTION 'FAIL a missing class was marked checked';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused results check wrote something';
  END IF;

  v_result := public.set_class_results_verified(
    '00000000-0000-0000-0000-000001030042', true, now() - interval '3 minutes');
  IF v_result IS DISTINCT FROM (SELECT version FROM public.classes
                                WHERE id = '00000000-0000-0000-0000-000001030042') THEN
    RAISE EXCEPTION 'FAIL the results check did not return the class version';
  END IF;
  SELECT results_verified_at INTO v_at FROM public.classes
  WHERE id = '00000000-0000-0000-0000-000001030042'
    AND results_verified_by = '00000000-0000-0000-0000-000000103011'::uuid;
  IF v_at IS DISTINCT FROM now() - interval '3 minutes' OR pg_temp.verified_count() <> 1 THEN
    RAISE EXCEPTION 'FAIL results check not stamped with the time and the caller''s auth uid';
  END IF;
  PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030042', true, now());
  IF (SELECT results_verified_at FROM public.classes
      WHERE id = '00000000-0000-0000-0000-000001030042') IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'FAIL a second results check replaced the first stamp';
  END IF;

  PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030042', false);
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL clearing the results check left it set';
  END IF;
  RAISE NOTICE 'PASS 10 results check: managers only, complete only, stamped, kept, cleared';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. A changed result clears the check; nothing else does.
-- ---------------------------------------------------------------------------
RESET ROLE;

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001030031', 'Alpha Registered', 'Alpha', 'Beagle',
   '00000000-0000-0000-0000-000000103003'),
  ('00000000-0000-0000-0000-000001030032', 'Bravo Registered', 'Bravo', 'Beagle',
   '00000000-0000-0000-0000-000000103003'),
  ('00000000-0000-0000-0000-000001030033', 'Charlie Registered', 'Charlie', 'Beagle',
   '00000000-0000-0000-0000-000000103003');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR1030' || right(d.id::text, 2), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-00000103003_';

-- Two scored entries in c4 (completed, not yet checked: the inserts write nothing).
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  armband, run_order, is_scored, result_status, search_time_seconds, total_faults,
  total_score, final_placement
) VALUES
  ('00000000-0000-0000-0000-000001030051', '00000000-0000-0000-0000-000001030031',
   '00000000-0000-0000-0000-000001030044', '00000000-0000-0000-0000-000001030002',
   '00000000-0000-0000-0000-000001030003', 'confirmed', 'paid', 25, '201', 1,
   true, 'qualified', 30.5, 0, 100, 1),
  ('00000000-0000-0000-0000-000001030052', '00000000-0000-0000-0000-000001030032',
   '00000000-0000-0000-0000-000001030044', '00000000-0000-0000-0000-000001030002',
   '00000000-0000-0000-0000-000001030003', 'confirmed', 'paid', 25, '202', 2,
   true, 'qualified', 41.25, 0, 100, 2);

CREATE FUNCTION pg_temp.c4_verified()
RETURNS boolean LANGUAGE sql AS $$
  SELECT results_verified_at IS NOT NULL FROM public.classes
  WHERE id = '00000000-0000-0000-0000-000001030044';
$$;

CREATE FUNCTION pg_temp.verify_c4()
RETURNS void LANGUAGE sql AS $$
  UPDATE public.classes
     SET results_verified_at = now(),
         results_verified_by = '00000000-0000-0000-0000-000000103011'
   WHERE id = '00000000-0000-0000-0000-000001030044';
$$;

DO $$
DECLARE
  v_version integer;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc
          WHERE oid = 'private.entries_clear_results_verified()'::regprocedure) THEN
    RAISE EXCEPTION 'FAIL the clear trigger must run as definer (judges and passcodes write scores)';
  END IF;
  IF (SELECT status FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030044')
     IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'FAIL fixture: c4 should still be completed with two scored entries';
  END IF;

  -- Not results: check-in, run order, ring time, judge notes; a no-op placement rewrite.
  PERFORM pg_temp.verify_c4();
  UPDATE public.entries
     SET check_in_status = 'checked-in', run_order = 5, ring_entry_time = now(),
         judge_notes = 'nice search', final_placement = final_placement
   WHERE id = '00000000-0000-0000-0000-000001030051';
  IF NOT pg_temp.c4_verified() THEN
    RAISE EXCEPTION 'FAIL a non-result change cleared the results check';
  END IF;

  -- A result change (a column the class rollup does not watch).
  UPDATE public.entries SET area1_correct = 2
   WHERE id = '00000000-0000-0000-0000-000001030051';
  IF pg_temp.c4_verified() THEN
    RAISE EXCEPTION 'FAIL a changed result left the results check set';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030044'
             AND results_verified_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the clear left results_verified_by behind';
  END IF;

  -- Unverified class + result change: no classes write at all.
  SELECT version INTO v_version FROM public.classes
   WHERE id = '00000000-0000-0000-0000-000001030044';
  UPDATE public.entries SET area1_correct = 3
   WHERE id = '00000000-0000-0000-0000-000001030051';
  IF (SELECT version FROM public.classes WHERE id = '00000000-0000-0000-0000-000001030044')
     IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'FAIL a result change wrote an unverified class';
  END IF;

  -- A corrected time (a column the rollup also watches).
  PERFORM pg_temp.verify_c4();
  UPDATE public.entries SET search_time_seconds = 31.0
   WHERE id = '00000000-0000-0000-0000-000001030051';
  IF pg_temp.c4_verified() THEN
    RAISE EXCEPTION 'FAIL a corrected time left the results check set';
  END IF;

  -- A scored entry inserted into, and one deleted from, a verified class.
  PERFORM pg_temp.verify_c4();
  INSERT INTO public.entries (
    id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
    armband, run_order, is_scored, result_status, search_time_seconds
  ) VALUES (
    '00000000-0000-0000-0000-000001030053', '00000000-0000-0000-0000-000001030033',
    '00000000-0000-0000-0000-000001030044', '00000000-0000-0000-0000-000001030002',
    '00000000-0000-0000-0000-000001030003', 'confirmed', 'pending', 0, '203', 3,
    true, 'nq', 90.0
  );
  IF pg_temp.c4_verified() THEN
    RAISE EXCEPTION 'FAIL a scored entry inserted into a verified class left it checked';
  END IF;
  PERFORM pg_temp.verify_c4();
  DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000001030053';
  IF pg_temp.c4_verified() THEN
    RAISE EXCEPTION 'FAIL a scored entry deleted from a verified class left it checked';
  END IF;

  RAISE NOTICE 'PASS 11 a changed result clears the check; check-in, run order and a no-op placement do not; an unverified class is never written';
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. anon is refused outright.
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  BEGIN
    PERFORM public.mark_classes_judge_signed_off(
      ARRAY['00000000-0000-0000-0000-000001030042'::uuid]);
    RAISE EXCEPTION 'FAIL anon called mark_classes_judge_signed_off';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.clear_class_judge_sign_off('00000000-0000-0000-0000-000001030042');
    RAISE EXCEPTION 'FAIL anon called clear_class_judge_sign_off';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_results_verified('00000000-0000-0000-0000-000001030042', true);
    RAISE EXCEPTION 'FAIL anon called set_class_results_verified';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 9 anon cannot call any of the three RPCs';
END;
$$;

RESET ROLE;
ROLLBACK;
