-- MYK9-2076: the "Results available" email is queued once per exhibitor when the
-- last class of a show is released.
--
--   A. releasing a class that is not the last queues nothing
--   B. releasing the last class queues ONE ready job per exhibitor (two dogs of one
--      owner still make one), with their own results link; a cancelled class, a class
--      with no dogs and a withdrawn dog never block or add a recipient
--   C. undo and redo of a release, and a class released later, queue nothing more
--   D. a second job for one (show, exhibitor) is refused by the unique index
--   E. the per-show switch: switched off, the last release queues nothing
--   F. the trigger function is not callable by an API role
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002076301', 'MYK9-2076 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002076302', 'MYK9-2076 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002076301', 'draft'),
  ('00000000-0000-0000-0000-000002076312', 'MYK9-2076 Switched Off Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002076301', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002076303', '00000000-0000-0000-0000-000002076302',
   'MYK9-2076 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002076313', '00000000-0000-0000-0000-000002076312',
   'MYK9-2076 Off Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002076304', '00000000-0000-0000-0000-000002076303', 'Container Novice A', 'completed', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076305', '00000000-0000-0000-0000-000002076303', 'Interior Novice A', 'completed', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076306', '00000000-0000-0000-0000-000002076303', 'Exterior Novice A', 'cancelled', 'Exterior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076307', '00000000-0000-0000-0000-000002076303', 'Buried Novice A', 'upcoming', 'Buried', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076314', '00000000-0000-0000-0000-000002076313', 'Container Novice A', 'completed', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002076321', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002076322', 'Bo', 'Owner', 'bo@example.test'),
  ('00000000-0000-0000-0000-000002076323', 'Cy', 'Withdrew', 'cy@example.test'),
  ('00000000-0000-0000-0000-000002076325', 'Eve', 'Cancelled', 'eve@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002076331', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002076321'),
  ('00000000-0000-0000-0000-000002076332', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002076321'),
  ('00000000-0000-0000-0000-000002076333', 'Bo Dog', 'Bo', 'Beagle', '00000000-0000-0000-0000-000002076322'),
  ('00000000-0000-0000-0000-000002076334', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002076323'),
  ('00000000-0000-0000-0000-000002076336', 'Eve Dog', 'Eve', 'Beagle', '00000000-0000-0000-0000-000002076325');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002076341', '00000000-0000-0000-0000-000002076331', '00000000-0000-0000-0000-000002076304', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076342', '00000000-0000-0000-0000-000002076332', '00000000-0000-0000-0000-000002076305', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '2', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076343', '00000000-0000-0000-0000-000002076333', '00000000-0000-0000-0000-000002076304', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '3', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002076344', '00000000-0000-0000-0000-000002076334', '00000000-0000-0000-0000-000002076304', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'withdrawn', '4', 3, 'no-status'),
  ('00000000-0000-0000-0000-000002076345', '00000000-0000-0000-0000-000002076331', '00000000-0000-0000-0000-000002076314', '00000000-0000-0000-0000-000002076312', '00000000-0000-0000-0000-000002076313', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076347', '00000000-0000-0000-0000-000002076333', '00000000-0000-0000-0000-000002076306', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '6', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076348', '00000000-0000-0000-0000-000002076336', '00000000-0000-0000-0000-000002076306', '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '7', 2, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;
-- Set after the entries: adding an entry recomputes the class status.
update public.classes set status = 'cancelled' where id = '00000000-0000-0000-0000-000002076306';

create or replace function pg_temp.job_count(p_show uuid) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = 'results_available'
$$;

-- A
do $$
begin
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076304';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076302') <> 0 then
    raise exception 'FAIL A a job was queued while a class still waited for release';
  end if;
  raise notice 'PASS A no job while a class is still unreleased';
end $$;

-- B
do $$
declare
  v_count integer;
  v_job record;
begin
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076305';
  v_count := pg_temp.job_count('00000000-0000-0000-0000-000002076302');
  if v_count <> 2 then
    raise exception 'FAIL B expected 2 jobs (Ada once, Bo once; cancelled/empty class, withdrawn dog ignored), found %', v_count;
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000002076302'
     and recipient_person_id = '00000000-0000-0000-0000-000002076321';
  if v_job.status <> 'ready' or v_job.recipient_email <> 'ada@example.test'
     or v_job.subject <> 'Results from MYK9-2076 Show are ready'
     or position('https://myk9show.com/exhibitor/entries?showId=00000000-0000-0000-0000-000002076302' in v_job.body) = 0 then
    raise exception 'FAIL B the job is wrong: %', row_to_json(v_job);
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = '00000000-0000-0000-0000-000002076302'
                and recipient_person_id = '00000000-0000-0000-0000-000002076323') then
    raise exception 'FAIL B an exhibitor whose only dog withdrew was queued';
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = '00000000-0000-0000-0000-000002076302'
                and recipient_person_id = '00000000-0000-0000-0000-000002076325') then
    raise exception 'FAIL B an exhibitor whose only dog is in a cancelled class was queued';
  end if;
  raise notice 'PASS B the last release queues one job per exhibitor';
end $$;

-- C
do $$
begin
  update public.classes set results_released_at = null where id = '00000000-0000-0000-0000-000002076305';
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076305';
  update public.show_lifecycle_email_jobs set status = 'dismissed', dismissed_at = now()
   where show_id = '00000000-0000-0000-0000-000002076302';
  update public.classes set results_released_at = null where id = '00000000-0000-0000-0000-000002076304';
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076304';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076302') <> 2 then
    raise exception 'FAIL C a redone release changed the number of jobs to %',
      pg_temp.job_count('00000000-0000-0000-0000-000002076302');
  end if;
  -- A dog entered after the email went: a later release still sends nothing.
  insert into public.people (id, first_name, last_name, email)
  values ('00000000-0000-0000-0000-000002076324', 'Di', 'Late', 'di@example.test');
  insert into public.dogs (id, name, call_name, breed, owner_id)
  values ('00000000-0000-0000-0000-000002076335', 'Di Dog', 'Di', 'Beagle', '00000000-0000-0000-0000-000002076324');
  alter table public.entries disable trigger trg_entries_require_dog_registration;
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status)
  values ('00000000-0000-0000-0000-000002076346', '00000000-0000-0000-0000-000002076335', '00000000-0000-0000-0000-000002076307',
          '00000000-0000-0000-0000-000002076302', '00000000-0000-0000-0000-000002076303', 'confirmed', '5', 1, 'no-status');
  alter table public.entries enable trigger trg_entries_require_dog_registration;
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076307';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076302') <> 2 then
    raise exception 'FAIL C a class released later queued a job (now %)',
      pg_temp.job_count('00000000-0000-0000-0000-000002076302');
  end if;
  raise notice 'PASS C undo and redo, and a later release, queue nothing more';
end $$;

-- D
do $$
declare v_step uuid;
begin
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000002076302' and step_type = 'results_available';
  begin
    insert into public.show_lifecycle_email_jobs
      (show_id, step_id, step_type, recipient_scope, recipient_person_id, recipient_email, idempotency_key)
    values
      ('00000000-0000-0000-0000-000002076302', v_step, 'results_available', 'show_recipient',
       '00000000-0000-0000-0000-000002076321', 'ada@example.test', 'myk9-2076-another-key');
    raise exception 'FAIL D a second results_available job for one exhibitor was accepted';
  exception when unique_violation then null;
  end;
  raise notice 'PASS D the unique index refuses a second job per (show, exhibitor)';
end $$;

-- E
do $$
begin
  update public.show_lifecycle_email_steps set is_enabled = false
   where show_id = '00000000-0000-0000-0000-000002076312' and step_type = 'results_available';
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076314';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076312') <> 0 then
    raise exception 'FAIL E a job was queued with the step switched off';
  end if;
  raise notice 'PASS E the per-show switch is honoured';
end $$;

-- F
do $$
begin
  if has_function_privilege('anon', 'public.queue_results_available_emails()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.queue_results_available_emails()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.queue_results_available_emails()', 'EXECUTE') then
    raise exception 'FAIL F an API role can execute queue_results_available_emails';
  end if;
  raise notice 'PASS F the producer is not callable by an API role';
end $$;

-- G, H: more shows (cancelling the last waiting class; switching the step on later)
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002076362', 'MYK9-2076 Cancel Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002076301', 'draft'),
  ('00000000-0000-0000-0000-000002076372', 'MYK9-2076 Enable Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002076301', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002076363', '00000000-0000-0000-0000-000002076362', 'Cancel Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002076373', '00000000-0000-0000-0000-000002076372', 'Enable Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002076364', '00000000-0000-0000-0000-000002076363', 'Container Novice A', 'completed', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076365', '00000000-0000-0000-0000-000002076363', 'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002076374', '00000000-0000-0000-0000-000002076373', 'Container Novice A', 'completed', 'Container', 'Novice', 'A');
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002076381', 'Fay', 'Stays', 'fay@example.test'),
  ('00000000-0000-0000-0000-000002076382', 'Gus', 'Cancelled', 'gus@example.test'),
  ('00000000-0000-0000-0000-000002076383', 'Hal', 'Later', 'hal@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002076391', 'Fay Dog', 'Fay', 'Beagle', '00000000-0000-0000-0000-000002076381'),
  ('00000000-0000-0000-0000-000002076392', 'Gus Dog', 'Gus', 'Beagle', '00000000-0000-0000-0000-000002076382'),
  ('00000000-0000-0000-0000-000002076393', 'Hal Dog', 'Hal', 'Beagle', '00000000-0000-0000-0000-000002076383');
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002076394', '00000000-0000-0000-0000-000002076391', '00000000-0000-0000-0000-000002076364', '00000000-0000-0000-0000-000002076362', '00000000-0000-0000-0000-000002076363', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076395', '00000000-0000-0000-0000-000002076392', '00000000-0000-0000-0000-000002076365', '00000000-0000-0000-0000-000002076362', '00000000-0000-0000-0000-000002076363', 'confirmed', '2', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002076396', '00000000-0000-0000-0000-000002076393', '00000000-0000-0000-0000-000002076374', '00000000-0000-0000-0000-000002076372', '00000000-0000-0000-0000-000002076373', 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

do $$
begin
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076364';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076362') <> 0 then
    raise exception 'FAIL G queued while a class still waited';
  end if;
  update public.classes set status = 'cancelled' where id = '00000000-0000-0000-0000-000002076365';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076362') <> 1
     or not exists (select 1 from public.show_lifecycle_email_jobs
                     where show_id = '00000000-0000-0000-0000-000002076362'
                       and recipient_person_id = '00000000-0000-0000-0000-000002076381') then
    raise exception 'FAIL G cancelling the last waiting class did not queue exactly Fay (found %)',
      pg_temp.job_count('00000000-0000-0000-0000-000002076362');
  end if;
  raise notice 'PASS G cancelling the last waiting class queues';
end $$;

do $$
begin
  update public.show_lifecycle_email_steps set is_enabled = false
   where show_id = '00000000-0000-0000-0000-000002076372' and step_type = 'results_available';
  update public.classes set results_released_at = now() where id = '00000000-0000-0000-0000-000002076374';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076372') <> 0 then
    raise exception 'FAIL H queued with the step off';
  end if;
  update public.show_lifecycle_email_steps set is_enabled = true
   where show_id = '00000000-0000-0000-0000-000002076372' and step_type = 'results_available';
  if pg_temp.job_count('00000000-0000-0000-0000-000002076372') <> 1 then
    raise exception 'FAIL H switching the step on after every release did not queue (found %)',
      pg_temp.job_count('00000000-0000-0000-0000-000002076372');
  end if;
  raise notice 'PASS H switching the step on queues';
end $$;

rollback;
