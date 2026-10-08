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
--   7. exact ties: a tie within 1st-4th (also one straddling 4th) is placed
--      consecutively and marked unresolved; a tie below 4th shares the
--      competition rank (5,5,7) and is marked shared; recomputes never reorder;
--      set_class_tie_order records the coin flip, places the tie in that
--      order, clears the flag and the results check, and survives a recompute;
--      non-tied, partial-group and cross-class orders are refused (MK016), a
--      flip for a tie below 4th is refused (MK017);
--      unplacing a class drops the flag (7f); a correction that merges two
--      separately resolved ties clears every flip in the class, so both read
--      unresolved, while an NQ change keeps them (7g); 7e. a nationals class still
--      ranks by most points, then fastest time;
--   8. soft-deleting an entry without a result leaves the check set;
--   9. a changed result clears the check;
--  10. the offline replay: the verify that succeeded before the correction is
--      refused (MK015) when it replays, and nothing is re-stamped;
--  11. a manager cannot write the results-check or tie columns directly (42501);
--  12. soft-deleting a resulted entry and moving one to another class clear the
--      check (both classes on a move);
--  13. the club admin clears a check with the per-class undo;
--  14. anon calling any of the three RPCs is refused.
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
  ('00000000-0000-0000-0000-000001045047', '00000000-0000-0000-0000-000001045003', 'Vehicle Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001045048', '00000000-0000-0000-0000-000001045003', 'Handler Discrimination', 'upcoming'),
  ('00000000-0000-0000-0000-000001045049', '00000000-0000-0000-0000-000001045003', 'Detective', 'upcoming'),
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
-- (in progress). Class 44: three qualified runs tied exactly on faults and time
-- (a coin flip decides). Class 47: four distinct runs, two tied for 5th
-- (they share 5th, no flip), then the next dog, who is 7th.
-- Class 48: two separate ties (three at 20.0s, two at 25.0s) and an NQ.
-- Class 49: 1st, 2nd, three tied for 3rd (a ribbon tie straddling 4th), two
-- tied for 6th (shared, no flip), then 8th.
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
  ('00000000-0000-0000-0000-000000104541', '00000000-0000-0000-0000-000001045044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000104543', '00000000-0000-0000-0000-000001045044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000104571', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 11.0, 0),
  ('00000000-0000-0000-0000-000000104572', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000104573', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000104574', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 14.0, 0),
  ('00000000-0000-0000-0000-000000104576', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 15.0, 0),
  ('00000000-0000-0000-0000-000000104575', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 15.0, 0),
  ('00000000-0000-0000-0000-000000104577', '00000000-0000-0000-0000-000001045047', 'checked-in', 'checked-in', true,  'qualified', 16.0, 0),
  ('00000000-0000-0000-0000-000000104591', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 10.0, 0),
  ('00000000-0000-0000-0000-000000104592', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 11.0, 0),
  ('00000000-0000-0000-0000-000000104593', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000104594', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000104595', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000104596', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000104597', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000104598', '00000000-0000-0000-0000-000001045049', 'checked-in', 'checked-in', true,  'qualified', 14.0, 0),
  ('00000000-0000-0000-0000-000000104581', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000104582', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000104583', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000104584', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000104585', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000104586', '00000000-0000-0000-0000-000001045048', 'checked-in', 'checked-in', true,  'nq',        99.0, 3)
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
-- 'id=placement' per placed entry; '!' = unresolved ribbon tie (needs a
-- flip), '~' = tie below 4th sharing the competition rank.
CREATE FUNCTION pg_temp.ties(p_class uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT string_agg(right(id::text, 6) || '=' || final_placement::text
                    || CASE placement_tie WHEN 'unresolved' THEN '!' WHEN 'shared' THEN '~' ELSE '' END,
                    ',' ORDER BY id)
  FROM public.entries WHERE class_id = p_class AND final_placement IS NOT NULL;
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
                    'private.entries_results_changed()'::regprocedure,
                    'private.entry_rank_inputs(public.entries)'::regprocedure)
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
  IF has_function_privilege('anon', 'public.set_class_tie_order(uuid, uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_class_tie_order(uuid, uuid[])', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.set_class_tie_order(uuid, uuid[])'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL set_class_tie_order is not authenticated-only';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.entries', 'placement_tiebreak', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.entries', 'placement_tie', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read the tie columns (the replica needs them)';
  END IF;
  IF has_column_privilege('anon', 'public.entries', 'placement_tiebreak', 'SELECT')
     OR has_column_privilege('anon', 'public.entries', 'placement_tie', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon may read a tie column';
  END IF;
  RAISE NOTICE 'PASS 1 grants: RPCs authenticated-only, columns at/_by and tie columns authenticated-only, fingerprint private';
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
    BEGIN
      PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045044', ARRAY[
        '00000000-0000-0000-0000-000000104543'::uuid,
        '00000000-0000-0000-0000-000000104542'::uuid,
        '00000000-0000-0000-0000-000000104541'::uuid]);
      RAISE EXCEPTION 'FAIL % recorded a tie order in a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF pg_temp.verified_count() <> 0 THEN
    RAISE EXCEPTION 'FAIL a refused call wrote a results check';
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=1!,104542=2!,104543=3!' THEN
    RAISE EXCEPTION 'FAIL a refused tie order changed placements: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  RAISE NOTICE 'PASS 3 exhibitor and other club''s secretary refused by all three RPCs, nothing written';
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
-- 7. Exact ties are decided by the secretary's recorded coin flip.
--    a. An unresolved three-way tie is placed 1/2/3 (consecutive, as before)
--       and every member is flagged; a tie for 5th is not flagged.
--    b. A recompute over the same inputs never reorders it (no flip-flop).
--    c. Recording the flip places the dogs in that order, clears the flag, and
--       clears a results check that the reorder invalidated; a recompute keeps
--       the recorded order.
--    d. Ids that are not exactly one tie group are refused (MK016), as is a
--       single id (22023).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_first text := pg_temp.placements('00000000-0000-0000-0000-000001045044');
BEGIN
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=1!,104542=2!,104543=3!' THEN
    RAISE EXCEPTION 'FAIL 7a an unresolved tie is not placed 1-3 and flagged: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045047')
     IS DISTINCT FROM '104571=1,104572=2,104573=3,104574=4,104575=5~,104576=5~,104577=7' THEN
    RAISE EXCEPTION 'FAIL 7a a tie for 5th did not share 5th (next dog 7th): %',
      pg_temp.ties('00000000-0000-0000-0000-000001045047');
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045049')
     IS DISTINCT FROM '104591=1,104592=2,104593=3!,104594=4!,104595=5!,104596=6~,104597=6~,104598=8' THEN
    RAISE EXCEPTION 'FAIL 7a a tie straddling 4th or a tie for 6th was placed wrongly: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045049');
  END IF;
  RAISE NOTICE 'PASS 7a ribbon ties (incl. straddling 4th) placed consecutively and marked unresolved; ties below 4th share the rank (5,5,7 / 6,6,8) and are marked shared';

  -- Touch a row so its heap position moves, then recompute twice.
  UPDATE public.entries SET judge_notes = 'moved in the heap'
  WHERE id = '00000000-0000-0000-0000-000000104541';
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045044'::uuid], false);
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045044'::uuid], false);
  IF regexp_replace(pg_temp.placements('00000000-0000-0000-0000-000001045044'), '104541=[^,]*', '')
     IS DISTINCT FROM regexp_replace(v_first, '104541=[^,]*', '')
     OR pg_temp.ties('00000000-0000-0000-0000-000001045044')
        IS DISTINCT FROM '104541=1!,104542=2!,104543=3!' THEN
    RAISE EXCEPTION 'FAIL 7b a recompute reordered or rewrote an unresolved tie: % -> %',
      v_first, pg_temp.placements('00000000-0000-0000-0000-000001045044');
  END IF;
  RAISE NOTICE 'PASS 7b recomputes over the same inputs leave an unresolved tie untouched';

  -- A late expected entry reopens the class: refresh_class_scoring_state
  -- unplaces everyone, and the tie flag must go with the placement.
  INSERT INTO public.entries (id, class_id, show_id, trial_id, entry_status, check_in_status,
                              is_scored, result_status)
  VALUES ('00000000-0000-0000-0000-000000104549', '00000000-0000-0000-0000-000001045044',
          '00000000-0000-0000-0000-000001045002', '00000000-0000-0000-0000-000001045003',
          'checked-in', 'checked-in', false, 'pending');
  IF EXISTS (SELECT 1 FROM public.entries
             WHERE class_id = '00000000-0000-0000-0000-000001045044'
               AND (final_placement IS NOT NULL OR placement_tie IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL 7f an unplaced entry kept its placement or tie marker';
  END IF;
  DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000104549';
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=1!,104542=2!,104543=3!' THEN
    RAISE EXCEPTION 'FAIL 7f the tie was not re-placed and re-flagged on completion: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  RAISE NOTICE 'PASS 7f unplacing a class drops the tie marker; completing it again restores it';
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  PERFORM public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001045044', pg_temp.fp('00000000-0000-0000-0000-000001045044'));
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045044') THEN
    RAISE EXCEPTION 'FAIL 7c setup: class 44 was not verified';
  END IF;

  -- The flip: 4543 won, then 4542, then 4541.
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045044', ARRAY[
    '00000000-0000-0000-0000-000000104543'::uuid,
    '00000000-0000-0000-0000-000000104542'::uuid,
    '00000000-0000-0000-0000-000000104541'::uuid]);
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=3,104542=2,104543=1' THEN
    RAISE EXCEPTION 'FAIL 7c the recorded order did not place the tie: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  IF pg_temp.verified('00000000-0000-0000-0000-000001045044') THEN
    RAISE EXCEPTION 'FAIL 7c reordering the tie left the results check set';
  END IF;
  -- The recalculator is not an API function; recompute as the owner.
  RESET ROLE;
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001045044'::uuid], false);
  SET LOCAL ROLE authenticated;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=3,104542=2,104543=1' THEN
    RAISE EXCEPTION 'FAIL 7c a recompute lost the recorded order: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  RAISE NOTICE 'PASS 7c recording the flip places the tie, clears the flag and the check, and survives a recompute';

  -- Not tied (20.0s vs 25.0s in class 42).
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045042', ARRAY[
      '00000000-0000-0000-0000-000000104521'::uuid, '00000000-0000-0000-0000-000000104522'::uuid]);
    RAISE EXCEPTION 'FAIL 7d an order over dogs that are not tied was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  -- Part of a tie group.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045044', ARRAY[
      '00000000-0000-0000-0000-000000104541'::uuid, '00000000-0000-0000-0000-000000104542'::uuid]);
    RAISE EXCEPTION 'FAIL 7d an order over part of a tie group was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  -- A tied entry of another class.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045047', ARRAY[
      '00000000-0000-0000-0000-000000104575'::uuid, '00000000-0000-0000-0000-000000104541'::uuid]);
    RAISE EXCEPTION 'FAIL 7d an entry of another class was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045044', ARRAY[
      '00000000-0000-0000-0000-000000104541'::uuid]);
    RAISE EXCEPTION 'FAIL 7d a one-entry order was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045044')
     IS DISTINCT FROM '104541=3,104542=2,104543=1' THEN
    RAISE EXCEPTION 'FAIL 7d a refused order changed placements: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045044');
  END IF;
  -- No flip below the ribbons: the 6th-place tie of class 49 and the 5th-place
  -- tie of class 47 are refused, and stay shared.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045049', ARRAY[
      '00000000-0000-0000-0000-000000104597'::uuid, '00000000-0000-0000-0000-000000104596'::uuid]);
    RAISE EXCEPTION 'FAIL 7d a flip for a 6th-place tie was accepted';
  EXCEPTION WHEN SQLSTATE 'MK017' THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045047', ARRAY[
      '00000000-0000-0000-0000-000000104576'::uuid, '00000000-0000-0000-0000-000000104575'::uuid]);
    RAISE EXCEPTION 'FAIL 7d a flip for a 5th-place tie was accepted';
  EXCEPTION WHEN SQLSTATE 'MK017' THEN NULL;
  END;
  -- The straddling ribbon tie does take a flip.
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045049', ARRAY[
    '00000000-0000-0000-0000-000000104595'::uuid,
    '00000000-0000-0000-0000-000000104593'::uuid,
    '00000000-0000-0000-0000-000000104594'::uuid]);
  IF pg_temp.ties('00000000-0000-0000-0000-000001045049')
     IS DISTINCT FROM '104591=1,104592=2,104593=4,104594=5,104595=3,104596=6~,104597=6~,104598=8' THEN
    RAISE EXCEPTION 'FAIL 7d the straddling tie''s flip was not applied: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045049');
  END IF;
  RAISE NOTICE 'PASS 7d non-tied, partial and cross-class orders refused (MK016), one id refused (22023), ties below 4th refused (MK017); a tie straddling 4th takes a flip';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7g. A recorded flip never outlives its tie (Codex review of 6cbd46088).
--     Class 48 has two ties, each resolved separately. A change to a run that
--     is never placed (the NQ) keeps both. A correction that moves one dog
--     into the other tie would leave that new group with distinct recorded
--     ordinals (1, 2 and 3) from two different flips; instead every flip in
--     the class is cleared and every tie reads unresolved.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000104511');
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045048', ARRAY[
    '00000000-0000-0000-0000-000000104583'::uuid,
    '00000000-0000-0000-0000-000000104582'::uuid,
    '00000000-0000-0000-0000-000000104581'::uuid]);
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045048', ARRAY[
    '00000000-0000-0000-0000-000000104585'::uuid,
    '00000000-0000-0000-0000-000000104584'::uuid]);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.ties('00000000-0000-0000-0000-000001045048')
     IS DISTINCT FROM '104581=3,104582=2,104583=1,104584=5,104585=4' THEN
    RAISE EXCEPTION 'FAIL 7g setup: the two recorded flips did not place class 48: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045048');
  END IF;

  UPDATE public.entries SET search_time_seconds = 98.0
  WHERE id = '00000000-0000-0000-0000-000000104586';
  IF (SELECT count(placement_tiebreak) FROM public.entries
      WHERE class_id = '00000000-0000-0000-0000-000001045048') <> 5 THEN
    RAISE EXCEPTION 'FAIL 7g a change to an NQ run cleared recorded flips';
  END IF;

  -- The judge misread 4583's time: it was 25.0s, tied with 4584 and 4585.
  UPDATE public.entries SET search_time_seconds = 25.0
  WHERE id = '00000000-0000-0000-0000-000000104583';
  IF (SELECT count(placement_tiebreak) FROM public.entries
      WHERE class_id = '00000000-0000-0000-0000-000001045048') <> 0 THEN
    RAISE EXCEPTION 'FAIL 7g a correction left recorded flips behind';
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001045048')
     IS DISTINCT FROM '104581=1!,104582=2!,104583=3!,104584=4!,104585=5!' THEN
    RAISE EXCEPTION 'FAIL 7g a merged tie read as resolved: %',
      pg_temp.ties('00000000-0000-0000-0000-000001045048');
  END IF;
  RAISE NOTICE 'PASS 7g a correction that merges two resolved ties clears every flip in the class; both ties read unresolved; an NQ change keeps them';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7e. A nationals class still ranks by most points, then fastest time.
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
  RAISE NOTICE 'PASS 7e a nationals class ranks by most points, then fastest time';
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
  BEGIN
    UPDATE public.entries SET placement_tiebreak = 1
    WHERE id = '00000000-0000-0000-0000-000000104541';
    RAISE EXCEPTION 'FAIL a manager wrote placement_tiebreak directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.entries SET placement_tie = 'shared'
    WHERE id = '00000000-0000-0000-0000-000000104541';
    RAISE EXCEPTION 'FAIL a manager wrote placement_tie directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001045042') THEN
    RAISE EXCEPTION 'FAIL the refused direct write changed the check';
  END IF;
  RAISE NOTICE 'PASS 11 direct writes to the results-check and tie columns are refused (42501)';
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
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001045047', ARRAY[
      '00000000-0000-0000-0000-000000104576'::uuid, '00000000-0000-0000-0000-000000104575'::uuid]);
    RAISE EXCEPTION 'FAIL anon called set_class_tie_order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 14 anon cannot call any of the three RPCs';
END;
$$;

RESET ROLE;
ROLLBACK;
