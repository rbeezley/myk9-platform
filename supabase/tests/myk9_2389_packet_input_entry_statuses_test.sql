-- MYK9-2389: emergency_packet_input returns every live entry of a mixed-status
-- class with its raw statuses (entryStatus, checkInStatus, resultStatus), so the
-- edge builder can apply the shared sheet rule. Withdrawn, pulled and pending
-- dogs come back; a soft-deleted entry still does not. Run against a migrated
-- local database; fixtures roll back.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000238901', 'MYK9-2389 fixture club');
insert into public.shows (id, name, organization, start_date, end_date, status, club_id)
values ('00000000-0000-0000-0000-000000238902', 'MYK9-2389 Show', 'AKC',
  current_date, current_date, 'published', '00000000-0000-0000-0000-000000238901');
insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values ('00000000-0000-0000-0000-000000238903', '00000000-0000-0000-0000-000000238902',
  'MYK9-2389 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, element, level, status)
values ('00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238903',
  'MYK9-2389 Container Novice', 'Container', 'Novice', 'upcoming');

insert into public.dogs (id, name, call_name, breed)
values
  ('00000000-0000-0000-0000-000000238911', 'MYK9-2389 Runner', 'Run', 'Beagle'),
  ('00000000-0000-0000-0000-000000238912', 'MYK9-2389 Withdrawn', 'Wd', 'Beagle'),
  ('00000000-0000-0000-0000-000000238913', 'MYK9-2389 Pulled', 'Pul', 'Beagle'),
  ('00000000-0000-0000-0000-000000238914', 'MYK9-2389 Pending', 'Pen', 'Beagle'),
  ('00000000-0000-0000-0000-000000238915', 'MYK9-2389 Absent Result', 'Abs', 'Beagle'),
  ('00000000-0000-0000-0000-000000238916', 'MYK9-2389 Deleted', 'Del', 'Beagle');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select id, 'AKC', 'SR2389' || right(id::text, 2), true
from public.dogs
where id::text like '00000000-0000-0000-0000-0000002389%';

insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status, result_status, deleted_at)
values
  ('00000000-0000-0000-0000-000000238921', '00000000-0000-0000-0000-000000238911', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'confirmed', '1', 1, 'no-status', null, null),
  ('00000000-0000-0000-0000-000000238922', '00000000-0000-0000-0000-000000238912', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'withdrawn', '2', 2, 'no-status', null, null),
  ('00000000-0000-0000-0000-000000238923', '00000000-0000-0000-0000-000000238913', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'confirmed', '3', 3, 'pulled', null, null),
  ('00000000-0000-0000-0000-000000238924', '00000000-0000-0000-0000-000000238914', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'pending', '4', 4, 'no-status', null, null),
  ('00000000-0000-0000-0000-000000238925', '00000000-0000-0000-0000-000000238915', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'confirmed', '5', 5, 'no-status', 'absent', null),
  ('00000000-0000-0000-0000-000000238926', '00000000-0000-0000-0000-000000238916', '00000000-0000-0000-0000-000000238905', '00000000-0000-0000-0000-000000238902', '00000000-0000-0000-0000-000000238903', 'confirmed', '6', 6, 'no-status', null, now());

do $$
declare
  packet jsonb;
  row_of jsonb;
begin
  packet := public.emergency_packet_input('00000000-0000-0000-0000-000000238902', current_date);

  if jsonb_array_length(packet->'entries') <> 5 then
    raise exception 'FAIL expected the 5 live entries, got %', jsonb_array_length(packet->'entries');
  end if;

  select item into row_of from jsonb_array_elements(packet->'entries') item
   where item->>'id' = '00000000-0000-0000-0000-000000238922';
  if row_of is null or row_of->>'entryStatus' <> 'withdrawn' then
    raise exception 'FAIL a withdrawn entry was not returned with entryStatus withdrawn: %', row_of;
  end if;

  select item into row_of from jsonb_array_elements(packet->'entries') item
   where item->>'id' = '00000000-0000-0000-0000-000000238923';
  if row_of is null or row_of->>'checkInStatus' <> 'pulled' then
    raise exception 'FAIL a pulled entry was not returned with checkInStatus pulled: %', row_of;
  end if;

  select item into row_of from jsonb_array_elements(packet->'entries') item
   where item->>'id' = '00000000-0000-0000-0000-000000238924';
  if row_of is null or row_of->>'entryStatus' <> 'pending' then
    raise exception 'FAIL a pending entry was not returned with entryStatus pending: %', row_of;
  end if;

  select item into row_of from jsonb_array_elements(packet->'entries') item
   where item->>'id' = '00000000-0000-0000-0000-000000238925';
  if row_of is null or row_of->>'resultStatus' <> 'absent' then
    raise exception 'FAIL a recorded-absent entry was not returned with resultStatus absent: %', row_of;
  end if;

  if exists (select 1 from jsonb_array_elements(packet->'entries') item
              where item->>'id' = '00000000-0000-0000-0000-000000238926') then
    raise exception 'FAIL a soft-deleted entry was returned';
  end if;

  raise notice 'PASS packet input returns every live entry with entryStatus, checkInStatus and resultStatus';
end;
$$;

rollback;
