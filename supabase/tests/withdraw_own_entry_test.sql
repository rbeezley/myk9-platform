-- MYK9-535: behavioral authorization test for public.withdraw_own_entry,
-- added by 20260915203300_withdraw_own_entry_rpc.sql.
--
-- Executes the INSTALLED function (never a source-string contract) as each
-- caller tier. Run with psql -X -v ON_ERROR_STOP=1 against a migrated local
-- database; every fixture rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/withdraw_own_entry_test.sql
--
-- ASSUMPTION: the harness role can read public.entry_status_history directly.
-- That table has FORCE RLS, so the success-path assertion below only reads
-- because the CI harness connects as a superuser (the same assumption every
-- other fixture in this directory makes for its read-backs). If the harness
-- ever runs as a non-superuser, that one assertion must move behind a definer
-- helper; the authorization assertions do not depend on it.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000535001', 'MYK9-535 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000535002', 'MYK9-535 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000535001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000535003', '00000000-0000-0000-0000-000000535002',
  'MYK9-535 Trial', current_date, 'AKC');

-- `entries_dog_class_unique_idx` is UNIQUE on (dog_id, class_id) WHERE
-- entry_status <> ALL ('withdrawn','scratched') — note it does NOT exclude
-- soft-deleted rows. Nine scenarios on one dog therefore need nine classes,
-- one entry each. Giving each scenario its own class (rather than its own dog)
-- keeps a single dog_registrations row, which the
-- trg_entries_require_dog_registration INSERT trigger needs to match the
-- trial's registry.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-00000053504' || n)::uuid,
  '00000000-0000-0000-0000-000000535003', 'Container Novice ' || n, 'upcoming'
from generate_series(1, 9) n;

-- Four more class/entry pairs, one per spelling of the two secretary-decision
-- request statuses, so each keeps its own row like every other guard here.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-00000053505' || n)::uuid,
  '00000000-0000-0000-0000-000000535003', 'Interior Novice ' || n, 'upcoming'
from generate_series(1, 4) n;

-- 1 owner, 2 co-owner, 3 handler, 4 outsider, 5 unlinked (no auth identity),
-- 6 club secretary.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000053501' || n)::uuid, 'MYK9-535', 'Person ' || n,
  case when n = 5 then null else ('00000000-0000-0000-0000-00000053510' || n)::uuid end
from generate_series(1, 6) n;

insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values ('00000000-0000-0000-0000-000000535021', 'MYK9-535 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000535011', '00000000-0000-0000-0000-000000535012');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000535021', 'AKC (American Kennel Club)', 'SR535021', true);

-- Nine independent targets, entry 5350'3n' in class 5350'4n' (n stays a
-- SINGLE digit: the concatenated literal is only a valid uuid for 1..9), so each guard is
-- asserted on a row of its own and a passing case can never mask a failing one.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000053503' || n)::uuid,
  '00000000-0000-0000-0000-000000535021',
  ('00000000-0000-0000-0000-00000053504' || n)::uuid,
  '00000000-0000-0000-0000-000000535002',
  '00000000-0000-0000-0000-000000535003', '00000000-0000-0000-0000-000000535013',
  'confirmed', 'pending', 25, 'no-status'
from generate_series(1, 9) n;

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000053506' || n)::uuid,
  '00000000-0000-0000-0000-000000535021',
  ('00000000-0000-0000-0000-00000053505' || n)::uuid,
  '00000000-0000-0000-0000-000000535002',
  '00000000-0000-0000-0000-000000535003', '00000000-0000-0000-0000-000000535013',
  status, 'pending', 25, 'no-status'
from unnest(array[
  'scratch-requested', 'scratch_requested',
  'move-up-requested', 'move_up_requested'
]) with ordinality as t(status, n);

update public.entries set payment_status = 'paid'
 where id = '00000000-0000-0000-0000-000000535032';
update public.entries set entry_status = 'withdrawn'
 where id = '00000000-0000-0000-0000-000000535033';
update public.entries set is_scored = true
 where id = '00000000-0000-0000-0000-000000535034';
update public.entries set deleted_at = now()
 where id = '00000000-0000-0000-0000-000000535035';
-- self_checkin_entry writes ONLY check_in_status, leaving entry_status
-- 'confirmed' — the day-of self-withdrawal hole this guard closes.
update public.entries set check_in_status = 'checked-in'
 where id = '00000000-0000-0000-0000-000000535039';

-- Club-scoped appointment: since the label/permission split a show-scoped
-- user_roles row grants nothing, so the secretary is appointed at the club.
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000535016', id,
  '00000000-0000-0000-0000-000000535001', true,
  '00000000-0000-0000-0000-000000535106'
from public.roles where name = 'secretary';

-- Invoker helper. Fixtures and read-back run as the migration role; the RPC
-- itself always runs as authenticated/anon, so no test-only grants are needed.
create function pg_temp.assert_withdraw(
  label text,
  caller text,
  target_id uuid,
  expected_error text default null,
  p_fields jsonb default '{"entry_status": "withdrawn"}'::jsonb,
  expected_version integer default null,
  caller_role text default 'authenticated',
  -- MYK9-632: a withdrawal now names one of the two recognised reasons. Every
  -- case in THIS file is a withdrawal, so one default covers them all; the
  -- allow-list itself is pinned in withdraw_or_pull_own_entry_test.sql.
  p_reason text default 'in_season'
) returns void language plpgsql as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  actual_error text;
  actual_state text;
  new_status text;
  new_withdrawn_at timestamptz;
begin
  select jsonb_object_agg(id::text, to_jsonb(e)) into before_rows
    from public.entries e where e.show_id = '00000000-0000-0000-0000-000000535002';

  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', caller_role)::text, true);
  perform set_config('role', caller_role, true);
  begin
    perform public.withdraw_own_entry(target_id, p_fields, expected_version, 'withdraw', p_reason);
  exception when others then
    actual_error := sqlerrm;
    actual_state := sqlstate;
  end;
  reset role;

  if expected_error is null and actual_error is not null then
    raise exception 'FAIL %: unexpected SQLSTATE %: %', label, actual_state, actual_error;
  end if;

  if expected_error is not null then
    if actual_error is null or actual_error not like expected_error then
      raise exception 'FAIL %: expected %, got SQLSTATE %: %',
        label, expected_error, actual_state, actual_error;
    end if;
    -- A denied call must change nothing at all, on any row of the show.
    select jsonb_object_agg(id::text, to_jsonb(e)) into after_rows
      from public.entries e where e.show_id = '00000000-0000-0000-0000-000000535002';
    if after_rows is distinct from before_rows then
      raise exception 'FAIL %: denied call changed persisted entry data', label;
    end if;
    raise notice 'PASS %', label;
    return;
  end if;

  select e.entry_status, e.withdrawn_at
    into new_status, new_withdrawn_at
    from public.entries e where e.id = target_id;

  if new_status <> 'withdrawn' then
    raise exception 'FAIL %: entry_status is % after an allowed withdrawal', label, new_status;
  end if;
  if new_withdrawn_at is null then
    raise exception 'FAIL %: withdrawn_at was not stamped', label;
  end if;
  if not exists (
    select 1 from public.entry_status_history h
     where h.entry_id = target_id and h.new_status = 'withdrawn'
  ) then
    raise exception 'FAIL %: no entry_status_history row was recorded', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- RED before 20260915203300: every call below raises SQLSTATE 42883
-- (function public.withdraw_own_entry does not exist).

-- Allowed: the owner and co-owner tiers, each on its own row.
select pg_temp.assert_withdraw('dog owner', '00000000-0000-0000-0000-000000535101',
  '00000000-0000-0000-0000-000000535031');
select pg_temp.assert_withdraw('co-owner', '00000000-0000-0000-0000-000000535102',
  '00000000-0000-0000-0000-000000535037');

-- An unpaid exhibitor awaiting a secretary decision must still be able to
-- withdraw. `entries_entry_status_check` admits BOTH spellings of each request
-- status and the live column holds the hyphenated one, so all four run — each on
-- its own row, with the EXACT strings.
select pg_temp.assert_withdraw('owner withdraws a ' || t.status || ' entry',
  '00000000-0000-0000-0000-000000535101',
  ('00000000-0000-0000-0000-00000053506' || t.n)::uuid)
from unnest(array[
  'scratch-requested', 'scratch_requested',
  'move-up-requested', 'move_up_requested'
]) with ordinality as t(status, n);

-- Denied: an unrelated authenticated caller, an authenticated caller with no
-- person row, and anon (which has no EXECUTE grant at all).
select pg_temp.assert_withdraw('outsider', '00000000-0000-0000-0000-000000535104',
  '00000000-0000-0000-0000-000000535036', 'Not authorized to withdraw entry %');
select pg_temp.assert_withdraw('authenticated caller with no person row',
  '00000000-0000-0000-0000-000000535199',
  '00000000-0000-0000-0000-000000535036', 'Not authorized to withdraw entry %');
select pg_temp.assert_withdraw('anonymous', null,
  '00000000-0000-0000-0000-000000535036',
  'permission denied for function withdraw_own_entry', '{"entry_status": "withdrawn"}'::jsonb,
  null, 'anon');
select pg_temp.assert_withdraw('nonexistent entry', '00000000-0000-0000-0000-000000535101',
  '00000000-0000-0000-0000-000000535099', 'Entry % not found');

-- Owner-only guards. Each must leave every row of the show untouched.
select pg_temp.assert_withdraw('owner cannot withdraw a PAID entry',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535032',
  'Entry % is paid; request a refund instead of withdrawing');
select pg_temp.assert_withdraw('owner cannot re-withdraw a withdrawn entry',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535033',
  'Entry % cannot be withdrawn from status %');
select pg_temp.assert_withdraw('owner cannot withdraw a scored entry',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535034',
  'Entry % has been scored and cannot be withdrawn');
select pg_temp.assert_withdraw('owner cannot withdraw a soft-deleted entry',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535035',
  'Entry % has been removed');

select pg_temp.assert_withdraw('owner cannot withdraw a CHECKED-IN entry',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535039',
  'Entry % is checked in at the show and cannot be withdrawn');

-- The function is not a general-purpose entries writer, and an OMITTED
-- entry_status must not withdraw by default.
select pg_temp.assert_withdraw('rejects a non-withdrawn entry_status',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535036',
  'withdraw_own_entry only writes entry_status = withdrawn',
  '{"entry_status": "confirmed"}'::jsonb);
select pg_temp.assert_withdraw('rejects an omitted entry_status',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535036',
  'withdraw_own_entry only writes entry_status = withdrawn',
  '{"withdrawal_reason": "Dog is injured"}'::jsonb);

-- OCC: a stale expected version conflicts and writes nothing.
select pg_temp.assert_withdraw('stale expected version conflicts',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535036',
  'Version conflict withdrawing entry % (expected %)',
  '{"entry_status": "withdrawn"}'::jsonb, 9999);

-- The listed handler may withdraw. `withdrawal_reason` is NOT in the allow-list
-- (the function writes exactly one column), so it must be ignored, not written.
select pg_temp.assert_withdraw('listed handler; withdrawal_reason is ignored',
  '00000000-0000-0000-0000-000000535103', '00000000-0000-0000-0000-000000535036',
  null, '{"entry_status": "withdrawn", "withdrawal_reason": "Dog is injured"}'::jsonb);

do $$
declare
  v_reason text;
begin
  select e.withdrawal_reason into v_reason
    from public.entries e where e.id = '00000000-0000-0000-0000-000000535036';
  if v_reason is not null then
    raise exception 'FAIL allow-list: withdrawal_reason was written as %', v_reason;
  end if;
  raise notice 'PASS withdrawal_reason outside the allow-list is ignored';
end;
$$;

-- Other fields outside the allow-list are ignored too: the withdrawal succeeds
-- and entry_fee / payment_status are untouched.
select pg_temp.assert_withdraw('ignores fields outside the allow-list',
  '00000000-0000-0000-0000-000000535101', '00000000-0000-0000-0000-000000535038',
  null, '{"entry_status": "withdrawn", "entry_fee": 0, "payment_status": "paid"}'::jsonb);

do $$
declare
  v_fee numeric;
  v_payment text;
begin
  select e.entry_fee, e.payment_status into v_fee, v_payment
    from public.entries e where e.id = '00000000-0000-0000-0000-000000535038';
  if v_fee is distinct from 25 or v_payment is distinct from 'pending' then
    raise exception 'FAIL allow-list: entry_fee=% payment_status=% were written by the RPC',
      v_fee, v_payment;
  end if;
  raise notice 'PASS allow-list leaves entry_fee / payment_status untouched';
end;
$$;

-- Manager parity: the club secretary keeps the reach `entries_update` already
-- gives them, including on a PAID entry the owner tier refuses.
select pg_temp.assert_withdraw('club secretary withdraws a paid entry',
  '00000000-0000-0000-0000-000000535106', '00000000-0000-0000-0000-000000535032');

-- Negative control for the ORIGINAL bug: the exhibitor's DIRECT UPDATE is still
-- denied by `entries_update`. If this ever starts succeeding, the RPC has been
-- made redundant by a policy change and this whole seam needs revisiting.
do $$
declare
  v_after text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000535101', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000535101', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update public.entries set entry_status = 'withdrawn'
     where id = '00000000-0000-0000-0000-000000535039';
  exception when others then
    null;  -- a hard denial is just as good as a zero-row match
  end;
  reset role;

  -- 535039 is the checked-in row: every RPC call against it was refused, so it
  -- is still 'confirmed' and a successful direct UPDATE would be unambiguous.
  select e.entry_status into v_after
    from public.entries e where e.id = '00000000-0000-0000-0000-000000535039';
  if v_after = 'withdrawn' then
    raise exception
      'FAIL direct-update control: entries_update now admits an exhibitor; the RPC seam needs review';
  end if;
  raise notice 'PASS a direct exhibitor UPDATE on entries is still denied';
end;
$$;

rollback;
