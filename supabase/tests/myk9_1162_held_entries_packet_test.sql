-- MYK9-1162: emergency_packet_input leaves entries awaiting a registration
-- number out (they keep capacity but never print), and a dog registered for the
-- TRIAL's registry stays in. Run against a migrated local database; fixtures
-- roll back.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000116201', 'MYK9-1162 fixture club');
insert into public.shows (id, name, organization, start_date, end_date, status, club_id)
values ('00000000-0000-0000-0000-000000116202', 'MYK9-1162 Show', 'AKC',
  current_date, current_date, 'published', '00000000-0000-0000-0000-000000116201');

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000000116203', '00000000-0000-0000-0000-000000116202',
   'MYK9-1162 AKC Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000116204', '00000000-0000-0000-0000-000000116202',
   'MYK9-1162 Conformation Trial', current_date, 'AKC', 'Conformation');

insert into public.classes (id, trial_id, name, element, level, status)
values
  ('00000000-0000-0000-0000-000000116205', '00000000-0000-0000-0000-000000116203',
   'MYK9-1162 Container Novice', 'Container', 'Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000116206', '00000000-0000-0000-0000-000000116204',
   'MYK9-1162 Puppy 6-9 Months', 'Puppy', 'Puppy', 'upcoming');

insert into public.dogs (id, name, call_name, breed)
values
  ('00000000-0000-0000-0000-000000116211', 'MYK9-1162 Registered', 'Reg', 'Beagle'),
  ('00000000-0000-0000-0000-000000116212', 'MYK9-1162 No Number', 'None', 'Beagle'),
  ('00000000-0000-0000-0000-000000116213', 'MYK9-1162 UKC Only', 'Ukc', 'Beagle'),
  ('00000000-0000-0000-0000-000000116214', 'MYK9-1162 Blank Number', 'Blank', 'Beagle'),
  ('00000000-0000-0000-0000-000000116215', 'MYK9-1162 Puppy', 'Pup', 'Beagle');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000116211', 'AKC (American Kennel Club)', 'SR1162001', true),
  ('00000000-0000-0000-0000-000000116213', 'UKC', 'P1162-1', true),
  ('00000000-0000-0000-0000-000000116214', 'AKC', '   ', true);

-- Inserted as the fixture owner with no caller identity, so the entry trigger
-- would refuse the unregistered dogs; disable it for the fixture only. Held
-- entries reach the table in production through a trial manager's insert.
alter table public.entries disable trigger trg_entries_require_dog_registration;

insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status)
values
  ('00000000-0000-0000-0000-000000116221', '00000000-0000-0000-0000-000000116211', '00000000-0000-0000-0000-000000116205', '00000000-0000-0000-0000-000000116202', '00000000-0000-0000-0000-000000116203', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000000116222', '00000000-0000-0000-0000-000000116212', '00000000-0000-0000-0000-000000116205', '00000000-0000-0000-0000-000000116202', '00000000-0000-0000-0000-000000116203', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000000116223', '00000000-0000-0000-0000-000000116213', '00000000-0000-0000-0000-000000116205', '00000000-0000-0000-0000-000000116202', '00000000-0000-0000-0000-000000116203', 'confirmed', '3', 3, 'no-status'),
  ('00000000-0000-0000-0000-000000116224', '00000000-0000-0000-0000-000000116214', '00000000-0000-0000-0000-000000116205', '00000000-0000-0000-0000-000000116202', '00000000-0000-0000-0000-000000116203', 'confirmed', '4', 4, 'no-status'),
  ('00000000-0000-0000-0000-000000116225', '00000000-0000-0000-0000-000000116215', '00000000-0000-0000-0000-000000116206', '00000000-0000-0000-0000-000000116202', '00000000-0000-0000-0000-000000116204', 'confirmed', '5', 1, 'no-status');

do $$
declare
  packet jsonb;
  listed text[];
begin
  packet := public.emergency_packet_input('00000000-0000-0000-0000-000000116202', current_date);

  select coalesce(array_agg(item->>'id' order by item->>'id'), '{}')
    into listed
    from jsonb_array_elements(packet->'entries') as item;

  -- Registered for the trial's registry (naming drift tolerated) stays listed.
  if not ('00000000-0000-0000-0000-000000116221' = any (listed)) then
    raise exception 'FAIL a dog registered for the trial registry was left off the packet';
  end if;
  -- No registration, other-registry-only and blank number are held, so unlisted.
  if '00000000-0000-0000-0000-000000116222' = any (listed) then
    raise exception 'FAIL an entry with no registration number was listed';
  end if;
  if '00000000-0000-0000-0000-000000116223' = any (listed) then
    raise exception 'FAIL a UKC-only dog in an AKC trial was listed';
  end if;
  if '00000000-0000-0000-0000-000000116224' = any (listed) then
    raise exception 'FAIL a blank registration number counted as a number';
  end if;
  -- The conformation puppy carve-out is never held.
  if not ('00000000-0000-0000-0000-000000116225' = any (listed)) then
    raise exception 'FAIL a conformation puppy entry was held';
  end if;

  raise notice 'PASS packet omits entries awaiting a registration number, keeps registered and conformation-puppy entries';
end;
$$;

rollback;
