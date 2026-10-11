-- MYK9-1086: ringside_update_class lets a judge set a class's max time at ringside.
--
-- Sections:
--   A. manager (site admin) sets a time within the rule range
--   B. the class's assigned judge (an account) sets it
--   C. a judge passcode for THIS show sets it; for another show it is refused
--   D. a signed-in account with no tier, and a steward passcode, are refused
--   E. the rule range: below min / above max refused; fixed rule caps at the fixed time
--   F. any key but time_limit_seconds is refused, not ignored
--   G. OCC: a stale version is 40001; a replay of an already-applied value is success
--   H. NULL clears the limit
--   I. grants: no EXECUTE for anon
--
-- Fixtures roll back.

begin;

-- Rule fixtures come from the seeded templates: AKC Interior Novice is judge-set
-- 60..180; AKC Container Novice is fixed 120.

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001086011', 'Mgr', 'Admin', '00000000-0000-0000-0000-000001086101'),
  ('00000000-0000-0000-0000-000001086012', 'Jay', 'Judge', '00000000-0000-0000-0000-000001086102'),
  ('00000000-0000-0000-0000-000001086013', 'Nora', 'Nobody', '00000000-0000-0000-0000-000001086103');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001086011', r.id, true, '00000000-0000-0000-0000-000001086101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-000001086020', 'MYK9-1086 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001086021', 'MYK9-1086 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001086020', 'published'),
  ('00000000-0000-0000-0000-000001086031', 'MYK9-1086 Other Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001086020', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001086022', '00000000-0000-0000-0000-000001086021',
   'MYK9-1086 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001086023', '00000000-0000-0000-0000-000001086022',
   'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000001086024', '00000000-0000-0000-0000-000001086022',
   'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001086012', '00000000-0000-0000-0000-000001086021',
        '00000000-0000-0000-0000-000001086022', '00000000-0000-0000-0000-000001086023',
        'confirmed', now());
insert into public.show_passcodes (show_id, role, passcode_hash, created_at) values
  ('00000000-0000-0000-0000-000001086021', 'judge', 'myk9-1086-judge', '2026-10-10T00:00:00Z'),
  ('00000000-0000-0000-0000-000001086021', 'steward', 'myk9-1086-steward', '2026-10-10T00:00:00Z'),
  ('00000000-0000-0000-0000-000001086031', 'judge', 'myk9-1086-other-judge', '2026-10-10T00:00:00Z');

-- authenticated cannot read classes rows it does not manage; versions cross the
-- role boundary through this temp table.
create temporary table myk9_1086 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_1086 to authenticated;

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(p_show uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001086199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001086199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', p_role,
             'passcode_generation', '2026-10-10T00:00:00Z'))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(uuid, text) to authenticated;

set local role authenticated;

-- A. manager
select pg_temp.as_account('00000000-0000-0000-0000-000001086101');
do $$
declare v integer;
begin
  v := public.ringside_update_class('00000000-0000-0000-0000-000001086023',
         jsonb_build_object('time_limit_seconds', 150), null);
  insert into myk9_1086 values ('v_after_a', v::text);
  raise notice 'PASS A manager set Interior Novice to 150s (version %)', v;
end $$;

-- B. assigned judge account
select pg_temp.as_account('00000000-0000-0000-0000-000001086102');
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
            jsonb_build_object('time_limit_seconds', 120), null);
  raise notice 'PASS B assigned judge set Interior Novice to 120s';
end $$;

-- C. passcodes
select pg_temp.as_passcode('00000000-0000-0000-0000-000001086021', 'judge');
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
            jsonb_build_object('time_limit_seconds', 90), null);
  raise notice 'PASS C judge passcode for this show set 90s';
end $$;
select pg_temp.as_passcode('00000000-0000-0000-0000-000001086031', 'judge');
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 100), null);
    raise exception 'FAIL C a judge passcode for another show was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS C another show''s judge passcode is refused';
  end;
end $$;

-- D. no tier / steward
select pg_temp.as_account('00000000-0000-0000-0000-000001086103');
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 100), null);
    raise exception 'FAIL D an unassigned account was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS D an unassigned account is refused';
  end;
end $$;
select pg_temp.as_passcode('00000000-0000-0000-0000-000001086021', 'steward');
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 100), null);
    raise exception 'FAIL D a steward passcode was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS D a steward passcode is refused';
  end;
end $$;

-- E. rule range (as the manager)
select pg_temp.as_account('00000000-0000-0000-0000-000001086101');
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 30), null);
    raise exception 'FAIL E 30s below the judge-set minimum was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS E below the rule minimum is refused';
  end;
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 1800), null);
    raise exception 'FAIL E 30:00 above the judge-set maximum was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS E above the rule maximum is refused';
  end;
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086024',
              jsonb_build_object('time_limit_seconds', 150), null);
    raise exception 'FAIL E 150s above Container Novice''s fixed 120s was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS E a fixed rule caps at its fixed time';
  end;
  perform public.ringside_update_class('00000000-0000-0000-0000-000001086024',
            jsonb_build_object('time_limit_seconds', 120), null);
  raise notice 'PASS E the fixed time itself is accepted';
end $$;

-- F. allow-list
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 120, 'status', 'completed'), null);
    raise exception 'FAIL F an extra key was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS F any key but time_limit_seconds is refused';
  end;
end $$;

-- G. OCC and replay
do $$
declare v_now integer; v_ret integer;
begin
  v_now := public.ringside_update_class('00000000-0000-0000-0000-000001086023',
             jsonb_build_object('time_limit_seconds', 170), null);
  -- Replay with the pre-write version and the SAME value: already applied.
  v_ret := public.ringside_update_class('00000000-0000-0000-0000-000001086023',
             jsonb_build_object('time_limit_seconds', 170), v_now - 1);
  if v_ret <> v_now then
    raise exception 'FAIL G an applied replay returned % not %', v_ret, v_now;
  end if;
  raise notice 'PASS G a replay of the applied value is success';
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
              jsonb_build_object('time_limit_seconds', 160), v_now - 1);
    raise exception 'FAIL G a stale version with a new value was accepted';
  exception when serialization_failure then
    raise notice 'PASS G a stale version with a different value is 40001';
  end;
end $$;

-- H. NULL clears
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001086023',
            jsonb_build_object('time_limit_seconds', null), null);
  raise notice 'PASS H NULL clears the limit';
end $$;

reset role;
do $$
begin
  if (select time_limit_seconds from public.classes
       where id = '00000000-0000-0000-0000-000001086023') is not null then
    raise exception 'FAIL H the limit was not cleared';
  end if;
  if (select time_limit_seconds from public.classes
       where id = '00000000-0000-0000-0000-000001086024') <> 120 then
    raise exception 'FAIL E the fixed class did not keep 120s';
  end if;
  -- I. grants
  if has_function_privilege('anon', 'public.ringside_update_class(uuid, jsonb, integer)', 'EXECUTE') then
    raise exception 'FAIL I anon can execute ringside_update_class';
  end if;
  if not has_function_privilege('authenticated', 'public.ringside_update_class(uuid, jsonb, integer)', 'EXECUTE') then
    raise exception 'FAIL I authenticated cannot execute ringside_update_class';
  end if;
  raise notice 'PASS I EXECUTE is authenticated-only';
end $$;

rollback;
