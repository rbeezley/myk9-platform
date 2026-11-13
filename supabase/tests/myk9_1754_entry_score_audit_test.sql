-- MYK9-1754: every successful ringside_update_entry write leaves exactly one
-- append-only row in public.entry_score_audit, in the same transaction.
--
-- Sections:
--   A. a manager's score write: one row, tier manager, the person, the field
--      diff ({old,new} per changed key), the device save time, the version
--   B. writes that wrote nothing audit nothing: an idempotent MYK9-740 replay, a
--      payload with no writable key, a stale-version conflict (40001), and an
--      unauthorized caller (42501)
--   C. a passcode judge row names the tier, role and generation, no person; a
--      passcode steward row likewise; client_saved_at stays NULL when not sent
--   D. a rolled-back call leaves no row (the audit insert shares the transaction)
--   E. access: a show manager reads; a signed-in user with no role reads nothing;
--      no client can insert, update or delete; anon has no access at all
--   F. the 3-argument signature is gone, the 4-argument one is callable by
--      authenticated only
--   G. a matching-version no-change write leaves one row with an empty diff;
--      assigned_judge, steward and passcode_admin tiers; append-only for the owner
--
-- Fixtures roll back. Section B's stale-version call burns one
-- ringside_conflict_seq value, which survives ROLLBACK (see
-- ringside_containment_test.sql); do not loop this file against a shared database.

begin;

update public.ringside_containment
   set state = 'armed', tripped_at = null, trip_conflict_delta = null, trip_reason = null;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001754011', 'Audit', 'Admin',
   '00000000-0000-0000-0000-000001754101'),
  ('00000000-0000-0000-0000-000001754012', 'Plain', 'User',
   '00000000-0000-0000-0000-000001754102'),
  ('00000000-0000-0000-0000-000001754013', 'Assigned', 'Judge',
   '00000000-0000-0000-0000-000001754103'),
  ('00000000-0000-0000-0000-000001754014', 'Show', 'Steward',
   '00000000-0000-0000-0000-000001754104');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001754011', r.id, true,
       '00000000-0000-0000-0000-000001754101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001754020', 'MYK9-1754 Audit Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001754021', 'MYK9-1754 Audit Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001754020', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000001754022', '00000000-0000-0000-0000-000001754021',
        'MYK9-1754 Audit Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000001754023', '00000000-0000-0000-0000-000001754022',
        'Container Novice', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000001754024', 'Audit Dog', 'Audit Dog', 'Beagle',
        '00000000-0000-0000-0000-000001754011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000001754024', 'AKC (American Kennel Club)',
        'SR' || upper(substr(md5('00000000-0000-0000-0000-000001754024'), 1, 8)), true);
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000001754033', '00000000-0000-0000-0000-000001754024',
   '00000000-0000-0000-0000-000001754023', '00000000-0000-0000-0000-000001754021',
   '00000000-0000-0000-0000-000001754022', '00000000-0000-0000-0000-000001754011',
   'confirmed', 'paid', 25);
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001754013', '00000000-0000-0000-0000-000001754021',
        '00000000-0000-0000-0000-000001754022', '00000000-0000-0000-0000-000001754023',
        'confirmed', now());
insert into public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001754014', r.id, '00000000-0000-0000-0000-000001754021',
       true, '00000000-0000-0000-0000-000001754104'
  from public.roles r where r.name = 'steward';
-- MYK9-1950: a judge code belongs to a judge. The assigned judge above got one from the
-- judge_assignments trigger; pin its generation so the claims below can name it.
update public.show_passcodes set created_at = '2026-11-01T00:00:00Z'
 where show_id = '00000000-0000-0000-0000-000001754021'
   and person_id = '00000000-0000-0000-0000-000001754013';
insert into public.show_passcodes (show_id, role, passcode_hash, created_at) values
  ('00000000-0000-0000-0000-000001754021', 'admin', 'myk9-1754-admin', '2026-11-03T00:00:00Z'),
  ('00000000-0000-0000-0000-000001754021', 'steward', 'myk9-1754-steward', '2026-11-02T00:00:00Z');

-- `authenticated` has no table-level SELECT on entries or the audit's count
-- helper, so results cross the role boundary through this temp table.
create temporary table myk9_1754 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_1754 to authenticated;
insert into myk9_1754 (step, value)
select 'base_version', version::text
  from public.entries where id = '00000000-0000-0000-0000-000001754033';
-- The whole pre-write row, so `old` is compared with what the row really held
-- (column defaults such as search_time_seconds = 0 and result_status = 'pending'
-- are not nulls), never with hard-coded values.
insert into myk9_1754 (step, value)
select 'base_row', to_jsonb(e)::text
  from public.entries e where e.id = '00000000-0000-0000-0000-000001754033';

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_passcode(
  p_role text, p_generation text, p_person text default null)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001754199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001754199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_strip_nulls(jsonb_build_object(
             'kind', 'ringside_passcode',
             'show_id', '00000000-0000-0000-0000-000001754021',
             'ringside_role', p_role,
             'ringside_person_id', p_person,
             'passcode_generation', p_generation)))::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.as_passcode(text, text, text) to authenticated;

-- ===========================================================================
-- A. A manager's score write.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001754101');

do $$
declare
  v_base integer;
begin
  select value::integer into strict v_base from myk9_1754 where step = 'base_version';
  insert into myk9_1754 values ('a_version',
    public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('is_scored', true, 'result_status', 'nq',
                         'search_time_seconds', 42, 'disqualification_reason', 'Incorrect Call',
                         'scoring_completed_at', '2026-11-07T15:42:00Z'),
      v_base,
      '2026-11-07T15:42:00Z')::text);
end;
$$;

reset role;
do $$
declare
  r public.entry_score_audit%rowtype;
  v_version integer;
  v_key text;
begin
  select value::integer into strict v_version from myk9_1754 where step = 'a_version';

  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 1 then
    raise exception 'FAIL expected exactly one audit row after one write, got %',
      (select count(*) from public.entry_score_audit
        where entry_id = '00000000-0000-0000-0000-000001754033');
  end if;

  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033';

  if r.actor_tier <> 'manager' then raise exception 'FAIL tier %, expected manager', r.actor_tier; end if;
  if r.actor_user_id <> '00000000-0000-0000-0000-000001754101' then
    raise exception 'FAIL actor_user_id %', r.actor_user_id;
  end if;
  if r.actor_person_id <> '00000000-0000-0000-0000-000001754011' then
    raise exception 'FAIL actor_person_id %', r.actor_person_id;
  end if;
  if r.actor_display_name <> 'Audit Admin' then
    raise exception 'FAIL actor_display_name %', r.actor_display_name;
  end if;
  if r.passcode_role is not null or r.passcode_generation is not null then
    raise exception 'FAIL an account write carried passcode columns';
  end if;
  if r.show_id <> '00000000-0000-0000-0000-000001754021'
     or r.class_id <> '00000000-0000-0000-0000-000001754023' then
    raise exception 'FAIL show/class context %/%', r.show_id, r.class_id;
  end if;
  if r.client_saved_at <> '2026-11-07T15:42:00Z'::timestamptz then
    raise exception 'FAIL client_saved_at %', r.client_saved_at;
  end if;
  if r.entry_version <> v_version then
    raise exception 'FAIL entry_version %, RPC returned %', r.entry_version, v_version;
  end if;
  if r.changed_at is null or r.changed_at > now() + interval '1 minute' then
    raise exception 'FAIL changed_at %', r.changed_at;
  end if;
  if not (r.changes -> 'is_scored' ? 'old')
     or r.changes -> 'is_scored' ->> 'new' <> 'true'
     or r.changes -> 'is_scored' ->> 'old' is not distinct from 'true' then
    raise exception 'FAIL is_scored diff %', r.changes -> 'is_scored';
  end if;
  if r.changes -> 'result_status' ->> 'new' <> 'nq'
     or (r.changes -> 'search_time_seconds' ->> 'new')::numeric <> 42 then
    raise exception 'FAIL diff values %', r.changes;
  end if;
  raise notice 'PASS a manager write leaves one row naming tier, person, diff, device time, version';

  -- A versioned write's `old` values are the row's values before the write.
  -- Every key in the diff is compared with the captured pre-write row.
  for v_key in select jsonb_object_keys(r.changes) loop
    if (r.changes -> v_key -> 'old')
       is distinct from ((select value::jsonb from myk9_1754 where step = 'base_row') -> v_key) then
      raise exception 'FAIL % old % differs from the pre-write row value %',
        v_key, r.changes -> v_key -> 'old',
        (select value::jsonb from myk9_1754 where step = 'base_row') -> v_key;
    end if;
  end loop;
  -- Positive control: the diff really holds the four keys that differ from the
  -- column defaults, so the loop above compared something.
  if not (r.changes ?& array['is_scored', 'result_status', 'search_time_seconds',
                             'disqualification_reason']) then
    raise exception 'FAIL expected diff keys missing: %', r.changes;
  end if;

  -- Unchanged keys are not in the diff: re-sending the same value is not a change.
  if r.changes ? 'run_order' then raise exception 'FAIL diff lists a key that was not sent'; end if;
end;
$$;

-- ===========================================================================
-- B. Writes that wrote nothing audit nothing.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001754101');

do $$
declare
  v_base integer;
  v_after integer;
  v_state text;
begin
  select value::integer into strict v_base from myk9_1754 where step = 'base_version';
  select value::integer into strict v_after from myk9_1754 where step = 'a_version';

  -- Idempotent replay of section A with the pre-write version (MYK9-740).
  insert into myk9_1754 values ('b_replay',
    public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('is_scored', true, 'result_status', 'nq',
                         'search_time_seconds', 42, 'disqualification_reason', 'Incorrect Call',
                         'scoring_completed_at', '2026-11-07T15:42:00Z'),
      v_base,
      '2026-11-07T15:43:00Z')::text);

  -- A payload with no writable key returns the version and writes nothing.
  insert into myk9_1754 values ('b_nokey',
    public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('entry_status', 'withdrawn'),
      v_after)::text);

  -- A stale write with different values is a real conflict.
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('result_status', 'qualified'), v_base);
    raise exception 'FAIL a stale differing write was accepted';
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> '40001' then raise exception 'FAIL expected 40001 got %', v_state; end if;
  end;
end;
$$;

-- An unauthorized signed-in user (no role, not assigned) is refused.
select pg_temp.as_account('00000000-0000-0000-0000-000001754102');
do $$
declare
  v_state text;
  v_after integer;
begin
  select value::integer into strict v_after from myk9_1754 where step = 'a_version';
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('total_faults', 9), v_after);
    raise exception 'FAIL an unauthorized write was accepted';
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> '42501' then raise exception 'FAIL expected 42501 got %', v_state; end if;
  end;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 1 then
    raise exception 'FAIL a replay, no-op, conflict or refusal wrote an audit row (% rows)',
      (select count(*) from public.entry_score_audit
        where entry_id = '00000000-0000-0000-0000-000001754033');
  end if;
  raise notice 'PASS replay, no-writable-key, 40001 and 42501 calls write no audit row';
end;
$$;

-- ===========================================================================
-- C. Passcode sessions.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_passcode('judge', '2026-11-01T00:00:00Z', '00000000-0000-0000-0000-000001754013');

do $$
declare
  v_now integer;
begin
  -- Authenticated has no entries SELECT, so read the current version through
  -- the no-op call (no writable key returns the version and writes nothing).
  v_now := public.ringside_update_entry(
    '00000000-0000-0000-0000-000001754033',
    jsonb_build_object('entry_status', 'withdrawn'), null);

  insert into myk9_1754 values ('c_judge',
    public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('total_faults', 3), v_now)::text);
end;
$$;

select pg_temp.as_passcode('steward', '2026-11-02T00:00:00Z');
do $$
declare
  v_now integer;
begin
  v_now := (select value::integer from myk9_1754 where step = 'c_judge');
  insert into myk9_1754 values ('c_steward',
    public.ringside_update_entry(
      '00000000-0000-0000-0000-000001754033',
      jsonb_build_object('run_order', 7), v_now)::text);
end;
$$;

reset role;
do $$
declare
  r public.entry_score_audit%rowtype;
begin
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and actor_tier = 'passcode_judge';
  if r.actor_person_id is not null or r.actor_display_name is not null then
    raise exception 'FAIL a passcode row named a person';
  end if;
  if r.actor_user_id <> '00000000-0000-0000-0000-000001754199' then
    raise exception 'FAIL passcode actor_user_id %', r.actor_user_id;
  end if;
  if r.passcode_role <> 'judge' or r.passcode_generation <> '2026-11-01T00:00:00Z' then
    raise exception 'FAIL passcode role/generation %/%', r.passcode_role, r.passcode_generation;
  end if;
  if r.client_saved_at is not null then
    raise exception 'FAIL client_saved_at invented for a call that sent none';
  end if;
  if (r.changes -> 'total_faults' ->> 'new')::numeric <> 3 then
    raise exception 'FAIL passcode diff %', r.changes;
  end if;

  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and actor_tier = 'passcode_steward';
  if r.passcode_role <> 'steward' or r.passcode_generation <> '2026-11-02T00:00:00Z'
     or r.actor_person_id is not null then
    raise exception 'FAIL steward passcode row %', to_jsonb(r);
  end if;
  if (r.changes -> 'run_order' ->> 'new')::numeric <> 7 then
    raise exception 'FAIL steward diff %', r.changes;
  end if;

  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 3 then
    raise exception 'FAIL expected 3 rows (manager, judge, steward)';
  end if;
  raise notice 'PASS passcode rows carry tier, role, generation and no person';
end;
$$;

-- ===========================================================================
-- D. A rolled-back call leaves no row: the insert shares the transaction.
-- ===========================================================================
savepoint before_rollback;
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001754101');
do $$
declare
  v_now integer;
begin
  v_now := (select value::integer from myk9_1754 where step = 'c_steward');
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001754033', jsonb_build_object('total_faults', 8), v_now);
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 4 then
    raise exception 'FAIL positive control: the write inside the savepoint left no row';
  end if;
end;
$$;
rollback to savepoint before_rollback;
do $$
begin
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 3 then
    raise exception 'FAIL a rolled-back write left an audit row';
  end if;
  raise notice 'PASS the audit row rolls back with its write';
end;
$$;

-- ===========================================================================
-- E. Access.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001754101');
do $$
begin
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001754033') <> 3 then
    raise exception 'FAIL a show manager cannot read the audit';
  end if;
end;
$$;

select pg_temp.as_account('00000000-0000-0000-0000-000001754102');
do $$
declare
  v_state text;
begin
  if (select count(*) from public.entry_score_audit) <> 0 then
    raise exception 'FAIL a user with no role can read audit rows';
  end if;

  begin
    insert into public.entry_score_audit (entry_id, class_id, show_id, actor_tier)
    values ('00000000-0000-0000-0000-000001754033', '00000000-0000-0000-0000-000001754023',
            '00000000-0000-0000-0000-000001754021', 'manager');
    raise exception 'FAIL authenticated inserted an audit row';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'FAIL insert: expected 42501 got %', v_state; end if;
  end;
end;
$$;

select pg_temp.as_account('00000000-0000-0000-0000-000001754101');
do $$
declare
  v_state text;
begin
  begin
    update public.entry_score_audit set actor_tier = 'steward';
    raise exception 'FAIL a manager updated an audit row';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'FAIL update: expected 42501 got %', v_state; end if;
  end;
  begin
    delete from public.entry_score_audit;
    raise exception 'FAIL a manager deleted an audit row';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'FAIL delete: expected 42501 got %', v_state; end if;
  end;
end;
$$;

reset role;
set local role anon;
do $$
declare
  v_state text;
begin
  begin
    perform count(*) from public.entry_score_audit;
    raise exception 'FAIL anon read the audit table';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'FAIL anon select: expected 42501 got %', v_state; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.entry_score_audit', 'insert')
     or has_table_privilege('anon', 'public.entry_score_audit', 'update')
     or has_table_privilege('anon', 'public.entry_score_audit', 'delete')
     or has_table_privilege('anon', 'public.entry_score_audit', 'select') then
    raise exception 'FAIL anon holds a table privilege on entry_score_audit';
  end if;
  if has_table_privilege('authenticated', 'public.entry_score_audit', 'insert')
     or has_table_privilege('authenticated', 'public.entry_score_audit', 'update')
     or has_table_privilege('authenticated', 'public.entry_score_audit', 'delete')
     or has_table_privilege('authenticated', 'public.entry_score_audit', 'truncate') then
    raise exception 'FAIL authenticated holds a write privilege on entry_score_audit';
  end if;
  if not has_table_privilege('authenticated', 'public.entry_score_audit', 'select') then
    raise exception 'FAIL authenticated lost SELECT (RLS needs it to admit managers)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.entry_score_audit'::regclass) then
    raise exception 'FAIL RLS is not enabled on entry_score_audit';
  end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.entry_score_audit'::regclass) then
    raise exception 'FAIL RLS is not forced on entry_score_audit';
  end if;
  raise notice 'PASS managers read, others do not, no client writes, anon has nothing';
end;
$$;

-- ===========================================================================
-- F. Signature and grants.
-- ===========================================================================
do $$
begin
  if to_regprocedure('public.ringside_update_entry(uuid,jsonb,integer)') is not null then
    raise exception 'FAIL the old 3-argument overload is still callable';
  end if;
  if to_regprocedure('public.ringside_update_entry(uuid,jsonb,integer,timestamptz)') is null then
    raise exception 'FAIL the 4-argument function is missing';
  end if;
  if has_function_privilege('anon',
       'public.ringside_update_entry(uuid,jsonb,integer,timestamptz)', 'execute') then
    raise exception 'FAIL anon can execute ringside_update_entry';
  end if;
  if not has_function_privilege('authenticated',
       'public.ringside_update_entry(uuid,jsonb,integer,timestamptz)', 'execute') then
    raise exception 'FAIL authenticated cannot execute ringside_update_entry';
  end if;
  raise notice 'PASS one signature, authenticated-only execute';
end;
$$;

-- ===========================================================================
-- G. A matching-version write that changes nothing still writes one row (with
--    an empty diff), every remaining account tier is named correctly, and the
--    table is append-only even for its owner.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001754101');
do $$
declare
  v_now integer;
begin
  v_now := public.ringside_update_entry('00000000-0000-0000-0000-000001754033',
    jsonb_build_object('entry_status', 'withdrawn'), null);
  -- total_faults already holds 3 (section C): same value, matching version.
  insert into myk9_1754 values ('g_manager',
    public.ringside_update_entry('00000000-0000-0000-0000-000001754033',
      jsonb_build_object('total_faults', 3), v_now)::text);
end;
$$;

select pg_temp.as_account('00000000-0000-0000-0000-000001754103');
do $$
begin
  insert into myk9_1754 values ('g_judge',
    public.ringside_update_entry('00000000-0000-0000-0000-000001754033',
      jsonb_build_object('total_faults', 4),
      (select value::integer from myk9_1754 where step = 'g_manager'))::text);
end;
$$;

select pg_temp.as_account('00000000-0000-0000-0000-000001754104');
do $$
begin
  insert into myk9_1754 values ('g_steward',
    public.ringside_update_entry('00000000-0000-0000-0000-000001754033',
      jsonb_build_object('run_order', 9),
      (select value::integer from myk9_1754 where step = 'g_judge'))::text);
end;
$$;

select pg_temp.as_passcode('admin', '2026-11-03T00:00:00Z');
do $$
begin
  insert into myk9_1754 values ('g_admin',
    public.ringside_update_entry('00000000-0000-0000-0000-000001754033',
      jsonb_build_object('total_faults', 5),
      (select value::integer from myk9_1754 where step = 'g_steward'))::text);
end;
$$;

reset role;
do $$
declare
  r public.entry_score_audit%rowtype;
  v_state text;
  v_msg text;
begin
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and changes = '{}'::jsonb;
  if r.actor_tier <> 'manager' then
    raise exception 'FAIL the no-change write row names tier %', r.actor_tier;
  end if;

  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and actor_tier = 'assigned_judge';
  if r.actor_person_id <> '00000000-0000-0000-0000-000001754013'
     or r.passcode_role is not null then
    raise exception 'FAIL assigned_judge row %', to_jsonb(r);
  end if;

  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and actor_tier = 'steward';
  if r.actor_person_id <> '00000000-0000-0000-0000-000001754014'
     or r.passcode_role is not null then
    raise exception 'FAIL steward-role row %', to_jsonb(r);
  end if;

  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001754033' and actor_tier = 'passcode_admin';
  if r.passcode_role <> 'admin' or r.passcode_generation <> '2026-11-03T00:00:00Z'
     or r.actor_person_id is not null then
    raise exception 'FAIL passcode_admin row %', to_jsonb(r);
  end if;
  raise notice 'PASS no-change write, assigned_judge, steward and passcode_admin tiers';

  -- Append-only holds for the table owner too (this block runs as the owner).
  begin
    update public.entry_score_audit set actor_tier = 'steward';
    raise exception 'FAIL the owner updated an audit row';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '42501' or v_msg <> 'entry_score_audit is append-only' then
      raise exception 'FAIL owner update: got %/%', v_state, v_msg;
    end if;
  end;
  begin
    delete from public.entry_score_audit;
    raise exception 'FAIL the owner deleted an audit row';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '42501' or v_msg <> 'entry_score_audit is append-only' then
      raise exception 'FAIL owner delete: got %/%', v_state, v_msg;
    end if;
  end;
  begin
    truncate public.entry_score_audit;
    raise exception 'FAIL the owner truncated the audit table';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '42501' or v_msg <> 'entry_score_audit is append-only' then
      raise exception 'FAIL owner truncate: got %/%', v_state, v_msg;
    end if;
  end;
  raise notice 'PASS the audit table is append-only even for its owner';
end;
$$;

rollback;
