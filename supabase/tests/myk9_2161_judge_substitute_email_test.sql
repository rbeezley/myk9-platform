-- MYK9-2161: once a vacant class gets a substitute judge, each exhibitor who was told "not
-- named yet" gets one email naming the new judge.
--
--   A. claiming a judge_changed job whose class has no judge writes a vacancy row per person
--      BEFORE any send (only for people with a live entry; a class with a judge, or a trial day
--      already past, writes none), and claiming again writes no duplicate
--   B. a send that failed (the job is released, still ready) leaves the rows; confirming a
--      substitute then queues ONE ready job per person, "was" = the judge they first knew, and
--      consumes the rows
--   C. the same after the first email was marked sent: a NEW job per person
--   D. a person who joined the class after the notice, and an exhibitor never told, get nothing
--   E. a class that never had a judge (first assignment) queues nothing and writes no rows
--   F. the old judge coming back queues nothing
--   H. a judge confirmed while the job is claimed and not yet sent is not emailed a second time
--   G. the table and functions are not reachable by an API role
--
-- Fixtures roll back. Every now() below is the transaction start.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002161001', 'MYK9-2161 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002161002', 'MYK9-2161 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002161001', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161002', 'MYK9-2161 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002161013', '00000000-0000-0000-0000-000002161002', 'MYK9-2161 Past Trial', current_date - 30, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002161005', '00000000-0000-0000-0000-000002161003', 'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002161006', '00000000-0000-0000-0000-000002161003', 'Exterior Novice A', 'upcoming', 'Exterior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002161014', '00000000-0000-0000-0000-000002161013', 'Container Past', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002161021', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002161025', 'Hal', 'Handler', 'hal@example.test'),
  ('00000000-0000-0000-0000-000002161027', 'Ivy', 'Interior', 'ivy@example.test'),
  ('00000000-0000-0000-0000-000002161028', 'Late', 'Joiner', 'late@example.test'),
  ('00000000-0000-0000-0000-000002161051', 'Judge', 'One', 'j1@example.test'),
  ('00000000-0000-0000-0000-000002161052', 'Judge', 'Two', 'j2@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002161031', 'Ada Dog', 'Ada', 'Beagle', '00000000-0000-0000-0000-000002161021'),
  ('00000000-0000-0000-0000-000002161035', 'Ivy Dog', 'Ivy', 'Beagle', '00000000-0000-0000-0000-000002161027'),
  ('00000000-0000-0000-0000-000002161036', 'Late Dog', 'Late', 'Beagle', '00000000-0000-0000-0000-000002161028');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002161041', '00000000-0000-0000-0000-000002161031', '00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161025', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002161047', '00000000-0000-0000-0000-000002161035', '00000000-0000-0000-0000-000002161005', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161003', null, 'confirmed', '5', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002161045', '00000000-0000-0000-0000-000002161031', '00000000-0000-0000-0000-000002161014', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161013', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- Classes 4 and 14 have judge One, written before anything is watched; class 5 keeps its judge;
-- class 6 never has one.
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status) values
  ('00000000-0000-0000-0000-000002161061', '00000000-0000-0000-0000-000002161051', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161004', 'confirmed'),
  ('00000000-0000-0000-0000-000002161062', '00000000-0000-0000-0000-000002161051', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161005', 'confirmed'),
  ('00000000-0000-0000-0000-000002161063', '00000000-0000-0000-0000-000002161051', '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161013', '00000000-0000-0000-0000-000002161014', 'confirmed');

create or replace function pg_temp.jobs(p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000002161002' and step_type = 'judge_changed'
     and (p_status is null or status = p_status)
$$;

create or replace function pg_temp.notices(p_class uuid default null) returns integer
language sql as $$
  select count(*)::integer from public.judge_vacancy_notices
   where show_id = '00000000-0000-0000-0000-000002161002' and (p_class is null or class_id = p_class)
$$;

-- A
do $$
declare
  v_one uuid := '00000000-0000-0000-0000-000002161051';
  v_claimed integer;
begin
  -- Judge One leaves classes 4 and 14 (the past trial) with nobody confirmed, and class 5 is
  -- replaced at once by Two. Each leaving queues one job per live entry.
  delete from public.judge_assignments
   where class_id in ('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161014');
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002161005';
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161005', 'confirmed');
  if pg_temp.jobs('ready') <> 3 then
    raise exception 'FAIL A expected 3 ready jobs (Ada and Hal in class 4, Ivy in class 5; Ada also in the past class), found %', pg_temp.jobs('ready');
  end if;
  if pg_temp.notices() <> 0 then
    raise exception 'FAIL A rows exist before any claim';
  end if;

  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = '00000000-0000-0000-0000-000002161002' and step_type = 'judge_changed';
  select count(*) into v_claimed from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_claimed <> 3 then
    raise exception 'FAIL A the claim returned % jobs, expected 3', v_claimed;
  end if;
  -- Ada and Hal were told class 4 has no judge yet; Ivy's class has Two; the past class is not told.
  if pg_temp.notices('00000000-0000-0000-0000-000002161004') <> 2
     or pg_temp.notices() <> 2 then
    raise exception 'FAIL A expected exactly 2 rows (Ada, Hal on class 4), found % total', pg_temp.notices();
  end if;
  if exists (select 1 from public.judge_vacancy_notices
              where class_id = '00000000-0000-0000-0000-000002161004' and from_person_id <> v_one) then
    raise exception 'FAIL A a row does not name the judge they first knew';
  end if;

  -- The lease expiring and a second claim of the same jobs writes nothing new.
  update public.show_lifecycle_email_jobs set claimed_until = now() - interval '1 minute', attempt_id = null
   where show_id = '00000000-0000-0000-0000-000002161002' and step_type = 'judge_changed';
  perform 1 from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if pg_temp.notices() <> 2 then
    raise exception 'FAIL A a second claim duplicated the rows: %', pg_temp.notices();
  end if;
  raise notice 'PASS A the claim persists who was told "not named yet", before any send';
end $$;

-- B: the send failed (the job is released with a retry delay and is still ready)
do $$
declare
  v_job record;
begin
  update public.show_lifecycle_email_jobs set attempt_id = null, claimed_until = now() + interval '5 minutes'
   where show_id = '00000000-0000-0000-0000-000002161002' and step_type = 'judge_changed';
  if pg_temp.notices() <> 2 then
    raise exception 'FAIL B a failed send lost the rows';
  end if;
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161004', 'confirmed');
  if pg_temp.notices() <> 0 then
    raise exception 'FAIL B the rows were not consumed';
  end if;
  -- Still one ready job per person: the waiting one is merged and made due again, not doubled.
  if pg_temp.jobs() <> 3 then
    raise exception 'FAIL B expected 3 jobs, found %', pg_temp.jobs();
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000002161002'
     and recipient_person_id = '00000000-0000-0000-0000-000002161021';
  if v_job.status <> 'ready' or v_job.due_at <> now() + interval '5 minutes'
     or v_job.judge_changes ->> '00000000-0000-0000-0000-000002161004' is distinct from '00000000-0000-0000-0000-000002161051' then
    raise exception 'FAIL B Ada''s job is wrong: %', row_to_json(v_job);
  end if;
  raise notice 'PASS B a failed send leaves the rows, and the substitute reaches the waiting job';
end $$;

-- C: the first email went out; a vacancy and a substitute again on class 4
do $$
declare
  v_one uuid := '00000000-0000-0000-0000-000002161051';
  v_two uuid := '00000000-0000-0000-0000-000002161052';
  v_rows record;
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = '00000000-0000-0000-0000-000002161002' and step_type = 'judge_changed';
  -- Two leaves class 4 and is not replaced; the jobs for that go out as "not named yet".
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002161004';
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  perform 1 from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if pg_temp.notices('00000000-0000-0000-0000-000002161004') <> 2 then
    raise exception 'FAIL C expected 2 rows after the second vacancy, found %', pg_temp.notices('00000000-0000-0000-0000-000002161004');
  end if;
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';

  -- D setup: Late joins the class after the notice went out.
  alter table public.entries disable trigger trg_entries_require_dog_registration;
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status)
  values ('00000000-0000-0000-0000-000002161048', '00000000-0000-0000-0000-000002161036',
          '00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', 'confirmed', '9', 9, 'no-status');
  alter table public.entries enable trigger trg_entries_require_dog_registration;

  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values (v_one, '00000000-0000-0000-0000-000002161002', '00000000-0000-0000-0000-000002161003',
          '00000000-0000-0000-0000-000002161004', 'confirmed');
  -- The notice named Two as the judge they knew, so One is a different judge and is told.
  if pg_temp.jobs('ready') <> 2 then
    raise exception 'FAIL C expected 2 new ready jobs (Ada, Hal), found %', pg_temp.jobs('ready');
  end if;
  for v_rows in
    select * from public.show_lifecycle_email_jobs
     where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready'
  loop
    if v_rows.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002161004', v_two::text) then
      raise exception 'FAIL C a follow-up names the wrong judge they knew: %', v_rows.judge_changes;
    end if;
    if v_rows.recipient_person_id = '00000000-0000-0000-0000-000002161028' then
      raise exception 'FAIL D a person who joined after the notice was queued';
    end if;
  end loop;
  if pg_temp.notices() <> 0 then
    raise exception 'FAIL C the rows were not consumed';
  end if;
  raise notice 'PASS C a substitute after a sent email queues a new job per person told, and consumes the rows';
  raise notice 'PASS D a person who joined the class after the notice is not emailed';
end $$;

-- E
do $$
declare
  v_before integer := pg_temp.jobs();
begin
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161006', 'confirmed');
  if pg_temp.jobs() <> v_before or pg_temp.notices() <> 0 then
    raise exception 'FAIL E a first assignment queued or wrote something';
  end if;
  raise notice 'PASS E a class that never had a judge emails nobody';
end $$;

-- F: Ada was told class 4 had no judge (the judge she knew: Two); Two returning is not news
do $$
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  insert into public.judge_vacancy_notices (class_id, person_id, from_person_id, show_id) values
    ('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161021',
     '00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002');
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002161004';
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now()
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002161052', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161004', 'confirmed');
  if pg_temp.jobs('ready') <> 0 or pg_temp.notices() <> 0 then
    raise exception 'FAIL F the old judge coming back queued % jobs, % rows left', pg_temp.jobs('ready'), pg_temp.notices();
  end if;
  raise notice 'PASS F the old judge coming back queues nothing';
end $$;

-- H: the jobs are claimed (in flight) when the substitute is confirmed: the send names the
-- judge at render time, so no second email is queued, and the rows are still consumed
do $$
declare
  v_row record;
begin
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now()
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002161004';
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  perform 1 from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if pg_temp.notices('00000000-0000-0000-0000-000002161004') <> 3 then
    raise exception 'FAIL H expected 3 rows (Ada, Hal, Late), found %', pg_temp.notices('00000000-0000-0000-0000-000002161004');
  end if;
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002161051', '00000000-0000-0000-0000-000002161002',
          '00000000-0000-0000-0000-000002161003', '00000000-0000-0000-0000-000002161004', 'confirmed');
  if pg_temp.jobs('ready') <> 3 then
    raise exception 'FAIL H a second email was queued: % ready jobs', pg_temp.jobs('ready');
  end if;
  for v_row in select * from public.show_lifecycle_email_jobs
                where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready' loop
    if v_row.attempt_id is null
       or v_row.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002161004', '00000000-0000-0000-0000-000002161052') then
      raise exception 'FAIL H the in-flight job was changed: %', row_to_json(v_row);
    end if;
  end loop;
  if pg_temp.notices() <> 0 then
    raise exception 'FAIL H the rows were not consumed';
  end if;
  raise notice 'PASS H a claimed job is not followed by a second email';
end $$;

-- I: a malformed judge_changes can never stop a claim
do $$
begin
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002161004';
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now()
   where show_id = '00000000-0000-0000-0000-000002161002' and status = 'ready';
  insert into public.show_lifecycle_email_jobs (show_id, step_id, step_type, status, recipient_scope,
    recipient_person_id, recipient_email, subject, idempotency_key, due_at, auto_send, judge_changes)
  select '00000000-0000-0000-0000-000002161002', s.id, 'judge_changed', 'ready', 'show_recipient',
         '00000000-0000-0000-0000-000002161021', 'ada@example.test', 'bad', 'bad-key-2161',
         now() - interval '1 minute', true, '{"not-a-uuid": "also-not", "00000000-0000-0000-0000-000002161004": "nope"}'::jsonb
    from public.show_lifecycle_email_steps s
   where s.show_id = '00000000-0000-0000-0000-000002161002' and s.step_type = 'judge_changed';
  if (select count(*) from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes')) <> 1 then
    raise exception 'FAIL I a malformed judge_changes stopped the claim';
  end if;
  if pg_temp.notices() <> 0 then
    raise exception 'FAIL I a malformed row wrote a notice';
  end if;
  raise notice 'PASS I a malformed judge_changes cannot stall the claim';
end $$;

-- G
do $$
begin
  if has_table_privilege('anon', 'public.judge_vacancy_notices', 'select')
     or has_table_privilege('authenticated', 'public.judge_vacancy_notices', 'select')
     or has_table_privilege('anon', 'public.judge_vacancy_notices', 'insert')
     or has_table_privilege('authenticated', 'public.judge_vacancy_notices', 'insert') then
    raise exception 'FAIL G an API role can reach judge_vacancy_notices';
  end if;
  if not has_table_privilege('service_role', 'public.judge_vacancy_notices', 'select') then
    raise exception 'FAIL G service_role cannot read judge_vacancy_notices';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.judge_vacancy_notices'::regclass) then
    raise exception 'FAIL G row level security is off';
  end if;
  if has_function_privilege('authenticated', 'public.queue_judge_changed_email_for_people(uuid, uuid, uuid[])', 'execute')
     or has_function_privilege('service_role', 'public.queue_judge_changed_email_for_people(uuid, uuid, uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.queue_judge_substitute_emails_from_assignment()', 'execute')
     or has_function_privilege('authenticated', 'public.record_judge_vacancy_notices_from_claim()', 'execute')
     or has_function_privilege('authenticated', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute') then
    raise exception 'FAIL G an API role can run a producer or the claim';
  end if;
  raise notice 'PASS G the table and functions are server-only';
end $$;

rollback;
