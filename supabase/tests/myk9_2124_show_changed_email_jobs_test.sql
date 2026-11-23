-- MYK9-2124: a published show's date or venue change queues one automatic email per exhibitor.
--
--   A. a trial date change queues one ready, automatic job per person with a live entry
--      (an owner with two dogs once, a handler once; a withdrawn dog's owner never),
--      due five minutes out
--   B. a venue change after that email went out queues a NEW job
--   C. an unpublished show queues nothing for either change; neither does an unrelated edit
--      or a show whose step is switched off
--   D. two quick edits are one job, and each edit pushes its due time out again
--   E. the claim takes due automatic jobs only, leases them, and hands an expired lease out again
--   F. the functions are not callable by an API role (the claim is service_role only)
--
-- Fixtures roll back. Every now() below is the transaction start, so due times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002124301', 'MYK9-2124 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status, venue_name, address, city) values
  ('00000000-0000-0000-0000-000002124302', 'MYK9-2124 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002124301', 'published', 'Old Barn', '1 Old Road', 'Oldtown'),
  ('00000000-0000-0000-0000-000002124312', 'MYK9-2124 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002124301', 'draft', 'Old Barn', '1 Old Road', 'Oldtown'),
  ('00000000-0000-0000-0000-000002124322', 'MYK9-2124 Switched Off Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002124301', 'published', 'Old Barn', '1 Old Road', 'Oldtown');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002124303', '00000000-0000-0000-0000-000002124302', 'MYK9-2124 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002124313', '00000000-0000-0000-0000-000002124312', 'MYK9-2124 Draft Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002124323', '00000000-0000-0000-0000-000002124322', 'MYK9-2124 Off Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002124304', '00000000-0000-0000-0000-000002124303', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002124314', '00000000-0000-0000-0000-000002124313', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002124324', '00000000-0000-0000-0000-000002124323', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002124321', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002124325', 'Hal', 'Handler', 'hal@example.test'),
  ('00000000-0000-0000-0000-000002124326', 'Cy', 'Withdrew', 'cy@example.test'),
  ('00000000-0000-0000-0000-000002124327', 'Pat', 'Paid', 'pat@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002124331', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002124321'),
  ('00000000-0000-0000-0000-000002124332', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002124321'),
  ('00000000-0000-0000-0000-000002124334', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002124326'),
  ('00000000-0000-0000-0000-000002124335', 'Pat Dog', 'Pat', 'Beagle', '00000000-0000-0000-0000-000002124327');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002124341', '00000000-0000-0000-0000-000002124331', '00000000-0000-0000-0000-000002124304', '00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124303', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002124342', '00000000-0000-0000-0000-000002124332', '00000000-0000-0000-0000-000002124304', '00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124303', '00000000-0000-0000-0000-000002124325', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002124344', '00000000-0000-0000-0000-000002124334', '00000000-0000-0000-0000-000002124304', '00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124303', null, 'withdrawn', '4', 3, 'no-status'),
  ('00000000-0000-0000-0000-000002124347', '00000000-0000-0000-0000-000002124335', '00000000-0000-0000-0000-000002124304', '00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124303', null, 'paid', '5', 4, 'no-status'),
  ('00000000-0000-0000-0000-000002124345', '00000000-0000-0000-0000-000002124331', '00000000-0000-0000-0000-000002124314', '00000000-0000-0000-0000-000002124312', '00000000-0000-0000-0000-000002124313', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002124346', '00000000-0000-0000-0000-000002124331', '00000000-0000-0000-0000-000002124324', '00000000-0000-0000-0000-000002124322', '00000000-0000-0000-0000-000002124323', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

update public.show_lifecycle_email_steps set is_enabled = false
 where show_id = '00000000-0000-0000-0000-000002124322' and step_type = 'show_changed';

create or replace function pg_temp.jobs(p_show uuid, p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = 'show_changed' and (p_status is null or status = p_status)
$$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002124302';
  v_job record;
begin
  update public.trials set date = current_date + 7 where id = '00000000-0000-0000-0000-000002124303';
  if pg_temp.jobs(v_show) <> 3 then
    raise exception 'FAIL A expected 3 jobs (Ada once for two dogs, Hal as handler, Pat paid but not yet accepted; Cy withdrew), found %', pg_temp.jobs(v_show);
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002124321';
  if v_job.status <> 'ready' or not v_job.auto_send or v_job.recipient_email <> 'ada@example.test'
     or v_job.due_at <> now() + interval '5 minutes' or v_job.recipient_scope <> 'show_recipient' then
    raise exception 'FAIL A the job is wrong: %', row_to_json(v_job);
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002124326') then
    raise exception 'FAIL A an exhibitor whose only dog withdrew was queued';
  end if;
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002124327') then
    raise exception 'FAIL A an exhibitor whose entry is paid but not yet accepted was not queued';
  end if;
  raise notice 'PASS A a date change queues one automatic job per exhibitor';
end $$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002124302';
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'show_changed';
  update public.shows set address = '2 New Road' where id = v_show;
  if pg_temp.jobs(v_show, 'ready') <> 3 or pg_temp.jobs(v_show, 'sent') <> 3 then
    raise exception 'FAIL B a venue change after the send should queue 3 new jobs beside 3 sent, found % ready % sent',
      pg_temp.jobs(v_show, 'ready'), pg_temp.jobs(v_show, 'sent');
  end if;
  raise notice 'PASS B a venue change after a send queues a new job';
end $$;

-- C
do $$
declare
  v_draft uuid := '00000000-0000-0000-0000-000002124312';
  v_off uuid := '00000000-0000-0000-0000-000002124322';
  v_show uuid := '00000000-0000-0000-0000-000002124302';
  v_before integer := pg_temp.jobs('00000000-0000-0000-0000-000002124302');
begin
  update public.trials set date = current_date + 9 where id = '00000000-0000-0000-0000-000002124313';
  update public.shows set address = '3 New Road', city = 'Newtown' where id = v_draft;
  if pg_temp.jobs(v_draft) <> 0 then
    raise exception 'FAIL C an unpublished show queued a job';
  end if;
  update public.trials set date = current_date + 9 where id = '00000000-0000-0000-0000-000002124323';
  if pg_temp.jobs(v_off) <> 0 then
    raise exception 'FAIL C a show with the step switched off queued a job';
  end if;
  update public.shows set name = 'MYK9-2124 Renamed' where id = v_show;
  if pg_temp.jobs(v_show) <> v_before then
    raise exception 'FAIL C an unrelated edit queued a job';
  end if;
  raise notice 'PASS C unpublished, switched off and unrelated edits queue nothing';
end $$;

-- D
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002124302';
  v_ready_before integer := pg_temp.jobs('00000000-0000-0000-0000-000002124302', 'ready');
begin
  -- The waiting jobs are nearly due; another edit must push them out again, not add rows.
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'show_changed' and status = 'ready';
  update public.shows set venue_name = 'New Barn' where id = v_show;
  update public.trials set date = current_date + 8 where id = '00000000-0000-0000-0000-000002124303';
  if pg_temp.jobs(v_show, 'ready') <> v_ready_before then
    raise exception 'FAIL D two edits made % ready jobs, expected %', pg_temp.jobs(v_show, 'ready'), v_ready_before;
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and step_type = 'show_changed' and status = 'ready'
                and due_at <> now() + interval '5 minutes') then
    raise exception 'FAIL D an edit did not push the due time out';
  end if;
  raise notice 'PASS D several edits are one job, held until quiet';
end $$;

-- E
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002124302';
  v_first record;
  v_claimed integer;
  v_second integer;
  v_third record;
begin
  -- Nothing is due yet.
  select count(*) into v_claimed from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_claimed <> 0 then
    raise exception 'FAIL E claimed % jobs that are not due', v_claimed;
  end if;

  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'show_changed' and status = 'ready';
  -- A job a secretary must review is never claimed.
  update public.show_lifecycle_email_jobs set auto_send = false
   where show_id = v_show and recipient_person_id in ('00000000-0000-0000-0000-000002124325', '00000000-0000-0000-0000-000002124327')
     and step_type = 'show_changed' and status = 'ready';

  select * into v_first from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_first.recipient_person_id <> '00000000-0000-0000-0000-000002124321' or v_first.attempt_id is null
     or v_first.show_id <> v_show or v_first.step_type <> 'show_changed' then
    raise exception 'FAIL E the claim returned the wrong job: %', row_to_json(v_first);
  end if;
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and status = 'ready' and attempt_id is not null and claimed_until = now() + interval '10 minutes') <> 1 then
    raise exception 'FAIL E the claim did not lease exactly the one automatic job';
  end if;

  select count(*) into v_second from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_second <> 0 then
    raise exception 'FAIL E a second claim took % jobs while the lease was live', v_second;
  end if;

  update public.show_lifecycle_email_jobs set claimed_until = now() - interval '1 minute'
   where id = v_first.job_id;
  select * into v_third from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_third.job_id is distinct from v_first.job_id or v_third.attempt_id is not distinct from v_first.attempt_id then
    raise exception 'FAIL E an expired lease was not handed out with a new attempt: %', row_to_json(v_third);
  end if;
  raise notice 'PASS E the claim leases due automatic jobs and re-hands an expired lease';
end $$;

-- F
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute') then
    raise exception 'FAIL F an API role can run the claim';
  end if;
  if not has_function_privilege('service_role', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute') then
    raise exception 'FAIL F service_role cannot run the claim';
  end if;
  if has_function_privilege('authenticated', 'public.queue_show_changed_email_for_show(uuid)', 'execute')
     or has_function_privilege('anon', 'public.queue_show_changed_email_for_show(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.queue_show_changed_email_from_show()', 'execute')
     or has_function_privilege('authenticated', 'public.queue_show_changed_email_from_trial()', 'execute') then
    raise exception 'FAIL F an API role can run a producer function';
  end if;
  if has_function_privilege('authenticated', 'public.show_person_has_live_entry(uuid, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.show_person_has_live_entry(uuid, uuid)', 'execute') then
    raise exception 'FAIL F show_person_has_live_entry is not service_role only';
  end if;
  if not public.show_person_has_live_entry('00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124321')
     or public.show_person_has_live_entry('00000000-0000-0000-0000-000002124302', '00000000-0000-0000-0000-000002124326') then
    raise exception 'FAIL F show_person_has_live_entry answers wrong (Ada live, Cy withdrew)';
  end if;
  raise notice 'PASS F the functions are not callable by an API role';
end $$;

-- H (MYK9-2347): an edit while a ready job is leased must queue a separate job, not rewrite the
-- one the drain is sending.
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002124302';
  v_ada uuid := '00000000-0000-0000-0000-000002124321';
  v_hal uuid := '00000000-0000-0000-0000-000002124325';
  v_leased record;
  v_after record;
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'show_changed';
  update public.shows set address = '3 Lease Road' where id = v_show;
  if pg_temp.jobs(v_show, 'ready') <> 3 then
    raise exception 'FAIL H setup expected 3 ready jobs, found %', pg_temp.jobs(v_show, 'ready');
  end if;
  -- The drain leases Ada's job; its due time is in the past so a rewrite (now() + 5 minutes) shows.
  update public.show_lifecycle_email_jobs
     set claimed_until = now() + interval '10 minutes', attempt_id = gen_random_uuid(),
         due_at = now() - interval '1 minute', recipient_name = 'Leased Name'
   where show_id = v_show and step_type = 'show_changed' and status = 'ready' and recipient_person_id = v_ada;
  select * into v_leased from public.show_lifecycle_email_jobs
   where show_id = v_show and status = 'ready' and recipient_person_id = v_ada;

  update public.shows set address = '4 Newer Road' where id = v_show;

  select * into v_after from public.show_lifecycle_email_jobs where id = v_leased.id;
  if v_after.status <> 'ready' or v_after.due_at <> v_leased.due_at or v_after.claimed_until <> v_leased.claimed_until
     or v_after.attempt_id <> v_leased.attempt_id or v_after.recipient_name <> 'Leased Name' then
    raise exception 'FAIL H the leased in-flight job was rewritten: %', row_to_json(v_after);
  end if;
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'show_changed' and status = 'ready' and recipient_person_id = v_ada) <> 2 then
    raise exception 'FAIL H the newer edit did not queue a separate job for Ada';
  end if;
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and step_type = 'show_changed' and status = 'ready'
                    and recipient_person_id = v_ada and id <> v_leased.id
                    and claimed_until is null and due_at = now() + interval '5 minutes') then
    raise exception 'FAIL H the separate job is not a fresh unleased ready job';
  end if;
  -- Hal's job was not leased: still one waiting job, merged as before.
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'show_changed' and status = 'ready' and recipient_person_id = v_hal) <> 1 then
    raise exception 'FAIL H an unleased waiting job was not merged';
  end if;
  raise notice 'PASS H an edit while a job is leased queues a separate job';
end $$;

rollback;
