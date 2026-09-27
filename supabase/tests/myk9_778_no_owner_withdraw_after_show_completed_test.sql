-- MYK9-778: an owner may not withdraw (or pull) an entry once the show has
-- finished; added by 20260926013700_myk9_778_no_owner_withdraw_after_show_completed.sql.
--
-- Executes the INSTALLED public.withdraw_own_entry as each caller tier. Run with
-- psql -X -v ON_ERROR_STOP=1 against a migrated local database; every fixture
-- rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_778_no_owner_withdraw_after_show_completed_test.sql
--
-- "Finished" is either arm, and each arm has a show of its own so a passing
-- case cannot be carried by the other arm:
--   778101  status 'completed', dates in the FUTURE  -> the closeout arm alone
--   778102  status 'in_progress', ended 3 days ago    -> the calendar arm alone
--   778103  status 'in_progress', running today (started yesterday, ends
--           tomorrow), entries CLOSED 5 days ago      -> NOT finished
--   778104  status 'in_progress', ONE day, and that day is today ON THE SHOW'S
--           calendar (America/New_York)              -> NOT finished (the
--           boundary: last day is today, not before today)
-- The first three sit a full day or more from today so no timezone reading of
-- "today" can move them across the line. 778104 is built from the show zone's
-- own today, stored the way the app stores a show date (midnight UTC of that
-- calendar day), so it pins the boundary whatever the session TimeZone is.
--
-- RED before 20260926013700: the four owner refusals below succeed (the
-- function had no completed-show check), so each raises 'FAIL ... unexpected
-- success'.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000778001', 'MYK9-778 Club');

insert into public.shows (id, name, organization, start_date, end_date, entry_close_date,
  club_id, status)
values
  ('00000000-0000-0000-0000-000000778101', 'MYK9-778 Closed-out Show', 'AKC',
    current_date + 1, current_date + 1, current_date - 5,
    '00000000-0000-0000-0000-000000778001', 'completed'),
  ('00000000-0000-0000-0000-000000778102', 'MYK9-778 Past Show', 'AKC',
    current_date - 4, current_date - 3, current_date - 10,
    '00000000-0000-0000-0000-000000778001', 'in_progress'),
  ('00000000-0000-0000-0000-000000778103', 'MYK9-778 Running Show', 'AKC',
    current_date - 1, current_date + 1, current_date - 5,
    '00000000-0000-0000-0000-000000778001', 'in_progress'),
  ('00000000-0000-0000-0000-000000778104', 'MYK9-778 Last-day-today Show', 'AKC',
    ((now() at time zone 'America/New_York')::date)::timestamp at time zone 'UTC',
    ((now() at time zone 'America/New_York')::date)::timestamp at time zone 'UTC',
    current_date - 5,
    '00000000-0000-0000-0000-000000778001', 'in_progress');

insert into public.trials (id, show_id, name, date, registry_id, timezone)
select ('00000000-0000-0000-0000-00000077820' || n)::uuid,
  ('00000000-0000-0000-0000-00000077810' || n)::uuid,
  'MYK9-778 Trial ' || n,
  case n when 1 then current_date + 1 when 2 then current_date - 4
    when 4 then (now() at time zone 'America/New_York')::date else current_date end,
  'AKC', 'America/New_York'
from generate_series(1, 4) n;

-- One class per entry: entries_dog_class_unique_idx is UNIQUE on
-- (dog_id, class_id) for live rows. Class 7783mn belongs to trial m.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-0000007783' || m || n)::uuid,
  ('00000000-0000-0000-0000-00000077820' || m)::uuid,
  'Container Novice ' || m || n, 'upcoming'
from generate_series(1, 4) m, generate_series(1, 3) n;

-- 1 owner, 2 club secretary.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000077801' || n)::uuid, 'MYK9-778', 'Person ' || n,
  ('00000000-0000-0000-0000-00000077811' || n)::uuid
from generate_series(1, 2) n;

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000778021', 'MYK9-778 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000778011');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000778021', 'AKC (American Kennel Club)', 'SR778021', true);

-- Entry 7784mn sits in class 7783mn of show 77810m: confirmed, never checked in,
-- never scored -- exactly the row that used to slip through after the show.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-0000007784' || m || n)::uuid,
  '00000000-0000-0000-0000-000000778021',
  ('00000000-0000-0000-0000-0000007783' || m || n)::uuid,
  ('00000000-0000-0000-0000-00000077810' || m)::uuid,
  ('00000000-0000-0000-0000-00000077820' || m)::uuid,
  '00000000-0000-0000-0000-000000778011',
  'confirmed', 'pending', 25, 'no-status'
from generate_series(1, 4) m, generate_series(1, 3) n;

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000778012', id,
  '00000000-0000-0000-0000-000000778001', true,
  '00000000-0000-0000-0000-000000778112'
from public.roles where name = 'secretary';

create function pg_temp.assert_remove(
  label text,
  caller text,
  target_id uuid,
  p_kind text,
  p_reason text,
  expected_state text default null
) returns void language plpgsql as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  actual_error text;
  actual_state text;
  new_status text;
  target_status text;
begin
  select jsonb_object_agg(id::text, to_jsonb(e)) into before_rows
    from public.entries e where e.dog_id = '00000000-0000-0000-0000-000000778021';

  perform set_config('request.jwt.claim.sub', caller, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.withdraw_own_entry(
      target_id,
      jsonb_build_object('entry_status',
        case p_kind when 'pull' then 'scratched' else 'withdrawn' end),
      null, p_kind, p_reason);
  exception when others then
    actual_error := sqlerrm;
    actual_state := sqlstate;
  end;
  reset role;

  if expected_state is not null then
    if actual_state is null then
      raise exception 'FAIL %: unexpected success, expected SQLSTATE %', label, expected_state;
    end if;
    if actual_state <> expected_state then
      raise exception 'FAIL %: expected SQLSTATE %, got %: %',
        label, expected_state, actual_state, actual_error;
    end if;
    select jsonb_object_agg(id::text, to_jsonb(e)) into after_rows
      from public.entries e where e.dog_id = '00000000-0000-0000-0000-000000778021';
    if after_rows is distinct from before_rows then
      raise exception 'FAIL %: refused call changed persisted entry data', label;
    end if;
    raise notice 'PASS %', label;
    return;
  end if;

  if actual_error is not null then
    raise exception 'FAIL %: unexpected SQLSTATE %: %', label, actual_state, actual_error;
  end if;
  select e.entry_status into new_status from public.entries e where e.id = target_id;
  -- Not inlined as a CASE: PL/pgSQL ends an IF condition at the first THEN.
  target_status := case p_kind when 'pull' then 'scratched' else 'withdrawn' end;
  if new_status is distinct from target_status then
    raise exception 'FAIL %: entry_status is % after an allowed %', label, new_status, p_kind;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Refused: the owner, on a finished show, by either arm and either act.
select pg_temp.assert_remove('owner cannot withdraw on a closed-out (completed) show',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778411',
  'withdraw', 'in_season', 'MK006');
select pg_temp.assert_remove('owner cannot withdraw after the show''s last day',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778421',
  'withdraw', 'judge_change', 'MK006');
select pg_temp.assert_remove('owner cannot pull after the show''s last day',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778422',
  'pull', null, 'MK006');
select pg_temp.assert_remove('owner cannot pull on a closed-out (completed) show',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778412',
  'pull', null, 'MK006');

-- The message names the reason, not the row state, so the client never has to
-- guess from a 42501.
do $$
declare
  v_message text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000778111', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000778111', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.withdraw_own_entry('00000000-0000-0000-0000-000000778413',
      '{"entry_status": "withdrawn"}'::jsonb, null, 'withdraw', 'in_season');
  exception when others then
    v_message := sqlerrm;
  end;
  reset role;
  if v_message is null or v_message not like 'Entry % cannot be withdrawn: the show has finished' then
    raise exception 'FAIL refusal message: got %', v_message;
  end if;
  raise notice 'PASS the refusal names the finished show';
end;
$$;

-- Allowed: a show running TODAY is not finished, even though its entries closed
-- five days ago -- an in-season withdrawal after close is the point of the act.
select pg_temp.assert_remove('owner CAN withdraw in-season on a running show after entry close',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778431',
  'withdraw', 'in_season');
select pg_temp.assert_remove('owner CAN pull on a running show after entry close',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778432',
  'pull', null);

-- The boundary: a show whose last day is TODAY on its own calendar is still on.
select pg_temp.assert_remove('owner CAN withdraw on the show''s last day (today, show zone)',
  '00000000-0000-0000-0000-000000778111', '00000000-0000-0000-0000-000000778441',
  'withdraw', 'judge_change');

-- Manager tier unchanged: the club secretary may still record a withdrawal on a
-- finished show, by either arm.
select pg_temp.assert_remove('secretary CAN withdraw on a closed-out show',
  '00000000-0000-0000-0000-000000778112', '00000000-0000-0000-0000-000000778411',
  'withdraw', 'judge_change');
select pg_temp.assert_remove('secretary CAN withdraw after the show''s last day',
  '00000000-0000-0000-0000-000000778112', '00000000-0000-0000-0000-000000778421',
  'withdraw', 'judge_change');

rollback;
