-- MYK9-2125: a changed class judge on a published show queues one automatic email per
-- exhibitor entered in that class.
--
--   A. set_class_judge-style replacement (delete the confirmed row, insert the new one)
--      queues one ready, automatic job per person with a live entry in THAT class (owner
--      with two dogs once, a handler once; a withdrawn dog's owner and a person entered
--      only in another class never), and records the judge before the change
--   B. an unpublished show, a show with the step switched off, a first assignment and an
--      unconfirmed (invited) row leaving all queue nothing
--   C. several edits in one sitting are ONE job per person; its due time is pushed out, the
--      classes merge, and the "was" judge is the one before the FIRST change
--   D. a no-op update (same judge) queues nothing
--   E. a direct person_id update on the confirmed row queues like a replacement
--   F. a change after the email went out queues a NEW job
--   G. the functions are not callable by an API role; the send-time class check is service_role only
--
-- Fixtures roll back. Every now() below is the transaction start, so due times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002125001', 'MYK9-2125 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002125002', 'MYK9-2125 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002125001', 'published'),
  ('00000000-0000-0000-0000-000002125012', 'MYK9-2125 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002125001', 'draft'),
  ('00000000-0000-0000-0000-000002125022', 'MYK9-2125 Switched Off Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002125001', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002125003', '00000000-0000-0000-0000-000002125002', 'MYK9-2125 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002125013', '00000000-0000-0000-0000-000002125012', 'MYK9-2125 Draft Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002125023', '00000000-0000-0000-0000-000002125022', 'MYK9-2125 Off Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002125005', '00000000-0000-0000-0000-000002125003', 'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002125014', '00000000-0000-0000-0000-000002125013', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002125024', '00000000-0000-0000-0000-000002125023', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002125021', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002125025', 'Hal', 'Handler', 'hal@example.test'),
  ('00000000-0000-0000-0000-000002125026', 'Cy', 'Withdrew', 'cy@example.test'),
  ('00000000-0000-0000-0000-000002125027', 'Ivy', 'Interior', 'ivy@example.test'),
  ('00000000-0000-0000-0000-000002125028', 'Pam', 'Pending', 'pam@example.test'),
  ('00000000-0000-0000-0000-000002125051', 'Judge', 'One', 'j1@example.test'),
  ('00000000-0000-0000-0000-000002125052', 'Judge', 'Two', 'j2@example.test'),
  ('00000000-0000-0000-0000-000002125053', 'Judge', 'Three', 'j3@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002125031', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002125021'),
  ('00000000-0000-0000-0000-000002125032', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002125021'),
  ('00000000-0000-0000-0000-000002125034', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002125026'),
  ('00000000-0000-0000-0000-000002125035', 'Ivy Dog', 'Ivy', 'Beagle', '00000000-0000-0000-0000-000002125027'),
  ('00000000-0000-0000-0000-000002125036', 'Pam Dog', 'Pam', 'Beagle', '00000000-0000-0000-0000-000002125028');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002125041', '00000000-0000-0000-0000-000002125031', '00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002125042', '00000000-0000-0000-0000-000002125032', '00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', '00000000-0000-0000-0000-000002125025', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002125044', '00000000-0000-0000-0000-000002125034', '00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', null, 'withdrawn', '4', 3, 'no-status'),
  ('00000000-0000-0000-0000-000002125048', '00000000-0000-0000-0000-000002125036', '00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', null, 'pending-payment', '6', 5, 'no-status'),
  ('00000000-0000-0000-0000-000002125047', '00000000-0000-0000-0000-000002125035', '00000000-0000-0000-0000-000002125005', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', null, 'confirmed', '5', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002125045', '00000000-0000-0000-0000-000002125031', '00000000-0000-0000-0000-000002125014', '00000000-0000-0000-0000-000002125012', '00000000-0000-0000-0000-000002125013', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002125046', '00000000-0000-0000-0000-000002125031', '00000000-0000-0000-0000-000002125024', '00000000-0000-0000-0000-000002125022', '00000000-0000-0000-0000-000002125023', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- Judges: one confirmed class-level row per class, written BEFORE anything is watched (a
-- first assignment must queue nothing, which test B asserts on the drafts and the rest).
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status) values
  ('00000000-0000-0000-0000-000002125061', '00000000-0000-0000-0000-000002125051', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', '00000000-0000-0000-0000-000002125004', 'confirmed'),
  ('00000000-0000-0000-0000-000002125062', '00000000-0000-0000-0000-000002125051', '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125003', '00000000-0000-0000-0000-000002125005', 'confirmed'),
  ('00000000-0000-0000-0000-000002125063', '00000000-0000-0000-0000-000002125051', '00000000-0000-0000-0000-000002125012', '00000000-0000-0000-0000-000002125013', '00000000-0000-0000-0000-000002125014', 'confirmed'),
  ('00000000-0000-0000-0000-000002125064', '00000000-0000-0000-0000-000002125051', '00000000-0000-0000-0000-000002125022', '00000000-0000-0000-0000-000002125023', '00000000-0000-0000-0000-000002125024', 'confirmed');

update public.show_lifecycle_email_steps set is_enabled = false
 where show_id = '00000000-0000-0000-0000-000002125022' and step_type = 'judge_changed';

create or replace function pg_temp.jobs(p_show uuid, p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = 'judge_changed' and (p_status is null or status = p_status)
$$;

-- Replace a class's judge the way set_class_judge does: delete every row, insert the new one.
create or replace function pg_temp.replace_judge(p_class uuid, p_person uuid, p_show uuid, p_trial uuid) returns void
language plpgsql as $$
begin
  delete from public.judge_assignments where class_id = p_class;
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values (p_person, p_show, p_trial, p_class, 'confirmed');
end $$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_job record;
begin
  if pg_temp.jobs(v_show) <> 0 then
    raise exception 'FAIL A the first assignments queued % jobs', pg_temp.jobs(v_show);
  end if;
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125052',
    v_show, '00000000-0000-0000-0000-000002125003');
  if pg_temp.jobs(v_show) <> 3 then
    raise exception 'FAIL A expected 3 jobs (Ada once for two dogs, Hal as handler, Pam on a waitlist offer awaiting payment; Cy withdrew, Ivy is in another class), found %', pg_temp.jobs(v_show);
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002125021';
  if v_job.status <> 'ready' or not v_job.auto_send or v_job.recipient_email <> 'ada@example.test'
     or v_job.due_at <> now() + interval '5 minutes' or v_job.recipient_scope <> 'show_recipient'
     or v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125051') then
    raise exception 'FAIL A the job is wrong: %', row_to_json(v_job);
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and recipient_person_id in
                ('00000000-0000-0000-0000-000002125026', '00000000-0000-0000-0000-000002125027')) then
    raise exception 'FAIL A a withdrawn exhibitor or one in another class was queued';
  end if;
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002125028') then
    raise exception 'FAIL A an exhibitor whose entry is pending-payment was not queued';
  end if;
  raise notice 'PASS A a judge change queues one automatic job per exhibitor in that class';
end $$;

-- B
do $$
declare
  v_draft uuid := '00000000-0000-0000-0000-000002125012';
  v_off uuid := '00000000-0000-0000-0000-000002125022';
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_before integer := pg_temp.jobs('00000000-0000-0000-0000-000002125002');
begin
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125014', '00000000-0000-0000-0000-000002125052',
    v_draft, '00000000-0000-0000-0000-000002125013');
  if pg_temp.jobs(v_draft) <> 0 then
    raise exception 'FAIL B an unpublished show queued a job';
  end if;
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125024', '00000000-0000-0000-0000-000002125052',
    v_off, '00000000-0000-0000-0000-000002125023');
  if pg_temp.jobs(v_off) <> 0 then
    raise exception 'FAIL B a show with the step switched off queued a job';
  end if;
  -- An invited (unconfirmed) row leaving is not a change of judge.
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values ('00000000-0000-0000-0000-000002125053', v_show, '00000000-0000-0000-0000-000002125003',
          '00000000-0000-0000-0000-000002125005', 'invited');
  delete from public.judge_assignments
   where class_id = '00000000-0000-0000-0000-000002125005' and status = 'invited';
  if pg_temp.jobs(v_show) <> v_before then
    raise exception 'FAIL B an invitation leaving queued a job';
  end if;
  raise notice 'PASS B unpublished, switched off and unconfirmed rows queue nothing';
end $$;

-- C
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_job record;
  v_ready integer := pg_temp.jobs('00000000-0000-0000-0000-000002125002', 'ready');
begin
  -- The waiting jobs are nearly due; more edits must push them out again, not add rows.
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'judge_changed' and status = 'ready';
  -- Class 4 changes again (Two -> Three): Ada and Hal keep their one job and its "was" judge.
  -- Class 5 changes (One -> Two): Ivy, entered only there, gets her own job.
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125053',
    v_show, '00000000-0000-0000-0000-000002125003');
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125005', '00000000-0000-0000-0000-000002125052',
    v_show, '00000000-0000-0000-0000-000002125003');
  if pg_temp.jobs(v_show, 'ready') <> v_ready + 1 then
    raise exception 'FAIL C expected % ready jobs (Ada, Hal, plus Ivy), found %', v_ready + 1, pg_temp.jobs(v_show, 'ready');
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002125021';
  if v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125051') then
    raise exception 'FAIL C Ada''s "was" judge is not the one before the first change: %', v_job.judge_changes;
  end if;
  if v_job.due_at <> now() + interval '5 minutes' then
    raise exception 'FAIL C an edit did not push the due time out';
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002125027';
  if v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002125005', '00000000-0000-0000-0000-000002125051') then
    raise exception 'FAIL C Ivy''s job is wrong: %', v_job.judge_changes;
  end if;
  raise notice 'PASS C several edits are one job per person, earliest "was" kept';
end $$;

-- D
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_before integer := pg_temp.jobs('00000000-0000-0000-0000-000002125002');
begin
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'judge_changed';
  update public.judge_assignments set person_id = person_id, status = status, notes = 'same judge'
   where class_id = '00000000-0000-0000-0000-000002125004';
  if pg_temp.jobs(v_show) <> v_before
     or exists (select 1 from public.show_lifecycle_email_jobs
                 where show_id = v_show and step_type = 'judge_changed' and due_at <> now() - interval '1 minute') then
    raise exception 'FAIL D a no-op update touched the queue';
  end if;
  raise notice 'PASS D a no-op update queues nothing';
end $$;

-- E
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_job record;
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'judge_changed';
  update public.judge_assignments set person_id = '00000000-0000-0000-0000-000002125051'
   where class_id = '00000000-0000-0000-0000-000002125004' and status = 'confirmed';
  if pg_temp.jobs(v_show, 'ready') <> 3 or pg_temp.jobs(v_show, 'sent') <> 4 then
    raise exception 'FAIL E a direct judge update after a send should queue 3 new jobs beside 4 sent, found % ready % sent',
      pg_temp.jobs(v_show, 'ready'), pg_temp.jobs(v_show, 'sent');
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and status = 'ready' and recipient_person_id = '00000000-0000-0000-0000-000002125021';
  -- Three was judging; the new job names Three as the judge before THIS change.
  if v_job.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125053') then
    raise exception 'FAIL E the new job names the wrong judge: %', v_job.judge_changes;
  end if;
  raise notice 'PASS E a direct update queues, and a change after a send is a new job';
end $$;

-- G
do $$
begin
  if has_function_privilege('authenticated', 'public.person_live_entry_class_ids(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.person_live_entry_class_ids(uuid, uuid)', 'execute') then
    raise exception 'FAIL G an API role can run person_live_entry_class_ids';
  end if;
  if not has_function_privilege('service_role', 'public.person_live_entry_class_ids(uuid, uuid)', 'execute') then
    raise exception 'FAIL G service_role cannot run person_live_entry_class_ids';
  end if;
  if has_function_privilege('authenticated', 'public.queue_judge_changed_email_for_class(uuid, uuid)', 'execute')
     or has_function_privilege('service_role', 'public.queue_judge_changed_email_for_class(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.live_entry_person_class_pairs(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.queue_judge_changed_email_from_assignment()', 'execute') then
    raise exception 'FAIL G an API role can run a producer function';
  end if;
  if (select count(*) from public.person_live_entry_class_ids(
        '00000000-0000-0000-0000-000002125002', '00000000-0000-0000-0000-000002125021')) <> 1 then
    raise exception 'FAIL G person_live_entry_class_ids answers wrong for Ada';
  end if;
  raise notice 'PASS G the functions are not callable by an API role';
end $$;

-- H (MYK9-2347): a judge change while a ready job is leased must queue a separate job, not rewrite
-- the one the drain is sending.
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002125002';
  v_ada uuid := '00000000-0000-0000-0000-000002125021';
  v_hal uuid := '00000000-0000-0000-0000-000002125025';
  v_leased record;
  v_after record;
begin
  if pg_temp.jobs(v_show, 'ready') <> 3 then
    raise exception 'FAIL H setup expected 3 ready jobs, found %', pg_temp.jobs(v_show, 'ready');
  end if;
  update public.show_lifecycle_email_jobs
     set claimed_until = now() + interval '10 minutes', attempt_id = gen_random_uuid(),
         due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'judge_changed' and status = 'ready' and recipient_person_id = v_ada;
  select * into v_leased from public.show_lifecycle_email_jobs
   where show_id = v_show and status = 'ready' and recipient_person_id = v_ada;

  -- Judge One is on class 4; Two takes over while Ada's email is in flight.
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125052',
    v_show, '00000000-0000-0000-0000-000002125003');

  select * into v_after from public.show_lifecycle_email_jobs where id = v_leased.id;
  if v_after.status <> 'ready' or v_after.due_at <> v_leased.due_at or v_after.claimed_until <> v_leased.claimed_until
     or v_after.attempt_id <> v_leased.attempt_id or v_after.judge_changes <> v_leased.judge_changes then
    raise exception 'FAIL H the leased in-flight job was rewritten: %', row_to_json(v_after);
  end if;
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'judge_changed' and status = 'ready' and recipient_person_id = v_ada) <> 2 then
    raise exception 'FAIL H the newer judge change did not queue a separate job for Ada';
  end if;
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and step_type = 'judge_changed' and status = 'ready'
                    and recipient_person_id = v_ada and id <> v_leased.id and claimed_until is null
                    and due_at = now() + interval '5 minutes'
                    and judge_changes = jsonb_build_object('00000000-0000-0000-0000-000002125004', '00000000-0000-0000-0000-000002125051')) then
    raise exception 'FAIL H the separate job is not a fresh unleased job naming the judge before this change';
  end if;
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'judge_changed' and status = 'ready' and recipient_person_id = v_hal) <> 1 then
    raise exception 'FAIL H an unleased waiting job was not merged';
  end if;
  raise notice 'PASS H a judge change while a job is leased queues a separate job';
end $$;

rollback;
