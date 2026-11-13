-- MYK9-1863: the server refuses score and check-in writes for a cancelled class.
--
-- Sections:
--   A. a judge passcode cannot score, check in or put in the ring an entry of a
--      cancelled class (23514, hint class_cancelled)
--   B. the partner section of the A/B pair, still running, scores and checks in
--   C. a manager's direct score and check-in writes are refused too
--   D. what takes something away still goes through: a score reset, a check-in
--      reset, a Pull, a withdrawal and a note
--   E. un-cancelling the class re-opens scoring
--
-- Fixtures roll back.

begin;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001863011', 'Mgr', 'Admin', '00000000-0000-0000-0000-000001863101');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001863011', r.id, true, '00000000-0000-0000-0000-000001863101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001863020', 'MYK9-1863 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001863021', 'MYK9-1863 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001863020', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000001863022', '00000000-0000-0000-0000-000001863021',
   'MYK9-1863 Trial', current_date, 'AKC', 'Scent Work');
-- Section A is cancelled below; section B keeps running.
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001863023', '00000000-0000-0000-0000-000001863022',
   'Container Novice A', 'in_progress', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000001863024', '00000000-0000-0000-0000-000001863022',
   'Container Novice B', 'in_progress', 'Container', 'Novice', 'B');
-- MYK9-1950: a judge code belongs to a judge and scores the classes assigned to them. The
-- judge_assignments trigger issues the code; pin its generation so the claims can name it.
insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000001863012', 'Ring', 'Judge');
insert into public.judge_assignments (person_id, show_id, class_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-000001863012', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863023', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001863012', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863024', 'confirmed', now());
update public.show_passcodes set created_at = '2026-11-13T00:00:00Z'
 where show_id = '00000000-0000-0000-0000-000001863021'
   and person_id = '00000000-0000-0000-0000-000001863012';

insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001863031', 'MYK9-1863 One', 'One', 'Beagle'),
  ('00000000-0000-0000-0000-000001863032', 'MYK9-1863 Two', 'Two', 'Beagle'),
  ('00000000-0000-0000-0000-000001863033', 'MYK9-1863 Three', 'Three', 'Beagle'),
  ('00000000-0000-0000-0000-000001863034', 'MYK9-1863 Four', 'Four', 'Beagle');
insert into public.dog_registrations (id, dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000001863081', '00000000-0000-0000-0000-000001863031', 'AKC', 'SR1863001', true),
  ('00000000-0000-0000-0000-000001863082', '00000000-0000-0000-0000-000001863032', 'AKC', 'SR1863002', true),
  ('00000000-0000-0000-0000-000001863083', '00000000-0000-0000-0000-000001863033', 'AKC', 'SR1863003', true),
  ('00000000-0000-0000-0000-000001863084', '00000000-0000-0000-0000-000001863034', 'AKC', 'SR1863004', true);

-- The fixture owner has no caller identity, so the entry trigger is off for the fixture only.
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  -- 41: section A, never scored
  ('00000000-0000-0000-0000-000001863041', '00000000-0000-0000-0000-000001863031',
   '00000000-0000-0000-0000-000001863023', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863022', 'confirmed', '1', 1, 'no-status'),
  -- 42: section A, scored and checked in before the cancel
  ('00000000-0000-0000-0000-000001863042', '00000000-0000-0000-0000-000001863032',
   '00000000-0000-0000-0000-000001863023', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863022', 'confirmed', '2', 2, 'no-status'),
  -- 43: section A, for the withdrawal
  ('00000000-0000-0000-0000-000001863043', '00000000-0000-0000-0000-000001863033',
   '00000000-0000-0000-0000-000001863023', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863022', 'confirmed', '3', 3, 'checked-in'),
  -- 44: section B, still running
  ('00000000-0000-0000-0000-000001863044', '00000000-0000-0000-0000-000001863034',
   '00000000-0000-0000-0000-000001863024', '00000000-0000-0000-0000-000001863021',
   '00000000-0000-0000-0000-000001863022', 'confirmed', '4', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

update public.entries
   set is_scored = true, result_status = 'qualified', search_time_seconds = 22,
       total_faults = 1, check_in_status = 'completed'
 where id = '00000000-0000-0000-0000-000001863042';

-- Show Desk cancels with status_source 'manual' (classStatusMutations), which keeps
-- the scoring-state recompute from re-deriving the status after an entry write.
update public.classes set status = 'cancelled', status_source = 'manual'
 where id = '00000000-0000-0000-0000-000001863023';

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(p_show uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001863199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001863199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', p_role,
             'ringside_person_id', '00000000-0000-0000-0000-000001863012',
             'passcode_generation', '2026-11-13T00:00:00Z'))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(uuid, text) to authenticated;

set local role authenticated;

-- A. judge passcode on the cancelled section
select pg_temp.as_passcode('00000000-0000-0000-0000-000001863021', 'judge');
do $$
declare
  v_payload jsonb;
  v_label text;
  v_entry uuid;
  v_hint text;
begin
  for v_label, v_entry, v_payload in
    select label, coalesce(entry, '00000000-0000-0000-0000-000001863041'::uuid), payload from (values
      ('a score', null::uuid, jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 30)),
      ('a fault-only correction', null::uuid, jsonb_build_object('total_faults', 1)),
      ('an absent', null::uuid, jsonb_build_object('is_scored', true, 'result_status', 'absent')),
      ('a check-in', null::uuid, jsonb_build_object('check_in_status', 'checked-in')),
      ('an in-ring move', null::uuid, jsonb_build_object('check_in_status', 'in-ring')),
      ('an is_in_ring write', null::uuid, jsonb_build_object('is_in_ring', true)),
      ('a reset carrying a score', null::uuid, jsonb_build_object('is_scored', false, 'result_status', 'pending', 'search_time_seconds', 0, 'total_faults', 2)),
      ('a zero-valued correction on a scored entry', '00000000-0000-0000-0000-000001863042'::uuid,
        jsonb_build_object('total_faults', 0)),
      ('completed back to checked-in without a reset', '00000000-0000-0000-0000-000001863042'::uuid,
        jsonb_build_object('check_in_status', 'checked-in'))
    ) as t(label, entry, payload)
  loop
    begin
      perform public.ringside_update_entry(v_entry, v_payload, null);
      raise exception 'FAIL A % was accepted for a cancelled class', v_label;
    exception when check_violation then
      get stacked diagnostics v_hint = pg_exception_hint;
      if sqlerrm <> 'This class is cancelled. Scores and check-ins are closed.'
         or v_hint is distinct from 'class_cancelled' then
        raise exception 'FAIL A wrong refusal for %: % (hint %)', v_label, sqlerrm, v_hint;
      end if;
    end;
  end loop;
  raise notice 'PASS A a judge passcode cannot score, check in or ring an entry of a cancelled class';
end $$;

-- B. the running partner section is untouched
do $$
begin
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001863044',
    jsonb_build_object('check_in_status', 'checked-in'), null);
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001863044',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 30),
    null);
  raise notice 'PASS B the running section of the pair checks in and scores';
end $$;

-- C. a manager's direct writes are refused too
select pg_temp.as_account('00000000-0000-0000-0000-000001863101');
do $$
begin
  begin
    update public.entries set is_scored = true, result_status = 'nq'
     where id = '00000000-0000-0000-0000-000001863041';
    raise exception 'FAIL C a manager scored an entry of a cancelled class directly';
  exception when check_violation then
    if sqlerrm not like 'This class is cancelled%' then
      raise exception 'FAIL C wrong refusal: %', sqlerrm;
    end if;
  end;
  begin
    update public.entries set check_in_status = 'checked-in'
     where id = '00000000-0000-0000-0000-000001863041';
    raise exception 'FAIL C a manager checked in an entry of a cancelled class directly';
  exception when check_violation then
    if sqlerrm not like 'This class is cancelled%' then
      raise exception 'FAIL C wrong refusal: %', sqlerrm;
    end if;
  end;
  raise notice 'PASS C a manager''s direct score and check-in writes are refused';
end $$;

-- D. what takes something away still goes through
do $$
begin
  -- The app's own reset payload (handleResetScore + SCORE_DETAIL_CLEAR_FIELDS +
  -- scoreResetCheckInFields), which moves the completed dog back to checked-in.
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001863042',
    jsonb_build_object(
      'is_scored', false, 'result_status', 'pending', 'search_time_seconds', 0,
      'total_faults', 0, 'final_placement', null, 'scoring_completed_at', null,
      'disqualification_reason', null,
      'area1_time_seconds', null, 'area2_time_seconds', null, 'area3_time_seconds', null,
      'area4_time_seconds', null, 'total_correct_finds', null, 'total_incorrect_finds', null,
      'no_finish_count', null, 'points_earned', null,
      'check_in_status', 'checked-in'),
    null);
  update public.entries set check_in_status = 'no-status'
   where id = '00000000-0000-0000-0000-000001863042';
  update public.entries set is_in_ring = false
   where id = '00000000-0000-0000-0000-000001863042';
  update public.entries set judge_notes = 'class cancelled for weather'
   where id = '00000000-0000-0000-0000-000001863042';
  update public.entries set check_in_status = 'pulled'
   where id = '00000000-0000-0000-0000-000001863043';
  update public.entries set entry_status = 'withdrawn'
   where id = '00000000-0000-0000-0000-000001863043';

  raise notice 'PASS D a score reset, check-in reset, note, Pull and withdrawal all go through';
end $$;

-- The authenticated role reads entries through views, so the read-back runs as the owner.
reset role;
do $$
declare r record;
begin
  if (select status from public.classes where id = '00000000-0000-0000-0000-000001863023') <> 'cancelled' then
    raise exception 'FAIL D the writes un-cancelled the class';
  end if;
  select is_scored, result_status, check_in_status into r
    from public.entries where id = '00000000-0000-0000-0000-000001863042';
  if r.is_scored is not false or r.result_status <> 'pending' or r.check_in_status <> 'no-status' then
    raise exception 'FAIL D the reset did not land (%, %, %)', r.is_scored, r.result_status, r.check_in_status;
  end if;
  raise notice 'PASS D the class is still cancelled and the reset landed';
end $$;

-- E. un-cancelling re-opens scoring
update public.classes set status = 'in_progress'
 where id = '00000000-0000-0000-0000-000001863023';
set local role authenticated;
select pg_temp.as_passcode('00000000-0000-0000-0000-000001863021', 'judge');
do $$
begin
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001863041',
    jsonb_build_object('check_in_status', 'checked-in'), null);
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001863041',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 30),
    null);
  raise notice 'PASS E un-cancelling the class re-opens check-in and scoring';
end $$;

rollback;
