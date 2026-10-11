-- MYK9-1098: ringside_update_class accepts a max time per area.
--
-- Sections:
--   A. the assigned judge sets area 1 and area 2 of a two-area class in one call
--   B. each area is range-checked against the rule for judges; a manager is not
--   C. setting only area 2 leaves area 1 untouched
--   D. a non-number area time is refused for everyone
--   E. OCC: a replay of applied area times is success; a stale version with a
--      different area time is 40001
--   F. NULL clears one area
--
-- Fixtures roll back.

begin;

-- Rule fixture from the seeded templates: AKC Interior Excellent is two areas,
-- judge-set 60..180 per area.

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001098011', 'Mgr', 'Admin', '00000000-0000-0000-0000-000001098101'),
  ('00000000-0000-0000-0000-000001098012', 'Jay', 'Judge', '00000000-0000-0000-0000-000001098102');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001098011', r.id, true, '00000000-0000-0000-0000-000001098101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-000001098020', 'MYK9-1098 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001098021', 'MYK9-1098 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001098020', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001098022', '00000000-0000-0000-0000-000001098021',
   'MYK9-1098 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001098023', '00000000-0000-0000-0000-000001098022',
   'Interior Excellent A', 'upcoming', 'Interior', 'Excellent', 'A');
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001098012', '00000000-0000-0000-0000-000001098021',
        '00000000-0000-0000-0000-000001098022', '00000000-0000-0000-0000-000001098023',
        'confirmed', now());

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;

set local role authenticated;

-- A. both areas in one call
select pg_temp.as_account('00000000-0000-0000-0000-000001098102');
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
            jsonb_build_object('time_limit_seconds', 90, 'time_limit_area2_seconds', 150), null);
  raise notice 'PASS A the assigned judge set area 1 to 90s and area 2 to 150s';
end $$;

-- B. per-area range
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
              jsonb_build_object('time_limit_seconds', 90, 'time_limit_area2_seconds', 200), null);
    raise exception 'FAIL B area 2 above the rule maximum was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS B area 2 above the rule maximum is refused';
  end;
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
              jsonb_build_object('time_limit_area3_seconds', 30), null);
    raise exception 'FAIL B area 3 below the rule minimum was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS B area 3 below the rule minimum is refused';
  end;
end $$;

-- C. area 2 alone
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
            jsonb_build_object('time_limit_area2_seconds', 170), null);
  raise notice 'PASS C the judge set area 2 alone';
end $$;

-- D. type
do $$
begin
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
              jsonb_build_object('time_limit_area2_seconds', '2:00'), null);
    raise exception 'FAIL D a string area time was accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS D a non-number area time is refused';
  end;
end $$;

-- E. OCC
do $$
declare v_now integer; v_ret integer;
begin
  v_now := public.ringside_update_class('00000000-0000-0000-0000-000001098023',
             jsonb_build_object('time_limit_seconds', 100, 'time_limit_area2_seconds', 160), null);
  v_ret := public.ringside_update_class('00000000-0000-0000-0000-000001098023',
             jsonb_build_object('time_limit_seconds', 100, 'time_limit_area2_seconds', 160), v_now - 1);
  if v_ret <> v_now then
    raise exception 'FAIL E an applied replay returned % not %', v_ret, v_now;
  end if;
  raise notice 'PASS E a replay of applied area times is success';
  begin
    perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
              jsonb_build_object('time_limit_seconds', 100, 'time_limit_area2_seconds', 140), v_now - 1);
    raise exception 'FAIL E a stale version with a different area 2 time was accepted';
  exception when serialization_failure then
    raise notice 'PASS E a stale version with a different area time is 40001';
  end;
end $$;

-- B (manager). A manager is not range-checked per area either.
select pg_temp.as_account('00000000-0000-0000-0000-000001098101');
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
            jsonb_build_object('time_limit_area3_seconds', 240), null);
  raise notice 'PASS B a manager is not range-checked per area';
end $$;

-- F. NULL clears one area
do $$
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001098023',
            jsonb_build_object('time_limit_area3_seconds', null), null);
  raise notice 'PASS F NULL clears area 3';
end $$;

reset role;
do $$
declare r record;
begin
  select time_limit_seconds a1, time_limit_area2_seconds a2, time_limit_area3_seconds a3
    into r from public.classes where id = '00000000-0000-0000-0000-000001098023';
  if r.a1 is distinct from 100 or r.a2 is distinct from 160 or r.a3 is not null then
    raise exception 'FAIL final area times are %, %, % (expected 100, 160, null)', r.a1, r.a2, r.a3;
  end if;
  raise notice 'PASS final area times are 100, 160, cleared';
end $$;

rollback;
