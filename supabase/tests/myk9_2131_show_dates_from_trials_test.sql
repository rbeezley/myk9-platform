-- MYK9-2131: a show's start and end dates are the dates of its live trials.
--
--   A. a one-day show whose trial moves follows it
--   B. a multi-day show: a trial added, soft-deleted, restored and hard-deleted
--   C. a trial moved to another show updates both shows
--   D. a direct UPDATE of the show's dates is overridden while trials exist
--   E. a show with no live trial keeps its dates
--   F. the backfill statement makes a mismatched show agree
--   G. a trial date move on a published show also queues the MYK9-2124 email (one trigger)
--   H. the functions are not executable by API roles
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002131001', 'MYK9-2131 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002131002', 'MYK9-2131 One Day', 'AKC', timestamptz '2027-03-05 00:00+00', timestamptz '2027-03-05 00:00+00',
   '00000000-0000-0000-0000-000002131001', 'published'),
  ('00000000-0000-0000-0000-000002131003', 'MYK9-2131 Multi Day', 'AKC', timestamptz '2027-03-05 00:00+00', timestamptz '2027-03-06 00:00+00',
   '00000000-0000-0000-0000-000002131001', 'draft'),
  ('00000000-0000-0000-0000-000002131004', 'MYK9-2131 Other', 'AKC', timestamptz '2027-04-01 00:00+00', timestamptz '2027-04-01 00:00+00',
   '00000000-0000-0000-0000-000002131001', 'draft'),
  ('00000000-0000-0000-0000-000002131005', 'MYK9-2131 No Trials', 'AKC', timestamptz '2027-05-01 00:00+00', timestamptz '2027-05-02 00:00+00',
   '00000000-0000-0000-0000-000002131001', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002131011', '00000000-0000-0000-0000-000002131002', 'One Day Trial', date '2027-03-05', 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002131012', '00000000-0000-0000-0000-000002131003', 'Multi Day 1', date '2027-03-05', 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002131013', '00000000-0000-0000-0000-000002131003', 'Multi Day 2', date '2027-03-06', 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002131014', '00000000-0000-0000-0000-000002131004', 'Other Trial', date '2027-04-01', 'AKC', 'Scent Work');

create or replace function pg_temp.dates(p_show uuid) returns text
language sql as $$
  select to_char(start_date at time zone 'UTC', 'YYYY-MM-DD') || ' to ' || to_char(end_date at time zone 'UTC', 'YYYY-MM-DD')
    from public.shows where id = p_show
$$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131002';
begin
  update public.trials set date = date '2027-03-12' where id = '00000000-0000-0000-0000-000002131011';
  if pg_temp.dates(v_show) <> '2027-03-12 to 2027-03-12' then
    raise exception 'FAIL A one-day show did not follow its trial: %', pg_temp.dates(v_show);
  end if;
  if (select start_date from public.shows where id = v_show) <> timestamptz '2027-03-12 00:00+00' then
    raise exception 'FAIL A the stored value is not midnight UTC';
  end if;
  raise notice 'PASS A a one-day show follows its trial';
end $$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131003';
begin
  insert into public.trials (id, show_id, name, date, registry_id, trial_type)
    values ('00000000-0000-0000-0000-000002131015', v_show, 'Multi Day 3', date '2027-03-07', 'AKC', 'Scent Work');
  if pg_temp.dates(v_show) <> '2027-03-05 to 2027-03-07' then
    raise exception 'FAIL B added trial: %', pg_temp.dates(v_show);
  end if;

  update public.trials set deleted_at = now() where id = '00000000-0000-0000-0000-000002131015';  -- what soft_delete_trial writes
  if pg_temp.dates(v_show) <> '2027-03-05 to 2027-03-06' then
    raise exception 'FAIL B soft-deleted trial: %', pg_temp.dates(v_show);
  end if;

  update public.trials set deleted_at = null where id = '00000000-0000-0000-0000-000002131015';  -- what restore_trial writes
  if pg_temp.dates(v_show) <> '2027-03-05 to 2027-03-07' then
    raise exception 'FAIL B restored trial: %', pg_temp.dates(v_show);
  end if;

  update public.trials set date = date '2027-03-04' where id = '00000000-0000-0000-0000-000002131013';
  if pg_temp.dates(v_show) <> '2027-03-04 to 2027-03-07' then
    raise exception 'FAIL B moved earlier: %', pg_temp.dates(v_show);
  end if;

  delete from public.trials where id = '00000000-0000-0000-0000-000002131015';
  if pg_temp.dates(v_show) <> '2027-03-04 to 2027-03-05' then
    raise exception 'FAIL B hard-deleted trial: %', pg_temp.dates(v_show);
  end if;
  raise notice 'PASS B a multi-day show follows add, soft delete, restore, move and hard delete';
end $$;

-- C
do $$
begin
  update public.trials set show_id = '00000000-0000-0000-0000-000002131003'
   where id = '00000000-0000-0000-0000-000002131014';
  if pg_temp.dates('00000000-0000-0000-0000-000002131003') <> '2027-03-04 to 2027-04-01' then
    raise exception 'FAIL C new show: %', pg_temp.dates('00000000-0000-0000-0000-000002131003');
  end if;
  -- The old show lost its only trial, so it keeps its dates.
  if pg_temp.dates('00000000-0000-0000-0000-000002131004') <> '2027-04-01 to 2027-04-01' then
    raise exception 'FAIL C old show changed: %', pg_temp.dates('00000000-0000-0000-0000-000002131004');
  end if;
  update public.trials set show_id = '00000000-0000-0000-0000-000002131004', date = date '2027-04-09'
   where id = '00000000-0000-0000-0000-000002131014';
  if pg_temp.dates('00000000-0000-0000-0000-000002131003') <> '2027-03-04 to 2027-03-05'
     or pg_temp.dates('00000000-0000-0000-0000-000002131004') <> '2027-04-09 to 2027-04-09' then
    raise exception 'FAIL C moved back: % / %', pg_temp.dates('00000000-0000-0000-0000-000002131003'),
      pg_temp.dates('00000000-0000-0000-0000-000002131004');
  end if;
  raise notice 'PASS C a trial moved to another show updates both shows';
end $$;

-- D
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131003';
begin
  update public.shows set start_date = timestamptz '2030-01-01 00:00+00', end_date = timestamptz '2030-01-02 00:00+00'
   where id = v_show;
  if pg_temp.dates(v_show) <> '2027-03-04 to 2027-03-05' then
    raise exception 'FAIL D a direct date write stuck: %', pg_temp.dates(v_show);
  end if;
  raise notice 'PASS D a direct show date write is overridden while trials exist';
end $$;

-- E
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131005';
begin
  update public.shows set start_date = timestamptz '2027-06-01 00:00+00', end_date = timestamptz '2027-06-03 00:00+00'
   where id = v_show;
  if pg_temp.dates(v_show) <> '2027-06-01 to 2027-06-03' then
    raise exception 'FAIL E a show with no trial lost its dates: %', pg_temp.dates(v_show);
  end if;
  insert into public.trials (id, show_id, name, date, registry_id, trial_type)
    values ('00000000-0000-0000-0000-000002131016', v_show, 'Late Trial', date '2027-06-10', 'AKC', 'Scent Work');
  update public.trials set deleted_at = now() where id = '00000000-0000-0000-0000-000002131016';  -- what soft_delete_trial writes
  if pg_temp.dates(v_show) <> '2027-06-10 to 2027-06-10' then
    raise exception 'FAIL E the last trial going away should leave the last dates: %', pg_temp.dates(v_show);
  end if;
  raise notice 'PASS E a show with no live trial keeps its dates';
end $$;

-- F: the migration's backfill statement (copied), scoped to one mismatched show. The trigger
-- guards the write, so open the mismatch by disabling it for the setup.
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131002';
  v_changed integer;
begin
  alter table public.shows disable trigger trg_derive_show_dates;
  update public.shows set start_date = timestamptz '2027-01-01 00:00+00' where id = v_show;
  alter table public.shows enable trigger trg_derive_show_dates;
  if pg_temp.dates(v_show) <> '2027-01-01 to 2027-03-12' then
    raise exception 'FAIL F setup: %', pg_temp.dates(v_show);
  end if;
  with derived as (
    select t.show_id,
           min(t.date)::timestamp at time zone 'UTC' as start_date,
           max(t.date)::timestamp at time zone 'UTC' as end_date
      from public.trials t
     where t.deleted_at is null and t.date is not null
     group by t.show_id
  ), changed as (
    update public.shows s
       set start_date = d.start_date, end_date = d.end_date
      from derived d
     where s.id = d.show_id and s.id = v_show
       and (s.start_date is distinct from d.start_date or s.end_date is distinct from d.end_date)
    returning s.id
  )
  select count(*) into v_changed from changed;
  if v_changed <> 1 or pg_temp.dates(v_show) <> '2027-03-12 to 2027-03-12' then
    raise exception 'FAIL F backfill changed % and left %', v_changed, pg_temp.dates(v_show);
  end if;
  raise notice 'PASS F the backfill makes a mismatched show agree';
end $$;

-- G
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002131002';
  v_job_count integer;
begin
  insert into public.people (id, first_name, last_name, email)
    values ('00000000-0000-0000-0000-000002131021', 'Ada', 'Owner', 'ada2131@example.test');
  insert into public.dogs (id, name, call_name, breed, owner_id)
    values ('00000000-0000-0000-0000-000002131022', 'Ada Dog', 'Ada', 'Beagle', '00000000-0000-0000-0000-000002131021');
  insert into public.classes (id, trial_id, name, status, element, level, section)
    values ('00000000-0000-0000-0000-000002131023', '00000000-0000-0000-0000-000002131011', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
  alter table public.entries disable trigger trg_entries_require_dog_registration;
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status)
    values ('00000000-0000-0000-0000-000002131024', '00000000-0000-0000-0000-000002131022', '00000000-0000-0000-0000-000002131023',
            v_show, '00000000-0000-0000-0000-000002131011', 'confirmed', '1', 1, 'no-status');
  alter table public.entries enable trigger trg_entries_require_dog_registration;

  update public.trials set date = date '2027-03-19' where id = '00000000-0000-0000-0000-000002131011';
  select count(*) into v_job_count from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'show_changed' and status = 'ready'
     and recipient_person_id = '00000000-0000-0000-0000-000002131021';
  if v_job_count <> 1 then
    raise exception 'FAIL G a trial date move on a published show should queue one show_changed job, found %', v_job_count;
  end if;
  if pg_temp.dates(v_show) <> '2027-03-19 to 2027-03-19' then
    raise exception 'FAIL G the show dates did not follow: %', pg_temp.dates(v_show);
  end if;
  -- One trigger: the trials table carries exactly one show_changed producer.
  if (select count(*) from pg_trigger
       where tgrelid = 'public.trials'::regclass and not tgisinternal
         and tgfoid = 'public.queue_show_changed_email_from_trial()'::regprocedure) <> 1 then
    raise exception 'FAIL G expected exactly one show_changed trigger on trials';
  end if;
  raise notice 'PASS G a trial date move on a published show queues the MYK9-2124 email';
end $$;

-- H
do $$
declare
  v_fn regprocedure;
  v_role text;
begin
  foreach v_fn in array array[
    'private.derived_show_dates(uuid)'::regprocedure,
    'private.sync_show_dates_from_trials(uuid)'::regprocedure,
    'public.sync_show_dates_from_trial_change()'::regprocedure,
    'public.derive_show_dates_before_update()'::regprocedure
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'FAIL H % can execute %', v_role, v_fn;
      end if;
    end loop;
  end loop;
  raise notice 'PASS H no API role can execute the date functions';
end $$;

rollback;
