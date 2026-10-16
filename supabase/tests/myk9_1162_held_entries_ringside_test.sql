-- MYK9-1162 (owner decision A): an entry awaiting a registration number stays in
-- its run-order place, is flagged for ringside by the server, and cannot be
-- scored until the number is added.
--
-- Sections:
--   A. a show manager's replication feed flags the held entry, not a registered one
--   B. a judge PASSCODE session (no dog_registrations access) sees the same flag
--   C. a judge passcode cannot record a score for the held entry (23514); a
--      check-in write for it still goes through; a registered entry scores
--   D. a manager's direct score write is refused too; a held entry can still be
--      withdrawn; an entry scored before it became held takes non-score writes
--   E. once the registration exists the flag clears and the score is accepted
--   F. ABSENT is allowed for a held dog (zero time), a timed absent and every
--      other result stay refused
--   G. conformation puppies are never held; a UKC trial with only an AKC number is
--   H. a registration DELETE advances the entry's updated_at (replicas re-read)
--   I. grants: authenticated may execute the predicate (the views need it), anon
--      may not, and anon has no SELECT on either entry-results view
--   J. a held entry still counts toward capacity: it is in the class's entry count,
--      the class reads full at that limit, and releasing the hold changes no count
--
-- Fixtures roll back.

begin;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001162011', 'Mgr', 'Admin', '00000000-0000-0000-0000-000001162101');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001162011', r.id, true, '00000000-0000-0000-0000-000001162101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001162020', 'MYK9-1162 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001162021', 'MYK9-1162 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001162020', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000001162022', '00000000-0000-0000-0000-000001162021',
   'MYK9-1162 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162022',
   'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.show_passcodes (show_id, role, passcode_hash, created_at) values
  ('00000000-0000-0000-0000-000001162021', 'judge', 'myk9-1162-judge', '2026-10-10T00:00:00Z');

-- A show never mixes registries (enforce_show_registry_on_trial), so the UKC
-- trial gets its own UKC show.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001162026', 'MYK9-1162 UKC Show', 'UKC', current_date, current_date,
   '00000000-0000-0000-0000-000001162020', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000001162052', '00000000-0000-0000-0000-000001162021',
   'MYK9-1162 Conformation Trial', current_date, 'AKC', 'Conformation'),
  ('00000000-0000-0000-0000-000001162062', '00000000-0000-0000-0000-000001162026',
   'MYK9-1162 UKC Trial', current_date, 'UKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001162053', '00000000-0000-0000-0000-000001162052',
   'Puppy 6-9 Months', 'upcoming', 'Puppy', 'Puppy', 'A'),
  ('00000000-0000-0000-0000-000001162063', '00000000-0000-0000-0000-000001162062',
   'Container Novice U', 'upcoming', 'Container', 'Novice', 'A');

insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001162031', 'MYK9-1162 Held', 'Held', 'Beagle'),
  ('00000000-0000-0000-0000-000001162032', 'MYK9-1162 Registered', 'Reg', 'Beagle'),
  ('00000000-0000-0000-0000-000001162033', 'MYK9-1162 Withdraw', 'Wd', 'Beagle'),
  ('00000000-0000-0000-0000-000001162034', 'MYK9-1162 Absent', 'Abs', 'Beagle'),
  ('00000000-0000-0000-0000-000001162035', 'MYK9-1162 Puppy', 'Pup', 'Beagle'),
  ('00000000-0000-0000-0000-000001162036', 'MYK9-1162 AKC In UKC', 'Mix', 'Beagle'),
  ('00000000-0000-0000-0000-000001162037', 'MYK9-1162 Scored Then Held', 'Sth', 'Beagle'),
  ('00000000-0000-0000-0000-000001162038', 'MYK9-1162 Touch', 'Tch', 'Beagle');
insert into public.dog_registrations (id, dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000001162081', '00000000-0000-0000-0000-000001162032', 'AKC', 'SR1162001', true),
  ('00000000-0000-0000-0000-000001162082', '00000000-0000-0000-0000-000001162036', 'AKC', 'SR1162006', true),
  ('00000000-0000-0000-0000-000001162083', '00000000-0000-0000-0000-000001162037', 'AKC', 'SR1162007', true),
  ('00000000-0000-0000-0000-000001162084', '00000000-0000-0000-0000-000001162038', 'AKC', 'SR1162008', true);

-- Held entries reach the table through a trial manager's insert; the fixture
-- owner has no caller identity, so the entry trigger is off for the fixture only.
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000001162041', '00000000-0000-0000-0000-000001162031',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000001162042', '00000000-0000-0000-0000-000001162032',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000001162043', '00000000-0000-0000-0000-000001162033',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '3', 3, 'no-status'),
  ('00000000-0000-0000-0000-000001162044', '00000000-0000-0000-0000-000001162034',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '4', 4, 'no-status'),
  ('00000000-0000-0000-0000-000001162045', '00000000-0000-0000-0000-000001162035',
   '00000000-0000-0000-0000-000001162053', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162052', 'confirmed', '5', 1, 'no-status'),
  ('00000000-0000-0000-0000-000001162046', '00000000-0000-0000-0000-000001162036',
   '00000000-0000-0000-0000-000001162063', '00000000-0000-0000-0000-000001162026',
   '00000000-0000-0000-0000-000001162062', 'confirmed', '6', 1, 'no-status'),
  ('00000000-0000-0000-0000-000001162047', '00000000-0000-0000-0000-000001162037',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '7', 5, 'no-status'),
  ('00000000-0000-0000-0000-000001162048', '00000000-0000-0000-0000-000001162038',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '8', 6, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- Entry 47 was scored while its dog was registered; the registration is deleted
-- later (section D), which makes it held with a result already on it.
update public.entries set is_scored = true, result_status = 'qualified', search_time_seconds = 22
 where id = '00000000-0000-0000-0000-000001162047';

create temporary table myk9_1162 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_1162 to authenticated;

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(p_show uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001162199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001162199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', p_role,
             'passcode_generation', '2026-10-10T00:00:00Z'))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(uuid, text) to authenticated;

set local role authenticated;

-- A. manager replication feed
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare held boolean; reg boolean;
begin
  -- Regression: PostgreSQL checks EXECUTE on the predicate against the QUERYING
  -- role even through an owner-run view, so these reads fail with "permission
  -- denied for function" unless authenticated may execute it. Both views, as a
  -- real authenticated session.
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results
   where id = '00000000-0000-0000-0000-000001162041';
  if held is distinct from true then
    raise exception 'FAIL A the inner view did not flag the held entry (%)', held;
  end if;
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162041';
  select awaiting_registration_number into reg
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162042';
  if held is distinct from true then
    raise exception 'FAIL A the held entry was not flagged (%)', held;
  end if;
  if reg is distinct from false then
    raise exception 'FAIL A a registered entry was flagged (%)', reg;
  end if;
  raise notice 'PASS A manager feed flags the held entry and not the registered one';
end $$;

-- B. judge passcode session
select pg_temp.as_passcode('00000000-0000-0000-0000-000001162021', 'judge');
do $$
declare held boolean; seen int;
begin
  select count(*) into seen
    from public.dog_registrations
   where dog_id = '00000000-0000-0000-0000-000001162032';
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results
   where id = '00000000-0000-0000-0000-000001162041';
  if held is distinct from true then
    raise exception 'FAIL B the passcode session did not see the flag on the inner view (%)', held;
  end if;
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162041';
  if seen <> 0 then
    raise notice 'NOTE B the passcode session can read dog_registrations (%); the flag does not depend on it', seen;
  end if;
  if held is distinct from true then
    raise exception 'FAIL B the passcode session did not see the flag (%)', held;
  end if;
  raise notice 'PASS B a judge passcode session sees awaiting_registration_number';
end $$;

-- C. score refused for the held entry; check-in allowed; registered scores
do $$
declare v integer;
begin
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000001162041',
      jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 30),
      null);
    raise exception 'FAIL C a score was accepted for a held entry';
  exception when check_violation then
    if sqlerrm not like 'Registration number needed%' then
      raise exception 'FAIL C wrong refusal: %', sqlerrm;
    end if;
    raise notice 'PASS C the held entry''s score is refused with the plain copy';
  end;

  v := public.ringside_update_entry(
         '00000000-0000-0000-0000-000001162041',
         jsonb_build_object('check_in_status', 'checked-in'), null);
  raise notice 'PASS C a check-in write for the held entry still goes through (version %)', v;

  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001162042',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 30),
    null);
  raise notice 'PASS C a registered entry scores as before';
end $$;

-- D. a manager's direct write is refused too
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
begin
  begin
    update public.entries
       set is_scored = true, result_status = 'nq'
     where id = '00000000-0000-0000-0000-000001162041';
    raise exception 'FAIL D a manager scored a held entry directly';
  exception when check_violation then
    if sqlerrm not like 'Registration number needed%' then
      raise exception 'FAIL D wrong refusal: %', sqlerrm;
    end if;
    raise notice 'PASS D a manager''s direct score write is refused with the plain copy';
  end;

  -- A held entry can still be withdrawn (it stops being live, so is not held).
  update public.entries set entry_status = 'withdrawn'
   where id = '00000000-0000-0000-0000-000001162043';
  raise notice 'PASS D a held entry can be withdrawn';
end $$;

-- An entry scored BEFORE it became held takes non-score writes.
reset role;
delete from public.dog_registrations where id = '00000000-0000-0000-0000-000001162083';
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare held boolean;
begin
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162047';
  if held is distinct from true then
    raise exception 'FAIL D the scored entry was not flagged once its registration was gone (%)', held;
  end if;
  update public.entries set judge_notes = 'checked after the fact'
   where id = '00000000-0000-0000-0000-000001162047';
  update public.entries set check_in_status = 'checked-in'
   where id = '00000000-0000-0000-0000-000001162047';
  raise notice 'PASS D a non-score write to an entry scored before it became held passes';
end $$;

-- A correction to any score-bearing column (faults, an area time) is still a
-- score write, even though is_scored, result_status and the time are unchanged.
-- `authenticated` holds no column grant on these (ringside writes them through
-- the owner-run ringside_update_entry), so the corrections run as the owner: the
-- guard is a trigger and refuses every writer alike.
reset role;
do $$
begin
  begin
    update public.entries set total_faults = coalesce(total_faults, 0) + 1
     where id = '00000000-0000-0000-0000-000001162047';
    raise exception 'FAIL D a fault-only correction was accepted for a held entry';
  exception when check_violation then
    if sqlerrm not like 'Registration number needed%' then raise; end if;
    raise notice 'PASS D a fault-only correction is refused for a held entry';
  end;
  begin
    update public.entries set area1_time_seconds = coalesce(area1_time_seconds, 0) + 5
     where id = '00000000-0000-0000-0000-000001162047';
    raise exception 'FAIL D an area-time correction was accepted for a held entry';
  exception when check_violation then
    if sqlerrm not like 'Registration number needed%' then raise; end if;
    raise notice 'PASS D an area-time correction is refused for a held entry';
  end;
end $$;

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
begin
  -- A reset (not scored, pending, zero time) clears a result, so it passes for
  -- an entry that became held after it was scored; a new score is still refused.
  update public.entries
     set is_scored = false, result_status = 'pending', search_time_seconds = 0
   where id = '00000000-0000-0000-0000-000001162047';
  raise notice 'PASS D a score reset passes for an entry that became held after scoring';
  begin
    update public.entries
       set is_scored = true, result_status = 'qualified', search_time_seconds = 30
     where id = '00000000-0000-0000-0000-000001162047';
    raise exception 'FAIL D a new score was accepted after the reset';
  exception when check_violation then
    raise notice 'PASS D a new score is refused after the reset';
  end;
end $$;

-- E. add the registration; the flag clears and the score is accepted
reset role;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000001162031', 'AKC', 'SR1162002', true);

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare held boolean;
begin
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162041';
  if held is distinct from false then
    raise exception 'FAIL E the flag did not clear after the number was added (%)', held;
  end if;
  update public.entries
     set is_scored = true, result_status = 'qualified', search_time_seconds = 41
   where id = '00000000-0000-0000-0000-000001162041';
  raise notice 'PASS E the flag clears and the score is accepted once the number exists';
end $$;

-- F. ABSENT for a held dog
select pg_temp.as_passcode('00000000-0000-0000-0000-000001162021', 'judge');
do $$
begin
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000001162044',
      jsonb_build_object('is_scored', true, 'result_status', 'absent', 'search_time_seconds', 14), null);
    raise exception 'FAIL F a timed absent was accepted for a held entry';
  exception when check_violation then
    raise notice 'PASS F a timed absent is refused';
  end;
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000001162044',
      jsonb_build_object('is_scored', true, 'result_status', 'excused', 'search_time_seconds', 0), null);
    raise exception 'FAIL F excused was accepted for a held entry';
  exception when check_violation then
    raise notice 'PASS F excused is refused';
  end;
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001162044',
    jsonb_build_object('is_scored', true, 'result_status', 'absent', 'search_time_seconds', 0), null);
  raise notice 'PASS F a held dog can be recorded absent (zero time)';
end $$;

-- G. carve-out and per-trial registry
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare puppy boolean; ukc boolean;
begin
  select awaiting_registration_number into puppy
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162045';
  select awaiting_registration_number into ukc
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162046';
  if puppy is distinct from false then
    raise exception 'FAIL G a conformation puppy was held (%)', puppy;
  end if;
  if ukc is distinct from true then
    raise exception 'FAIL G a UKC-trial entry with only an AKC number was not held (%)', ukc;
  end if;
  raise notice 'PASS G conformation puppy is not held; a UKC trial needs a UKC number';
end $$;

-- H. a registration DELETE advances the entry's updated_at
reset role;
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  update public.entries set updated_at = '2020-01-01T00:00:00Z'
   where id = '00000000-0000-0000-0000-000001162048';
  delete from public.dog_registrations where id = '00000000-0000-0000-0000-000001162084';
  select updated_at into after_ts from public.entries
   where id = '00000000-0000-0000-0000-000001162048';
  if after_ts < now() - interval '1 minute' then
    raise exception 'FAIL H deleting a registration did not advance the entry (%)', after_ts;
  end if;
  raise notice 'PASS H a registration delete advances the entry''s updated_at';
end $$;

-- I. grants
do $$
declare fn text := 'public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz)';
begin
  if has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception 'FAIL I anon can execute the held predicate';
  end if;
  if not has_function_privilege('authenticated', fn, 'EXECUTE') then
    raise exception 'FAIL I authenticated cannot execute the held predicate, so the entry-results views fail';
  end if;
  if has_table_privilege('anon', 'public.view_authenticated_entry_results', 'SELECT')
     or has_table_privilege('anon', 'public.view_authenticated_entry_results_replication', 'SELECT') then
    raise exception 'FAIL I anon can read an entry-results view';
  end if;
  raise notice 'PASS I authenticated may execute the predicate, anon may not, and anon cannot read the entry-results views';
end $$;

-- J. capacity still counts a held entry
reset role;
insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001162039', 'MYK9-1162 Capacity Held', 'Cap', 'Beagle');
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000001162049', '00000000-0000-0000-0000-000001162039',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '9', 9, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare
  r record;
  held boolean;
begin
  select awaiting_registration_number into held
    from public.view_authenticated_entry_results_replication
   where id = '00000000-0000-0000-0000-000001162049';
  if held is distinct from true then
    raise exception 'FIXTURE J the capacity entry is not held (%)', held;
  end if;
  select * into r from public.get_show_class_availability('00000000-0000-0000-0000-000001162021')
   where class_id = '00000000-0000-0000-0000-000001162023';
  if r is null or r.entry_count < 1 then
    raise exception 'FAIL J no availability row for the class';
  end if;
  insert into myk9_1162 (step, value) values ('j_count', r.entry_count::text);
end $$;

reset role;
update public.classes
   set max_entries = (select value::int from myk9_1162 where step = 'j_count')
 where id = '00000000-0000-0000-0000-000001162023';

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare
  r record;
  v_with_held int := (select value::int from myk9_1162 where step = 'j_count');
begin
  select * into r from public.get_show_class_availability('00000000-0000-0000-0000-000001162021')
   where class_id = '00000000-0000-0000-0000-000001162023';
  if not r.class_full then
    raise exception 'FAIL J a class at its limit with a held entry did not read full (count %, max %)',
      r.entry_count, v_with_held;
  end if;
  raise notice 'PASS J a held entry fills its place: the class reads full at its limit';
end $$;

-- Releasing the hold changes no count: the held entry was counted all along.
reset role;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000001162039', 'AKC', 'SR1162099', true);
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001162101');
do $$
declare r record;
begin
  select * into r from public.get_show_class_availability('00000000-0000-0000-0000-000001162021')
   where class_id = '00000000-0000-0000-0000-000001162023';
  if r.entry_count <> (select value::int from myk9_1162 where step = 'j_count') then
    raise exception 'FAIL J releasing the hold changed the class count (% -> %)',
      (select value from myk9_1162 where step = 'j_count'), r.entry_count;
  end if;
  raise notice 'PASS J releasing the hold changes no count';
end $$;

rollback;
