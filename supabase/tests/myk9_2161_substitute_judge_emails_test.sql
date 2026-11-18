-- MYK9-2161: the secretary's "email the exhibitors who were told no judge yet" action.
--
--   A. nothing to offer while the class has no judge, and for a class that never had one
--   B. after a substitute is confirmed, the offer counts exactly the people whose sent judge
--      email went out before it (live entry, email on file); not a withdrawn dog's owner
--   C. only the show's secretary (here) is allowed; another club's secretary and a plain user
--      are refused with P0002 (the same answer as a missing class) and queue nothing; anon has no EXECUTE
--   D. the tap queues one ready, automatic judge_changed job per told person, naming the judge
--      before the first change; a second tap queues nothing; the offer then reads as sent
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

-- The class starts with judge A (confirmed a day ago).
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-000002161061', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161002', NULL, '00000000-0000-0000-0000-000002161004',
   'confirmed', now() - interval '1 day');

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
      v_result := public.substitute_judge_email_offer(p_class);
    ELSIF p_fn = 'queue' THEN
      v_result := to_jsonb(public.queue_substitute_judge_emails(p_class, v_judge));
    ELSIF p_fn = 'queue_wrong' THEN
      v_result := to_jsonb(public.queue_substitute_judge_emails(p_class, '00000000-0000-0000-0000-000002161099'));
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

-- Judge A leaves: the 2125 trigger queues the judge_changed emails, which then go out an hour
-- ago while the class has no judge ("not named yet").
DELETE FROM public.judge_assignments WHERE id = '00000000-0000-0000-0000-000002161061';
UPDATE public.show_lifecycle_email_jobs
   SET status = 'sent', sent_at = now() - interval '1 hour', created_at = now() - interval '1 hour',
       class_notices = jsonb_build_object('00000000-0000-0000-0000-000002161004', 'unnamed')
 WHERE show_id = '00000000-0000-0000-0000-000002161002' AND step_type = 'judge_changed';

-- A
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
  IF pg_temp.t2161_jobs('sent') <> 3 THEN
    RAISE EXCEPTION 'FAIL A.0 expected 3 sent jobs (Ada, Ivy, Nan), found %', pg_temp.t2161_jobs('sent');
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL A.1 a class with no judge offered something: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  -- First assignment: Interior never had a judge.
  PERFORM pg_temp.t2161_call(v_sec, 'pick', '00000000-0000-0000-0000-000002161005');
  IF pg_temp.t2161_call(v_sec, 'offer', '00000000-0000-0000-0000-000002161005') IS DISTINCT FROM '{"pending_count":0,"sent_count":0}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', '00000000-0000-0000-0000-000002161005') IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL A.2 a first assignment offered or queued emails';
  END IF;
  RAISE NOTICE 'PASS A no offer without a replaced judge';
END $$;

-- B: a substitute is confirmed.
SELECT pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'pick', '00000000-0000-0000-0000-000002161004');

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_offer jsonb := pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'offer', v_class);
BEGIN
  IF v_offer IS DISTINCT FROM '{"pending_count":3,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL B the offer should count Ada, Ivy and Nan (told, live entry), got %', v_offer;
  END IF;
  RAISE NOTICE 'PASS B the offer counts the people who were told';
END $$;

-- C
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_who text;
  v_fn text;
BEGIN
  FOREACH v_who IN ARRAY ARRAY['00000000-0000-0000-0000-000002161102', '00000000-0000-0000-0000-000002161103'] LOOP
    FOREACH v_fn IN ARRAY ARRAY['offer', 'queue'] LOOP
      IF pg_temp.t2161_call(v_who, v_fn, v_class) IS DISTINCT FROM '{"error":"P0002"}'::jsonb THEN
        RAISE EXCEPTION 'FAIL C % by % was not refused: %', v_fn, v_who, pg_temp.t2161_call(v_who, v_fn, v_class);
      END IF;
    END LOOP;
  END LOOP;
  IF pg_temp.t2161_jobs('ready') <> 0 THEN
    RAISE EXCEPTION 'FAIL C a refused caller queued jobs';
  END IF;
  IF has_function_privilege('anon', 'public.queue_substitute_judge_emails(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.substitute_judge_email_offer(uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'public.queue_substitute_judge_emails(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.substitute_judge_email_audience(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.substitute_judge_email_show(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.substitute_judge_email_show(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL C an API role can execute where it should not';
  END IF;
  RAISE NOTICE 'PASS C only the show secretary can offer or queue';
END $$;

-- D
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
  v_job record;
BEGIN
  -- now() is the transaction start, so move the confirmation back to let the tap's jobs be later.
  UPDATE public.judge_assignments SET confirmed_at = now() - interval '10 minutes' WHERE class_id = v_class;
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '3'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.0 the tap should queue 3, got %', pg_temp.t2161_call(v_sec, 'queue', v_class);
  END IF;
  IF pg_temp.t2161_jobs('ready') <> 3 THEN
    RAISE EXCEPTION 'FAIL D.1 expected 3 ready jobs, found %', pg_temp.t2161_jobs('ready');
  END IF;
  SELECT * INTO v_job FROM public.show_lifecycle_email_jobs
   WHERE status = 'ready' AND recipient_person_id = '00000000-0000-0000-0000-000002161021';
  IF v_job.auto_send IS NOT TRUE OR v_job.step_type <> 'judge_changed'
     OR v_job.recipient_email <> 'ada-2161@example.test'
     OR v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161051') THEN
    RAISE EXCEPTION 'FAIL D.2 the queued job is wrong: %', row_to_json(v_job);
  END IF;
  IF EXISTS (SELECT 1 FROM public.show_lifecycle_email_jobs
              WHERE status = 'ready' AND recipient_person_id = '00000000-0000-0000-0000-000002161023') THEN
    RAISE EXCEPTION 'FAIL D.3 a withdrawn dog''s owner was queued';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.4 a second tap queued again';
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":3}'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.5 the offer should read as sent to 3, got %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  -- The emails go out (the sender records that each one named the judge); the offer still reads as sent and is not offered again.
  UPDATE public.show_lifecycle_email_jobs
     SET status = 'sent', sent_at = now(), class_notices = jsonb_build_object(v_class::text, 'named')
   WHERE status = 'ready';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":3}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL D.6 after sending, the offer came back or was not marked sent';
  END IF;
  RAISE NOTICE 'PASS D the tap queues the told people once and the offer then says sent';
END $$;

-- E: a second class, Ada told "not named yet", a substitute confirmed ten minutes ago.
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) VALUES
  ('00000000-0000-0000-0000-000002161071', '00000000-0000-0000-0000-000002161031',
   '00000000-0000-0000-0000-000002161006', '00000000-0000-0000-0000-000002161002',
   '00000000-0000-0000-0000-000002161003', 'confirmed', '71', 1, 'no-status');
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-000002161062', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161002', NULL, '00000000-0000-0000-0000-000002161006',
   'confirmed', now() - interval '1 day');
DELETE FROM public.judge_assignments WHERE id = '00000000-0000-0000-0000-000002161062';
UPDATE public.show_lifecycle_email_jobs
   SET status = 'sent', sent_at = now() - interval '1 hour', created_at = now() - interval '1 hour',
       class_notices = jsonb_build_object('00000000-0000-0000-0000-000002161006', 'unnamed')
 WHERE status = 'ready' AND judge_changes ? '00000000-0000-0000-0000-000002161006';
SELECT pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'pick', '00000000-0000-0000-0000-000002161006');
UPDATE public.judge_assignments SET confirmed_at = now() - interval '10 minutes'
 WHERE class_id = '00000000-0000-0000-0000-000002161006';

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161006';
  v_sec text := '00000000-0000-0000-0000-000002161101';
  v_show uuid := '00000000-0000-0000-0000-000002161002';
  v_zero jsonb := '{"pending_count":0,"sent_count":0}'::jsonb;
BEGIN
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":1,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.0 expected an offer of 1, got %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  IF pg_temp.t2161_call('00000000-0000-0000-0000-000002161104', 'offer', v_class) IS DISTINCT FROM '{"pending_count":1,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.1 a site admin was not allowed: %', pg_temp.t2161_call('00000000-0000-0000-0000-000002161104', 'offer', v_class);
  END IF;
  IF pg_temp.t2161_call(v_sec, 'offer', '00000000-0000-0000-0000-000002161999') IS DISTINCT FROM '{"error":"P0002"}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', '00000000-0000-0000-0000-000002161999') IS DISTINCT FROM '{"error":"P0002"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.2 a missing class was not P0002';
  END IF;

  -- The step switched off: nothing offered or queued.
  UPDATE public.show_lifecycle_email_steps SET is_enabled = false WHERE show_id = v_show AND step_type = 'judge_changed';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_zero
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.3 a switched-off step offered or queued';
  END IF;
  UPDATE public.show_lifecycle_email_steps SET is_enabled = true WHERE show_id = v_show AND step_type = 'judge_changed';

  -- A draft show: nothing offered or queued.
  UPDATE public.shows SET status = 'draft' WHERE id = v_show;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_zero
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.4 a draft show offered or queued';
  END IF;
  UPDATE public.shows SET status = 'published' WHERE id = v_show;

  -- A trial day already past: nothing offered or queued.
  UPDATE public.trials SET date = current_date - 3 WHERE id = '00000000-0000-0000-0000-000002161003';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_zero
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.4b a past trial day offered or queued';
  END IF;
  UPDATE public.trials SET date = current_date + 7 WHERE id = '00000000-0000-0000-0000-000002161003';

  -- A sent job that lists the class in judge_changes but did NOT call it unnamed does not count.
  UPDATE public.show_lifecycle_email_jobs SET class_notices = jsonb_build_object(v_class::text, 'named')
   WHERE status = 'sent' AND judge_changes ? v_class::text;
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_zero THEN
    RAISE EXCEPTION 'FAIL E.4c an email that did not say unnamed was offered';
  END IF;
  UPDATE public.show_lifecycle_email_jobs SET class_notices = jsonb_build_object(v_class::text, 'unnamed')
   WHERE status = 'sent' AND judge_changes ? v_class::text;

  -- The person already has a waiting job for another class: the tap merges into it, and that
  -- still reads as queued (sent_count 1), not as the offer vanishing.
  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id, recipient_email,
    idempotency_key, due_at, auto_send, judge_changes)
  SELECT v_show, s.id, 'judge_changed', 'ready', 'show_recipient', '00000000-0000-0000-0000-000002161021',
         'ada-2161@example.test', 'myk9-2161-bundled', now() + interval '5 minutes', true,
         jsonb_build_object('00000000-0000-0000-0000-000002161005', '00000000-0000-0000-0000-000002161051')
    FROM public.show_lifecycle_email_steps s WHERE s.show_id = v_show AND s.step_type = 'judge_changed';
  -- (a ready job for another class does not cover this one, so Ada is still pending)
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":1,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.4d bundled: expected pending 1, got %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '1'::jsonb
     OR (SELECT count(*) FROM public.show_lifecycle_email_jobs
          WHERE status = 'ready' AND step_type = 'judge_changed'
            AND recipient_person_id = '00000000-0000-0000-0000-000002161021') <> 1
     OR pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":1}'::jsonb THEN
    RAISE EXCEPTION 'FAIL E.4e the merged tap did not read as queued: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  -- The merged job is skipped: still followed up, not offered again.
  UPDATE public.show_lifecycle_email_jobs SET status = 'skipped', skipped_at = now()
   WHERE status = 'ready' AND recipient_person_id = '00000000-0000-0000-0000-000002161021';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_zero THEN
    RAISE EXCEPTION 'FAIL E.4f a skipped merged job was offered again';
  END IF;
  RAISE NOTICE 'PASS E site admin, missing class, switched-off step, draft show, past trial day, unnamed record, bundled and skipped follow-ups';
END $$;

-- F: the original judge comes back to a class whose exhibitors were told "not named yet".
-- The sender skips that email as not news, so the offer must not appear.
DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161004';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
  DELETE FROM public.judge_assignments WHERE class_id = v_class;
  INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
  VALUES ('00000000-0000-0000-0000-000002161051', '00000000-0000-0000-0000-000002161002', NULL, v_class,
          'confirmed', now() - interval '5 minutes');
  UPDATE public.show_lifecycle_email_jobs SET status = 'skipped', skipped_at = now() WHERE status = 'ready';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":0}'::jsonb
     OR pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FAIL F the original judge coming back still offered: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  RAISE NOTICE 'PASS F re-confirming the original judge clears the offer';
END $$;

-- G: a later email that named a judge supersedes an earlier "not named yet"; the tap is refused
-- when the screen's judge is not the class's judge; an old unrecorded email is read from its body.
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.classes (id, trial_id, name, status, element, level, section) VALUES
  ('00000000-0000-0000-0000-000002161007', '00000000-0000-0000-0000-000002161003', 'Handler Novice A', 'upcoming', 'Handler', 'Novice', 'A');
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) VALUES
  ('00000000-0000-0000-0000-000002161072', '00000000-0000-0000-0000-000002161031',
   '00000000-0000-0000-0000-000002161007', '00000000-0000-0000-0000-000002161002',
   '00000000-0000-0000-0000-000002161003', 'confirmed', '72', 1, 'no-status');
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-000002161063', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161002', NULL, '00000000-0000-0000-0000-000002161007',
   'confirmed', now() - interval '1 day');
DELETE FROM public.judge_assignments WHERE id = '00000000-0000-0000-0000-000002161063';
-- The old sender sent it and recorded nothing (class_notices NULL): the saved body says what it told them.
UPDATE public.show_lifecycle_email_jobs
   SET status = 'sent', sent_at = now() - interval '2 hours', created_at = now() - interval '2 hours',
       class_notices = NULL,
       rendered_body = E'Hi Ada,\nThe judge for a class you are entered in has changed.\nHandler Novice A (MYK9-2161 Trial, Friday): was Judge Judge A\nA new judge for Handler Novice A (MYK9-2161 Trial, Friday) has not been named yet. The trial secretary will tell you who it is.'
 WHERE status = 'ready' AND judge_changes ? '00000000-0000-0000-0000-000002161007';
SELECT pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'pick', '00000000-0000-0000-0000-000002161007');
UPDATE public.judge_assignments SET confirmed_at = now() - interval '10 minutes'
 WHERE class_id = '00000000-0000-0000-0000-000002161007';

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161007';
  v_sec text := '00000000-0000-0000-0000-000002161101';
BEGIN
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":1,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL G.0 the old unrecorded email should be offered, got %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  IF pg_temp.t2161_call(v_sec, 'queue_wrong', v_class) IS DISTINCT FROM '{"error":"P0001"}'::jsonb
     OR pg_temp.t2161_jobs('ready') <> 0 THEN
    RAISE EXCEPTION 'FAIL G.1 a tap for another judge was not refused: %', pg_temp.t2161_call(v_sec, 'queue_wrong', v_class);
  END IF;
  -- A later email that named a judge (the earlier judge came back and left again, say).
  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id, recipient_email,
    idempotency_key, due_at, auto_send, judge_changes, sent_at, class_notices)
  SELECT '00000000-0000-0000-0000-000002161002', s.id, 'judge_changed', 'sent', 'show_recipient',
         '00000000-0000-0000-0000-000002161021', 'ada-2161@example.test', 'myk9-2161-later',
         now() - interval '1 hour', true,
         jsonb_build_object(v_class::text, '00000000-0000-0000-0000-000002161051'),
         now() - interval '1 hour', jsonb_build_object(v_class::text, 'named')
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = '00000000-0000-0000-0000-000002161002' AND s.step_type = 'judge_changed';
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM '{"pending_count":0,"sent_count":0}'::jsonb THEN
    RAISE EXCEPTION 'FAIL G.2 a later email that named a judge did not supersede: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;
  RAISE NOTICE 'PASS G latest notice wins, wrong judge refused, old sent job read from its saved body';
END $$;

-- H: what each delivered email actually said, and a job the sender already claimed.
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.classes (id, trial_id, name, status, element, level, section) VALUES
  ('00000000-0000-0000-0000-000002161008', '00000000-0000-0000-0000-000002161003', 'Fetch Novice A', 'upcoming', 'Fetch', 'Novice', 'A');
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) VALUES
  ('00000000-0000-0000-0000-000002161073', '00000000-0000-0000-0000-000002161032',
   '00000000-0000-0000-0000-000002161008', '00000000-0000-0000-0000-000002161002',
   '00000000-0000-0000-0000-000002161003', 'confirmed', '73', 1, 'no-status');
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_require_dog_registration;
INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-000002161064', '00000000-0000-0000-0000-000002161051',
   '00000000-0000-0000-0000-000002161002', NULL, '00000000-0000-0000-0000-000002161008',
   'confirmed', now() - interval '1 day');
DELETE FROM public.judge_assignments WHERE id = '00000000-0000-0000-0000-000002161064';
UPDATE public.show_lifecycle_email_jobs
   SET status = 'sent', sent_at = now() - interval '1 hour', created_at = now() - interval '1 hour',
       class_notices = jsonb_build_object('00000000-0000-0000-0000-000002161008', 'unnamed')
 WHERE status = 'ready' AND judge_changes ? '00000000-0000-0000-0000-000002161008';
SELECT pg_temp.t2161_call('00000000-0000-0000-0000-000002161101', 'pick', '00000000-0000-0000-0000-000002161008');
UPDATE public.judge_assignments SET confirmed_at = now() - interval '10 minutes'
 WHERE class_id = '00000000-0000-0000-0000-000002161008';

CREATE FUNCTION pg_temp.t2161_job(
  p_key text, p_status text, p_changes jsonb, p_notices jsonb, p_sent_at timestamptz, p_claimed timestamptz
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id, recipient_email,
    idempotency_key, due_at, auto_send, judge_changes, sent_at, class_notices, claimed_until)
  SELECT '00000000-0000-0000-0000-000002161002', s.id, 'judge_changed', p_status, 'show_recipient',
         '00000000-0000-0000-0000-000002161022', 'ivy-2161@example.test', 'myk9-2161-h-' || p_key,
         now() - interval '1 minute', true, p_changes, p_sent_at, p_notices, p_claimed
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = '00000000-0000-0000-0000-000002161002' AND s.step_type = 'judge_changed'
  RETURNING id
$$;

DO $$
DECLARE
  v_class uuid := '00000000-0000-0000-0000-000002161008';
  v_other uuid := '00000000-0000-0000-0000-000002161005';
  v_judge_a text := '00000000-0000-0000-0000-000002161051';
  v_sec text := '00000000-0000-0000-0000-000002161101';
  v_pending jsonb := '{"pending_count":1,"sent_count":0}'::jsonb;
  v_job uuid;
  v_result jsonb;
BEGIN
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_pending THEN
    RAISE EXCEPTION 'FAIL H.0 expected Ivy pending, got %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;

  -- H.1 an email that omitted this class (it only lists it as a candidate) is not a later notice.
  PERFORM pg_temp.t2161_job('omit', 'sent',
    jsonb_build_object(v_class::text, v_judge_a, v_other::text, v_judge_a),
    jsonb_build_object(v_other::text, 'named'), now() - interval '5 minutes', NULL);
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_pending THEN
    RAISE EXCEPTION 'FAIL H.1 an email that never named the class changed the offer: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;

  -- H.2 the vacancy email was delivered AFTER the substitute was confirmed: still "not named yet",
  -- so it is not the follow-up, and Ivy is still owed one.
  PERFORM pg_temp.t2161_job('late', 'sent', jsonb_build_object(v_class::text, v_judge_a),
    jsonb_build_object(v_class::text, 'unnamed'), now(), NULL);
  IF pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_pending THEN
    RAISE EXCEPTION 'FAIL H.2 a late "not named yet" email counted as the follow-up: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;

  -- H.3 a job the sender holds (leased) is not touched; Ivy stays pending.
  v_job := pg_temp.t2161_job('claimed', 'ready', jsonb_build_object(v_other::text, v_judge_a), NULL, NULL,
    now() + interval '10 minutes');
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb
     OR (SELECT judge_changes FROM public.show_lifecycle_email_jobs WHERE id = v_job)
        <> jsonb_build_object(v_other::text, v_judge_a)
     OR pg_temp.t2161_call(v_sec, 'offer', v_class) IS DISTINCT FROM v_pending THEN
    RAISE EXCEPTION 'FAIL H.3 a claimed job was changed or counted: %', pg_temp.t2161_call(v_sec, 'offer', v_class);
  END IF;

  -- H.4 lease expired, but the provider already took the email and the drain has not recorded it.
  UPDATE public.show_lifecycle_email_jobs SET claimed_until = now() - interval '1 minute' WHERE id = v_job;
  INSERT INTO public.show_lifecycle_email_attempts (job_id, resend_message_id, status)
  VALUES (v_job, 'resend-2161-h', 'sent');
  IF pg_temp.t2161_call(v_sec, 'queue', v_class) IS DISTINCT FROM '0'::jsonb
     OR (SELECT judge_changes FROM public.show_lifecycle_email_jobs WHERE id = v_job)
        <> jsonb_build_object(v_other::text, v_judge_a) THEN
    RAISE EXCEPTION 'FAIL H.4 a job the provider accepted was changed';
  END IF;

  -- H.5 an unclaimed waiting job takes the class.
  DELETE FROM public.show_lifecycle_email_attempts WHERE job_id = v_job;
  UPDATE public.show_lifecycle_email_jobs SET claimed_until = NULL WHERE id = v_job;
  v_result := pg_temp.t2161_call(v_sec, 'queue', v_class);
  IF v_result IS DISTINCT FROM '1'::jsonb
     OR NOT (SELECT judge_changes ? v_class::text FROM public.show_lifecycle_email_jobs WHERE id = v_job) THEN
    RAISE EXCEPTION 'FAIL H.5 an unclaimed waiting job did not take the class: % %', v_result,
      (SELECT row_to_json(x) FROM public.show_lifecycle_email_jobs x WHERE id = v_job);
  END IF;
  RAISE NOTICE 'PASS H omitted classes, late vacancy emails and claimed jobs';
END $$;

ROLLBACK;
