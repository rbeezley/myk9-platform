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
--   F. silent class still getting check-ins goes stale (classes.updated_at is not the clock);
--      a reopened class with an old activity row is live right after its start; break and
--      briefing never read stale; coming back from a break is not instantly stale.
--   G. scores_on_paper is the one source: offline_scoring sets it, break/briefing keep it,
--      only an explicit write clears it; a reopen records activity (fresh, not stale).
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
-- status_source 'manual': otherwise inserting entries re-derives each class back to 'upcoming'.
insert into public.classes (id, trial_id, name, status, ring_phase, scores_on_paper, status_source) values
  ('00000000-0000-0000-0000-0000019690a0', '00000000-0000-0000-0000-000001969003', 'Phone', 'in_progress', null, null, 'manual'),
  ('00000000-0000-0000-0000-0000019690b0', '00000000-0000-0000-0000-000001969003', 'Paper flag', 'in_progress', null, true, 'manual'),
  ('00000000-0000-0000-0000-0000019690c0', '00000000-0000-0000-0000-000001969003', 'Offline phase', 'in_progress', 'offline_scoring', null, 'manual'),
  ('00000000-0000-0000-0000-0000019690d0', '00000000-0000-0000-0000-000001969003', 'Upcoming', 'upcoming', null, null, 'manual'),
  ('00000000-0000-0000-0000-0000019690e0', '00000000-0000-0000-0000-000001969003', 'Explicit phone', 'in_progress', null, false, 'manual');

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

-- Nothing has been scored or put in the ring in any class yet: clear any activity rows,
-- then seed 30 minutes ago for the classes that are meant to be silent. (classes.updated_at
-- is forced to now() by a trigger and is not what the rule reads.)
delete from private.class_ring_activity
 where class_id in (select class_id from fx);
insert into private.class_ring_activity (class_id, last_activity_at)
select distinct class_id, now() - interval '30 minutes' from fx where cls <> 'U';
-- Something may stamp actual_start_time when a class is created in progress; the quiet
-- clock starts at the later of activity and start, so push the start back too.
update public.classes set actual_start_time = now() - interval '2 hours'
 where id in (select class_id from fx) and status = 'in_progress';

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
    raise exception 'FAIL A expected the place to survive with claim stale, got % (class: %; activity: %; now: %)',
      pg_temp.state_as('P', 1),
      (select to_jsonb(c) - 'description' from public.classes c where c.id = '00000000-0000-0000-0000-0000019690a0'),
      (select last_activity_at from private.class_ring_activity where class_id = '00000000-0000-0000-0000-0000019690a0'),
      now();
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

-- F. the clock: check-ins do not count, a fresh start does, a break does not go stale
do $$
declare
  v_class uuid := '00000000-0000-0000-0000-0000019690a0';
begin
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  update public.classes set actual_start_time = null, ring_phase = null where id = v_class;
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  -- a check-in (bumps classes.updated_at and the counters) leaves it stale
  update public.entries set check_in_status = 'at-gate'
   where id = (select entry_id from fx where cls = 'P' and n = 3);
  update public.classes set checked_in_count = coalesce(checked_in_count, 0) + 1 where id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/stale' then
    raise exception 'FAIL F check-ins only must stay stale: %', pg_temp.state_as('P', 3);
  end if;
  -- reopened/restarted: old activity row, but the class started a minute ago
  update public.classes set actual_start_time = now() - interval '1 minute' where id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL F restart with an old activity row should be live: %', pg_temp.state_as('P', 3);
  end if;
  -- no activity row and no start time: not demonstrably quiet, live
  delete from private.class_ring_activity where class_id = v_class;
  update public.classes set actual_start_time = null where id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL F no clock at all should be live: %', pg_temp.state_as('P', 3);
  end if;
  -- break and briefing past 10 minutes of silence stay live
  insert into private.class_ring_activity (class_id, last_activity_at)
  values (v_class, now() - interval '30 minutes');
  update public.classes set ring_phase = 'break', ring_phase_time = '12:30' where id = v_class;
  -- the phase change itself is activity; age it to prove break never goes stale
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL F break should stay live: %', pg_temp.state_as('P', 3);
  end if;
  update public.classes set ring_phase = 'briefing', ring_phase_time = '13:00' where id = v_class;
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL F briefing should stay live: %', pg_temp.state_as('P', 3);
  end if;
  -- back from the break: the phase change restarts the clock, so not instantly stale
  update public.classes set ring_phase = null, ring_phase_time = null where id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/live' then
    raise exception 'FAIL F back from break must not be instantly stale: %', pg_temp.state_as('P', 3);
  end if;
  -- and it goes stale again after 10 quiet minutes
  update private.class_ring_activity set last_activity_at = now() - interval '11 minutes'
   where class_id = v_class;
  if pg_temp.state_as('P', 3) is distinct from '1/stale' then
    raise exception 'FAIL F should go stale again after the break: %', pg_temp.state_as('P', 3);
  end if;
  raise notice 'PASS F clock: check-ins ignored, restart live, break/briefing live, back from break live';
end $$;

-- G. owner design 2026-11-14: scores_on_paper is the one source of "paper". Offline
-- Scoring sets it (trigger), break/briefing leave it alone, only an explicit write
-- clears it, and a reopen records activity.
do $$
declare
  v_class uuid := '00000000-0000-0000-0000-0000019690d0';
  v_paper boolean;
begin
  update public.classes set status = 'in_progress' where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/live' then
    raise exception 'FAIL G fresh in-progress phone class: %', pg_temp.state_as('U', 1);
  end if;
  -- offline_scoring phase sets paper
  update public.classes set ring_phase = 'offline_scoring' where id = v_class;
  select scores_on_paper into v_paper from public.classes where id = v_class;
  if v_paper is distinct from true then
    raise exception 'FAIL G offline_scoring phase must set scores_on_paper, got %', v_paper;
  end if;
  if pg_temp.state_as('U', 1) is distinct from '1/paper' then
    raise exception 'FAIL G offline_scoring: %', pg_temp.state_as('U', 1);
  end if;
  -- break and briefing after paper keep paper: never live with a countdown
  update public.classes set ring_phase = 'break', ring_phase_time = '12:30' where id = v_class;
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  update public.classes set actual_start_time = now() - interval '2 hours' where id = v_class;
  select scores_on_paper into v_paper from public.classes where id = v_class;
  if v_paper is distinct from true or pg_temp.state_as('U', 1) is distinct from '1/paper' then
    raise exception 'FAIL G break after paper must stay paper: % %', v_paper, pg_temp.state_as('U', 1);
  end if;
  update public.classes set ring_phase = 'briefing', ring_phase_time = '13:00' where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/paper' then
    raise exception 'FAIL G briefing after paper must stay paper: %', pg_temp.state_as('U', 1);
  end if;
  update public.classes set ring_phase = null, ring_phase_time = null where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/paper' then
    raise exception 'FAIL G clearing the phase must not clear paper: %', pg_temp.state_as('U', 1);
  end if;
  -- an explicit write clears it (part 3's switch back to live scoring)
  update public.classes set scores_on_paper = false where id = v_class;
  update private.class_ring_activity set last_activity_at = now() - interval '30 minutes'
   where class_id = v_class;
  update public.classes set actual_start_time = now() - interval '2 hours' where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/stale' then
    raise exception 'FAIL G explicit switch back to live scoring: %', pg_temp.state_as('U', 1);
  end if;
  -- an unrelated update while on the offline phase does not re-set it
  update public.classes set ring_phase = 'offline_scoring' where id = v_class;
  update public.classes set scores_on_paper = false where id = v_class;
  update public.classes set name = 'Upcoming renamed' where id = v_class;
  select scores_on_paper into v_paper from public.classes where id = v_class;
  if v_paper is distinct from false then
    raise exception 'FAIL G unrelated update must not re-set paper, got %', v_paper;
  end if;
  update public.classes set ring_phase = null where id = v_class;
  -- reopen: old start and old activity, then back to in_progress reads fresh, not stale
  update public.classes set status = 'completed',
         actual_start_time = now() - interval '2 hours' where id = v_class;
  update private.class_ring_activity set last_activity_at = now() - interval '90 minutes'
   where class_id = v_class;
  update public.classes set status = 'in_progress' where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/live' then
    raise exception 'FAIL G reopened class must read live, not stale: %', pg_temp.state_as('U', 1);
  end if;
  update private.class_ring_activity set last_activity_at = now() - interval '11 minutes'
   where class_id = v_class;
  update public.classes set actual_start_time = now() - interval '2 hours' where id = v_class;
  if pg_temp.state_as('U', 1) is distinct from '1/stale' then
    raise exception 'FAIL G reopened class goes stale after 10 quiet minutes: %', pg_temp.state_as('U', 1);
  end if;
  raise notice 'PASS G scores_on_paper sticky across phases, explicit clear, reopen fresh';
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
