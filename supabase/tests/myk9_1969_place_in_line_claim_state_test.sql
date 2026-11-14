-- MYK9-1969 (part 1 of MYK9-1943): claim_state on get_my_entry_queue_places and
-- show_dogs_limited_view.run_claim_state.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; the fixture rolls
-- back. A clean run prints PASS notices.
--
--   A. REPRO: an in-progress phone class with no activity for 30 minutes still returns
--      its place (the pre-MYK9-1969 behaviour) AND now says stale. On main's definitions
--      the function has no claim_state, so the place is all the caller gets and it is
--      shown as live for ever.
--   B. paper: classes.scores_on_paper = true, the show switch off, and ring_phase
--      offline_scoring each give 'paper'; an explicit false on a switched-off show wins.
--      A paper class still returns the position, with 'paper' (never a count of dogs ahead).
--   C. the 10-minute rule: live before the limit, stale past it, upcoming class never
--      stale, live again on the next score and on the next in-ring mark.
--   D. show_dogs_limited_view carries the same claim_state.
--   E. ACL unchanged: anon and PUBLIC cannot execute, authenticated can; the internal
--      function and the activity table stay closed.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001969001', 'MYK9-1969 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001969002', 'MYK9-1969 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001969001', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001969003', '00000000-0000-0000-0000-000001969002',
   'MYK9-1969 Trial', current_date, 'AKC');

-- Classes: P phone in progress, N paper-flagged in progress, O offline_scoring phase,
-- U phone upcoming, X explicit false (used after the show switch is turned off).
insert into public.classes (id, trial_id, name, status, ring_phase, scores_on_paper) values
  ('00000000-0000-0000-0000-0000019690a0', '00000000-0000-0000-0000-000001969003', 'Phone', 'in_progress', null, null),
  ('00000000-0000-0000-0000-0000019690b0', '00000000-0000-0000-0000-000001969003', 'Paper flag', 'in_progress', null, true),
  ('00000000-0000-0000-0000-0000019690c0', '00000000-0000-0000-0000-000001969003', 'Offline phase', 'in_progress', 'offline_scoring', null),
  ('00000000-0000-0000-0000-0000019690d0', '00000000-0000-0000-0000-000001969003', 'Upcoming', 'upcoming', null, null),
  ('00000000-0000-0000-0000-0000019690e0', '00000000-0000-0000-0000-000001969003', 'Explicit phone', 'in_progress', null, false);

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001969011', 'MYK9-1969', 'Owner', '00000000-0000-0000-0000-000001969101');

create function pg_temp.fx_id(k text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' ||
    lpad(to_hex(('x' || substr(md5(k), 1, 8))::bit(32)::bigint), 12, '0'))::uuid
$$;

-- Two waiting dogs per class (run order 1 and 2), all owned by the caller.
create temp table fx as
select c.cls, n, pg_temp.fx_id('e-' || c.cls || n) as entry_id, c.class_id
from (values ('P', '00000000-0000-0000-0000-0000019690a0'::uuid),
             ('N', '00000000-0000-0000-0000-0000019690b0'::uuid),
             ('O', '00000000-0000-0000-0000-0000019690c0'::uuid),
             ('U', '00000000-0000-0000-0000-0000019690d0'::uuid),
             ('X', '00000000-0000-0000-0000-0000019690e0'::uuid)) c(cls, class_id)
cross join generate_series(1, 2) n;

insert into public.dogs (id, name, call_name, breed, owner_id)
select pg_temp.fx_id('d-' || cls || n), 'MYK9-1969 ' || cls || n, cls || n, 'Beagle',
  '00000000-0000-0000-0000-000001969011' from fx;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select pg_temp.fx_id('d-' || cls || n), 'AKC (American Kennel Club)', 'SR1969' || cls || n, true from fx;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status,
  entry_fee, armband, run_order, check_in_status)
select entry_id, pg_temp.fx_id('d-' || cls || n), class_id,
  '00000000-0000-0000-0000-000001969002', '00000000-0000-0000-0000-000001969003',
  'confirmed', 'pending', 25, (100 + ascii(cls) + n)::text, n, 'checked-in' from fx;

-- Nothing has been scored or put in the ring in any class yet; age the classes' last
-- change to 30 minutes ago so "no activity" is a real 30 minutes.
update public.classes set updated_at = now() - interval '30 minutes'
 where trial_id = '00000000-0000-0000-0000-000001969003';
delete from private.class_ring_activity
 where class_id in (select class_id from fx);

create function pg_temp.state_as(cls_name text, n integer)
returns text language plpgsql as $$
declare
  r record;
  v_id uuid := (select entry_id from fx where cls = cls_name and fx.n = state_as.n);
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001969101', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000001969101', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select p.place, p.claim_state into r from public.get_my_entry_queue_places(array[v_id]) p;
  reset role;
  return coalesce(r.place::text, 'null') || '/' || coalesce(r.claim_state, 'null');
exception when others then
  reset role;
  raise;
end;
$$;

-- A. REPRO: phone class, in progress, 30 minutes of silence. The place is still there.
do $$
begin
  if pg_temp.state_as('P', 1) is distinct from '1/stale' then
    raise exception 'FAIL A expected the place to survive with claim stale, got %', pg_temp.state_as('P', 1);
  end if;
  if pg_temp.state_as('P', 2) is distinct from '2/stale' then
    raise exception 'FAIL A second dog: %', pg_temp.state_as('P', 2);
  end if;
  raise notice 'PASS A silent phone class keeps its place and is stale';
end $$;

-- B. paper
do $$
begin
  if pg_temp.state_as('N', 2) is distinct from '2/paper' then
    raise exception 'FAIL B scores_on_paper flag: %', pg_temp.state_as('N', 2);
  end if;
  if pg_temp.state_as('O', 2) is distinct from '2/paper' then
    raise exception 'FAIL B offline_scoring phase: %', pg_temp.state_as('O', 2);
  end if;
  if pg_temp.state_as('X', 1) is distinct from '1/stale' then
    raise exception 'FAIL B explicit false on a device show: %', pg_temp.state_as('X', 1);
  end if;
  -- the show switch: off => every class without an explicit value is paper
  update public.shows set uses_device_scoring = false where id = '00000000-0000-0000-0000-000001969002';
  if pg_temp.state_as('P', 1) is distinct from '1/paper' then
    raise exception 'FAIL B show switch off: %', pg_temp.state_as('P', 1);
  end if;
  if pg_temp.state_as('U', 1) is distinct from '1/paper' then
    raise exception 'FAIL B show switch off, upcoming class: %', pg_temp.state_as('U', 1);
  end if;
  if pg_temp.state_as('X', 1) is distinct from '1/stale' then
    raise exception 'FAIL B explicit false must beat the switch: %', pg_temp.state_as('X', 1);
  end if;
  update public.shows set uses_device_scoring = true where id = '00000000-0000-0000-0000-000001969002';
  if pg_temp.state_as('P', 1) is distinct from '1/stale' then
    raise exception 'FAIL B switch back on: %', pg_temp.state_as('P', 1);
  end if;
  raise notice 'PASS B paper: flag, offline_scoring phase, show switch, explicit false';
end $$;

-- C. the 10-minute rule
do $$
declare
  v_class uuid := '00000000-0000-0000-0000-0000019690a0';
begin
  -- 9 minutes of silence: live
  insert into private.class_ring_activity (class_id, last_activity_at)
  values (v_class, now() - interval '9 minutes')
  on conflict (class_id) do update set last_activity_at = excluded.last_activity_at;
  if pg_temp.state_as('P', 1) is distinct from '1/live' then
    raise exception 'FAIL C 9 minutes should be live: %', pg_temp.state_as('P', 1);
  end if;
  -- 11 minutes: stale
  update private.class_ring_activity set last_activity_at = now() - interval '11 minutes'
   where class_id = v_class;
  if pg_temp.state_as('P', 1) is distinct from '1/stale' then
    raise exception 'FAIL C 11 minutes should be stale: %', pg_temp.state_as('P', 1);
  end if;
  -- an upcoming class is never stale
  if pg_temp.state_as('U', 1) is distinct from '1/live' then
    raise exception 'FAIL C upcoming class: %', pg_temp.state_as('U', 1);
  end if;
  -- next score: back to live (the scored dog leaves the queue, the other moves up)
  update public.entries set is_scored = true, result_status = 'qualified'
   where id = (select entry_id from fx where cls = 'P' and n = 1);
  if pg_temp.state_as('P', 2) is distinct from '1/live' then
    raise exception 'FAIL C next score should make it live: %', pg_temp.state_as('P', 2);
  end if;
  -- age it again, then the next in-ring mark: live again
  update private.class_ring_activity set last_activity_at = now() - interval '11 minutes'
   where class_id = v_class;
  if pg_temp.state_as('P', 2) is distinct from '1/stale' then
    raise exception 'FAIL C re-aged should be stale: %', pg_temp.state_as('P', 2);
  end if;
  update public.entries set is_in_ring = true
   where id = (select entry_id from fx where cls = 'P' and n = 2);
  -- the in-ring dog is no longer waiting; another dog proves the class is live
  insert into public.dogs (id, name, call_name, breed, owner_id)
  values (pg_temp.fx_id('d-P3'), 'MYK9-1969 P3', 'P3', 'Beagle', '00000000-0000-0000-0000-000001969011');
  insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
  values (pg_temp.fx_id('d-P3'), 'AKC (American Kennel Club)', 'SR1969P3', true);
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status,
    entry_fee, armband, run_order, check_in_status)
  values (pg_temp.fx_id('e-P3'), pg_temp.fx_id('d-P3'), v_class,
    '00000000-0000-0000-0000-000001969002', '00000000-0000-0000-0000-000001969003',
    'confirmed', 'pending', 25, '999', 3, 'checked-in');
  insert into fx values ('P', 3, pg_temp.fx_id('e-P3'), v_class);
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL C in-ring mark should make it live: %', pg_temp.state_as('P', 3);
  end if;
  raise notice 'PASS C 10-minute rule: live at 9, stale at 11, live on score and in-ring';
end $$;

-- D. the run-position view carries the same state
do $$
declare
  v_states text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001969101', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000001969101', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select string_agg(distinct v.class_name || '=' || coalesce(v.run_claim_state, 'null'), ',' order by
      v.class_name || '=' || coalesce(v.run_claim_state, 'null'))
    into v_states
    from public.show_dogs_limited_view('00000000-0000-0000-0000-000001969002') v
   where v.class_name in ('Paper flag', 'Explicit phone', 'Upcoming');
  reset role;
  if v_states is distinct from 'Explicit phone=stale,Paper flag=paper,Upcoming=live' then
    raise exception 'FAIL D view claim states: %', v_states;
  end if;
  raise notice 'PASS D show_dogs_limited_view run_claim_state';
end $$;

-- E. ACL
do $$
begin
  if has_function_privilege('anon', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE')
     or has_function_privilege('public', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE') then
    raise exception 'FAIL E get_my_entry_queue_places ACL';
  end if;
  if has_function_privilege('anon', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE')
     or has_function_privilege('public', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.show_dogs_limited_view(uuid, integer, integer)', 'EXECUTE') then
    raise exception 'FAIL E show_dogs_limited_view ACL';
  end if;
  if has_function_privilege('anon', 'public.entry_queue_places_for_classes(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.entry_queue_places_for_classes(uuid[])', 'EXECUTE') then
    raise exception 'FAIL E internal function must stay closed';
  end if;
  if has_table_privilege('anon', 'private.class_ring_activity', 'SELECT')
     or has_table_privilege('authenticated', 'private.class_ring_activity', 'SELECT') then
    raise exception 'FAIL E activity table must stay closed';
  end if;
  raise notice 'PASS E ACL unchanged';
end $$;

rollback;
