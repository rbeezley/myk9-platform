-- MYK9-2005: the server refuses a Qualified with no time, or a time over the class's limit.
--
-- Behavioral test for 20261114231900_myk9_2005_qualified_needs_a_valid_time.sql, run only in CI
-- (scripts/qa/run-behavioral-sql-tests.sh).
--
--   A. a judge passcode through ringside_update_entry: a Qualified with a time of 0 or none, or a
--      time over the class's limit (area 1 and area 2), is refused with 23514, a plain sentence
--      and a hint; a time EQUAL to the limit is accepted; a class with no limit (null or 0) takes
--      any time; NQ and Absent never need a time
--   B. a manager's direct entries UPDATE (the paper-scoring and results-edit path) is refused
--      the same way; an unrelated edit to an old bad Qualified is not blocked
--   C. a write with no end-user JWT (migration, service role, import) is not gated
--   D. placements: the cases in fixtures/qualified-ranking/cases.json, which the paper-scoring
--      page's calculatePlacements test reads too, rank the same way here; a zero-time Qualified
--      is left unplaced
--
-- Fixtures roll back.

begin;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000002005011', 'Mgr', 'Admin', '00000000-0000-0000-0000-000002005101');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002005011', r.id, true, '00000000-0000-0000-0000-000002005101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002005020', 'MYK9-2005 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002005021', 'MYK9-2005 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002005020', 'published');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002005022', '00000000-0000-0000-0000-000002005021',
   'MYK9-2005 Trial', current_date, 'AKC', 'Scent Work');
-- 31: 3:00 limit, one area. 32: no limit set. 33: two areas, 3:00 and 2:00. 34: limit 0 (none).
-- 35, 36: the ranking cases of section D (no limit).
insert into public.classes (id, trial_id, name, status, element, level, section,
                            time_limit_seconds, time_limit_area2_seconds, num_areas) values
  ('00000000-0000-0000-0000-000002005031', '00000000-0000-0000-0000-000002005022',
   'Container Novice', 'in_progress', 'Container', 'Novice', 'A', 180, null, 1),
  ('00000000-0000-0000-0000-000002005032', '00000000-0000-0000-0000-000002005022',
   'Interior Novice', 'in_progress', 'Interior', 'Novice', 'A', null, null, 1),
  ('00000000-0000-0000-0000-000002005033', '00000000-0000-0000-0000-000002005022',
   'Exterior Excellent', 'in_progress', 'Exterior', 'Excellent', 'A', 180, 120, 2),
  ('00000000-0000-0000-0000-000002005034', '00000000-0000-0000-0000-000002005022',
   'Buried Novice', 'in_progress', 'Buried', 'Novice', 'A', 0, 0, 1),
  ('00000000-0000-0000-0000-000002005035', '00000000-0000-0000-0000-000002005022',
   'Handler Discrimination', 'in_progress', 'Handler Discrimination', 'Novice', 'A', null, null, 1),
  ('00000000-0000-0000-0000-000002005036', '00000000-0000-0000-0000-000002005022',
   'Container Open', 'in_progress', 'Container', 'Open', 'A', null, null, 1);

insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000002005012', 'Ring', 'Judge');
insert into public.judge_assignments (person_id, show_id, class_id, status, confirmed_at)
select '00000000-0000-0000-0000-000002005012', '00000000-0000-0000-0000-000002005021', c.id, 'confirmed', now()
  from public.classes c where c.trial_id = '00000000-0000-0000-0000-000002005022';
update public.show_passcodes set created_at = '2026-11-13T00:00:00Z'
 where show_id = '00000000-0000-0000-0000-000002005021'
   and person_id = '00000000-0000-0000-0000-000002005012';

-- Entries 41-44 are the one-per-class subjects of sections A to C: e41 (class 31), e42 (32),
-- e43 (33), e44 (34), e45 (31, for B). The ranking entries of D are made below.
insert into public.dogs (id, name, call_name, breed)
select ('00000000-0000-0000-0000-0000020050' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-2005 Dog ' || n, 'Dog ' || n, 'Beagle'
  from generate_series(51, 70) as n;

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002005041', '00000000-0000-0000-0000-000002005051', '00000000-0000-0000-0000-000002005031',
   '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022', 'confirmed', '1', 1, 'checked-in'),
  ('00000000-0000-0000-0000-000002005042', '00000000-0000-0000-0000-000002005052', '00000000-0000-0000-0000-000002005032',
   '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022', 'confirmed', '2', 1, 'checked-in'),
  ('00000000-0000-0000-0000-000002005043', '00000000-0000-0000-0000-000002005053', '00000000-0000-0000-0000-000002005033',
   '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022', 'confirmed', '3', 1, 'checked-in'),
  ('00000000-0000-0000-0000-000002005044', '00000000-0000-0000-0000-000002005054', '00000000-0000-0000-0000-000002005034',
   '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022', 'confirmed', '4', 1, 'checked-in'),
  ('00000000-0000-0000-0000-000002005045', '00000000-0000-0000-0000-000002005055', '00000000-0000-0000-0000-000002005031',
   '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022', 'confirmed', '5', 2, 'checked-in');
alter table public.entries enable trigger trg_entries_require_dog_registration;

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(p_show uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002005199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000002005199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', p_role,
             'ringside_person_id', '00000000-0000-0000-0000-000002005012',
             'passcode_generation', '2026-11-13T00:00:00Z'))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(uuid, text) to authenticated;

set local role authenticated;

-- A. judge passcode through ringside_update_entry
select pg_temp.as_passcode('00000000-0000-0000-0000-000002005021', 'judge');
do $$
declare
  v_label text;
  v_entry uuid;
  v_payload jsonb;
  v_message text;
  v_hint text;
  v_state text;
  v_sqlerrm text;
  v_got_hint text;
begin
  for v_label, v_entry, v_payload, v_message, v_hint in
    select * from (values
      ('a time of zero', '00000000-0000-0000-0000-000002005041'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 0),
        'A Qualified needs a time. Add the time, or change the result to NQ.', 'qualified_needs_time'),
      ('no time sent (the column default is 0)', '00000000-0000-0000-0000-000002005041'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified'),
        'A Qualified needs a time. Add the time, or change the result to NQ.', 'qualified_needs_time'),
      ('a null time', '00000000-0000-0000-0000-000002005041'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', null),
        'A Qualified needs a time. Add the time, or change the result to NQ.', 'qualified_needs_time'),
      ('a time with no limit set, but zero', '00000000-0000-0000-0000-000002005042'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 0),
        'A Qualified needs a time. Add the time, or change the result to NQ.', 'qualified_needs_time'),
      ('a time one second over the limit', '00000000-0000-0000-0000-000002005041'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 181),
        '3:01 is over the 3:00 limit. Fix the time, or change the result to NQ.', 'qualified_over_time_limit'),
      ('a time a hundredth over the limit', '00000000-0000-0000-0000-000002005041'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 180.5),
        '3:00.50 is over the 3:00 limit. Fix the time, or change the result to NQ.', 'qualified_over_time_limit'),
      ('area 1 over its limit', '00000000-0000-0000-0000-000002005043'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 250,
                           'area1_time_seconds', 181, 'area2_time_seconds', 60),
        'Area 1 time 3:01 is over the 3:00 limit. Fix the time, or change the result to NQ.', 'qualified_over_time_limit'),
      ('area 2 over its own, shorter limit', '00000000-0000-0000-0000-000002005043'::uuid,
        jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 220,
                           'area1_time_seconds', 100, 'area2_time_seconds', 121),
        'Area 2 time 2:01 is over the 2:00 limit. Fix the time, or change the result to NQ.', 'qualified_over_time_limit')
    ) as t(label, entry, payload, message, hint)
  loop
    begin
      perform public.ringside_update_entry(v_entry, v_payload, null);
      raise exception 'FAIL A % was accepted', v_label;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_got_hint = pg_exception_hint;
      v_sqlerrm := sqlerrm;
      if v_sqlerrm like 'FAIL A %' then raise; end if;
      if v_state <> '23514' or v_sqlerrm <> v_message or v_got_hint is distinct from v_hint then
        raise exception 'FAIL A wrong refusal for %: % % (hint %)', v_label, v_state, v_sqlerrm, v_got_hint;
      end if;
    end;
  end loop;
  raise notice 'PASS A a Qualified with no time or a time over the limit is refused, in plain words, with 23514';
end $$;

do $$
declare r record;
begin
  -- Equal to the limit; a class with no limit (null and 0); areas at their limits.
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005041',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 180), null);
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005042',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 99999), null);
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005044',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 99999), null);
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005043',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified', 'search_time_seconds', 300,
                       'area1_time_seconds', 180, 'area2_time_seconds', 120), null);
  -- NQ and Absent never need a time.
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005045',
    jsonb_build_object('is_scored', true, 'result_status', 'nq', 'search_time_seconds', 0), null);
  perform public.ringside_update_entry('00000000-0000-0000-0000-000002005045',
    jsonb_build_object('is_scored', true, 'result_status', 'absent', 'search_time_seconds', 0), null);
  raise notice 'PASS A a time equal to the limit, a class with no limit, and NQ or Absent without a time all save';
end $$;

-- B. a manager's direct writes (paper scoring, results edit)
reset role;
-- An old bad Qualified (written with no JWT, as a migration or import would).
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
update public.entries set is_scored = true, result_status = 'qualified', search_time_seconds = 0
 where id = '00000000-0000-0000-0000-000002005045';
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000002005101');
do $$
declare
  v_state text;
  v_hint text;
begin
  begin
    update public.entries set is_scored = true, result_status = 'qualified', search_time_seconds = 0
     where id = '00000000-0000-0000-0000-000002005041';
    raise exception 'FAIL B a manager saved a zero-time Qualified directly';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_state <> '23514' or v_hint <> 'qualified_needs_time' then
      raise exception 'FAIL B wrong refusal: % % (hint %)', v_state, sqlerrm, v_hint;
    end if;
  end;
  begin
    update public.entries set search_time_seconds = 181
     where id = '00000000-0000-0000-0000-000002005041';
    raise exception 'FAIL B a manager saved a Qualified over the limit by editing only the time';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_state <> '23514' or v_hint <> 'qualified_over_time_limit' then
      raise exception 'FAIL B wrong refusal: % % (hint %)', v_state, sqlerrm, v_hint;
    end if;
  end;
  begin
    update public.entries set result_status = 'pending', search_time_seconds = 0
     where id = '00000000-0000-0000-0000-000002005042';
    update public.entries set result_status = 'qualified'
     where id = '00000000-0000-0000-0000-000002005042';
    raise exception 'FAIL B a manager turned a no-time result into a Qualified';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '23514' then
      raise exception 'FAIL B wrong refusal: % %', v_state, sqlerrm;
    end if;
  end;
  update public.entries set search_time_seconds = 180
   where id = '00000000-0000-0000-0000-000002005041';
  -- An unrelated edit to the old bad Qualified, and moving it off Qualified, both go through.
  update public.entries set judge_notes = 'checked by the secretary'
   where id = '00000000-0000-0000-0000-000002005045';
  update public.entries set result_status = 'nq'
   where id = '00000000-0000-0000-0000-000002005045';
  raise notice 'PASS B a manager''s direct writes are refused the same way, and unrelated edits are not blocked';
end $$;

-- C. no end-user JWT: not gated
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
do $$
begin
  update public.entries set is_scored = true, result_status = 'qualified', search_time_seconds = 0
   where id = '00000000-0000-0000-0000-000002005044';
  raise notice 'PASS C a write with no end-user JWT is not gated';
end $$;

-- D. placements: the cases of fixtures/qualified-ranking/cases.json, in file order. The letters
-- a..f map to dogs 56..61 (case 1, class 35) and a..e to dogs 62..66 (case 2, class 36).
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order,
                            check_in_status, is_scored, result_status, total_faults, search_time_seconds)
select ('00000000-0000-0000-0000-00000200' || lpad((1000 + c.n * 10 + k.i)::text, 4, '0'))::uuid,
       ('00000000-0000-0000-0000-0000020050' || lpad((56 + c.off + k.i)::text, 2, '0'))::uuid,
       c.class_id, '00000000-0000-0000-0000-000002005021', '00000000-0000-0000-0000-000002005022',
       'confirmed', (c.n * 10 + k.i + 100)::text, k.i + 1, 'completed', true,
       k.status, k.faults, k.t
  from (values
    (1, 0, '00000000-0000-0000-0000-000002005035'::uuid),
    (2, 6, '00000000-0000-0000-0000-000002005036'::uuid)
  ) as c(n, off, class_id)
  join (values
    (1, 0, 'qualified', 0, 0::numeric), (1, 1, 'qualified', 0, 30), (1, 2, 'qualified', 0, 20),
    (1, 3, 'qualified', 0, null), (1, 4, 'qualified', 1, 10), (1, 5, 'nq', 0, 5),
    (2, 0, 'qualified', 1, 12), (2, 1, 'qualified', 0, 90), (2, 2, 'qualified', 1, 11),
    (2, 3, 'excused', 0, 0), (2, 4, 'absent', 0, 0)
  ) as k(n, i, status, faults, t) on k.n = c.n;
alter table public.entries enable trigger trg_entries_require_dog_registration;

select public.recalculate_class_placements(
  array['00000000-0000-0000-0000-000002005035', '00000000-0000-0000-0000-000002005036']::uuid[], false);

do $$
declare
  v_actual integer[];
  v_expected integer[];
  v_class uuid;
begin
  for v_class, v_expected in
    select * from (values
      ('00000000-0000-0000-0000-000002005035'::uuid, array[null, 2, 1, null, 3, null]::integer[]),
      ('00000000-0000-0000-0000-000002005036'::uuid, array[3, 1, 2, null, null]::integer[])
    ) as t(class_id, expected)
  loop
    select array_agg(e.final_placement order by e.armband) into v_actual
      from public.entries e where e.class_id = v_class;
    if v_actual is distinct from v_expected then
      raise exception 'FAIL D class % ranked % but the shared fixture says %', v_class, v_actual, v_expected;
    end if;
  end loop;
  raise notice 'PASS D placements match the shared ranking fixture; a Qualified with no time is unplaced';
end $$;

rollback;
