-- MYK9-665: preserve the load-bearing handler_id during text corrections.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- This executes the installed RPC, rather than asserting only on migration text.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000665001', 'MYK9-665 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000665002', 'MYK9-665 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000665001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000665003', '00000000-0000-0000-0000-000000665002',
  'MYK9-665 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000665004', '00000000-0000-0000-0000-000000665003',
  'Container Novice', 'upcoming');

-- Owner, handler-only exhibitor, secretary and an unrelated person.
insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000665011', 'MYK9-665', 'Owner', '00000000-0000-0000-0000-000000665101'),
  ('00000000-0000-0000-0000-000000665012', 'MYK9-665', 'Handler', '00000000-0000-0000-0000-000000665102'),
  ('00000000-0000-0000-0000-000000665013', 'MYK9-665', 'Secretary', '00000000-0000-0000-0000-000000665103'),
  ('00000000-0000-0000-0000-000000665014', 'MYK9-665', 'Outsider', '00000000-0000-0000-0000-000000665104'),
  ('00000000-0000-0000-0000-000000665015', 'MYK9-665', 'Club Admin', '00000000-0000-0000-0000-000000665105');

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000665013', id,
  '00000000-0000-0000-0000-000000665001', true,
  '00000000-0000-0000-0000-000000665103'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000665015', id,
  '00000000-0000-0000-0000-000000665001', true,
  '00000000-0000-0000-0000-000000665105'
from public.roles where name = 'club_admin';

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000665021', 'MYK9-665 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000665011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000665021', 'AKC (American Kennel Club)', 'SR665021', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values ('00000000-0000-0000-0000-000000665031',
  '00000000-0000-0000-0000-000000665021', '00000000-0000-0000-0000-000000665004',
  '00000000-0000-0000-0000-000000665002', '00000000-0000-0000-0000-000000665003',
  'MYK9-665 Handler', '00000000-0000-0000-0000-000000665012',
  'confirmed', 'pending', 25, 'no-status');

create function pg_temp.call_handler_update(
  caller text,
  new_handler text,
  clear_id boolean,
  expected_error text default null,
  selected_handler_id uuid default null
) returns void language plpgsql as $$
declare
  actual_error text;
begin
  perform set_config('request.jwt.claim.sub', caller, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.update_entry_handler_for_entry_management(
      '00000000-0000-0000-0000-000000665031', new_handler, selected_handler_id, clear_id);
  exception when others then
    actual_error := sqlerrm;
  end;
  reset role;

  if expected_error is null and actual_error is not null then
    raise exception 'FAIL caller %, unexpected error: %', caller, actual_error;
  end if;
  if expected_error is not null and (actual_error is null or actual_error not like expected_error) then
    raise exception 'FAIL caller %, expected %; got %', caller, expected_error, actual_error;
  end if;
  raise notice 'PASS handler update for %', caller;
end;
$$;

-- An exhibitor's text correction preserves the load-bearing link when the new
-- client omits the legacy clear request.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665102', 'MYK9-665 Renamed Handler', false);
do $$
begin
  if (select handler_id from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from '00000000-0000-0000-0000-000000665012'::uuid then
    raise exception 'FAIL exhibitor clear changed handler_id';
  end if;
  if (select handler from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from 'MYK9-665 Renamed Handler' then
    raise exception 'FAIL exhibitor edit did not update handler text';
  end if;
end;
$$;
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665102', 'MYK9-665 Handler Again', false,
  null, '00000000-0000-0000-0000-000000665012');
do $$
begin
  if (select handler from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from 'MYK9-665 Handler Again' then
    raise exception 'FAIL exhibitor edit did not update handler text';
  end if;
end;
$$;

-- A legacy exhibitor clear fails closed instead of revoking the former
-- handler's access.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665102', 'MYK9-665 Cleared Handler', true,
  'Explicit handler identity clearing is not supported%');

-- An official text correction with no selected replacement also preserves the
-- existing handler identity.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665103', 'MYK9-665 Handler Restored', false);
do $$
begin
  if (select handler_id from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from '00000000-0000-0000-0000-000000665012'::uuid then
    raise exception 'FAIL official text correction changed handler_id';
  end if;
end;
$$;

-- An official legacy clear also fails closed.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665103', 'MYK9-665 Corrected Handler', true,
  'Explicit handler identity clearing is not supported%');

-- A club admin is authorized while the show is linked to that club.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665105', 'MYK9-665 Club Admin Correction', false,
  null, '00000000-0000-0000-0000-000000665012');
do $$
begin
  if (select handler from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from 'MYK9-665 Club Admin Correction' then
    raise exception 'FAIL club admin could not correct linked show entry';
  end if;
  if (select handler_id from public.entries where id = '00000000-0000-0000-0000-000000665031')
    is distinct from '00000000-0000-0000-0000-000000665012'::uuid then
    raise exception 'FAIL club admin selected handler was not stored';
  end if;
end;
$$;

-- A club admin must not become an official for a show whose club_id is NULL.
update public.shows set club_id = null
 where id = '00000000-0000-0000-0000-000000665002';
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665105', 'MYK9-665 Null Club Attempt', true,
  'Not authorized: caller does not own entry %');

-- A non-owner/non-handler cannot use the correction RPC.
select pg_temp.call_handler_update(
  '00000000-0000-0000-0000-000000665104', 'MYK9-665 Intruder', false,
  'Not authorized: caller does not own entry %');

rollback;
