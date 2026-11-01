-- MYK9-1625 / MYK9-1631: ASCA Interior area counts and the judge's ringside choice.
--
-- Sections:
--   A. every ASCA Interior rule (sections A and C) starts a class at 1 area, per the
--      rulebook (Novice and Open are 1; Advanced and Excellent are 1 or 2, default 1)
--   B. ringside_update_class lets the assigned judge save num_areas, and refuses
--      0, 4, 2.5, null and a string
--
-- Fixtures roll back.

begin;

-- A. seed values
do $$
declare v_bad text;
begin
  select string_agg(r.class_name || '=' || coalesce(r.area_count::text, 'null'), ', ')
    into v_bad
    from public.sport_class_rules r
    join public.sport_templates st on st.id = r.sport_template_id
   where st.sport_code = 'asca-scent-detection'
     and r.element = 'Interior'
     and r.area_count is distinct from 1;
  if v_bad is not null then
    raise exception 'FAIL A ASCA Interior rules not at 1 area: %', v_bad;
  end if;
  if (select count(*) from public.sport_class_rules r
        join public.sport_templates st on st.id = r.sport_template_id
       where st.sport_code = 'asca-scent-detection' and r.element = 'Interior') <> 8 then
    raise exception 'FAIL A expected 8 ASCA Interior rules (4 levels x sections A and C)';
  end if;
  raise notice 'PASS A all 8 ASCA Interior rules start at 1 area';
end $$;

-- B. the RPC
insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001625011', 'Jay', 'Judge', '00000000-0000-0000-0000-000001625101');
insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-000001625020', 'MYK9-1625 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001625021', 'MYK9-1625 Show', 'ASCA', current_date, current_date,
   '00000000-0000-0000-0000-000001625020', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001625022', '00000000-0000-0000-0000-000001625021',
   'MYK9-1625 Trial', current_date, 'ASCA');
insert into public.classes (id, trial_id, name, status, element, level, section, num_areas) values
  ('00000000-0000-0000-0000-000001625023', '00000000-0000-0000-0000-000001625022',
   'Interior Excellent', 'upcoming', 'Interior', 'Excellent', 'A', 1);
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001625011', '00000000-0000-0000-0000-000001625021',
        '00000000-0000-0000-0000-000001625022', '00000000-0000-0000-0000-000001625023',
        'confirmed', now());

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001625101');

do $$
declare v_bad jsonb;
begin
  perform public.ringside_update_class('00000000-0000-0000-0000-000001625023',
            jsonb_build_object('num_areas', 2), null);
  raise notice 'PASS B the assigned judge saved 2 areas';

  foreach v_bad in array ARRAY['0'::jsonb, '4'::jsonb, '2.5'::jsonb, 'null'::jsonb, '"2"'::jsonb]
  loop
    begin
      perform public.ringside_update_class('00000000-0000-0000-0000-000001625023',
                jsonb_build_object('num_areas', v_bad), null);
      raise exception 'FAIL B num_areas % was accepted', v_bad;
    exception when invalid_parameter_value then
      raise notice 'PASS B num_areas % is refused', v_bad;
    end;
  end loop;
end $$;

reset role;
do $$
begin
  if (select num_areas from public.classes
       where id = '00000000-0000-0000-0000-000001625023') is distinct from 2 then
    raise exception 'FAIL B the class does not hold the judge''s 2 areas';
  end if;
  raise notice 'PASS B the class holds 2 areas';
end $$;

rollback;
