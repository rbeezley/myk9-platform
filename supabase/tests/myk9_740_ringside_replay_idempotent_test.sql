-- MYK9-740: a replayed ringside_update_entry call whose write already landed
-- returns success instead of a 40001 version conflict.
--
-- The failure this guards (Playwright Regression run 36057233283): a judge's
-- offline score drained on reconnect, the page reloaded before the response
-- arrived, and the server had already committed it. The queue replayed the same
-- call with the pre-commit version and got 40001, so the judge saw "This record
-- was changed elsewhere" for their own score.
--
-- Sections:
--   A. the lost-response replay returns the current version and writes nothing
--   B. the same values in another spelling (…+00:00, 0.0) still count as applied
--   C. a replay whose values DIFFER is still an ordinary 40001 with the version
--   D. a partial match (one field landed, one did not) is still a conflict
--   E. the rebased follow-up write for the same row lands normally
--   0. a real conflict locks nothing; only a matching payload takes the row
--      lock (Codex P1 on PR #2436: the lock was held through the containment
--      back-off). Runs first, before any call in this file locks the row.
--   F. the shared predicate both conflict sites call, and its grant posture.
--      The overlap race itself (two identical calls in flight, the loser
--      reaching the late post-UPDATE site) needs two sessions, so it was
--      reproduced red/green on a throwaway Postgres; this pins the predicate
--      that site now calls, which is the same one step 6 calls.
--
-- Fixtures roll back. Sections C and D each burn one ringside_conflict_seq
-- value, which survives ROLLBACK (see ringside_containment_test.sql); two values
-- are far below the breaker's threshold, but do not loop this file against a
-- shared database.

begin;

update public.ringside_containment
   set state = 'armed', tripped_at = null, trip_conflict_delta = null, trip_reason = null;

insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000740011', 'Replay', 'Admin',
        '00000000-0000-0000-0000-000000740101');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000740011', r.id, true,
       '00000000-0000-0000-0000-000000740101'
from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000740020', 'MYK9-740 Replay Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000740021', 'MYK9-740 Replay Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000000740020', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000000740022', '00000000-0000-0000-0000-000000740021',
        'MYK9-740 Replay Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000740023', '00000000-0000-0000-0000-000000740022',
        'Container Novice', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000740024', 'Replay Dog', 'Replay Dog', 'Beagle',
        '00000000-0000-0000-0000-000000740011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000740024', 'AKC (American Kennel Club)',
        'SR' || upper(substr(md5('00000000-0000-0000-0000-000000740024'), 1, 8)), true);
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000000740033', '00000000-0000-0000-0000-000000740024',
   '00000000-0000-0000-0000-000000740023', '00000000-0000-0000-0000-000000740021',
   '00000000-0000-0000-0000-000000740022', '00000000-0000-0000-0000-000000740011',
   'confirmed', 'paid', 25);

-- `authenticated` has no table-level SELECT on entries, so versions and the
-- conflict counter are read as the session role and cross the role boundary
-- through this temp table.
create temporary table myk9_740 (step text primary key, value text) on commit drop;
grant select, insert on myk9_740 to authenticated;
insert into myk9_740 (step, value)
select 'base_version', version::text
  from public.entries where id = '00000000-0000-0000-0000-000000740033';
insert into myk9_740 (step, value)
select 'seq_before', coalesce(last_value, 0)::text
  from pg_sequences where schemaname = 'public' and sequencename = 'ringside_conflict_seq';

-- ===========================================================================
-- 0. The replay predicate locks the row only when the payload already matches.
-- A row lock this transaction takes sets the tuple's xmax to our xid, and
-- nothing earlier in this file locks or updates the entry, so xmax is the
-- lock probe. The positive control proves the probe sees a lock at all.
-- ===========================================================================
do $$
begin
  if (select xmax::text from public.entries
       where id = '00000000-0000-0000-0000-000000740033') <> '0' then
    raise exception 'FAIL precondition: the fixture row is already locked';
  end if;

  -- A differing value: a real conflict. It must return NULL and lock nothing.
  if public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-000000740033',
       jsonb_build_object('entry_status', 'withdrawn')) is not null then
    raise exception 'FAIL a differing payload was treated as applied';
  end if;
  if (select xmax::text from public.entries
       where id = '00000000-0000-0000-0000-000000740033') <> '0' then
    raise exception 'FAIL a real conflict took the row lock';
  end if;

  -- Positive control: a matching payload returns the version and locks the row.
  if public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-000000740033',
       jsonb_build_object('entry_status', 'confirmed')) is null then
    raise exception 'FAIL a matching payload was not treated as applied';
  end if;
  if (select xmax::text from public.entries
       where id = '00000000-0000-0000-0000-000000740033')
     is distinct from pg_current_xact_id()::xid::text then
    raise exception 'FAIL a matching payload did not lock the row (probe blind?)';
  end if;
  raise notice 'PASS a real conflict locks nothing; only an applied replay locks the row';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000740101', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000740101","role":"authenticated"}', true);

do $$
declare
  v_base integer;
  v_score jsonb := jsonb_build_object(
    'result_status', 'nq',
    'is_scored', true,
    'search_time_seconds', 0,
    'total_faults', 0,
    'scoring_completed_at', '2026-09-24T21:19:38.574Z',
    'area1_time_seconds', null,
    'points_earned', 0,
    'disqualification_reason', 'Incorrect Call'
  );
begin
  select value::integer into strict v_base from myk9_740 where step = 'base_version';

  -- The call whose response was lost: it commits.
  insert into myk9_740 values ('first',
    public.ringside_update_entry('00000000-0000-0000-0000-000000740033', v_score, v_base)::text);

  -- A. The same call replayed with the pre-commit version.
  insert into myk9_740 values ('replay',
    public.ringside_update_entry('00000000-0000-0000-0000-000000740033', v_score, v_base)::text);

  -- B. The same values, spelled the way PostgREST reads them back.
  insert into myk9_740 values ('replay_spelling',
    public.ringside_update_entry('00000000-0000-0000-0000-000000740033',
      jsonb_build_object('scoring_completed_at', '2026-09-24T21:19:38.574+00:00',
                         'search_time_seconds', 0.0),
      v_base)::text);
end;
$$;

reset role;
do $$
declare
  v_base integer;
  v_first integer;
  v_now integer;
begin
  select value::integer into strict v_base from myk9_740 where step = 'base_version';
  select value::integer into strict v_first from myk9_740 where step = 'first';
  select version into strict v_now from public.entries
   where id = '00000000-0000-0000-0000-000000740033';

  if v_first <> v_base + 1 then
    raise exception 'FAIL first write returned %, expected %', v_first, v_base + 1;
  end if;
  if (select value::integer from myk9_740 where step = 'replay') <> v_first then
    raise exception 'FAIL replay returned %, expected the current version %',
      (select value from myk9_740 where step = 'replay'), v_first;
  end if;
  if (select value::integer from myk9_740 where step = 'replay_spelling') <> v_first then
    raise exception 'FAIL differently spelled replay returned %',
      (select value from myk9_740 where step = 'replay_spelling');
  end if;
  if v_now <> v_first then
    raise exception 'FAIL a replay wrote again: version % after first write %', v_now, v_first;
  end if;
  if (select coalesce(last_value, 0) from pg_sequences
       where schemaname = 'public' and sequencename = 'ringside_conflict_seq')
     <> (select value::bigint from myk9_740 where step = 'seq_before') then
    raise exception 'FAIL an already-applied replay was counted as a conflict';
  end if;
  raise notice 'PASS a replay of a landed write returns the current version and writes nothing';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000740101","role":"authenticated"}', true);

do $$
declare
  v_base integer;
  v_first integer;
  v_state text;
  v_detail text;
begin
  select value::integer into strict v_base from myk9_740 where step = 'base_version';
  select value::integer into strict v_first from myk9_740 where step = 'first';

  -- C. Different values with the stale version: a real conflict.
  begin
    perform public.ringside_update_entry('00000000-0000-0000-0000-000000740033',
      jsonb_build_object('result_status', 'qualified'), v_base);
    raise exception 'FAIL a differing stale write was accepted';
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
      if v_state <> '40001' or v_detail <> v_first::text then
        raise exception 'FAIL differing stale write: expected 40001/% got %/%',
          v_first, v_state, v_detail;
      end if;
  end;
  raise notice 'PASS a stale write with different values is still a 40001 carrying the version';

  -- D. One field already landed, one did not: still a conflict.
  begin
    perform public.ringside_update_entry('00000000-0000-0000-0000-000000740033',
      jsonb_build_object('result_status', 'nq', 'check_in_status', 'completed'), v_base);
    raise exception 'FAIL a partially applied stale write was accepted';
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> '40001' then
        raise exception 'FAIL partial match: expected 40001 got %', v_state;
      end if;
  end;
  raise notice 'PASS a partially applied stale write is still a conflict';

  -- E. The follow-up write, rebased onto the version the replay returned.
  insert into myk9_740 values ('follow_up',
    public.ringside_update_entry('00000000-0000-0000-0000-000000740033',
      jsonb_build_object('check_in_status', 'completed',
                         'ring_exit_time', '2026-09-24T21:19:38.594Z'),
      v_first)::text);
end;
$$;

reset role;
do $$
declare
  v_first integer;
  r record;
begin
  select value::integer into strict v_first from myk9_740 where step = 'first';
  select version, result_status, check_in_status into strict r
    from public.entries where id = '00000000-0000-0000-0000-000000740033';
  if (select value::integer from myk9_740 where step = 'follow_up') <> v_first + 1
     or r.version <> v_first + 1 then
    raise exception 'FAIL follow-up write: returned % row version %, expected %',
      (select value from myk9_740 where step = 'follow_up'), r.version, v_first + 1;
  end if;
  if r.result_status <> 'nq' or r.check_in_status <> 'completed' then
    raise exception 'FAIL final row % / %', r.result_status, r.check_in_status;
  end if;
  raise notice 'PASS the rebased follow-up write lands once';
end;
$$;

-- ===========================================================================
-- F. ringside_replay_applied_version: one definition of "already applied".
-- ===========================================================================
do $$
declare
  v_version integer;
begin
  select version into strict v_version from public.entries
   where id = '00000000-0000-0000-0000-000000740033';

  -- Every requested value already stored (including another spelling of the
  -- same instant): the current version.
  if public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-000000740033',
       jsonb_build_object('result_status', 'nq',
                          'scoring_completed_at', '2026-09-24T21:19:38.574+00:00',
                          'check_in_status', 'completed'))
     is distinct from v_version then
    raise exception 'FAIL predicate did not recognise stored values as applied';
  end if;

  -- One differing value: not applied.
  if public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-000000740033',
       jsonb_build_object('result_status', 'nq', 'check_in_status', 'in-ring'))
     is not null then
    raise exception 'FAIL predicate treated a differing value as applied';
  end if;

  -- A key the row does not have, an empty payload, a missing row: not applied.
  if public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-000000740033', jsonb_build_object('no_such_column', 1))
     is not null
     or public.ringside_replay_applied_version('00000000-0000-0000-0000-000000740033', null)
     is not null
     or public.ringside_replay_applied_version(
       '00000000-0000-0000-0000-00000074dead', jsonb_build_object('result_status', 'nq'))
     is not null then
    raise exception 'FAIL predicate accepted an unknown key, an empty payload or a missing row';
  end if;

  -- Internal only: no client role may call it directly.
  if has_function_privilege('anon', 'public.ringside_replay_applied_version(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.ringside_replay_applied_version(uuid, jsonb)', 'execute') then
    raise exception 'FAIL replay predicate is client-executable';
  end if;

  raise notice 'PASS the shared replay predicate matches only fully applied payloads and is internal';
end;
$$;

rollback;
