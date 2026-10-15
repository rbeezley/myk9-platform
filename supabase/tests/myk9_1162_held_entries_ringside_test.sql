-- MYK9-1162 (owner decision A): an entry awaiting a registration number stays in
-- its run-order place, is flagged for ringside by the server, and cannot be
-- scored until the number is added.
--
-- Sections:
--   A. a show manager's replication feed flags the held entry, not a registered one
--   B. a judge PASSCODE session (no dog_registrations access) sees the same flag
--   C. a judge passcode cannot record a score for the held entry (23514); a
--      check-in write for it still goes through; a registered entry scores
--   D. a manager's direct score write is refused too
--   E. once the registration exists the flag clears and the score is accepted
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

insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001162031', 'MYK9-1162 Held', 'Held', 'Beagle'),
  ('00000000-0000-0000-0000-000001162032', 'MYK9-1162 Registered', 'Reg', 'Beagle');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000001162032', 'AKC', 'SR1162001', true);

-- Held entries reach the table through a trial manager's insert; the fixture
-- owner has no caller identity, so the entry trigger is off for the fixture only.
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000001162041', '00000000-0000-0000-0000-000001162031',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000001162042', '00000000-0000-0000-0000-000001162032',
   '00000000-0000-0000-0000-000001162023', '00000000-0000-0000-0000-000001162021',
   '00000000-0000-0000-0000-000001162022', 'confirmed', '2', 2, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

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
    raise notice 'PASS D a manager''s direct score write is refused';
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

rollback;
