-- MYK9-1327 Batch 3: judge_assignments_one_confirmed_judge_per_class, the partial unique index
-- (20261028185300) that makes "a Class has exactly one Judge" (CONTEXT.md, Class) a constraint.
--
-- Cases: 1 a second CONFIRMED class-level row for the same class is refused (23505), whether it
-- names another judge or the same one; 2 show-level rows (class_id NULL) are unconstrained, many
-- per show; 3 non-confirmed class-level rows (invited, declined) sit beside the confirmed one,
-- and a declined row may be confirmed only once the confirmed one is gone; 4 the same judge on
-- two DIFFERENT classes is fine; 5 set_class_judge still replaces A with B (the DELETE runs
-- before the INSERT, so the index never sees two) and removes with NULL; 6 the index is the
-- partial unique one on class_id.
--
-- Conventions match myk9_1327_set_class_judge_test.sql: run with psql -X -v ON_ERROR_STOP=1 after
-- migrations; every fixture rolls back. Runs only in CI.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001327201', 'MYK9-1327 One-Judge Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001327211', 'Sam', 'Secretary', 'myk9-1327-oj-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000001327221', 'Alice', 'JudgeA', 'myk9-1327-oj-judge-a@example.test', NULL),
  ('00000000-0000-0000-0000-000001327222', 'Bob', 'JudgeB', 'myk9-1327-oj-judge-b@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001327301', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1327-oj-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000001327201', '00000000-0000-0000-0000-000001327211', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001327211', id, '00000000-0000-0000-0000-000001327201', true,
       '00000000-0000-0000-0000-000001327301'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000001327231', 'MYK9-1327 One-Judge Show', 'AKC',
        current_date, current_date + 1, 'published', '00000000-0000-0000-0000-000001327201');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000001327241', '00000000-0000-0000-0000-000001327231',
        'MYK9-1327 One-Judge Trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000001327251', '00000000-0000-0000-0000-000001327241', 'O1 second confirmed'),
  ('00000000-0000-0000-0000-000001327252', '00000000-0000-0000-0000-000001327241', 'O2 non-confirmed beside confirmed'),
  ('00000000-0000-0000-0000-000001327253', '00000000-0000-0000-0000-000001327241', 'O3 same judge, other class'),
  ('00000000-0000-0000-0000-000001327254', '00000000-0000-0000-0000-000001327241', 'O4 set_class_judge');

-- 1. A second confirmed class-level row for the same class is refused, for another judge and for
-- the same judge alike.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
VALUES ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL,
        '00000000-0000-0000-0000-000001327251', 'confirmed', now());

DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
    VALUES ('00000000-0000-0000-0000-000001327222', '00000000-0000-0000-0000-000001327231', NULL,
            '00000000-0000-0000-0000-000001327251', 'confirmed', now());
    RAISE EXCEPTION 'FAIL 1.0 a second confirmed judge on one class was accepted';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '23505' THEN
      RAISE EXCEPTION 'FAIL 1.1 expected 23505, got %', v_state;
    END IF;
  END;
  BEGIN
    INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
    VALUES ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL,
            '00000000-0000-0000-0000-000001327251', 'confirmed', now());
    RAISE EXCEPTION 'FAIL 1.2 the same judge confirmed twice on one class was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.judge_assignments
      WHERE class_id = '00000000-0000-0000-0000-000001327251') <> 1 THEN
    RAISE EXCEPTION 'FAIL 1.3 a refused insert left a row behind';
  END IF;
  RAISE NOTICE 'PASS 1 a second confirmed class-level judge is refused with 23505';
END;
$$;

-- 2. Show-level rows are unconstrained: several confirmed per show.
DO $$
BEGIN
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL, NULL, 'confirmed', now()),
    ('00000000-0000-0000-0000-000001327222', '00000000-0000-0000-0000-000001327231', NULL, NULL, 'confirmed', now());
  IF (SELECT count(*) FROM public.judge_assignments
      WHERE show_id = '00000000-0000-0000-0000-000001327231' AND class_id IS NULL
        AND status = 'confirmed') <> 2 THEN
    RAISE EXCEPTION 'FAIL 2.0 expected two confirmed show-level rows';
  END IF;
  RAISE NOTICE 'PASS 2 show-level (class_id NULL) rows are unaffected';
END;
$$;

-- 3. Non-confirmed class-level rows sit beside the confirmed one.
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327252';
  v_declined uuid;
BEGIN
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
  VALUES ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL, v_class, 'confirmed', now());
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  VALUES ('00000000-0000-0000-0000-000001327222', '00000000-0000-0000-0000-000001327231', NULL, v_class, 'invited');
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  VALUES ('00000000-0000-0000-0000-000001327222', '00000000-0000-0000-0000-000001327231', NULL, v_class, 'declined')
  RETURNING id INTO v_declined;
  IF (SELECT count(*) FROM public.judge_assignments WHERE class_id = v_class) <> 3 THEN
    RAISE EXCEPTION 'FAIL 3.0 invited and declined rows must coexist with the confirmed one';
  END IF;
  BEGIN
    UPDATE public.judge_assignments SET status = 'confirmed' WHERE id = v_declined;
    RAISE EXCEPTION 'FAIL 3.1 confirming a second row on the class was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RAISE NOTICE 'PASS 3 non-confirmed rows coexist; confirming a second row is refused';
END;
$$;

-- 4. The same judge on two different classes is fine.
DO $$
BEGIN
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL, '00000000-0000-0000-0000-000001327253', 'confirmed', now()),
    ('00000000-0000-0000-0000-000001327221', '00000000-0000-0000-0000-000001327231', NULL, '00000000-0000-0000-0000-000001327254', 'confirmed', now());
  RAISE NOTICE 'PASS 4 one judge may judge several classes';
END;
$$;

-- 5. set_class_judge replaces A with B and removes with NULL; the index never sees two rows.
CREATE FUNCTION pg_temp.t1327oj_call(p_sub text, p_class uuid, p_person uuid) RETURNS jsonb
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

CREATE TEMP TABLE t1327oj_results (label text PRIMARY KEY, payload jsonb);

INSERT INTO t1327oj_results
SELECT 'replace', pg_temp.t1327oj_call('00000000-0000-0000-0000-000001327301',
  '00000000-0000-0000-0000-000001327254', '00000000-0000-0000-0000-000001327222');
INSERT INTO t1327oj_results
SELECT 'remove', pg_temp.t1327oj_call('00000000-0000-0000-0000-000001327301',
  '00000000-0000-0000-0000-000001327253', NULL);

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000001327254';
BEGIN
  IF (SELECT payload ->> 'error' FROM t1327oj_results WHERE label = 'replace') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 5.0 set_class_judge raised %, so the assertions below would be vacuous',
      (SELECT payload FROM t1327oj_results WHERE label = 'replace');
  END IF;
  IF (SELECT count(*) FROM public.judge_assignments WHERE class_id = v_class) <> 1
     OR (SELECT person_id FROM public.judge_assignments WHERE class_id = v_class AND status = 'confirmed')
        IS DISTINCT FROM '00000000-0000-0000-0000-000001327222'::uuid THEN
    RAISE EXCEPTION 'FAIL 5.1 expected exactly one confirmed row, for B, after replacing A';
  END IF;
  IF (SELECT payload ->> 'error' FROM t1327oj_results WHERE label = 'remove') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.judge_assignments
                WHERE class_id = '00000000-0000-0000-0000-000001327253') THEN
    RAISE EXCEPTION 'FAIL 5.2 NULL must remove the class judge (payload %)',
      (SELECT payload FROM t1327oj_results WHERE label = 'remove');
  END IF;
  RAISE NOTICE 'PASS 5 set_class_judge still replaces A with B and removes with NULL';
END;
$$;

-- 6. The index is the partial unique one on class_id.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'judge_assignments'
    AND indexname = 'judge_assignments_one_confirmed_judge_per_class';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FAIL 6.0 judge_assignments_one_confirmed_judge_per_class does not exist';
  END IF;
  IF v_def NOT LIKE 'CREATE UNIQUE INDEX%' OR v_def NOT LIKE '%(class_id)%'
     OR v_def NOT LIKE '%class_id IS NOT NULL%' OR v_def NOT LIKE '%confirmed%' THEN
    RAISE EXCEPTION 'FAIL 6.1 index is not the partial unique one on confirmed class-level rows: %', v_def;
  END IF;
  RAISE NOTICE 'PASS 6 index is unique, partial on class_id IS NOT NULL AND status = confirmed';
END;
$$;

ROLLBACK;
