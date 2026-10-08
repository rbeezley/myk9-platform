-- MYK9-1045 (migration 20261008014300): results checked against the paper,
-- guarded by a results fingerprint.
--
-- Properties asserted here:
--   1. grants: anon and PUBLIC cannot execute either RPC, authenticated can;
--      authenticated may read results_verified_at/_by but not the fingerprint,
--      anon reads none of the three; API roles cannot execute the private
--      fingerprint functions;
--   2. the SQL fingerprint of a fixed fixture equals the hash pinned in
--      apps/myk9show/src/features/show-map/__tests__/classResultsFingerprint.test.ts
--      (the client and server definitions agree);
--   3. an exhibitor and another club's secretary are refused (42501) by both
--      RPCs and write nothing;
--   4. an incomplete class is refused (55000), a missing class (P0002), a
--      missing fingerprint (22023);
--   5. the show's secretary marks a class with the fingerprint of its current
--      results: stamped with the time, the caller's auth uid and the
--      fingerprint; a replay keeps the first stamp and returns the version;
--   6. a pull of a placed dog re-ranks the completed class THROUGH
--      recalculate_class_placements, and a direct recompute too: identical
--      results write no placement and leave the check set;
--   7. a recompute over tied results always gives the same placements, and a
--      nationals class still ranks by most points, then fastest time;
--   8. soft-deleting an entry without a result leaves the check set;
--   9. a changed result clears the check;
--  10. the offline replay: the verify that succeeded before the correction is
--      refused (MK015) when it replays, and nothing is re-stamped;
--  11. a manager cannot write the columns directly (42501);
--  12. soft-deleting a resulted entry and moving one to another class clear the
--      check (both classes on a move);
--  13. the club admin clears a check with the per-class undo;
--  14. anon calling either RPC at all is refused.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- Silence the push webhooks for the test transaction (rolled back with the txn).
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_results_push;

-- ---------------------------------------------------------------------------
-- Fixtures. People ids 10450x, auth uids 10451x (deliberately different).
--   104501 secretary of club A (S)   104502 secretary of club B (SB)
--   104503 exhibitor (X)             104504 club admin of club A (CA)
-- Classes 1045004x: 41 fingerprint fixture, 42 main, 43 in progress,
--   44 tie, 45 move target.
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000001045801', 'secretary', 'MYK9-1045 fixture', true),
  ('00000000-0000-0000-0000-000001045802', 'club_admin', 'MYK9-1045 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001045901', 'MYK9-1045 Club A'),
  ('00000000-0000-0000-0000-000001045902', 'MYK9-1045 Club B');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000104501', NULL, 'Sec', 'A', 'myk91045-s@example.test'),
  ('00000000-0000-0000-0000-000000104502', NULL, 'Sec', 'B', 'myk91045-sb@example.test'),
  ('00000000-0000-0000-0000-000000104503', NULL, 'Exhib', 'X', 'myk91045-x@example.test'),
  ('00000000-0000-0000-0000-000000104504', NULL, 'Club', 'Admin', 'myk91045-ca@example.test');

-- results_verified_by references auth.users, so the callers are real accounts.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000104511', 'myk91045-s@example.test'),
  ('00000000-0000-0000-0000-000000104512', 'myk91045-sb@example.test'),
  ('00000000-0000-0000-0000-000000104513', 'myk91045-x@example.test'),
  ('00000000-0000-0000-0000-000000104514', 'myk91045-ca@example.test')
) AS u(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, NULL, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000104501', '00000000-0000-0000-0000-000000104511', 'secretary',
   '00000000-0000-0000-0000-000001045901'),
  ('00000000-0000-0000-0000-000000104502', '00000000-0000-0000-0000-000000104512', 'secretary',
   '00000000-0000-0000-0000-000001045902'),
  ('00000000-0000-0000-0000-000000104504', '00000000-0000-0000-0000-000000104514', 'club_admin',
   '00000000-0000-0000-0000-000001045901')
) AS g(person_id, auth_id, role_name, club_id)
JOIN public.roles r ON r.name = g.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
VALUES ('00000000-0000-0000-0000-000001045002', 'MYK9-1045 Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001045901', 'published', false);

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000001045003', '00000000-0000-0000-0000-000001045002',
        'MYK9-1045 Trial', current_date);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-000001045041', '00000000-0000-0000-0000-000001045003', 'Fingerprint Fixture', 'upcoming'),
  ('00000000-0000-0000-0000-000001045042', '00000000-0000-0000-0000-000001045003', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001045043', '00000000-0000-0000-0000-000001045003', 'Interior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001045044', '00000000-0000-0000-0000-000001045003', 'Exterior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001045045', '00000000-0000-0000-0000-000001045003', 'Buried Novice', 'upcoming');

-- The fingerprint fixture. Kept byte-for-byte in step with FIXTURE in
-- classResultsFingerprint.test.ts. Ids are deliberately out of insert order.
--   ...4510 soft-deleted qualified run  -> no line (deleted)
--   ...4511 qualified, 1 fault, 30.5s   -> placement 2
--   ...4512 NQ with an escaped reason   -> no placement
--   ...4513 qualified, 0 faults, 45.20s -> placement 1 (trailing zero trimmed)
--   ...4514 absent                      -> a line (has a result), no placement
--   ...4515 scratched, never ran        -> no line (no result)
INSERT INTO public.entries (
  id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status,
  search_time_seconds, area1_time_seconds, total_correct_finds, total_faults,
  disqualification_reason, deleted_at
)
VALUES
  ('00000000-0000-0000-0000-000000104510', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'checked-in', 'checked-in', true, 'qualified', 1, 1, 1, 0, NULL, now()),
  ('00000000-0000-0000-0000-000000104513', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'checked-in', 'checked-in', true, 'qualified', 45.20, 45.20, 1, 0, NULL, NULL),
  ('00000000-0000-0000-0000-000000104511', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'checked-in', 'checked-in', true, 'qualified', 30.5, 30.5, 1, 1, NULL, NULL),
  ('00000000-0000-0000-0000-000000104512', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'checked-in', 'checked-in', true, 'nq', 12, 12, 0, 3,
   E'Handler said "a|b\\c"\nthen left', NULL),
  ('00000000-0000-0000-0000-000000104514', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'checked-in', 'checked-in', false, 'absent', 0, 0, 0, 0, NULL, NULL),
  ('00000000-0000-0000-0000-000000104515', '00000000-0000-0000-0000-000001045041',
   '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
   'scratched', 'no-status', false, 'pending', 0, 0, 0, 0, NULL, NULL);

-- Main class 42: three qualified runs (placements 1-3) and one entry that
-- never ran and was scratched (no result). Class 43: one run scored, one not
-- (in progress). Class 44: two qualified runs tied on faults and time.
INSERT INTO public.entries (
  id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status,
  search_time_seconds, total_faults
)
SELECT v.id::uuid, v.class_id::uuid, '00000000-0000-0000-0000-000001045002',
       '00000000-0000-0000-0000-000001045003', v.entry_status, v.check_in, v.is_scored,
       v.result_status, v.secs, v.faults
FROM (VALUES
  ('00000000-0000-0000-0000-000000104521', '00000000-0000-0000-0000-000001045042', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000104522', '00000000-0000-0000-0000-000001045042', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000104523', '00000000-0000-0000-0000-000001045042', 'checked-in', 'checked-in', true,  'qualified', 15.0, 1),
  ('00000000-0000-0000-0000-000000104524', '00000000-0000-0000-0000-000001045042', 'scratched',  'no-status',  false, 'pending',   0,    0),
  ('00000000-0000-0000-0000-000000104531', '00000000-0000-0000-0000-000001045043', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000104532', '00000000-0000-0000-0000-000001045043', 'checked-in', 'checked-in', false, 'pending',   0,    0),
  ('00000000-0000-0000-0000-000000104542', '00000000-0000-0000-0000-000001045044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000104541', '00000000-0000-0000-0000-000001045044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0)
) AS v(id, class_id, entry_status, check_in, is_scored, result_status, secs, faults);

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

-- Read as the test's owner role (SECURITY DEFINER), so a refused caller's RLS
-- cannot hide a stray write and the role switch cannot hide the private schema.
CREATE FUNCTION pg_temp.verified(p_class uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT results_verified_at IS NOT NULL FROM public.classes WHERE id = p_class;
$$;
CREATE FUNCTION pg_temp.verified_count()
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::integer FROM public.classes
  WHERE id::text LIKE '00000000-0000-0000-0000-00000104504_'
    AND (results_verified_at IS NOT NULL OR results_verified_by IS NOT NULL
         OR results_verified_fingerprint IS NOT NULL);
$$;
CREATE FUNCTION pg_temp.fp(p_class uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT private.class_results_fingerprint(p_class);
$$;
CREATE FUNCTION pg_temp.placements(p_class uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(right(id::text, 6) || '=' || coalesce(final_placement::text, '-')
                    || '@v' || version, ',' ORDER BY id)
  FROM public.entries WHERE class_id = p_class;
$$;

-- ---------------------------------------------------------------------------
-- 1. Grants.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.mark_class_results_verified(uuid, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.clear_class_results_verified(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon may execute a results-verified RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.mark_class_results_verified(uuid, text, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.clear_class_results_verified(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute a results-verified RPC';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('public.mark_class_results_verified(uuid, text, timestamptz)'::regprocedure,
                    'public.clear_class_results_verified(uuid)'::regprocedure,
                    'private.class_results_fingerprint(uuid)'::regprocedure,
                    'private.entry_results_line(public.entries)'::regprocedure,
                    'private.entries_clear_stale_results_verified()'::regprocedure)
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC keeps EXECUTE on a MYK9-1045 function';
  END IF;
  IF has_function_privilege('authenticated', 'private.class_results_fingerprint(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.class_results_fingerprint(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL an API role may execute the private fingerprint';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.classes', 'results_verified_at', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.classes', 'results_verified_by', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read results_verified_at/_by';
  END IF;
  IF has_column_privilege('authenticated', 'public.classes', 'results_verified_fingerprint', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated may read the stored fingerprint';
  END IF;
  IF has_column_privilege('anon', 'public.classes', 'results_verified_at', 'SELECT')
     OR has_column_privilege('anon', 'public.classes', 'results_verified_by', 'SELECT')
     OR has_column_privilege('anon', 'public.classes', 'results_verified_fingerprint', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon may read a results_verified column';
  END IF;
  RAISE NOTICE 'PASS 1 grants: RPCs authenticated-only, columns at/_by authenticated-only, fingerprint private';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The SQL fingerprint matches the client's on the shared fixture.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected constant text := '4d0d56e5b7bb8cdb47591069945876b6bd09bc638cec4c559f0d3669d9612e46';
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045041';
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'FAIL setup: fingerprint fixture class is %, expected completed', v_status;
  END IF;
  IF pg_temp.placements('00000000-0000-0000-0000-000001045041')
     !~ '^104510=-@v[0-9]+,104511=2@v[0-9]+,104512=-@v[0-9]+,104513=1@v[0-9]+,104514=-@v[0-9]+,104515=-@v[0-9]+$' THEN
    RAISE EXCEPTION 'FAIL setup: fixture placements are %',
      pg_temp.placements('00000000-0000-0000-0000-000001045041');
  END IF;
  IF pg_temp.fp('00000000-0000-0000-0000-000001045041') IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'FAIL the SQL fingerprint % differs from the client''s pinned %',
      pg_temp.fp('00000000-0000-0000-0000-000001045041'), v_expected;
  END IF;
  RAISE NOTICE 'PASS 2 the SQL fingerprint equals the client''s on the shared fixture';
END;
$$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 3. An exhibitor and another club's secretary are refused, both RPCs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  caller uuid;
  v_fp text := pg_temp.fp('00000000-0000-0000-0000-000001045042');
BEGIN
  FOREACH caller IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000104513'::uuid,  -- exhibitor
    '00000000-0000-0000-0000-000000104512'::uuid   -- club B secretary
  ] LOOP
    PERFORM pg_temp.act_as(caller);
    BEGIN
      PERFORM public.mark_class_results_verified('00000000-0000-0000-0000-000001045042', v_fp);
      RAISE EXCEPTION 'FAIL % verified a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.clear_class_results_verified('00000000-0000-0000-0000-000001045042');
      RAISE EXCEPTION 'FAIL % cleared a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused call wrote a results check';
  END IF;
  RAISE NOTICE 'PASS 3 exhibitor and other club''s secretary refused by both RPCs, nothing written';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Incomplete class, missing class, missing fingerprint.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  BEGIN
    PERFORM public.mark_class_results_verified(
      '00000000-0000-0000-0000-000001045043', pg_temp.fp('00000000-0000-0000-0000-000001045043'));
    RAISE EXCEPTION 'FAIL an in-progress class was verified';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    PERFORM public.mark_class_results_verified('00000000-0000-0000-0000-0000010459ff', 'x');
    RAISE EXCEPTION 'FAIL a missing class was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.mark_class_results_verified('00000000-0000-0000-0000-000001045042', NULL);
    RAISE EXCEPTION 'FAIL a check without a fingerprint was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused call wrote a results check';
  END IF;
  RAISE NOTICE 'PASS 4 incomplete (55000), missing class (P0002), missing fingerprint (22023) refused';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The secretary marks class 42; a replay keeps the first stamp.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fp text := pg_temp.fp('00000000-0000-0000-0000-000001045042');
  v_result integer;
  v_version integer;
  v_at timestamptz;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  v_result := public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001045042', v_fp, now() - interval '5 minutes');
  SELECT version INTO v_version FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042';
  IF v_result IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'FAIL mark returned %, the class version is %', v_result, v_version;
  END IF;
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = '00000000-0000-0000-0000-000001045042'
      AND results_verified_at = now() - interval '5 minutes'
      AND results_verified_by = '00000000-0000-0000-0000-000000104511'::uuid
      AND results_verified_fingerprint = v_fp
  ) THEN
    RAISE EXCEPTION 'FAIL the check was not stamped with the time, the caller''s auth uid and the fingerprint';
  END IF;
  SET LOCAL ROLE authenticated;
  RAISE NOTICE 'PASS 5a the secretary verifies; stamped with time, auth uid and fingerprint';

  SELECT results_verified_at INTO v_at FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042';
  v_result := public.mark_class_results_verified('00000000-0000-0000-0000-000001045042', v_fp, now());
  SELECT version INTO v_version FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042';
  IF v_result IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'FAIL a replay returned %, the class version is %', v_result, v_version;
  END IF;
  IF (SELECT results_verified_at FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042')
     IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'FAIL a replay replaced the first stamp';
  END IF;
  RAISE NOTICE 'PASS 5b a replay with the same results keeps the first stamp and returns the version';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. Codex defect 1: a pull re-ranks the class through
--    recalculate_class_placements; identical results write nothing and leave
--    the check set. Then a direct recompute, twice.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_before text := pg_temp.placements('00000000-0000-0000-0000-000001045042');
  v_status text;
BEGIN
  IF v_before !~ '104521=1@.*104522=2@.*104523=3@' THEN
    RAISE EXCEPTION 'FAIL setup: class 42 placements are %', v_before;
  END IF;

  -- Pull the 3rd-placed dog (its run stands; pulled is a lifecycle state).
  UPDATE public.entries SET check_in_status = 'pulled'
  WHERE id = '00000000-0000-0000-0000-000000104523';

  SELECT status INTO v_status FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042';
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'FAIL setup: the pull moved class 42 to %', v_status;
  END IF;
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL a pull with unchanged results cleared the check';
  END IF;

  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045042'::uuid], false);
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045042'::uuid], false);

  -- The pulled dog's own row was written by the pull; the others must keep
  -- their versions, which proves the recompute wrote no placement.
  IF regexp_replace(pg_temp.placements('00000000-0000-0000-0000-000001045042'), '104523=[^,]*', '')
     IS DISTINCT FROM regexp_replace(v_before, '104523=[^,]*', '') THEN
    RAISE EXCEPTION 'FAIL a recompute over unchanged results rewrote placements: % -> %',
      v_before, pg_temp.placements('00000000-0000-0000-0000-000001045042');
  END IF;
  IF pg_temp.placements('00000000-0000-0000-0000-000001045042') !~ '104523=3@' THEN
    RAISE EXCEPTION 'FAIL the pulled dog lost its placement: %',
      pg_temp.placements('00000000-0000-0000-0000-000001045042');
  END IF;
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL a recompute with identical results cleared the check';
  END IF;
  RAISE NOTICE 'PASS 6 a pull and two direct recomputes with identical results write no placement and keep the check';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Tied runs always rank the same way (entry id breaks the tie).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_first text := pg_temp.placements('00000000-0000-0000-0000-000001045044');
BEGIN
  IF v_first !~ '^104541=1@v[0-9]+,104542=2@v[0-9]+$' THEN
    RAISE EXCEPTION 'FAIL tied runs did not rank by entry id: %', v_first;
  END IF;
  -- Touch the lower-id row so its heap position moves, then recompute.
  UPDATE public.entries SET judge_notes = 'moved in the heap'
  WHERE id = '00000000-0000-0000-0000-000000104541';
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045044'::uuid], false);
  IF pg_temp.placements('00000000-0000-0000-0000-000001045044') !~ '^104541=1@v[0-9]+,104542=2@v[0-9]+$' THEN
    RAISE EXCEPTION 'FAIL tied runs swapped on a recompute: %',
      pg_temp.placements('00000000-0000-0000-0000-000001045044');
  END IF;
  RAISE NOTICE 'PASS 7 tied runs rank by entry id on every recompute';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7b. A nationals class still ranks by most points, then fastest time.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
  VALUES ('00000000-0000-0000-0000-000001045012', 'MYK9-1045 Nationals', 'AKC',
          current_date, current_date, '00000000-0000-0000-0000-000001045901', 'published', true);
  INSERT INTO public.trials (id, show_id, name, date)
  VALUES ('00000000-0000-0000-0000-000001045013', '00000000-0000-0000-0000-000001045012',
          'MYK9-1045 Nationals Trial', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
  VALUES ('00000000-0000-0000-0000-000001045046', '00000000-0000-0000-0000-000001045013',
          'Nationals Container', 'upcoming');
  INSERT INTO public.entries (
    id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status,
    points_earned, search_time_seconds, total_faults
  )
  SELECT v.id::uuid, '00000000-0000-0000-0000-000001045046', '00000000-0000-0000-0000-000001045012',
         '00000000-0000-0000-0000-000001045013', 'checked-in', 'checked-in', true, 'qualified',
         v.points, v.secs, v.faults
  FROM (VALUES
    ('00000000-0000-0000-0000-000000104561', 20, 40.0, 0),
    ('00000000-0000-0000-0000-000000104562', 25, 60.0, 3),
    ('00000000-0000-0000-0000-000000104563', 20, 35.0, 1)
  ) AS v(id, points, secs, faults);
  IF pg_temp.placements('00000000-0000-0000-0000-000001045046')
     !~ '^104561=3@v[0-9]+,104562=1@v[0-9]+,104563=2@v[0-9]+$' THEN
    RAISE EXCEPTION 'FAIL nationals ranking is not most points then fastest time: %',
      pg_temp.placements('00000000-0000-0000-0000-000001045046');
  END IF;
  RAISE NOTICE 'PASS 7b a nationals class ranks by most points, then fastest time';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Soft-deleting an entry with no result leaves the check set.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.entries SET deleted_at = now()
  WHERE id = '00000000-0000-0000-0000-000000104524';
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL soft-deleting an entry without a result cleared the check';
  END IF;
  RAISE NOTICE 'PASS 8 soft-deleting an entry without a result keeps the check';
END;
$$;

-- ---------------------------------------------------------------------------
-- 9 and 10. A correction clears the check, and the queued verify that
--    succeeded before it (response lost) is refused when it replays.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_seen text := pg_temp.fp('00000000-0000-0000-0000-000001045042');
BEGIN
  -- The judge's time on the 2nd-placed dog was misread.
  UPDATE public.entries SET search_time_seconds = 24.75
  WHERE id = '00000000-0000-0000-0000-000000104522';
  IF pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL a changed result left the check set';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001045042'
             AND (results_verified_by IS NOT NULL OR results_verified_fingerprint IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL the clear left the verifier or fingerprint behind';
  END IF;
  RAISE NOTICE 'PASS 9 a changed result clears the check';

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  BEGIN
    PERFORM public.mark_class_results_verified('00000000-0000-0000-0000-000001045042', v_seen);
    RAISE EXCEPTION 'FAIL a stale verify replayed over a correction';
  EXCEPTION WHEN SQLSTATE 'MK015' THEN NULL;
  END;
  IF pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL the refused replay still stamped the class';
  END IF;
  -- A check made against the corrected results is accepted.
  PERFORM public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001045042', pg_temp.fp('00000000-0000-0000-0000-000001045042'));
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL a fresh check against the corrected results was not stamped';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS 10 a stale verify is refused (MK015); a fresh one is stamped';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. A manager cannot write the columns directly.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  BEGIN
    UPDATE public.classes SET results_verified_at = NULL
    WHERE id = '00000000-0000-0000-0000-000001045042';
    RAISE EXCEPTION 'FAIL a manager wrote results_verified_at directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL the refused direct write changed the check';
  END IF;
  RAISE NOTICE 'PASS 11 a direct write to the columns is refused (42501)';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 12. Soft-deleting a resulted entry clears; so does moving one (both classes).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Verify the fixture class too, so the move below can clear two classes.
  UPDATE public.classes
     SET results_verified_at = now(),
         results_verified_by = '00000000-0000-0000-0000-000000104511',
         results_verified_fingerprint = private.class_results_fingerprint(id)
   WHERE id IN ('00000000-0000-0000-0000-000001045041', '00000000-0000-0000-0000-000001045044');

  UPDATE public.entries SET deleted_at = now()
  WHERE id = '00000000-0000-0000-0000-000000104523';
  IF pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL soft-deleting a placed run left the check set';
  END IF;

  UPDATE public.entries SET class_id = '00000000-0000-0000-0000-000001045041'
  WHERE id = '00000000-0000-0000-0000-000000104542';
  IF pg_temp.verified('00000000-0000-0000-0000-000001045044')
     OR pg_temp.verified('00000000-0000-0000-0000-000001045041') THEN
    RAISE EXCEPTION 'FAIL moving a run left a check set (source %, target %)',
      pg_temp.verified('00000000-0000-0000-0000-000001045044'),
      pg_temp.verified('00000000-0000-0000-0000-000001045041');
  END IF;
  RAISE NOTICE 'PASS 12 soft-deleting a placed run and moving a run clear the check (both classes)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. The club admin clears a check with the per-class undo.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_result integer;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  PERFORM public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001045042', pg_temp.fp('00000000-0000-0000-0000-000001045042'));
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104514');
  v_result := public.clear_class_results_verified('00000000-0000-0000-0000-000001045042');
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'FAIL the undo returned no version';
  END IF;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL the undo left a check behind';
  END IF;
  RAISE NOTICE 'PASS 13 the club admin clears the check';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 14. anon is refused outright.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  BEGIN
    PERFORM public.mark_class_results_verified('00000000-0000-0000-0000-000001045042', 'x');
    RAISE EXCEPTION 'FAIL anon called mark_class_results_verified';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.clear_class_results_verified('00000000-0000-0000-0000-000001045042');
    RAISE EXCEPTION 'FAIL anon called clear_class_results_verified';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 14 anon cannot call either RPC';
END;
$$;

RESET ROLE;
ROLLBACK;
