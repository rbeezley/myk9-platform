-- MYK9-1473: exact ties are decided by a recorded coin flip.
--
-- Behavioral test for 20261029012700_myk9_1473_coin_flip_tie_order.sql, run only
-- in CI (scripts/qa/run-behavioral-sql-tests.sh; no container runtime on the
-- development Mac). Every placement assertion goes through
-- recalculate_class_placements (the entries trigger, or a direct call) and
-- set_class_tie_order.
--
--   1. grants: set_class_tie_order authenticated-only; authenticated reads both
--      tie columns, anon reads neither; the private helpers are not callable;
--   2. an exhibitor and another club's secretary are refused (42501), nothing
--      written;
--   3. exact ties: a tie within 1st-4th (also one straddling 4th) is placed
--      consecutively and marked unresolved; a tie below 4th shares the
--      competition rank (5,5,7) and is marked shared; recomputes never reorder;
--      set_class_tie_order records the flip, places the tie in that order,
--      clears the marker and the results check, and survives a recompute;
--      non-tied, partial-group and cross-class orders are refused (MK016), a
--      flip for a tie below 4th is refused (MK017), a single id (22023);
--      unplacing a class drops the marker; a correction that merges two
--      separately resolved ties clears every flip in the class, while an NQ
--      change keeps them;
--   4. a manager cannot write the tie columns directly (42501);
--   5. anon calling set_class_tie_order is refused;
--   6. marking a class checked is refused (MK018) while a ribbon tie is
--      unresolved and allowed after set_class_tie_order; get_class_ties lists
--      the unresolved groups for the show's manager only;
--   7. the backfill: a completed class holding pre-migration placements for a
--      tie below 4th reads shared ranks after refresh_class_scoring_state.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- Silence the push webhooks for the test transaction (rolled back with the txn).
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_results_push;

-- ---------------------------------------------------------------------------
-- Fixtures. People ids 14730x, auth uids 14731x (deliberately different).
--   147301 secretary of club A (S)   147302 secretary of club B (SB)
--   147303 exhibitor (X)
-- Classes 1473004x: 42 not tied, 44 three-way tie, 47 tie for 5th,
--   48 two separate ties and an NQ, 49 ribbon tie straddling 4th.
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000001473801', 'secretary', 'MYK9-1473 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001473901', 'MYK9-1473 Club A'),
  ('00000000-0000-0000-0000-000001473902', 'MYK9-1473 Club B');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000147301', NULL, 'Sec', 'A', 'myk91473-s@example.test'),
  ('00000000-0000-0000-0000-000000147302', NULL, 'Sec', 'B', 'myk91473-sb@example.test'),
  ('00000000-0000-0000-0000-000000147303', NULL, 'Exhib', 'X', 'myk91473-x@example.test');

-- results_verified_by references auth.users, so the callers are real accounts.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000147311', 'myk91473-s@example.test'),
  ('00000000-0000-0000-0000-000000147312', 'myk91473-sb@example.test'),
  ('00000000-0000-0000-0000-000000147313', 'myk91473-x@example.test')
) AS u(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, NULL, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000147301', '00000000-0000-0000-0000-000000147311', 'secretary',
   '00000000-0000-0000-0000-000001473901'),
  ('00000000-0000-0000-0000-000000147302', '00000000-0000-0000-0000-000000147312', 'secretary',
   '00000000-0000-0000-0000-000001473902')
) AS g(person_id, auth_id, role_name, club_id)
JOIN public.roles r ON r.name = g.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
VALUES ('00000000-0000-0000-0000-000001473002', 'MYK9-1473 Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001473901', 'published', false);

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000001473003', '00000000-0000-0000-0000-000001473002',
        'MYK9-1473 Trial', current_date);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-000001473042', '00000000-0000-0000-0000-000001473003', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001473044', '00000000-0000-0000-0000-000001473003', 'Exterior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001473047', '00000000-0000-0000-0000-000001473003', 'Vehicle Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000001473048', '00000000-0000-0000-0000-000001473003', 'Handler Discrimination', 'upcoming'),
  ('00000000-0000-0000-0000-000001473049', '00000000-0000-0000-0000-000001473003', 'Detective', 'upcoming');

-- Class 42: distinct runs (not tied). Class 44: three runs tied exactly on faults
-- and time (a coin flip decides). Class 47: four distinct runs, two tied for 5th
-- (they share 5th, no flip), then the next dog, 7th. Class 48: two separate ties
-- (three at 20.0s, two at 25.0s) and an NQ. Class 49: 1st, 2nd, three tied for
-- 3rd (a ribbon tie straddling 4th), two tied for 6th (shared), then 8th.
INSERT INTO public.entries (
  id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status,
  search_time_seconds, total_faults
)
SELECT v.id::uuid, v.class_id::uuid, '00000000-0000-0000-0000-000001473002',
       '00000000-0000-0000-0000-000001473003', v.entry_status, v.check_in, v.is_scored,
       v.result_status, v.secs, v.faults
FROM (VALUES
  ('00000000-0000-0000-0000-000000147321', '00000000-0000-0000-0000-000001473042', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000147322', '00000000-0000-0000-0000-000001473042', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000147323', '00000000-0000-0000-0000-000001473042', 'checked-in', 'checked-in', true,  'qualified', 15.0, 1),
  ('00000000-0000-0000-0000-000000147324', '00000000-0000-0000-0000-000001473042', 'scratched',  'no-status',  false, 'pending',   0,    0),
  ('00000000-0000-0000-0000-000000147342', '00000000-0000-0000-0000-000001473044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000147341', '00000000-0000-0000-0000-000001473044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000147343', '00000000-0000-0000-0000-000001473044', 'checked-in', 'checked-in', true,  'qualified', 30.0, 0),
  ('00000000-0000-0000-0000-000000147371', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 11.0, 0),
  ('00000000-0000-0000-0000-000000147372', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000147373', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000147374', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 14.0, 0),
  ('00000000-0000-0000-0000-000000147376', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 15.0, 0),
  ('00000000-0000-0000-0000-000000147375', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 15.0, 0),
  ('00000000-0000-0000-0000-000000147377', '00000000-0000-0000-0000-000001473047', 'checked-in', 'checked-in', true,  'qualified', 16.0, 0),
  ('00000000-0000-0000-0000-000000147391', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 10.0, 0),
  ('00000000-0000-0000-0000-000000147392', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 11.0, 0),
  ('00000000-0000-0000-0000-000000147393', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000147394', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000147395', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 12.0, 0),
  ('00000000-0000-0000-0000-000000147396', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000147397', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 13.0, 0),
  ('00000000-0000-0000-0000-000000147398', '00000000-0000-0000-0000-000001473049', 'checked-in', 'checked-in', true,  'qualified', 14.0, 0),
  ('00000000-0000-0000-0000-000000147381', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000147382', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000147383', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'qualified', 20.0, 0),
  ('00000000-0000-0000-0000-000000147384', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000147385', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'qualified', 25.0, 0),
  ('00000000-0000-0000-0000-000000147386', '00000000-0000-0000-0000-000001473048', 'checked-in', 'checked-in', true,  'nq',        99.0, 3)
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
  IF has_function_privilege('anon', 'public.set_class_tie_order(uuid, uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_class_tie_order(uuid, uuid[])', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.set_class_tie_order(uuid, uuid[])'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL set_class_tie_order is not authenticated-only';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('private.entry_rank_inputs(public.entries)'::regprocedure,
                    'private.entries_block_direct_tie_write()'::regprocedure,
                    'private.entries_unplaced_clears_tie_marker()'::regprocedure,
                    'private.entries_clear_stale_results_verified()'::regprocedure)
      AND a.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
                           (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL a private tie function is executable by an API role';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.entries', 'placement_tiebreak', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.entries', 'placement_tie', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read the tie columns (the replica needs them)';
  END IF;
  IF has_column_privilege('anon', 'public.entries', 'placement_tiebreak', 'SELECT')
     OR has_column_privilege('anon', 'public.entries', 'placement_tie', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon may read a tie column';
  END IF;
  RAISE NOTICE 'PASS 1 grants: set_class_tie_order authenticated-only, tie columns authenticated-readable and anon-unreadable, helpers private';
END;
$$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 2. An exhibitor and another club's secretary are refused.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  caller uuid;
BEGIN
  FOREACH caller IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000147313'::uuid,  -- exhibitor
    '00000000-0000-0000-0000-000000147312'::uuid   -- club B secretary
  ] LOOP
    PERFORM pg_temp.act_as(caller);
    BEGIN
      PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473044', ARRAY[
        '00000000-0000-0000-0000-000000147343'::uuid,
        '00000000-0000-0000-0000-000000147342'::uuid,
        '00000000-0000-0000-0000-000000147341'::uuid]);
      RAISE EXCEPTION 'FAIL % recorded a tie order in a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=1!,147342=2!,147343=3!' THEN
    RAISE EXCEPTION 'FAIL a refused tie order changed placements: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  RAISE NOTICE 'PASS 2 exhibitor and other club''s secretary refused, nothing written';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Exact ties are decided by the secretary's recorded coin flip.
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
  v_first text := pg_temp.placements('00000000-0000-0000-0000-000001473044');
BEGIN
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=1!,147342=2!,147343=3!' THEN
    RAISE EXCEPTION 'FAIL 3a an unresolved tie is not placed 1-3 and flagged: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473047')
     IS DISTINCT FROM '147371=1,147372=2,147373=3,147374=4,147375=5~,147376=5~,147377=7' THEN
    RAISE EXCEPTION 'FAIL 3a a tie for 5th did not share 5th (next dog 7th): %',
      pg_temp.ties('00000000-0000-0000-0000-000001473047');
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473049')
     IS DISTINCT FROM '147391=1,147392=2,147393=3!,147394=4!,147395=5!,147396=6~,147397=6~,147398=8' THEN
    RAISE EXCEPTION 'FAIL 3a a tie straddling 4th or a tie for 6th was placed wrongly: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473049');
  END IF;
  RAISE NOTICE 'PASS 3a ribbon ties (incl. straddling 4th) placed consecutively and marked unresolved; ties below 4th share the rank (5,5,7 / 6,6,8) and are marked shared';

  -- Touch a row so its heap position moves, then recompute twice.
  UPDATE public.entries SET judge_notes = 'moved in the heap'
  WHERE id = '00000000-0000-0000-0000-000000147341';
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001473044'::uuid], false);
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001473044'::uuid], false);
  IF regexp_replace(pg_temp.placements('00000000-0000-0000-0000-000001473044'), '147341=[^,]*', '')
     IS DISTINCT FROM regexp_replace(v_first, '147341=[^,]*', '')
     OR pg_temp.ties('00000000-0000-0000-0000-000001473044')
        IS DISTINCT FROM '147341=1!,147342=2!,147343=3!' THEN
    RAISE EXCEPTION 'FAIL 3b a recompute reordered or rewrote an unresolved tie: % -> %',
      v_first, pg_temp.placements('00000000-0000-0000-0000-000001473044');
  END IF;
  RAISE NOTICE 'PASS 3b recomputes over the same inputs leave an unresolved tie untouched';

  -- A late expected entry reopens the class: refresh_class_scoring_state
  -- unplaces everyone, and the tie flag must go with the placement.
  INSERT INTO public.entries (id, class_id, show_id, trial_id, entry_status, check_in_status,
                              is_scored, result_status)
  VALUES ('00000000-0000-0000-0000-000000147349', '00000000-0000-0000-0000-000001473044',
          '00000000-0000-0000-0000-000001473002', '00000000-0000-0000-0000-000001473003',
          'checked-in', 'checked-in', false, 'pending');
  IF EXISTS (SELECT 1 FROM public.entries
             WHERE class_id = '00000000-0000-0000-0000-000001473044'
               AND (final_placement IS NOT NULL OR placement_tie IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL 3f an unplaced entry kept its placement or tie marker';
  END IF;
  DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000147349';
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=1!,147342=2!,147343=3!' THEN
    RAISE EXCEPTION 'FAIL 3f the tie was not re-placed and re-flagged on completion: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  RAISE NOTICE 'PASS 3f unplacing a class drops the tie marker; completing it again restores it';
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000147311');
  -- A class with an unresolved ribbon tie cannot be checked (MK018), so the
  -- first flip is recorded, the class checked, and then the flip is reversed.
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473044', ARRAY[
    '00000000-0000-0000-0000-000000147341'::uuid,
    '00000000-0000-0000-0000-000000147342'::uuid,
    '00000000-0000-0000-0000-000000147343'::uuid]);
  PERFORM public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001473044', pg_temp.fp('00000000-0000-0000-0000-000001473044'));
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001473044') THEN
    RAISE EXCEPTION 'FAIL 3c setup: class 44 was not verified';
  END IF;

  -- The reversed flip: 4543 won, then 4542, then 4541.
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473044', ARRAY[
    '00000000-0000-0000-0000-000000147343'::uuid,
    '00000000-0000-0000-0000-000000147342'::uuid,
    '00000000-0000-0000-0000-000000147341'::uuid]);
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=3,147342=2,147343=1' THEN
    RAISE EXCEPTION 'FAIL 3c the recorded order did not place the tie: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  IF pg_temp.verified('00000000-0000-0000-0000-000001473044') THEN
    RAISE EXCEPTION 'FAIL 3c reordering the tie left the results check set';
  END IF;
  -- The recalculator is not an API function; recompute as the owner.
  RESET ROLE;
  PERFORM public.recalculate_class_placements(ARRAY['00000000-0000-0000-0000-000001473044'::uuid], false);
  SET LOCAL ROLE authenticated;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=3,147342=2,147343=1' THEN
    RAISE EXCEPTION 'FAIL 3c a recompute lost the recorded order: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  RAISE NOTICE 'PASS 3c recording the flip places the tie, clears the flag and the check, and survives a recompute';

  -- Not tied (20.0s vs 25.0s in class 42).
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473042', ARRAY[
      '00000000-0000-0000-0000-000000147321'::uuid, '00000000-0000-0000-0000-000000147322'::uuid]);
    RAISE EXCEPTION 'FAIL 3d an order over dogs that are not tied was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  -- Part of a tie group.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473044', ARRAY[
      '00000000-0000-0000-0000-000000147341'::uuid, '00000000-0000-0000-0000-000000147342'::uuid]);
    RAISE EXCEPTION 'FAIL 3d an order over part of a tie group was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  -- A tied entry of another class.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473047', ARRAY[
      '00000000-0000-0000-0000-000000147375'::uuid, '00000000-0000-0000-0000-000000147341'::uuid]);
    RAISE EXCEPTION 'FAIL 3d an entry of another class was accepted';
  EXCEPTION WHEN SQLSTATE 'MK016' THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473044', ARRAY[
      '00000000-0000-0000-0000-000000147341'::uuid]);
    RAISE EXCEPTION 'FAIL 3d a one-entry order was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473044')
     IS DISTINCT FROM '147341=3,147342=2,147343=1' THEN
    RAISE EXCEPTION 'FAIL 3d a refused order changed placements: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473044');
  END IF;
  -- No flip below the ribbons: the 6th-place tie of class 49 and the 5th-place
  -- tie of class 47 are refused, and stay shared.
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473049', ARRAY[
      '00000000-0000-0000-0000-000000147397'::uuid, '00000000-0000-0000-0000-000000147396'::uuid]);
    RAISE EXCEPTION 'FAIL 3d a flip for a 6th-place tie was accepted';
  EXCEPTION WHEN SQLSTATE 'MK017' THEN NULL;
  END;
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473047', ARRAY[
      '00000000-0000-0000-0000-000000147376'::uuid, '00000000-0000-0000-0000-000000147375'::uuid]);
    RAISE EXCEPTION 'FAIL 3d a flip for a 5th-place tie was accepted';
  EXCEPTION WHEN SQLSTATE 'MK017' THEN NULL;
  END;
  -- The straddling ribbon tie does take a flip.
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473049', ARRAY[
    '00000000-0000-0000-0000-000000147395'::uuid,
    '00000000-0000-0000-0000-000000147393'::uuid,
    '00000000-0000-0000-0000-000000147394'::uuid]);
  IF pg_temp.ties('00000000-0000-0000-0000-000001473049')
     IS DISTINCT FROM '147391=1,147392=2,147393=4,147394=5,147395=3,147396=6~,147397=6~,147398=8' THEN
    RAISE EXCEPTION 'FAIL 3d the straddling tie''s flip was not applied: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473049');
  END IF;
  RAISE NOTICE 'PASS 3d non-tied, partial and cross-class orders refused (MK016), one id refused (22023), ties below 4th refused (MK017); a tie straddling 4th takes a flip';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3g. A recorded flip never outlives its tie (independent review of the first cut).
--     Class 48 has two ties, each resolved separately. A change to a run that
--     is never placed (the NQ) keeps both. A correction that moves one dog
--     into the other tie would leave that new group with distinct recorded
--     ordinals (1, 2 and 3) from two different flips; instead every flip in
--     the class is cleared and every tie reads unresolved.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000147311');
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473048', ARRAY[
    '00000000-0000-0000-0000-000000147383'::uuid,
    '00000000-0000-0000-0000-000000147382'::uuid,
    '00000000-0000-0000-0000-000000147381'::uuid]);
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473048', ARRAY[
    '00000000-0000-0000-0000-000000147385'::uuid,
    '00000000-0000-0000-0000-000000147384'::uuid]);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.ties('00000000-0000-0000-0000-000001473048')
     IS DISTINCT FROM '147381=3,147382=2,147383=1,147384=5,147385=4' THEN
    RAISE EXCEPTION 'FAIL 3g setup: the two recorded flips did not place class 48: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473048');
  END IF;

  UPDATE public.entries SET search_time_seconds = 98.0
  WHERE id = '00000000-0000-0000-0000-000000147386';
  IF (SELECT count(placement_tiebreak) FROM public.entries
      WHERE class_id = '00000000-0000-0000-0000-000001473048') <> 5 THEN
    RAISE EXCEPTION 'FAIL 3g a change to an NQ run cleared recorded flips';
  END IF;

  -- The judge misread 4583's time: it was 25.0s, tied with 4584 and 4585.
  UPDATE public.entries SET search_time_seconds = 25.0
  WHERE id = '00000000-0000-0000-0000-000000147383';
  IF (SELECT count(placement_tiebreak) FROM public.entries
      WHERE class_id = '00000000-0000-0000-0000-000001473048') <> 0 THEN
    RAISE EXCEPTION 'FAIL 3g a correction left recorded flips behind';
  END IF;
  IF pg_temp.ties('00000000-0000-0000-0000-000001473048')
     IS DISTINCT FROM '147381=1!,147382=2!,147383=3!,147384=4!,147385=5!' THEN
    RAISE EXCEPTION 'FAIL 3g a merged tie read as resolved: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473048');
  END IF;
  RAISE NOTICE 'PASS 3g a correction that merges two resolved ties clears every flip in the class; both ties read unresolved; an NQ change keeps them';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. A manager cannot write the tie columns directly.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000147311');
  BEGIN
    UPDATE public.entries SET placement_tiebreak = 1
    WHERE id = '00000000-0000-0000-0000-000000147341';
    RAISE EXCEPTION 'FAIL a manager wrote placement_tiebreak directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.entries SET placement_tie = 'shared'
    WHERE id = '00000000-0000-0000-0000-000000147341';
    RAISE EXCEPTION 'FAIL a manager wrote placement_tie directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 4 direct writes to the tie columns are refused (42501)';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. An unresolved ribbon tie blocks "results checked", and get_class_ties
--    lists it. Class 48 (after 3g) holds two unresolved ties: 147381/147382
--    tied for 1st and 147383-147385 tied for 3rd.
--    a. Marking the class checked is refused (MK018) and writes nothing.
--    b. get_class_ties returns the five tied entries, grouped by the place
--       they share (1,1,3,3,3); an exhibitor and another club's secretary
--       are refused (42501); anon cannot call it.
--    c. After both flips are recorded the list is empty and the check works.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_ranks text;
  caller uuid;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000147311');
  BEGIN
    PERFORM public.mark_class_results_verified(
      '00000000-0000-0000-0000-000001473048', pg_temp.fp('00000000-0000-0000-0000-000001473048'));
    RAISE EXCEPTION 'FAIL 6a a class with an unresolved ribbon tie was marked checked';
  EXCEPTION WHEN SQLSTATE 'MK018' THEN NULL;
  END;
  IF pg_temp.verified('00000000-0000-0000-0000-000001473048') THEN
    RAISE EXCEPTION 'FAIL 6a a refused check still stamped the class';
  END IF;
  RAISE NOTICE 'PASS 6a marking a class with an unresolved ribbon tie checked is refused (MK018)';

  SELECT string_agg(right(t.entry_id::text, 3) || '@' || t.group_rank, ',' ORDER BY t.group_rank, t.entry_id)
    INTO v_ranks
  FROM public.get_class_ties('00000000-0000-0000-0000-000001473048') t;
  IF v_ranks IS DISTINCT FROM '381@1,382@1,383@3,384@3,385@3' THEN
    RAISE EXCEPTION 'FAIL 6b get_class_ties did not list both unresolved ties: %', v_ranks;
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_class_ties('00000000-0000-0000-0000-000001473047')) THEN
    RAISE EXCEPTION 'FAIL 6b get_class_ties listed a tie below 4th';
  END IF;

  FOREACH caller IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000147313'::uuid,
    '00000000-0000-0000-0000-000000147312'::uuid
  ] LOOP
    PERFORM pg_temp.act_as(caller);
    BEGIN
      PERFORM * FROM public.get_class_ties('00000000-0000-0000-0000-000001473048');
      RAISE EXCEPTION 'FAIL 6b % read the ties of a class it does not manage', caller;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 6b get_class_ties lists the unresolved ribbon ties (1,1,3,3,3) for the manager only';

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000147311');
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473048', ARRAY[
    '00000000-0000-0000-0000-000000147382'::uuid, '00000000-0000-0000-0000-000000147381'::uuid]);
  PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473048', ARRAY[
    '00000000-0000-0000-0000-000000147385'::uuid,
    '00000000-0000-0000-0000-000000147384'::uuid,
    '00000000-0000-0000-0000-000000147383'::uuid]);
  IF EXISTS (SELECT 1 FROM public.get_class_ties('00000000-0000-0000-0000-000001473048')) THEN
    RAISE EXCEPTION 'FAIL 6c ties are still listed after both flips were recorded';
  END IF;
  PERFORM public.mark_class_results_verified(
    '00000000-0000-0000-0000-000001473048', pg_temp.fp('00000000-0000-0000-0000-000001473048'));
  IF NOT pg_temp.verified('00000000-0000-0000-0000-000001473048') THEN
    RAISE EXCEPTION 'FAIL 6c the class could not be checked after the flips were recorded';
  END IF;
  RAISE NOTICE 'PASS 6c after the flips are recorded the list is empty and the class can be checked';
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  BEGIN
    PERFORM * FROM public.get_class_ties('00000000-0000-0000-0000-000001473048');
    RAISE EXCEPTION 'FAIL anon called get_class_ties';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 6d anon cannot call get_class_ties';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Backfill: a completed class that still holds the old placements for a
--    tie below 4th (consecutive 5, 6, no marker) reads shared ranks once it is
--    re-derived through refresh_class_scoring_state, the call the migration's
--    backfill makes for every completed, non-deleted class. Class 47 stands in
--    for such a class: its tie for 5th is put back to the pre-migration shape
--    first.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.entries SET final_placement = 5, placement_tie = NULL
  WHERE id = '00000000-0000-0000-0000-000000147375';
  UPDATE public.entries SET final_placement = 6, placement_tie = NULL
  WHERE id = '00000000-0000-0000-0000-000000147376';
  IF pg_temp.ties('00000000-0000-0000-0000-000001473047')
     IS DISTINCT FROM '147371=1,147372=2,147373=3,147374=4,147375=5,147376=6,147377=7' THEN
    RAISE EXCEPTION 'FAIL 7 setup: class 47 is not in the pre-migration shape: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473047');
  END IF;

  PERFORM public.refresh_class_scoring_state(c.id)
  FROM public.classes c
  WHERE c.status = 'completed' AND c.deleted_at IS NULL
    AND c.id = '00000000-0000-0000-0000-000001473047';

  IF pg_temp.ties('00000000-0000-0000-0000-000001473047')
     IS DISTINCT FROM '147371=1,147372=2,147373=3,147374=4,147375=5~,147376=5~,147377=7' THEN
    RAISE EXCEPTION 'FAIL 7 the backfill did not give the tie below 4th shared ranks: %',
      pg_temp.ties('00000000-0000-0000-0000-000001473047');
  END IF;
  RAISE NOTICE 'PASS 7 a completed class with a tie below 4th reads shared ranks (5, 5, 7) after the backfill re-derives it';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. anon is refused outright.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  BEGIN
    PERFORM public.set_class_tie_order('00000000-0000-0000-0000-000001473047', ARRAY[
      '00000000-0000-0000-0000-000000147376'::uuid, '00000000-0000-0000-0000-000000147375'::uuid]);
    RAISE EXCEPTION 'FAIL anon called set_class_tie_order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 5 anon cannot call set_class_tie_order';
END;
$$;

RESET ROLE;
ROLLBACK;
