-- MYK9-2031: mark_entries_handler_to_decide is the owner's or staff's flag only, and Change
-- handler clears it.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- This executes the installed RPCs, rather than asserting only on migration text.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000203001', 'MYK9-2031 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000203002', 'MYK9-2031 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000203001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000203003', '00000000-0000-0000-0000-000000203002',
  'MYK9-2031 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000203004', '00000000-0000-0000-0000-000000203003',
  'Container Novice', 'upcoming');

-- Owner, handler-only exhibitor, secretary and an unrelated person.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000203011', 'MYK9-2031', 'Owner', 'myk9-2031-owner@example.test'),
  ('00000000-0000-0000-0000-000000203012', 'MYK9-2031', 'Handler', 'myk9-2031-handler@example.test'),
  ('00000000-0000-0000-0000-000000203013', 'MYK9-2031', 'Secretary', 'myk9-2031-secretary@example.test'),
  ('00000000-0000-0000-0000-000000203014', 'MYK9-2031', 'Outsider', 'myk9-2031-outsider@example.test'),
  ('00000000-0000-0000-0000-000000203015', 'MYK9-2031', 'Club Admin', 'myk9-2031-club-admin@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000203101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2031-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000203102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2031-handler@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000203103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2031-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000203104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2031-outsider@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000203105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2031-club-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

update public.people p
set auth_user_id = fixture.auth_id
from (values
  ('00000000-0000-0000-0000-000000203011'::uuid, '00000000-0000-0000-0000-000000203101'::uuid),
  ('00000000-0000-0000-0000-000000203012'::uuid, '00000000-0000-0000-0000-000000203102'::uuid),
  ('00000000-0000-0000-0000-000000203013'::uuid, '00000000-0000-0000-0000-000000203103'::uuid),
  ('00000000-0000-0000-0000-000000203014'::uuid, '00000000-0000-0000-0000-000000203104'::uuid),
  ('00000000-0000-0000-0000-000000203015'::uuid, '00000000-0000-0000-0000-000000203105'::uuid)
) as fixture(person_id, auth_id)
where p.id = fixture.person_id;

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000203013', id,
  '00000000-0000-0000-0000-000000203001', true,
  '00000000-0000-0000-0000-000000203103'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000203015', id,
  '00000000-0000-0000-0000-000000203001', true,
  '00000000-0000-0000-0000-000000203105'
from public.roles where name = 'club_admin';

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000203021', 'MYK9-2031 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000203011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000203021', 'AKC (American Kennel Club)', 'SR2031021', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values ('00000000-0000-0000-0000-000000203031',
  '00000000-0000-0000-0000-000000203021', '00000000-0000-0000-0000-000000203004',
  '00000000-0000-0000-0000-000000203002', '00000000-0000-0000-0000-000000203003',
  'MYK9-2031 Handler', '00000000-0000-0000-0000-000000203012',
  'confirmed', 'pending', 25, 'no-status');


create function pg_temp.mark_as(caller text, ids uuid[]) returns integer language plpgsql as $$
declare
  marked integer;
begin
  perform set_config('request.jwt.claim.sub', caller, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  marked := public.mark_entries_handler_to_decide(ids);
  reset role;
  return marked;
end;
$$;

create function pg_temp.flag() returns boolean language sql as $$
  select handler_to_decide from public.entries where id = '00000000-0000-0000-0000-000000203031';
$$;

do $$
begin
  if pg_temp.flag() is distinct from false then
    raise exception 'FAIL the flag does not start false';
  end if;
  -- Another person cannot mark an entry they neither own nor manage.
  if pg_temp.mark_as('00000000-0000-0000-0000-000000203104',
       array['00000000-0000-0000-0000-000000203031']::uuid[]) <> 0 or pg_temp.flag() then
    raise exception 'FAIL an unrelated person marked another person''s entry';
  end if;
  -- A handler who is not the dog's owner cannot either.
  if pg_temp.mark_as('00000000-0000-0000-0000-000000203102',
       array['00000000-0000-0000-0000-000000203031']::uuid[]) <> 0 or pg_temp.flag() then
    raise exception 'FAIL a non-owner handler marked the entry';
  end if;
  -- The dog's owner can.
  if pg_temp.mark_as('00000000-0000-0000-0000-000000203101',
       array['00000000-0000-0000-0000-000000203031']::uuid[]) <> 1 or not pg_temp.flag() then
    raise exception 'FAIL the owner could not mark the entry';
  end if;
  raise notice 'PASS mark authorization (owner yes, outsider and handler no)';
end;
$$;

-- Change handler clears it, for the secretary.
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000203103', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000203103', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.update_entry_handler_for_entry_management(
    '00000000-0000-0000-0000-000000203031', 'MYK9-2031 Chosen Handler', null, false);
  reset role;
  if pg_temp.flag() then
    raise exception 'FAIL Change handler did not clear the flag';
  end if;
  raise notice 'PASS Change handler clears handler_to_decide';
end;
$$;

-- A secretary can mark too (staff for the show).
do $$
begin
  if pg_temp.mark_as('00000000-0000-0000-0000-000000203103',
       array['00000000-0000-0000-0000-000000203031']::uuid[]) <> 1 or not pg_temp.flag() then
    raise exception 'FAIL the show secretary could not mark the entry';
  end if;
  raise notice 'PASS secretary can mark';
end;
$$;

rollback;
