-- MYK9-2161: the secretary's "email the exhibitors in this class who the new judge is" action.
--
--   A. a class that never had a judge offers nothing and emails nobody (first assignment)
--   B. a replaced judge: the offer names the new judge and counts exactly the people with a live
--      entry and an email (a withdrawn dog's owner is out)
--   C. another club's secretary and a plain user get P0002 (offer, queue, dismiss); anon has no EXECUTE
--   D. the tap queues one ready, automatic judge_changed job per person naming the judge who left;
--      a second tap is refused (offer resolved); a changed judge is refused with P0001
--   E. a job the sender has claimed is never changed: that person is skipped, the offer stays up,
--      and the next tap (after the lease ends) covers them
--   F. dismissing hides the offer for that judge only; a later judge change offers again
--   G. a draft show offers nothing and records no departure; a vacancy (judge left, none named) offers nothing
--
-- Every fixture rolls back. Runs only in CI (psql -X -v ON_ERROR_STOP=1 after migrations).

BEGIN;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000002161001', 'MYK9-2161 Club'),
  ('00000000-0000-0000-0000-000002161002', 'MYK9-2161 Other Club');

INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-000002161011', 'Sam', 'Secretary', 'myk9-2161-secretary@example.test'),
  ('00000000-0000-0000-0000-000002161012', 'Olga', 'Other', 'myk9-2161-other@example.test'),
  ('00000000-0000-0000-0000-000002161013', 'Pat', 'Plain', 'myk9-2161-plain@example.test'),
  ('00000000-0000-0000-0000-000002161014', 'Sia', 'SiteAdmin', 'myk9-2161-site@example.test'),
  ('00000000-0000-0000-0000-000002161021', 'Ada', 'Owner', 'ada-2161@example.test'),
  ('00000000-0000-0000-0000-000002161022', 'Ivy', 'Owner', 'ivy-2161@example.test'),
  ('00000000-0000-0000-0000-000002161023', 'Cy', 'Withdrew', 'cy-2161@example.test'),
  ('00000000-0000-0000-0000-000002161024', 'Nan', 'Never', 'nan-2161@example.test'),
  ('00000000-0000-0000-0000-000002161051', 'Judge', 'A', 'ja-2161@example.test'),
  ('00000000-0000-0000-0000-000002161052', 'Judge', 'B', 'jb-2161@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES
  ('00000000-0000-0000-0000-000002161101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2161-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002161102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2161-other@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002161103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2161-plain@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002161104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2161-site@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002161014', id, true, '00000000-0000-0000-0000-000002161104'
FROM public.roles WHERE name = 'site_admin';

INSERT INTO public.club_members (club_id, person_id, membership_status) VALUES
  ('00000000-0000-0000-0000-000002161001', '00000000-0000-0000-0000-000002161011', 'active'),
  ('00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161012', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002161011', id, '00000000-0000-0000-0000-000002161001', true,
       '00000000-0000-0000-0000-000002161101'
FROM public.roles WHERE name = 'secretary';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002161012', id, '00000000-0000-0000-0000-000002161002', true,
       '00000000-0000-0000-0000-000002161102'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000002161002', 'MYK9-2161 Show', 'AKC', current_date + 7, current_date + 7,
   '00000000-0000-0000-0000-000002161001', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type) VALUES
  ('00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161002', 'MYK9-2161 Trial',
   current_date + 7, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, status, element, level, section) VALUES
  ('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002161005', '00000000-0000-0000-0000-000002161003', 'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002161006', '00000000-0000-0000-0000-000002161003', 'Buried Novice A', 'upcoming', 'Buried', 'Novice', 'A');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id) VALUES
  ('00000000-0000-0000-0000-000002161031', 'Ada Dog', 'Ada', 'Beagle', '00000000-0000-0000-0000-000002161021'),
  ('00000000-0000-0000-0000-000002161032', 'Ivy Dog', 'Ivy', 'Beagle', '00000000-0000-0000-0000-000002161022'),
  ('00000000-0000-0000-0000-000002161033', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002161023'),
  ('00000000-0000-0000-0000-000002161034', 'Nan Dog', 'Nan', 'Beagle', '00000000-0000-0000-0000-000002161024');

ALTER TABLE public.entries DISABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status)
SELECT ('00000000-0000-0000-0000-0000021610' || lpad(n::text, 2, '0'))::uuid, d.id,
       '00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161002',
       '00000000-0000-0000-0000-000002161003', d.status, n::text, n, 'no-status'
FROM (VALUES
  (41, '00000000-0000-0000-0000-000002161031'::uuid, 'confirmed'),
  (42, '00000000-0000-0000-0000-000002161032'::uuid, 'confirmed'),
  (43, '00000000-0000-0000-0000-000002161033'::uuid, 'withdrawn'),
  (44, '00000000-0000-0000-0000-000002161034'::uuid, 'confirmed')
) AS d(n, id, status)
WHERE true;
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_require_dog_registration;

-- A draft show with a class and a judge, for G.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000002161082', 'MYK9-2161 Draft Show', 'AKC', current_date + 7, current_date + 7,
   '00000000-0000-0000-0000-000002161001', 'draft');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type) VALUES
  ('00000000-0000-0000-0000-000002161083', '00000000-0000-0000-0000-000002161082', 'MYK9-2161 Draft Trial',
   current_date + 7, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, status, element, level, section) VALUES
  ('00000000-0000-0000-0000-000002161084', '00000000-0000-0000-0000-000002161083', 'Draft Container', 'upcoming', 'Container', 'Novice', 'A');

-- Container starts with judge A.
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status) VALUES
  ('00000000-0000-0000-0000-000002161061', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161002', NULL, '00000000-0000-0000-0000-000002161004', 'confirmed'),
  ('00000000-0000-0000-0000-000002161063', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161082', NULL, '00000000-0000-0000-0000-000002161084', 'confirmed');

CREATE FUNCTION pg_temp.t2161_call(p_sub text, p_fn text, p_class uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
  v_judge uuid := (SELECT person_id FROM public.judge_assignments
                    WHERE class_id = p_class AND status = 'confirmed' ORDER BY id LIMIT 1);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    IF p_fn = 'offer' THEN
      v_result := public.class_substitute_judge_offer(p_class);
    ELSIF p_fn = 'queue' THEN
      v_result := to_jsonb(public.queue_substitute_judge_emails(p_class, v_judge));
    ELSIF p_fn = 'queue_wrong' THEN
      v_result := to_jsonb(public.queue_substitute_judge_emails(p_class, '00000000-0000-0000-0000-000002161099'));
    ELSIF p_fn = 'dismiss' THEN
      PERFORM public.dismiss_substitute_judge_email_offer(p_class, v_judge);
      v_result := 'null'::jsonb;
    ELSE
      v_result := to_jsonb(public.set_class_judge(p_class, '00000000-0000-0000-0000-000002161052'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('error', SQLSTATE);
  END;
  RESET ROLE;
  RETURN v_result;
END;
$$;

CREATE FUNCTION pg_temp.t2161_jobs(p_status text) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.show_lifecycle_email_jobs
   WHERE show_id = '00000000-0000-0000-0000-000002161002' AND step_type = 'judge_changed' AND status = p_status
$$;

-- A: Interior never had a judge. The first assignment offers nothing and queues nothing.
DO $$
DECLARE
  v_sec text := '00000000-0000-0000-0000-000002161101';
  v_class uuid := '00000000-0000-0000-0000-000002161005';
BEGIN
  PERFORM pg_temp.t2161_call(v_sec, 'pick', v_class);
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '{"error":"P0001"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL A a first assignment offered or queued emails: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  IF pg_temp.t2161_jobs('ready') <> 0 OR EXISTS (SELECT 1 FROM public.class_judge_departures WHERE class_id = v_class) THEN
    RAISE EXCEPTION 'FAIL A a first assignment left a job or a departure';
  END IF;
  RAISE NOTICE 'PASS A first assignment emails nobody';
END $$;

-- B: judge A is replaced by B (set_class_judge). The 2125 job for the change is cleared so the
-- jobs below are only this feature's.
SELECT pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'pick', '00000000-0000-0000-0000-000002161004');
DELETE FROM public.show_lifecycle_email_jobs WHERE step_type = 'judge_changed';

DO $$
DECLARE
  v_offer jsonb := pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'offer', '00000000-0000-0000-0000-000002161004');
BEGIN
  IF v_offer IS DISTINCT FROM jsonb_build_object('judge_id', '00000000-0000-0000-0000-000002161052', 'recipient_count', 3) THEN
    RAISE EXCEPTION 'FAIL B the offer should name judge B and count Ada, Ivy, Nan (not the withdrawn Cy), got %', v_offer;
  END IF;
  RAISE NOTICE 'PASS B the offer names the new judge and counts the live exhibitors';
END $$;

-- C
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_who text;
  v_fn text;
BEGIN
  FOREACH v_who IN ARRAY ARRAY['00000000-0000-0000-0000-000002161102', '00000000-0000-0000-0000-000002161103'] LOOP
    FOREACH v_fn IN ARRAY ARRAY['offer', 'queue', 'dismiss'] LOOP
      IF pg_temp.t2161_call(v_who, v_fn, v_class) IS DISTINCT FROM '{"error":"P0002"}'::jsonb THEN
        RAISE EXCEPTION 'FAIL C % by % was not refused: %', v_fn, v_who, pg_temp.t2161_call(v_who, v_fn, v_class);
      END IF;
    END LOOP;
  END LOOP;
  IF pg_temp.t2161_jobs('ready') <> 0 THEN
    RAISE EXCEPTION 'FAIL C a refused caller queued jobs';
  END IF;
  IF has_function_privilege('anon', 'public.queue_substitute_judge_emails(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.class_substitute_judge_offer(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dismiss_substitute_judge_email_offer(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'public.queue_substitute_judge_emails(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.substitute_judge_email_target(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.substitute_judge_email_show(uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.class_judge_departures', 'SELECT')
     OR has_table_privilege('anon', 'public.class_judge_departures', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL C an API role can reach something it should not';
  END IF;
  RAISE NOTICE 'PASS C only the show secretary can offer, queue or dismiss';
END $$;

-- D
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
  v_job record;
BEGIN
  IF pg_temp.t2161_call(v_sec, 'queue_wrong', v_class) IS DISTINCT FROM '{"error":"P0001"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.0 a tap for another judge was not refused';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '3'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.1 the tap should queue 3, got %', pg_temp.t2161_call(v_sec, 'queue', v_class);
  END IF;
  IF pg_temp.t2161_jobs('ready') <> 3 THEN
    RAISE EXCEPTION 'FAIL D.2 expected 3 ready jobs, found %', pg_temp.t2161_jobs('ready');
  END IF;
  SELECT * INTO v_job FROM public.show_lifecycle_email_jobs
   WHERE status = 'ready' AND recipient_person_id = '00000000-0000-0000-0000-000002161021';
  IF v_job.auto_send IS NOT TRUE OR v_job.step_type <> 'judge_changed'
     OR v_job.recipient_email <> 'ada-2161@example.test'
     OR v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161051') THEN
    RAISE EXCEPTION 'FAIL D.3 the queued job is wrong: %', row_to_json(v_job);
  END IF;
  IF EXISTS (SELECT 1 FROM public.show_lifecycle_email_jobs
              WHERE status = 'ready' AND recipient_person_id = '00000000-0000-0000-0000-000002161023') THEN
    RAISE EXCEPTION 'FAIL D.4 a withdrawn dog''s owner was queued';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '{"error":"P0001"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.5 the offer came back after the tap';
  END IF;
  RAISE NOTICE 'PASS D the tap queues one job per live exhibitor and the offer disappears';
END $$;

-- E: Container is replaced again (B to A); one exhibitor's ready job is claimed by the sender.
DELETE FROM public.show_lifecycle_email_jobs WHERE step_type = 'judge_changed';
UPDATE public.judge_assignments SET person_id = '00000000-0000-0000-0000-000002161051'
 WHERE class_id = '00000000-0000-0000-0000-000002161004';
UPDATE public.judge_assignments SET person_id = '00000000-0000-0000-0000-000002161052'
 WHERE class_id = '00000000-0000-0000-0000-000002161004';
DELETE FROM public.show_lifecycle_email_jobs WHERE step_type = 'judge_changed' AND recipient_person_id <> '00000000-0000-0000-0000-000002161021';
UPDATE public.show_lifecycle_email_jobs SET claimed_until = now() + interval '10 minutes', attempt_id = gen_random_uuid()
 WHERE step_type = 'judge_changed' AND recipient_person_id = '00000000-0000-0000-0000-000002161021';
CREATE TEMP TABLE t2161_claimed AS
  SELECT id, judge_changes, due_at FROM public.show_lifecycle_email_jobs
   WHERE step_type = 'judge_changed' AND recipient_person_id = '00000000-0000-0000-0000-000002161021';

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.0 expected 2 queued (Ivy, Nan), got %', pg_temp.t2161_call(v_sec, 'queue', v_class);
  END IF;
  IF EXISTS (SELECT 1 FROM public.show_lifecycle_email_jobs j JOIN t2161_claimed c ON c.id = j.id
              WHERE j.judge_changes IS DISTINCT FROM c.judge_changes OR j.due_at IS DISTINCT FROM c.due_at) THEN
    RAISE EXCEPTION 'FAIL E.1 a claimed job was changed';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) ->> 'judge_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL E.2 the offer should stay up while a claimed job was skipped';
  END IF;
  UPDATE public.show_lifecycle_email_jobs SET claimed_until = now() - interval '1 minute'
   WHERE id IN (SELECT id FROM t2161_claimed);
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '3'::jsonb
     OR pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.3 the second tap should cover everyone and resolve the offer';
  END IF;
  RAISE NOTICE 'PASS E a claimed job is untouched and the offer waits for another tap';
END $$;

-- F: dismiss hides the offer for this judge; a later change offers again.
DELETE FROM public.show_lifecycle_email_jobs WHERE step_type = 'judge_changed';
UPDATE public.judge_assignments SET person_id = '00000000-0000-0000-0000-000002161051'
 WHERE class_id = '00000000-0000-0000-0000-000002161004';
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
    UPDATE public.judge_assignments SET person_id = '00000000-0000-0000-0000-000002161052' WHERE class_id = v_class;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) ->> 'judge_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL F.0 the offer should be up for a new change';
  END IF;
  PERFORM pg_temp.t2161_call(v_sec, 'dismiss', v_class);
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb OR pg_temp.t2161_jobs('ready') <> 0 THEN
    RAISE EXCEPTION 'FAIL F.1 dismiss did not hide the offer or queued mail';
  END IF;
  -- The judge who left is back (delete, then insert the same person): nothing to tell anyone.
  DELETE FROM public.judge_assignments WHERE class_id = v_class;
  INSERT INTO public.judge_assignments (person_id, show_id, class_id, status)
  VALUES ('00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002', v_class, 'confirmed');
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL F.2 the original judge returning should offer nothing';
  END IF;
  RAISE NOTICE 'PASS F dismiss and a returning judge hide the offer';
END $$;

-- G: a draft show records nothing; a vacancy offers nothing.
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161084';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
  UPDATE public.judge_assignments SET person_id = '00000000-0000-0000-0000-000002161052' WHERE class_id = v_class;
  IF EXISTS (SELECT 1 FROM public.class_judge_departures WHERE class_id = v_class) THEN
    RAISE EXCEPTION 'FAIL G.0 a draft show recorded a departure';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL G.1 a draft show offered something';
  END IF;
  DELETE FROM public.judge_assignments WHERE class_id = '00000000-0000-0000-0000-000002161004';
  IF pg_temp.t2161_call(v_sec, 'offer', '00000000-0000-0000-0000-000002161004') IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL G.2 a class with no judge now offered something';
  END IF;
  RAISE NOTICE 'PASS G draft shows and vacancies offer nothing';
END $$;

ROLLBACK;
