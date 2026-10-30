-- MYK9-1513: classes.ring_phase / ring_phase_time.
--
-- Sections:
--   A. the CHECKs: a bad phase, a time on offline_scoring and an orphan time (NULL phase)
--      are all refused
--   B. the clear trigger: kept across upcoming, cleared by completed
--   C. refresh_class_scoring_state's reset to upcoming keeps an announced phase
--   D. ringside_update_class accepts ring_phase, ring_phase_time and revised_expected_start,
--      clears the time for a phase that takes none, and refuses a bad phase
--
-- Fixtures roll back.

begin;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001513011', 'Jay', 'Judge', '00000000-0000-0000-0000-000001513101');

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-000001513020', 'MYK9-1513 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001513021', 'MYK9-1513 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001513020', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001513022', '00000000-0000-0000-0000-000001513021',
   'MYK9-1513 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001513023', '00000000-0000-0000-0000-000001513022',
   'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A');
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001513011', '00000000-0000-0000-0000-000001513021',
        '00000000-0000-0000-0000-000001513022', '00000000-0000-0000-0000-000001513023',
        'confirmed', now());

-- A. CHECKs
do $$
begin
  begin
    update public.classes set ring_phase = 'lunch'
     where id = '00000000-0000-0000-0000-000001513023';
    raise exception 'FAIL A an unknown ring_phase was accepted';
  exception when check_violation then
    raise notice 'PASS A an unknown ring_phase is refused';
  end;
  begin
    update public.classes set status = 'in_progress', ring_phase = 'offline_scoring',
           ring_phase_time = '10:00'
     where id = '00000000-0000-0000-0000-000001513023';
    raise exception 'FAIL A a time on offline_scoring was accepted';
  exception when check_violation then
    raise notice 'PASS A a time on offline_scoring is refused';
  end;
  begin
    update public.classes set status = 'in_progress', ring_phase = null, ring_phase_time = '10:00'
     where id = '00000000-0000-0000-0000-000001513023';
    raise exception 'FAIL A an orphan time (NULL phase) was accepted';
  exception when check_violation then
    raise notice 'PASS A an orphan time with a NULL phase is refused';
  end;
end $$;

-- B. trigger
do $$
declare r record;
begin
  update public.classes set status = 'in_progress', ring_phase = 'break', ring_phase_time = '10:30'
   where id = '00000000-0000-0000-0000-000001513023';
  update public.classes set status = 'upcoming'
   where id = '00000000-0000-0000-0000-000001513023';
  select ring_phase, ring_phase_time into r from public.classes
   where id = '00000000-0000-0000-0000-000001513023';
  if r.ring_phase is distinct from 'break' or r.ring_phase_time is distinct from '10:30'::time then
    raise exception 'FAIL B the phase did not survive a move to upcoming: %, %', r.ring_phase, r.ring_phase_time;
  end if;
  raise notice 'PASS B the phase is kept across upcoming';

  update public.classes set status = 'completed'
   where id = '00000000-0000-0000-0000-000001513023';
  select ring_phase, ring_phase_time into r from public.classes
   where id = '00000000-0000-0000-0000-000001513023';
  if r.ring_phase is not null or r.ring_phase_time is not null then
    raise exception 'FAIL B completed left the phase: %, %', r.ring_phase, r.ring_phase_time;
  end if;
  raise notice 'PASS B completed clears the phase and its time';
end $$;

-- C. the server derivation's reset to upcoming keeps an announced phase
do $$
declare r record;
begin
  update public.classes
     set status = 'in_progress', status_source = 'derived',
         ring_phase = 'briefing', ring_phase_time = '09:45'
   where id = '00000000-0000-0000-0000-000001513023';
  perform public.refresh_class_scoring_state('00000000-0000-0000-0000-000001513023');
  select status, ring_phase, ring_phase_time into r from public.classes
   where id = '00000000-0000-0000-0000-000001513023';
  if r.status is distinct from 'upcoming' then
    raise exception 'FAIL C the derivation did not reset the unscored class to upcoming (%)', r.status;
  end if;
  if r.ring_phase is distinct from 'briefing' or r.ring_phase_time is distinct from '09:45'::time then
    raise exception 'FAIL C the derivation erased the phase: %, %', r.ring_phase, r.ring_phase_time;
  end if;
  raise notice 'PASS C refresh_class_scoring_state keeps an announced briefing';
end $$;

-- D. the RPC
create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001513101');

do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001513023',
            jsonb_build_object('status', 'in_progress', 'ring_phase', 'break',
                               'ring_phase_time', '10:30',
                               'revised_expected_start', '2026-11-01T15:00:00Z'), null);
  raise notice 'PASS D the assigned judge set a break phase, its time and the Expected start';

  perform public.ringside_update_class('00000000-0000-0000-0000-000001513023',
            jsonb_build_object('ring_phase', 'offline_scoring', 'ring_phase_time', '10:30'), null);
  raise notice 'PASS D offline_scoring with a time is accepted (the time is cleared)';

  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001513023',
              jsonb_build_object('ring_phase', 'lunch'), null);
    raise exception 'FAIL D an unknown ring_phase was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS D an unknown ring_phase is refused';
  end;

  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001513023',
              jsonb_build_object('revised_expected_start', 'soon'), null);
    raise exception 'FAIL D a non-timestamp Expected start was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS D a non-timestamp Expected start is refused';
  end;
end $$;

reset role;
do $$
declare r record;
begin
  select status, ring_phase, ring_phase_time, revised_expected_start into r
    from public.classes where id = '00000000-0000-0000-0000-000001513023';
  if r.status is distinct from 'in_progress' or r.ring_phase is distinct from 'offline_scoring'
     or r.ring_phase_time is not null
     or r.revised_expected_start is distinct from '2026-11-01T15:00:00Z'::timestamptz then
    raise exception 'FAIL D final row is %, %, %, %', r.status, r.ring_phase, r.ring_phase_time, r.revised_expected_start;
  end if;
  raise notice 'PASS D final row: in_progress, offline_scoring, no time, Expected start kept';
end $$;

rollback;
