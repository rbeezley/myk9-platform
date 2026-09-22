-- MYK9-603: emergency_packet_input follows the entry's assigned handler and
-- uses dog ownership only when the entry has no assigned handler identity.
-- Run against a migrated local database. All fixtures roll back.

begin;

insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000603011', 'MYK9-603', 'Owner', 'myk9-603-owner@example.test'),
  ('00000000-0000-0000-0000-000000603012', 'MYK9-603', 'Assigned', 'myk9-603-assigned@example.test'),
  ('00000000-0000-0000-0000-000000603013', 'MYK9-603', 'Deleted', 'myk9-603-deleted@example.test');

update public.people
set deleted_at = now()
where id = '00000000-0000-0000-0000-000000603013';

insert into public.shows (id, name, type, organization, start_date, end_date, status)
values ('00000000-0000-0000-0000-000000603001', 'MYK9-603 Show', 'All-Breed', 'AKC',
  current_date, current_date, 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000603002', '00000000-0000-0000-0000-000000603001',
  'MYK9-603 Trial', current_date, 'AKC');

insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603002',
  'MYK9-603 Class', 'no-status');

insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000603021', 'MYK9-603 Dog 1', 'Dog 1', 'Beagle', '00000000-0000-0000-0000-000000603011'),
  ('00000000-0000-0000-0000-000000603022', 'MYK9-603 Dog 2', 'Dog 2', 'Beagle', '00000000-0000-0000-0000-000000603011'),
  ('00000000-0000-0000-0000-000000603023', 'MYK9-603 Dog 3', 'Dog 3', 'Beagle', '00000000-0000-0000-0000-000000603011'),
  ('00000000-0000-0000-0000-000000603024', 'MYK9-603 Dog 4', 'Dog 4', 'Beagle', '00000000-0000-0000-0000-000000603011'),
  ('00000000-0000-0000-0000-000000603025', 'MYK9-603 Dog 5', 'Dog 5', 'Beagle', null);

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, armband, run_order, check_in_status)
values
  -- Explicit entry text has precedence over a resolvable assigned person.
  ('00000000-0000-0000-0000-000000603031', '00000000-0000-0000-0000-000000603021', '00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603001', '00000000-0000-0000-0000-000000603002', '  Text Handler  ', '00000000-0000-0000-0000-000000603012', 'confirmed', '1', 1, 'no-status'),
  -- With no text, a live assigned person beats the different dog owner.
  ('00000000-0000-0000-0000-000000603032', '00000000-0000-0000-0000-000000603022', '00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603001', '00000000-0000-0000-0000-000000603002', null, '00000000-0000-0000-0000-000000603012', 'confirmed', '2', 2, 'no-status'),
  -- A soft-deleted assigned person is unresolved, not permission to show owner.
  ('00000000-0000-0000-0000-000000603033', '00000000-0000-0000-0000-000000603023', '00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603001', '00000000-0000-0000-0000-000000603002', null, '00000000-0000-0000-0000-000000603013', 'confirmed', '3', 3, 'no-status'),
  -- Owner fallback is valid only when handler_id is absent.
  ('00000000-0000-0000-0000-000000603034', '00000000-0000-0000-0000-000000603024', '00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603001', '00000000-0000-0000-0000-000000603002', null, null, 'confirmed', '4', 4, 'no-status'),
  -- Neither assigned handler nor owner resolves.
  ('00000000-0000-0000-0000-000000603035', '00000000-0000-0000-0000-000000603025', '00000000-0000-0000-0000-000000603003', '00000000-0000-0000-0000-000000603001', '00000000-0000-0000-0000-000000603002', null, null, 'confirmed', '5', 5, 'no-status');

do $$
declare
  packet jsonb;
  actual_handler text;
  expected record;
begin
  packet := public.emergency_packet_input('00000000-0000-0000-0000-000000603001', current_date);

  for expected in
    select * from (values
      ('00000000-0000-0000-0000-000000603031'::uuid, 'Text Handler'),
      ('00000000-0000-0000-0000-000000603032'::uuid, 'MYK9-603 Assigned'),
      ('00000000-0000-0000-0000-000000603033'::uuid, 'Unknown Handler'),
      ('00000000-0000-0000-0000-000000603034'::uuid, 'MYK9-603 Owner'),
      ('00000000-0000-0000-0000-000000603035'::uuid, 'Unknown Handler')
    ) as expected(entry_id, handler_name)
  loop
    select item->>'handler'
      into actual_handler
      from jsonb_array_elements(packet->'entries') as item
     where item->>'id' = expected.entry_id::text;

    if actual_handler is distinct from expected.handler_name then
      raise exception 'FAIL entry %: expected handler %, got %',
        expected.entry_id, expected.handler_name, actual_handler;
    end if;
  end loop;
end;
$$;

rollback;
