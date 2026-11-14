-- MYK9-1929 phase 1: behavioral test for public.request_own_entry_class_change
-- and public.cancel_own_entry_class_change
-- (20261114201300_myk9_1929_class_change_request_rpcs.sql).
--
-- Executes the INSTALLED functions as each caller tier (never a source-string
-- contract). Run with psql -X -v ON_ERROR_STOP=1 against a migrated local
-- database; every fixture rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1929_class_change_request_test.sql
--
-- Covers: own entry only, a full class, a full judge day, a started class, a dog
-- already in the target class, a finished show, a pulled or in-ring source entry,
-- a stale version on the request and on the take-back, the show's switch (off
-- after entries close, irrelevant before), taking the request back, the retired
-- underscore spelling of the status, and that a waiting request keeps holding its seat in its class and
-- judge day (20261114201700): nobody else can take it, and the take-back never
-- leaves the class or the day over its limit.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001929001', 'MYK9-1929 Club');

-- The show is mid-future, entries open. Cases that need entries closed or the
-- switch off update this row, and the whole file rolls back.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
  entry_close_date)
values ('00000000-0000-0000-0000-000001929002', 'MYK9-1929 Show', 'AKC',
  current_date + 7, current_date + 7, '00000000-0000-0000-0000-000001929001', 'published',
  now() + interval '3 days');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001929003', 'MYK9-1929 Other Show', 'AKC',
  current_date + 7, current_date + 7, '00000000-0000-0000-0000-000001929001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929002',
  'MYK9-1929 Trial', current_date + 7, 'AKC'),
  ('00000000-0000-0000-0000-000001929005', '00000000-0000-0000-0000-000001929003',
  'MYK9-1929 Other Trial', current_date + 7, 'AKC');

-- 11 current class, 12 open target, 13 full target (limit 1), 14 started target,
-- 15 cancelled target, 16 other show's class, 17/18/19 homes for the entries
-- that must be refused on their own state.
insert into public.classes (id, trial_id, name, status, max_entries)
values
  ('00000000-0000-0000-0000-000001929011', '00000000-0000-0000-0000-000001929004', 'Container Novice A', 'upcoming', null),
  ('00000000-0000-0000-0000-000001929012', '00000000-0000-0000-0000-000001929004', 'Container Advanced A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929013', '00000000-0000-0000-0000-000001929004', 'Container Excellent A', 'upcoming', 1),
  ('00000000-0000-0000-0000-000001929014', '00000000-0000-0000-0000-000001929004', 'Container Master A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929015', '00000000-0000-0000-0000-000001929004', 'Interior Novice A', 'cancelled', 5),
  ('00000000-0000-0000-0000-000001929016', '00000000-0000-0000-0000-000001929005', 'Container Advanced A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929017', '00000000-0000-0000-0000-000001929004', 'Interior Advanced A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929018', '00000000-0000-0000-0000-000001929004', 'Interior Excellent A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929019', '00000000-0000-0000-0000-000001929004', 'Interior Master A', 'upcoming', 5),
  -- 20 target whose judge's day is full, 21 / 22 homes of the pulled and in-ring
  -- entries, 23 a class at its limit (2 of 2) that its own entry asks to leave.
  ('00000000-0000-0000-0000-000001929020', '00000000-0000-0000-0000-000001929004', 'Exterior Novice A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929021', '00000000-0000-0000-0000-000001929004', 'Buried Novice A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929022', '00000000-0000-0000-0000-000001929004', 'Buried Advanced A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929023', '00000000-0000-0000-0000-000001929004', 'Exterior Advanced A', 'upcoming', 2);

-- Classes 20 and 23 take no wait list, so a refused entry there is 'denied' and
-- writes nothing.
update public.classes set allow_waitlist = false
 where id in ('00000000-0000-0000-0000-000001929020', '00000000-0000-0000-0000-000001929023');

-- Persons 1 owner, 2 co-owner, 3 handler, 4 outsider, 5 club secretary (not an
-- owner of anything), 6 owner of the dogs that fill the full and started classes.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000192910' || n)::uuid, 'MYK9-1929', 'Person ' || n,
  ('00000000-0000-0000-0000-00000192920' || n)::uuid
from generate_series(1, 6) n;

-- A one-dog judge day on class 20 (person 4 judges it).
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, day_capacity_override)
values ('00000000-0000-0000-0000-000001929104', '00000000-0000-0000-0000-000001929002',
  '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929020', 'confirmed', 1);

-- Dogs: 21 main (owner 1, co-owner 2), 22 fills the full class, 23 runs in the
-- started class, 24 / 25 / 26 sit in states that must refuse a request.
insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
select ('00000000-0000-0000-0000-0000019293' || n)::uuid, 'MYK9-1929 Dog ' || n, 'Dog' || n, 'Beagle',
  case when n in (21, 24, 25, 26) then '00000000-0000-0000-0000-000001929101'::uuid
       else '00000000-0000-0000-0000-000001929106'::uuid end,
  case when n = 21 then '00000000-0000-0000-0000-000001929102'::uuid else null end
from generate_series(21, 26) n;

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000019293' || n)::uuid, 'AKC (American Kennel Club)', 'SR19' || n, true
from generate_series(21, 26) n;

-- 31 the entry that asks; 32 fills the full class; 33 is scored in the started
-- class; 34 not yet accepted; 35 checked in; 36 already scored itself; 37 pulled;
-- 38 in the ring; 39 fills class 20's judge day; 40 and 41 fill class 23 (2 of 2);
-- 42 is dog 21 already entered in class 17; 44 is the unscored second entry in class 14.
-- Handler of 31 is person 3.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, is_scored)
values
  ('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929321', '00000000-0000-0000-0000-000001929011',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929103',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929032', '00000000-0000-0000-0000-000001929322', '00000000-0000-0000-0000-000001929013',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929106',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929033', '00000000-0000-0000-0000-000001929323', '00000000-0000-0000-0000-000001929014',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929106',
   'confirmed', 'pending', 25, 'no-status', true),
  ('00000000-0000-0000-0000-000001929034', '00000000-0000-0000-0000-000001929324', '00000000-0000-0000-0000-000001929017',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'submitted', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929035', '00000000-0000-0000-0000-000001929325', '00000000-0000-0000-0000-000001929018',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'checked-in', false),
  ('00000000-0000-0000-0000-000001929036', '00000000-0000-0000-0000-000001929326', '00000000-0000-0000-0000-000001929019',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'no-status', true),
  ('00000000-0000-0000-0000-000001929037', '00000000-0000-0000-0000-000001929324', '00000000-0000-0000-0000-000001929021',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'pulled', false),
  ('00000000-0000-0000-0000-000001929038', '00000000-0000-0000-0000-000001929325', '00000000-0000-0000-0000-000001929022',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929039', '00000000-0000-0000-0000-000001929322', '00000000-0000-0000-0000-000001929020',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929106',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929040', '00000000-0000-0000-0000-000001929323', '00000000-0000-0000-0000-000001929023',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929106',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929041', '00000000-0000-0000-0000-000001929322', '00000000-0000-0000-0000-000001929023',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929106',
   'confirmed', 'pending', 25, 'no-status', false),
  ('00000000-0000-0000-0000-000001929042', '00000000-0000-0000-0000-000001929321', '00000000-0000-0000-0000-000001929017',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'no-status', false),
  -- 44 keeps class 14 at 1 of 2 scored: with 33 as its only entry the scoring
  -- trigger completes the class (derived status), and the fixture would read as
  -- finished, not started.
  ('00000000-0000-0000-0000-000001929044', '00000000-0000-0000-0000-000001929321', '00000000-0000-0000-0000-000001929014',
   '00000000-0000-0000-0000-000001929002', '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
   'confirmed', 'pending', 25, 'no-status', false);

-- The in-ring flag is set apart from the insert so the row is otherwise ordinary.
update public.entries set is_in_ring = true
 where id = '00000000-0000-0000-0000-000001929038';

-- Club-scoped secretary appointment (a show-scoped row grants nothing).
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001929105', id,
  '00000000-0000-0000-0000-000001929001', true,
  '00000000-0000-0000-0000-000001929205'
from public.roles where name = 'secretary';

-- Run one of the two functions as `caller` and compare its outcome. A denied
-- call must leave every entry of the show exactly as it was.
create function pg_temp.call_as(
  label text,
  caller text,
  call_sql text,
  expected_error text default null,
  caller_role text default 'authenticated'
) returns void language plpgsql as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  actual_error text;
  actual_state text;
begin
  select jsonb_object_agg(id::text, to_jsonb(e)) into before_rows
    from public.entries e where e.show_id = '00000000-0000-0000-0000-000001929002';

  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', caller_role)::text, true);
  perform set_config('role', caller_role, true);
  begin
    execute call_sql;
  exception when others then
    actual_error := sqlerrm;
    actual_state := sqlstate;
  end;
  reset role;

  if expected_error is null and actual_error is not null then
    raise exception 'FAIL %: unexpected SQLSTATE %: %', label, actual_state, actual_error;
  end if;

  if expected_error is not null then
    if actual_error is null or actual_error not like expected_error then
      raise exception 'FAIL %: expected %, got SQLSTATE %: %',
        label, expected_error, actual_state, actual_error;
    end if;
    select jsonb_object_agg(id::text, to_jsonb(e)) into after_rows
      from public.entries e where e.show_id = '00000000-0000-0000-0000-000001929002';
    if after_rows is distinct from before_rows then
      raise exception 'FAIL %: denied call changed persisted entry data', label;
    end if;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function pg_temp.ask_sql(entry uuid, target uuid, reason text) returns text
language sql as $$
  select format('select public.request_own_entry_class_change(%L, %L, %L)', entry, target, reason)
$$;

create function pg_temp.take_back_sql(entry uuid) returns text
language sql as $$
  select format('select public.cancel_own_entry_class_change(%L)', entry)
$$;

create function pg_temp.assert_request_state(label text, entry uuid, want_status text,
  want_target uuid, want_reason text) returns void language plpgsql as $$
declare
  r record;
begin
  select e.entry_status, e.move_up_requested, e.class_id, e.class_change_target_class_id,
         e.class_change_reason, e.class_change_requested_at
    into r from public.entries e where e.id = entry;
  if r.entry_status is distinct from want_status then
    raise exception 'FAIL %: entry_status is %, wanted %', label, r.entry_status, want_status;
  end if;
  if r.class_change_target_class_id is distinct from want_target
     or r.class_change_reason is distinct from want_reason then
    raise exception 'FAIL %: target/reason are %/%, wanted %/%', label,
      r.class_change_target_class_id, r.class_change_reason, want_target, want_reason;
  end if;
  if want_target is not null and (r.class_change_requested_at is null
       or r.class_change_requested_at < now() - interval '1 minute'
       or r.move_up_requested is not true) then
    raise exception 'FAIL %: time not recorded or move_up_requested not set', label;
  end if;
  if want_target is null and (r.class_change_requested_at is not null
       or r.move_up_requested is true) then
    raise exception 'FAIL %: request columns not cleared', label;
  end if;
  if r.class_id is distinct from '00000000-0000-0000-0000-000001929011'::uuid
     and entry = '00000000-0000-0000-0000-000001929031' then
    raise exception 'FAIL %: the request moved the entry out of its class', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- ---- Own entry only -------------------------------------------------------
select pg_temp.call_as('outsider is refused',
  '00000000-0000-0000-0000-000001929204',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Not authorized to request a class change for entry %');
select pg_temp.call_as('secretary who is not the owner is refused',
  '00000000-0000-0000-0000-000001929205',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Not authorized to request a class change for entry %');
select pg_temp.call_as('caller with no person row is refused',
  '00000000-0000-0000-0000-000001929299',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Not authorized to request a class change for entry %');
select pg_temp.call_as('anon has no EXECUTE', null,
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'permission denied for function request_own_entry_class_change', 'anon');
select pg_temp.call_as('unknown entry',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929099', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % not found');

-- ---- The request itself ---------------------------------------------------
select pg_temp.call_as('reason must be one of the three',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'because'),
  'request_own_entry_class_change: p_reason must be %');
select pg_temp.call_as('target must be in the same show',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929016', 'finished_level'),
  'An entry can only ask for a class in its own show.');
select pg_temp.call_as('target cannot be the class the dog is in',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929011', 'wrong_section'),
  'That entry is already in this class.');
select pg_temp.call_as('cannot ask into a full class',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929013', 'finished_level'),
  'That class is full.');
select pg_temp.call_as('cannot ask into a started class',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929014', 'finished_level'),
  'That class has already started %');
select pg_temp.call_as('cannot ask into a cancelled class',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929015', 'finished_level'),
  'That class is finished or cancelled %');
select pg_temp.call_as('an entry not yet accepted cannot ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929034', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % cannot ask for a class change from status %');
select pg_temp.call_as('a checked-in entry cannot ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929035', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % has already started at the show %');
select pg_temp.call_as('a scored entry cannot ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929036', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % has already started at the show %');

select pg_temp.call_as('a pulled entry cannot ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929037', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % has already started at the show %');
select pg_temp.call_as('an entry in the ring cannot ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929038', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % has already started at the show %');
select pg_temp.call_as('a dog already in the target class cannot ask for it',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929017', 'wrong_level'),
  'This dog is already entered in that class.');
select pg_temp.call_as('cannot ask into a class whose judge day is full',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929020', 'wrong_level'),
  'That class is full.');
select pg_temp.call_as('a stale version on the request is a conflict',
  '00000000-0000-0000-0000-000001929201',
  format('select public.request_own_entry_class_change(%L, %L, %L, %s)',
    '00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'wrong_level', -1),
  'Version conflict requesting a class change for entry %');

-- A finished show takes no more requests (MK006, same as withdraw_own_entry).
update public.shows set status = 'completed'
 where id = '00000000-0000-0000-0000-000001929002';
select pg_temp.call_as('a finished show refuses the request',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'Entry % cannot change class: the show has finished');
update public.shows set status = 'published'
 where id = '00000000-0000-0000-0000-000001929002';

-- ---- The show's switch ----------------------------------------------------
-- Switch off but entries still open: the switch does not apply yet.
update public.shows set allow_class_changes_after_close = false
 where id = '00000000-0000-0000-0000-000001929002';
select pg_temp.call_as('switch off, entries open: owner can ask',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'));
select pg_temp.assert_request_state('switch off, entries open: request recorded',
  '00000000-0000-0000-0000-000001929031', 'move-up-requested',
  '00000000-0000-0000-0000-000001929012', 'finished_level');
select pg_temp.call_as('owner takes the request back',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'));
select pg_temp.assert_request_state('take-back restores confirmed and clears the request',
  '00000000-0000-0000-0000-000001929031', 'confirmed', null, null);

-- Entries closed and the switch off: refused. Closed with the switch on: allowed.
update public.shows set entry_close_date = now() - interval '3 days'
 where id = '00000000-0000-0000-0000-000001929002';
select pg_temp.call_as('switch off, entries closed: refused',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'finished_level'),
  'This show does not take class change requests after entries close.');
update public.shows set allow_class_changes_after_close = true
 where id = '00000000-0000-0000-0000-000001929002';

-- ---- Allowed tiers, each ending in a take-back ----------------------------
select pg_temp.call_as('dog owner asks, entries closed, switch on',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'wrong_level'));
select pg_temp.assert_request_state('dog owner request recorded',
  '00000000-0000-0000-0000-000001929031', 'move-up-requested',
  '00000000-0000-0000-0000-000001929012', 'wrong_level');
select pg_temp.call_as('a second request while one waits is refused',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929017', 'wrong_level'),
  'This entry already has a class change request. %');
select pg_temp.call_as('an outsider cannot take it back',
  '00000000-0000-0000-0000-000001929204',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'),
  'Not authorized to take back the class change request for entry %');
select pg_temp.call_as('the secretary (not the owner) cannot take it back here',
  '00000000-0000-0000-0000-000001929205',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'),
  'Not authorized to take back the class change request for entry %');
select pg_temp.call_as('co-owner takes it back',
  '00000000-0000-0000-0000-000001929202',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'));
select pg_temp.call_as('nothing left to take back',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'),
  'Entry % has no waiting class change request');
select pg_temp.call_as('handler asks',
  '00000000-0000-0000-0000-000001929203',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929031', '00000000-0000-0000-0000-000001929012', 'wrong_section'));
select pg_temp.assert_request_state('handler request recorded',
  '00000000-0000-0000-0000-000001929031', 'move-up-requested',
  '00000000-0000-0000-0000-000001929012', 'wrong_section');

-- Version conflict: a stale token must not overwrite.
select pg_temp.call_as('stale version on take-back is a conflict',
  '00000000-0000-0000-0000-000001929203',
  format('select public.cancel_own_entry_class_change(%L, %s)',
    '00000000-0000-0000-0000-000001929031', -1),
  'Version conflict taking back the class change request for entry %');
select pg_temp.call_as('handler takes it back',
  '00000000-0000-0000-0000-000001929203',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929031'));

-- ---- Only the hyphen spelling exists ---------------------------------------
-- The underscore twin was retired in 20261114201700: the constraint refuses it,
-- on an insert-shaped update as well as any other write.
do $$
declare
  v_state text;
begin
  begin
    update public.entries
       set entry_status = 'move_up_requested'
     where id = '00000000-0000-0000-0000-000001929031';
    raise exception 'FAIL: the underscore spelling was accepted';
  exception when check_violation then
    v_state := sqlstate;
  end;
  raise notice 'PASS the underscore spelling of the request status is refused (%)', v_state;
end;
$$;

-- ---- A waiting request keeps its seat (20261114201700) ---------------------
-- Class 23 is at its limit (2 of 2) and class 20's judge day is at its limit
-- (1 of 1). Their entries ask to leave; nothing has moved, so both must still
-- be full, nobody else can take the seat, and the take-back leaves them at the
-- limit, never over.
create function pg_temp.assert_full(label text, class_ids uuid[], want_count integer,
  want_judge_day_full boolean) returns void language plpgsql as $$
declare
  r record;
begin
  for r in select * from public.class_entry_availability(class_ids, null, false) loop
    if r.entry_count is distinct from want_count then
      raise exception 'FAIL %: class % counts %, wanted %', label, r.class_id, r.entry_count, want_count;
    end if;
    if want_judge_day_full then
      if r.judge_day_full is not true then
        raise exception 'FAIL %: class % judge day is not full', label, r.class_id;
      end if;
    elsif r.class_full is not true then
      raise exception 'FAIL %: class % is not full', label, r.class_id;
    end if;
  end loop;
  raise notice 'PASS %', label;
end;
$$;

create function pg_temp.assert_seat_not_available(label text, class_id uuid) returns void
language plpgsql as $$
declare
  v_outcome text;
begin
  select outcome into v_outcome from public.evaluate_entry_capacity(
    class_id, '00000000-0000-0000-0000-000001929324', null,
    '00000000-0000-0000-0000-000001929101', 'show_desk', false);
  if v_outcome = 'available' then
    raise exception 'FAIL %: another entry was offered the seat the request still holds', label;
  end if;
  raise notice 'PASS % (%)', label, v_outcome;
end;
$$;

select pg_temp.assert_full('class 23 is full before the request',
  array['00000000-0000-0000-0000-000001929023']::uuid[], 2, false);
select pg_temp.call_as('an entry in a full class asks to leave it',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929040', '00000000-0000-0000-0000-000001929012', 'wrong_level'));
select pg_temp.assert_full('class 23 is still full while the request waits',
  array['00000000-0000-0000-0000-000001929023']::uuid[], 2, false);
select pg_temp.assert_seat_not_available('another entry cannot take the requested seat',
  '00000000-0000-0000-0000-000001929023');
select pg_temp.call_as('the exhibitor takes the request back',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929040'));
select pg_temp.assert_full('class 23 is at its limit after the take-back, never over',
  array['00000000-0000-0000-0000-000001929023']::uuid[], 2, false);

select pg_temp.call_as('an entry on a full judge day asks to leave its class',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929039', '00000000-0000-0000-0000-000001929012', 'wrong_section'));
select pg_temp.assert_full('the judge day is still full while the request waits',
  array['00000000-0000-0000-0000-000001929020']::uuid[], 1, true);
select pg_temp.assert_seat_not_available('another entry cannot take the judge day seat',
  '00000000-0000-0000-0000-000001929020');
select pg_temp.call_as('the exhibitor takes the judge day request back',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929039'));
select pg_temp.assert_full('the judge day is at its limit after the take-back, never over',
  array['00000000-0000-0000-0000-000001929020']::uuid[], 1, true);

-- ---- A change within one judge day is judged net of the entry -------------
-- Class 20's judge day (judge 4) is full at 1 of 1 and entry 39 is that seat. Class 24
-- is the same judge, same date: moving there adds nobody to the day, so it is
-- accepted. Entry 43 sits under a different judge (class 25); asking for class 20
-- would add a second dog to a full day, so it is still refused.
insert into public.classes (id, trial_id, name, status, max_entries)
values
  ('00000000-0000-0000-0000-000001929024', '00000000-0000-0000-0000-000001929004', 'Exterior Excellent A', 'upcoming', 5),
  ('00000000-0000-0000-0000-000001929025', '00000000-0000-0000-0000-000001929004', 'Exterior Master A', 'upcoming', 5);
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status)
values
  ('00000000-0000-0000-0000-000001929104', '00000000-0000-0000-0000-000001929002',
   '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929024', 'confirmed'),
  ('00000000-0000-0000-0000-000001929102', '00000000-0000-0000-0000-000001929002',
   '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929025', 'confirmed');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values ('00000000-0000-0000-0000-000001929043', '00000000-0000-0000-0000-000001929325',
  '00000000-0000-0000-0000-000001929025', '00000000-0000-0000-0000-000001929002',
  '00000000-0000-0000-0000-000001929004', '00000000-0000-0000-0000-000001929101',
  'confirmed', 'pending', 25, 'no-status');

select pg_temp.call_as('a different judge day that is full still refuses the request',
  '00000000-0000-0000-0000-000001929201',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929043', '00000000-0000-0000-0000-000001929020', 'wrong_level'),
  'That class is full.');
select pg_temp.call_as('the same judge day, exactly full, accepts a change inside it',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.ask_sql('00000000-0000-0000-0000-000001929039', '00000000-0000-0000-0000-000001929024', 'wrong_section'));
select pg_temp.assert_request_state('the same-judge-day request is recorded',
  '00000000-0000-0000-0000-000001929039', 'move-up-requested',
  '00000000-0000-0000-0000-000001929024', 'wrong_section');
select pg_temp.call_as('the exhibitor takes the same-judge-day request back',
  '00000000-0000-0000-0000-000001929206',
  pg_temp.take_back_sql('00000000-0000-0000-0000-000001929039'));

-- Installed ACL: authenticated only, never anon or PUBLIC.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.request_own_entry_class_change(uuid, uuid, text, integer)',
    'public.cancel_own_entry_class_change(uuid, integer)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'FAIL: anon can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'FAIL: authenticated cannot execute %', fn;
    end if;
  end loop;
  raise notice 'PASS function grants are authenticated only';
end;
$$;

rollback;
