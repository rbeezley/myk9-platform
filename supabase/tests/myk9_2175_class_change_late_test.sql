-- MYK9-2175: a class change request inside 30 minutes of the target trial's start
-- is RECORDED as late (entries.class_change_is_late), never refused, and the
-- take-back clears the flag
-- (20261119023700_myk9_2175_class_change_request_late.sql).
--
-- Executes the INSTALLED functions as the entry's owner. Run with
-- psql -X -v ON_ERROR_STOP=1 against a migrated local database; every fixture
-- rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_2175_class_change_late_test.sql
--
-- Trials run in UTC. Trial 5 starts 10 minutes from now (written 24-hour), trial 6
-- the same moment written '9:41 PM' style, trial 7 the same time tomorrow, trial 8
-- next week, trial 9 has start text that cannot be read.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000002175001', 'MYK9-2175 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000002175002', 'MYK9-2175 Show', 'AKC',
  current_date - 1, current_date + 7, '00000000-0000-0000-0000-000002175001', 'published');

-- Source trial 4; target trials 5 to 9 (see the header).
insert into public.trials (id, show_id, name, date, registry_id, timezone, planned_start_time)
select ('00000000-0000-0000-0000-00000217500' || n)::uuid,
  '00000000-0000-0000-0000-000002175002', 'MYK9-2175 Trial ' || n,
  case n when 8 then (now() at time zone 'UTC')::date + 6
    when 7 then (now() at time zone 'UTC')::date + 1
    else (now() at time zone 'UTC')::date end,
  'AKC', 'UTC',
  case n
    when 5 then to_char((now() at time zone 'UTC') + interval '10 minutes', 'HH24:MI')
    when 6 then to_char((now() at time zone 'UTC') + interval '10 minutes', 'FMHH12:MI AM')
    when 7 then to_char(now() at time zone 'UTC', 'HH24:MI')
    when 8 then '9:00 AM'
    when 9 then 'TBD'
    else null end
from generate_series(4, 9) n;

-- Class 11 is where the dogs are; 15..19 are the targets, one per trial 5..9.
insert into public.classes (id, trial_id, name, status, max_entries)
select ('00000000-0000-0000-0000-0000021750' || (10 + n))::uuid,
  ('00000000-0000-0000-0000-00000217500' || n)::uuid,
  'Target ' || n, 'upcoming', 10
from generate_series(4, 9) n;

insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000002175101', 'MYK9-2175', 'Owner',
  '00000000-0000-0000-0000-000002175201');

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-0000021753' || n)::uuid, 'MYK9-2175 Dog ' || n, 'Dog' || n,
  'Beagle', '00000000-0000-0000-0000-000002175101'
from generate_series(21, 25) n;

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000021753' || n)::uuid, 'AKC (American Kennel Club)', 'SR2175' || n, true
from generate_series(21, 25) n;

-- Entries 31..35 sit in class 14 (trial 4), one dog each.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, is_scored)
select ('00000000-0000-0000-0000-0000021750' || (n + 10))::uuid,
  ('00000000-0000-0000-0000-0000021753' || n)::uuid,
  '00000000-0000-0000-0000-000002175014', '00000000-0000-0000-0000-000002175002',
  '00000000-0000-0000-0000-000002175004', '00000000-0000-0000-0000-000002175101',
  'confirmed', 'pending', 25, 'no-status', false
from generate_series(21, 25) n;

create function pg_temp.as_owner(call_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002175201', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000002175201', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute call_sql;
  reset role;
exception when others then
  reset role;
  raise;
end;
$$;

create function pg_temp.ask(label text, entry uuid, target uuid, want_late boolean)
returns void language plpgsql as $$
declare
  r record;
begin
  perform pg_temp.as_owner(format(
    'select public.request_own_entry_class_change(%L, %L, %L)', entry, target, 'finished_level'));
  select e.entry_status, e.class_change_target_class_id, e.class_change_is_late
    into r from public.entries e where e.id = entry;
  if r.entry_status is distinct from 'move-up-requested'
     or r.class_change_target_class_id is distinct from target then
    raise exception 'FAIL %: request not recorded (% / %)', label, r.entry_status, r.class_change_target_class_id;
  end if;
  if r.class_change_is_late is distinct from want_late then
    raise exception 'FAIL %: class_change_is_late is %, wanted %', label, r.class_change_is_late, want_late;
  end if;
  raise notice 'PASS %', label;
end;
$$;

select pg_temp.ask('24-hour start 10 minutes away is recorded late, not refused',
  '00000000-0000-0000-0000-000002175031', '00000000-0000-0000-0000-000002175015', true);

-- Taking it back clears the flag with the rest of the request.
select pg_temp.as_owner(
  'select public.cancel_own_entry_class_change(''00000000-0000-0000-0000-000002175031'')');
do $$
declare
  late boolean;
  st text;
begin
  select e.class_change_is_late, e.entry_status into late, st
    from public.entries e where e.id = '00000000-0000-0000-0000-000002175031';
  if late is not null or st <> 'confirmed' then
    raise exception 'FAIL take-back: is_late % status %', late, st;
  end if;
  raise notice 'PASS take-back clears the late flag';
end;
$$;

-- The same entry asks again, this time well ahead: recorded as not late.
select pg_temp.ask('a start a day away is not late',
  '00000000-0000-0000-0000-000002175031', '00000000-0000-0000-0000-000002175017', false);

select pg_temp.ask('12-hour "H:MM PM" start 10 minutes away is late',
  '00000000-0000-0000-0000-000002175032', '00000000-0000-0000-0000-000002175016', true);

select pg_temp.ask('a trial next week is not late',
  '00000000-0000-0000-0000-000002175033', '00000000-0000-0000-0000-000002175018', false);

select pg_temp.ask('start text that cannot be read is not late and not refused',
  '00000000-0000-0000-0000-000002175034', '00000000-0000-0000-0000-000002175019', false);

-- A request made before this migration (flag NULL) still reads as unknown.
do $$
begin
  if exists (select 1 from public.entries
              where id = '00000000-0000-0000-0000-000002175035'
                and class_change_is_late is not null) then
    raise exception 'FAIL: an entry with no request has a late flag';
  end if;
  raise notice 'PASS an entry with no request has no late flag';
end;
$$;

rollback;
