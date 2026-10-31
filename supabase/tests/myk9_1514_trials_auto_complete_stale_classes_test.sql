-- MYK9-1514: behavioral test for trials.auto_complete_stale_classes and
-- public.ringside_complete_stale_class(), both added by
-- 20261031051700_myk9_1514_trials_auto_complete_stale_classes.sql.
--
-- Part 1: the trial switch. Part 2: the server action - a matching set marks exactly
-- those dogs absent; a grown, shrunk or empty set changes nothing and returns the
-- current ids; an unauthorized caller is refused; a manual-status class completes.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database; the
-- fixture rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1514_trials_auto_complete_stale_classes_test.sql

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001514001', 'MYK9-1514 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001514002', 'MYK9-1514 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000001514001', 'published');

insert into public.trials (id, show_id, name, date, trial_number)
values ('00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514002',
  'MYK9-1514 Trial', current_date, '1');

do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
  v_value boolean;
  v_acl aclitem[];
begin
  select data_type, is_nullable, column_default
    into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'trials'
    and column_name = 'auto_complete_stale_classes';

  if v_type is distinct from 'boolean' then
    raise exception 'FAIL: auto_complete_stale_classes is %, expected boolean', v_type;
  end if;
  if v_nullable is distinct from 'YES' or v_default is not null then
    raise exception 'FAIL: column must be nullable with no default (NULL = enabled), got nullable=% default=%',
      v_nullable, v_default;
  end if;
  raise notice 'PASS: boolean, nullable, no default';

  select auto_complete_stale_classes into v_value
  from public.trials where id = '00000000-0000-0000-0000-000001514003';
  if v_value is not null then
    raise exception 'FAIL: a new trial must read NULL (enabled), got %', v_value;
  end if;
  raise notice 'PASS: new trial reads NULL';

  update public.trials set auto_complete_stale_classes = false
  where id = '00000000-0000-0000-0000-000001514003';
  select auto_complete_stale_classes into v_value
  from public.trials where id = '00000000-0000-0000-0000-000001514003';
  if v_value is distinct from false then
    raise exception 'FAIL: explicit false must round-trip, got %', v_value;
  end if;
  raise notice 'PASS: explicit false round-trips';

  select a.attacl into v_acl
  from pg_attribute a
  where a.attrelid = 'public.trials'::regclass and a.attname = 'auto_complete_stale_classes';
  if v_acl is not null then
    raise exception 'FAIL: the column must inherit the table ACL (attacl NULL), got %', v_acl;
  end if;
  raise notice 'PASS: no column-level ACL';

  if has_column_privilege('anon', 'public.trials', 'auto_complete_stale_classes', 'UPDATE') then
    raise exception 'FAIL: anon must not be able to update the switch';
  end if;
  if not has_column_privilege('authenticated', 'public.trials', 'auto_complete_stale_classes', 'UPDATE') then
    raise exception 'FAIL: authenticated must be able to update the switch (RLS decides the rows)';
  end if;
  raise notice 'PASS: anon cannot write, authenticated can (RLS-gated)';
end
$$;


-- =============================================================================
-- Part 2: ringside_complete_stale_class
-- =============================================================================

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001514011', 'Jay', 'Judge', '00000000-0000-0000-0000-000001514101'),
  ('00000000-0000-0000-0000-000001514012', 'Nora', 'Nobody', '00000000-0000-0000-0000-000001514102');

insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514003',
   'Container Novice A', 'in_progress', 'Container', 'Novice', 'A');
insert into public.classes (id, trial_id, name, status, status_source, element, level, section) values
  ('00000000-0000-0000-0000-000001514022', '00000000-0000-0000-0000-000001514003',
   'Interior Novice A', 'in_progress', 'manual', 'Interior', 'Novice', 'A');
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-000001514011', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514021',
   'confirmed', now()),
  ('00000000-0000-0000-0000-000001514011', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514022',
   'confirmed', now());

-- Six dogs: 031/032 are unscored, 033 is scored, 034 is pulled, 035 is in the ring,
-- 036 is the manual class's only dog.
insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-0000015140' || n)::uuid, 'Dog ' || n, 'Dog ' || n, 'Beagle',
       '00000000-0000-0000-0000-000001514011'
  from unnest(array['31','32','33','34','35','36']) as n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000015140' || n)::uuid, 'AKC (American Kennel Club)',
       'SR1514' || n, true
  from unnest(array['31','32','33','34','35','36']) as n;
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, payment_status, entry_fee,
  is_scored, result_status, check_in_status, is_in_ring
) values
  ('00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514031',
   '00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, false, 'pending', 'checked-in', false),
  ('00000000-0000-0000-0000-000001514132', '00000000-0000-0000-0000-000001514032',
   '00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, false, 'pending', 'checked-in', false),
  ('00000000-0000-0000-0000-000001514133', '00000000-0000-0000-0000-000001514033',
   '00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, true, 'qualified', 'checked-in', false),
  ('00000000-0000-0000-0000-000001514134', '00000000-0000-0000-0000-000001514034',
   '00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, false, 'pending', 'pulled', false),
  ('00000000-0000-0000-0000-000001514135', '00000000-0000-0000-0000-000001514035',
   '00000000-0000-0000-0000-000001514021', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, false, 'pending', 'in-ring', true),
  ('00000000-0000-0000-0000-000001514136', '00000000-0000-0000-0000-000001514036',
   '00000000-0000-0000-0000-000001514022', '00000000-0000-0000-0000-000001514002',
   '00000000-0000-0000-0000-000001514003', '00000000-0000-0000-0000-000001514011',
   'confirmed', 'paid', 25, false, 'pending', 'checked-in', false);

create temporary table myk9_1514 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_1514 to authenticated;

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(p_show uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001514199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001514199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_build_object(
             'kind', 'ringside_passcode', 'show_id', p_show, 'ringside_role', p_role,
             'passcode_generation', '2026-10-10T00:00:00Z'))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(uuid, text) to authenticated;

-- Reads as the table owner: authenticated callers cannot see entries through RLS.
create or replace function pg_temp.q(p_sql text) returns text language plpgsql security definer as $$
declare v text;
begin
  execute p_sql into v;
  return v;
end $$;
grant execute on function pg_temp.q(text) to authenticated;

create or replace function pg_temp.absent_count(p_class uuid) returns integer language sql security definer as $$
  select count(*)::integer from public.entries where class_id = p_class and result_status = 'absent';
$$;
grant execute on function pg_temp.absent_count(uuid) to authenticated;

set local role authenticated;

-- U. unauthorized callers are refused and change nothing
select pg_temp.as_account('00000000-0000-0000-0000-000001514102');
do $$
begin
  begin
    perform public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
      array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132']::uuid[]);
    raise exception 'FAIL U an account with no tier was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS U an account with no tier is refused';
  end;
end $$;
select pg_temp.as_passcode('00000000-0000-0000-0000-000001514999', 'judge');
do $$
begin
  begin
    perform public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
      array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132']::uuid[]);
    raise exception 'FAIL U another show''s judge passcode was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS U another show''s judge passcode is refused';
  end;
end $$;
select pg_temp.as_passcode('00000000-0000-0000-0000-000001514002', 'steward');
do $$
begin
  begin
    perform public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
      array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132']::uuid[]);
    raise exception 'FAIL U a steward passcode was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS U a steward passcode is refused (absent is a scoring write)';
  end;
end $$;
do $$
begin
  if pg_temp.absent_count('00000000-0000-0000-0000-000001514021') <> 0 then
    raise exception 'FAIL U a refused call changed entries';
  end if;
  raise notice 'PASS U refused calls changed nothing';
end $$;
do $$
begin
  if has_function_privilege('anon', 'public.ringside_complete_stale_class(uuid, uuid[])', 'EXECUTE') then
    raise exception 'FAIL anon can execute ringside_complete_stale_class';
  end if;
  raise notice 'PASS anon has no EXECUTE';
end $$;

-- G. grown, shrunk and empty sets refuse and change nothing (assigned judge)
select pg_temp.as_account('00000000-0000-0000-0000-000001514101');
do $$
declare
  v_reply jsonb;
  v_ids uuid[];
begin
  -- grown: the judge saw 031 only, 032 has since joined the unscored set
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514131']::uuid[]);
  select array_agg(x::uuid order by x::uuid) into v_ids from jsonb_array_elements_text(v_reply -> 'current_entry_ids') x;
  if (v_reply ->> 'ok')::boolean is not false
     or v_ids is distinct from array['00000000-0000-0000-0000-000001514131',
                                      '00000000-0000-0000-0000-000001514132']::uuid[] then
    raise exception 'FAIL G grown set not refused with the current ids: %', v_reply;
  end if;
  raise notice 'PASS G a grown set is refused and the current ids are returned (scored, pulled and in-ring dogs excluded)';

  -- shrunk: the judge saw 031, 032 and 033, but 033 is scored
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132',
          '00000000-0000-0000-0000-000001514133']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not false then
    raise exception 'FAIL G a set naming a scored dog was not refused: %', v_reply;
  end if;
  raise notice 'PASS G a set naming a scored dog is refused';

  -- in-ring and pulled dogs can never be named
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132',
          '00000000-0000-0000-0000-000001514135']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not false then
    raise exception 'FAIL G a set naming an in-ring dog was not refused: %', v_reply;
  end if;
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132',
          '00000000-0000-0000-0000-000001514134']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not false then
    raise exception 'FAIL G a set naming a pulled dog was not refused: %', v_reply;
  end if;
  raise notice 'PASS G in-ring and pulled dogs are refused';

  -- empty and NULL never mark anything
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021', '{}'::uuid[]);
  if (v_reply ->> 'ok')::boolean is not false then
    raise exception 'FAIL G an empty set was not refused: %', v_reply;
  end if;
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021', null);
  if (v_reply ->> 'ok')::boolean is not false then
    raise exception 'FAIL G a NULL set was not refused: %', v_reply;
  end if;
  raise notice 'PASS G empty and NULL sets are refused';

  if pg_temp.absent_count('00000000-0000-0000-0000-000001514021') <> 0 then
    raise exception 'FAIL G a refused call changed entries';
  end if;
  raise notice 'PASS G refusals changed nothing';
end $$;

-- M. the matching set (order and duplicates ignored) marks exactly those dogs absent
do $$
declare
  v_reply jsonb;
  v_n integer;
begin
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514132', '00000000-0000-0000-0000-000001514131',
          '00000000-0000-0000-0000-000001514132']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not true or (v_reply ->> 'marked_count')::integer <> 2 then
    raise exception 'FAIL M matching set not accepted: %', v_reply;
  end if;
  raise notice 'PASS M the matching set is accepted (marked_count 2)';

  v_n := pg_temp.q($q$select count(*) from public.entries
   where id in ('00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132')
     and result_status = 'absent' and is_scored = true and search_time_seconds = 0
     and disqualification_reason = 'Absent' and scoring_completed_at is not null$q$)::integer;
  if v_n <> 2 then
    raise exception 'FAIL M expected both named dogs absent with the Absent chip''s columns, got %', v_n;
  end if;
  raise notice 'PASS M exactly the named dogs are absent, with the Absent chip''s columns';

  v_n := pg_temp.q($q$select count(*) from public.entries
   where id in ('00000000-0000-0000-0000-000001514133', '00000000-0000-0000-0000-000001514134',
                '00000000-0000-0000-0000-000001514135')
     and result_status = 'absent'$q$)::integer;
  if v_n <> 0 then
    raise exception 'FAIL M % dog(s) outside the set were marked absent', v_n;
  end if;
  raise notice 'PASS M the scored, pulled and in-ring dogs were left alone';

  -- a second tap finds nothing left and writes nothing
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514021',
    array['00000000-0000-0000-0000-000001514131', '00000000-0000-0000-0000-000001514132']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not false or jsonb_array_length(v_reply -> 'current_entry_ids') <> 0 then
    raise exception 'FAIL M a repeated call should find no dogs left: %', v_reply;
  end if;
  raise notice 'PASS M a repeated call is refused with no dogs left';
end $$;

-- S. a class whose status a person set by hand completes in the same call
do $$
declare
  v_reply jsonb;
  v_status text;
begin
  v_reply := public.ringside_complete_stale_class('00000000-0000-0000-0000-000001514022',
    array['00000000-0000-0000-0000-000001514136']::uuid[]);
  if (v_reply ->> 'ok')::boolean is not true then
    raise exception 'FAIL S manual-status class not accepted: %', v_reply;
  end if;
  v_status := pg_temp.q($q$select status from public.classes where id = '00000000-0000-0000-0000-000001514022'$q$);
  if v_status is distinct from 'completed' then
    raise exception 'FAIL S a manual-status class should be completed, got %', v_status;
  end if;
  raise notice 'PASS S a manual-status class is completed by the same call';
end $$;

rollback;
