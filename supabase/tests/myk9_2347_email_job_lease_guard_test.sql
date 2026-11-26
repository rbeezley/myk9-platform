-- MYK9-2347: a show or judge edit while a ready job is leased by the email drain queues a
-- separate job instead of overwriting the leased row.
--
--   A. show_changed: an edit after the drain leased the ready job inserts a second ready job
--      with the new recipient details; the leased row is untouched; a further edit merges into
--      the new unleased job (still two rows)
--   B. judge_changed: a judge change after the drain leased the ready job inserts a second ready
--      job holding only the new change; the leased row keeps its judge_changes and due time
--   C. both partial unique indexes only cover unleased rows
--
-- Fixtures roll back. now() is the transaction start, so due times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002347001', 'MYK9-2347 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002347002', 'MYK9-2347 Show', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000002347001', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002347003', '00000000-0000-0000-0000-000002347002', 'MYK9-2347 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002347004', '00000000-0000-0000-0000-000002347003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002347021', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002347051', 'Judge', 'One', 'j1@example.test'),
  ('00000000-0000-0000-0000-000002347052', 'Judge', 'Two', 'j2@example.test'),
  ('00000000-0000-0000-0000-000002347053', 'Judge', 'Three', 'j3@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002347031', 'Ada Dog', 'Ada', 'Beagle', '00000000-0000-0000-0000-000002347021');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002347041', '00000000-0000-0000-0000-000002347031', '00000000-0000-0000-0000-000002347004', '00000000-0000-0000-0000-000002347002', '00000000-0000-0000-0000-000002347003', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status) values
  ('00000000-0000-0000-0000-000002347061', '00000000-0000-0000-0000-000002347051', '00000000-0000-0000-0000-000002347002', '00000000-0000-0000-0000-000002347003', '00000000-0000-0000-0000-000002347004', 'confirmed');

-- The drain leases a job by setting attempt_id and claimed_until while it is still 'ready'.
create or replace function pg_temp.lease(p_type text) returns void
language sql as $$
  update public.show_lifecycle_email_jobs
     set attempt_id = gen_random_uuid(), claimed_until = now() + interval '10 minutes'
   where show_id = '00000000-0000-0000-0000-000002347002' and step_type = p_type and status = 'ready' and claimed_until is null
$$;

create or replace function pg_temp.replace_judge(p_person uuid) returns void
language plpgsql as $$
begin
  delete from public.judge_assignments where class_id = '00000000-0000-0000-0000-000002347004';
  insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
  values (p_person, '00000000-0000-0000-0000-000002347002', '00000000-0000-0000-0000-000002347003', '00000000-0000-0000-0000-000002347004', 'confirmed');
end $$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002347002';
  v_first record;
  v_after record;
  v_second record;
begin
  update public.trials set date = current_date + 7 where id = '00000000-0000-0000-0000-000002347003';
  select * into v_first from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'show_changed';
  if v_first.id is null or v_first.status <> 'ready' or v_first.claimed_until is not null then
    raise exception 'FAIL A the first edit did not queue one unleased ready job: %', row_to_json(v_first);
  end if;

  perform pg_temp.lease('show_changed');
  -- Snapshot after leasing, so claimed_until and attempt_id are the leased values.
  select * into v_first from public.show_lifecycle_email_jobs where id = v_first.id;
  update public.people set email = 'ada.new@example.test' where id = '00000000-0000-0000-0000-000002347021';
  update public.trials set date = current_date + 9 where id = '00000000-0000-0000-0000-000002347003';

  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'show_changed' and status = 'ready') <> 2 then
    raise exception 'FAIL A an edit during a lease should leave two ready jobs, found %',
      (select count(*) from public.show_lifecycle_email_jobs where show_id = v_show and step_type = 'show_changed');
  end if;
  select * into v_after from public.show_lifecycle_email_jobs where id = v_first.id;
  if v_after.recipient_email <> 'ada@example.test' or v_after.claimed_until is distinct from v_first.claimed_until
     or v_after.attempt_id is null
     or v_after.status <> 'ready' then
    raise exception 'FAIL A the leased job was mutated: %', row_to_json(v_after);
  end if;
  select * into v_second from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'show_changed' and id <> v_first.id;
  if v_second.status <> 'ready' or v_second.claimed_until is not null or v_second.attempt_id is not null
     or v_second.recipient_email <> 'ada.new@example.test' then
    raise exception 'FAIL A the new job is wrong: %', row_to_json(v_second);
  end if;

  update public.people set email = 'ada.third@example.test' where id = '00000000-0000-0000-0000-000002347021';
  update public.trials set date = current_date + 11 where id = '00000000-0000-0000-0000-000002347003';
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'show_changed') <> 2 then
    raise exception 'FAIL A a further edit should merge into the unleased job, not add a third';
  end if;
  select * into v_after from public.show_lifecycle_email_jobs where id = v_first.id;
  if v_after.recipient_email <> 'ada@example.test' or v_after.claimed_until is distinct from v_first.claimed_until then
    raise exception 'FAIL A the further edit touched the leased job: %', row_to_json(v_after);
  end if;
  select * into v_second from public.show_lifecycle_email_jobs where id <> v_first.id and show_id = v_show and step_type = 'show_changed';
  if v_second.recipient_email <> 'ada.third@example.test' or v_second.claimed_until is not null then
    raise exception 'FAIL A the further edit did not update the unleased job: %', row_to_json(v_second);
  end if;
  raise notice 'PASS A a show edit during a lease queues a separate job';
end $$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002347002';
  v_first record;
  v_after record;
  v_second record;
begin
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002347052');
  select * into v_first from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'judge_changed';
  if v_first.id is null or v_first.status <> 'ready' or v_first.claimed_until is not null
     or v_first.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002347004', '00000000-0000-0000-0000-000002347051') then
    raise exception 'FAIL B the first change did not queue one unleased ready job: %', row_to_json(v_first);
  end if;

  perform pg_temp.lease('judge_changed');
  perform pg_temp.replace_judge('00000000-0000-0000-0000-000002347053');

  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'judge_changed' and status = 'ready') <> 2 then
    raise exception 'FAIL B a change during a lease should leave two ready jobs, found %',
      (select count(*) from public.show_lifecycle_email_jobs where show_id = v_show and step_type = 'judge_changed');
  end if;
  select * into v_after from public.show_lifecycle_email_jobs where id = v_first.id;
  if v_after.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002347004', '00000000-0000-0000-0000-000002347051')
     or v_after.claimed_until is null or v_after.status <> 'ready' then
    raise exception 'FAIL B the leased job was mutated: %', row_to_json(v_after);
  end if;
  select * into v_second from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'judge_changed' and id <> v_first.id;
  if v_second.status <> 'ready' or v_second.claimed_until is not null
     or v_second.judge_changes <> jsonb_build_object('00000000-0000-0000-0000-000002347004', '00000000-0000-0000-0000-000002347052') then
    raise exception 'FAIL B the new job is wrong: %', row_to_json(v_second);
  end if;
  raise notice 'PASS B a judge change during a lease queues a separate job';
end $$;

-- C
do $$
declare
  v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'show_lifecycle_email_jobs_one_ready_show_changed';
  if v_def is null or v_def not like '%claimed_until IS NULL%' then
    raise exception 'FAIL C the show_changed index ignores the lease: %', v_def;
  end if;
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'show_lifecycle_email_jobs_one_ready_judge_changed';
  if v_def is null or v_def not like '%claimed_until IS NULL%' then
    raise exception 'FAIL C the judge_changed index ignores the lease: %', v_def;
  end if;
  raise notice 'PASS C both indexes only cover unleased jobs';
end $$;

rollback;
