-- MYK9-2490: a show's typed address (shows.location) is watched by the "show changed" trigger.
--
--   A. a location-only change on a published show queues exactly one ready job for the
--      exhibitor with a live entry
--   B. an update that leaves location as it was queues none
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002490301', 'MYK9-2490 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status, location) values
  ('00000000-0000-0000-0000-000002490302', 'MYK9-2490 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002490301', 'published', '1 Old Road, Oldtown, TX');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002490303', '00000000-0000-0000-0000-000002490302', 'MYK9-2490 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002490304', '00000000-0000-0000-0000-000002490303', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002490321', 'Ada', 'Address', 'ada2490@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002490331', 'Ada Dog', 'Ad', 'Beagle', '00000000-0000-0000-0000-000002490321');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002490341', '00000000-0000-0000-0000-000002490331', '00000000-0000-0000-0000-000002490304', '00000000-0000-0000-0000-000002490302', '00000000-0000-0000-0000-000002490303', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- B first: nothing changed, nothing queued.
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002490302';
begin
  update public.shows set location = '1 Old Road, Oldtown, TX' where id = v_show;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and step_type = 'show_changed') then
    raise exception 'FAIL B an update that left location as it was queued a job';
  end if;
  raise notice 'PASS B an unchanged location queues nothing';
end $$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002490302';
  v_person uuid := '00000000-0000-0000-0000-000002490321';
  v_count integer;
begin
  update public.shows set location = '2 New Road, Newtown, TX' where id = v_show;
  select count(*) into v_count from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'show_changed' and status = 'ready'
     and recipient_person_id = v_person and recipient_email = 'ada2490@example.test';
  if v_count <> 1 then
    raise exception 'FAIL A a location-only change queued % jobs, expected 1', v_count;
  end if;
  raise notice 'PASS A a location-only change queues one job';
end $$;

rollback;
