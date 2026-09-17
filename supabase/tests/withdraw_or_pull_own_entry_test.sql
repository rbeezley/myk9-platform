-- MYK9-632: Withdraw and Pull are different acts and must write different rows.
--
-- Executes the INSTALLED public.withdraw_own_entry (never a source-string
-- contract) as each caller tier. Run with psql -X -v ON_ERROR_STOP=1 against a
-- migrated local database; every fixture rolls back. A clean run prints PASS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/withdraw_or_pull_own_entry_test.sql
--
-- Sibling of withdraw_own_entry_test.sql, which pins the MYK9-535 authorization
-- tiers. This file pins only what MYK9-632 added: p_kind, the two-value reason
-- allow-list, the status each act writes, and the ONE guard that differs (a paid
-- entry may be pulled, never withdrawn).

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000632001', 'MYK9-632 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000632002', 'MYK9-632 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000632001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000632003', '00000000-0000-0000-0000-000000632002',
  'MYK9-632 Trial', current_date, 'AKC');

-- `entries_dog_class_unique_idx` is UNIQUE on (dog_id, class_id) WHERE
-- entry_status <> ALL ('withdrawn','scratched'), so each scenario needs its own
-- class; one dog keeps a single dog_registrations row for the INSERT trigger.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-00000063204' || n)::uuid,
  '00000000-0000-0000-0000-000000632003', 'Container Novice ' || n, 'upcoming'
from generate_series(1, 9) n;

-- 1 owner.
insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000632011', 'MYK9-632', 'Owner',
  '00000000-0000-0000-0000-000000632101');

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000632021', 'MYK9-632 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000632011');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000632021', 'AKC (American Kennel Club)', 'SR632021', true);

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000063203' || n)::uuid,
  '00000000-0000-0000-0000-000000632021',
  ('00000000-0000-0000-0000-00000063204' || n)::uuid,
  '00000000-0000-0000-0000-000000632002',
  '00000000-0000-0000-0000-000000632003', '00000000-0000-0000-0000-000000632011',
  'confirmed', 'pending', 25, 'no-status'
from generate_series(1, 9) n;

-- 632032 and 632038 are PAID: the one guard the two acts do not share.
update public.entries set payment_status = 'paid'
 where id in ('00000000-0000-0000-0000-000000632032', '00000000-0000-0000-0000-000000632038');

create function pg_temp.assert_leave(
  label text,
  caller text,
  target_id uuid,
  p_kind text,
  p_reason text,
  expected_error text default null,
  expected_status text default null,
  p_fields jsonb default null
) returns void language plpgsql as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  actual_error text;
  actual_state text;
  new_status text;
  new_code text;
  new_withdrawn_at timestamptz;
  fields jsonb;
begin
  fields := coalesce(
    p_fields,
    jsonb_build_object('entry_status',
      case p_kind when 'pull' then 'scratched' else 'withdrawn' end));

  select jsonb_object_agg(id::text, to_jsonb(e)) into before_rows
    from public.entries e where e.show_id = '00000000-0000-0000-0000-000000632002';

  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.withdraw_own_entry(target_id, fields, null, p_kind, p_reason);
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
      from public.entries e where e.show_id = '00000000-0000-0000-0000-000000632002';
    if after_rows is distinct from before_rows then
      raise exception 'FAIL %: denied call changed persisted entry data', label;
    end if;
    raise notice 'PASS %', label;
    return;
  end if;

  select e.entry_status, e.withdrawal_reason_code, e.withdrawn_at
    into new_status, new_code, new_withdrawn_at
    from public.entries e where e.id = target_id;

  if new_status is distinct from expected_status then
    raise exception 'FAIL %: entry_status is %, expected %', label, new_status, expected_status;
  end if;
  -- The stored code is the NORMALISED reason: '' and '   ' are no reason at all,
  -- on either arm.
  if new_code is distinct from nullif(btrim(coalesce(p_reason, '')), '') then
    raise exception 'FAIL %: withdrawal_reason_code is %, expected %',
      label, new_code, nullif(btrim(coalesce(p_reason, '')), '');
  end if;
  -- Both acts are "the dog is not running", so both stamp the give-up time.
  if new_withdrawn_at is null then
    raise exception 'FAIL %: withdrawn_at was not stamped', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- RED before 20260917214300: every call raises 42883 (no 5-argument
-- withdraw_own_entry) or 42703 (no withdrawal_reason_code column).

-- The two acts, each writing its OWN status and its OWN reason.
select pg_temp.assert_leave('withdraw in_season writes withdrawn + the code',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632031',
  'withdraw', 'in_season', null, 'withdrawn');
select pg_temp.assert_leave('withdraw judge_change writes withdrawn + the code',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632033',
  'withdraw', 'judge_change', null, 'withdrawn');
select pg_temp.assert_leave('pull writes scratched and NO reason code',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632034',
  'pull', null, null, 'scratched');

-- The reason allow-list. Exactly two values; no "other", no free text.
select pg_temp.assert_leave('rejects an unlisted reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'withdraw', 'other', 'withdraw_own_entry: p_reason must be in_season or judge_change');
select pg_temp.assert_leave('rejects free text as a reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'withdraw', 'dog is injured', 'withdraw_own_entry: p_reason must be in_season or judge_change');
select pg_temp.assert_leave('rejects a withdrawal with NO reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'withdraw', null, 'withdraw_own_entry: p_reason must be in_season or judge_change');
select pg_temp.assert_leave('rejects a PULL that carries a reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'pull', 'in_season', 'withdraw_own_entry: a pull carries no withdrawal reason');
-- The two arms must agree on what an EMPTY reason is. A withdrawal normalises
-- '' and '   ' to NULL and then refuses for the missing reason; a pull must
-- treat the same input as "no reason", not as a contradiction.
select pg_temp.assert_leave('a PULL accepts an empty-string reason as no reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'pull', '   ', null, 'scratched');
select pg_temp.assert_leave('rejects an unknown kind',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'scratch', null, 'withdraw_own_entry: p_kind must be withdraw or pull, got %');

-- p_fields must AGREE with p_kind: the function is not a general-purpose writer
-- and must never be talked into the opposite act.
select pg_temp.assert_leave('a pull cannot smuggle entry_status=withdrawn',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'pull', null, 'withdraw_own_entry: a pull only writes entry_status = scratched',
  null, '{"entry_status": "withdrawn"}'::jsonb);
select pg_temp.assert_leave('a withdrawal cannot smuggle entry_status=scratched',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632035',
  'withdraw', 'in_season', 'withdraw_own_entry only writes entry_status = withdrawn',
  null, '{"entry_status": "scratched"}'::jsonb);

-- MONEY. Owner decision 2026-09-17: BOTH acts are available on a paid entry.
-- Neither moves money — the exhibitor's click records what happened and the
-- secretary confirms the refund afterwards on the reconciliation surface. The
-- previous "Entry % is paid; request a refund instead of withdrawing" refusal is
-- GONE; it left a paid exhibitor with no honest way to say they were not coming.
select pg_temp.assert_leave('a PAID entry CAN be WITHDRAWN with a reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632032',
  'withdraw', 'judge_change', null, 'withdrawn');
select pg_temp.assert_leave('a PAID entry CAN be pulled',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632039',
  'pull', null, null, 'scratched');

-- ...and neither act touches a single money column. The exhibitor's own click
-- must never assert a refund; it only records the act.
do $$
declare
  v_payment text;
  v_amount numeric;
  v_refunded timestamptz;
  v_decision text;
  v_fee numeric;
begin
  select e.payment_status, e.refund_amount, e.refunded_at, e.refund_decision, e.entry_fee
    into v_payment, v_amount, v_refunded, v_decision, v_fee
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632032';
  if v_payment <> 'paid' or v_amount is not null or v_refunded is not null
     or v_decision is not null or v_fee is distinct from 25 then
    raise exception
      'FAIL paid withdrawal wrote money: payment=% refund_amount=% refunded_at=% decision=% fee=%',
      v_payment, v_amount, v_refunded, v_decision, v_fee;
  end if;
  raise notice 'PASS a paid WITHDRAWAL writes no refund columns and moves no money';
end;
$$;

-- A pull of a paid, online entry is exactly the row
-- set_entry_refund_decision / isUnresolvedPullRefundDecision look for. If this
-- ever stops holding, the secretary's Issue refund / Deny refund is unreachable
-- for every entry an exhibitor pulled.
update public.entries set payment_method = 'online'
 where id = '00000000-0000-0000-0000-000000632038';
select pg_temp.assert_leave('a pulled paid-online entry reaches the reconciliation queue',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632038',
  'pull', null, null, 'scratched');

do $$
declare
  v_status text;
  v_method text;
  v_payment text;
  v_decision text;
begin
  select e.entry_status, e.payment_method, e.payment_status, e.refund_decision
    into v_status, v_method, v_payment, v_decision
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632038';
  if v_status <> 'scratched' or v_method <> 'online' or v_payment <> 'paid'
     or v_decision is not null then
    raise exception
      'FAIL reconciliation shape: status=% method=% payment=% decision=%',
      v_status, v_method, v_payment, v_decision;
  end if;
  raise notice 'PASS a pulled paid-online entry is an UNRESOLVED refund decision';
end;
$$;

-- The CHECK constraint is the backstop under the RPC's own allow-list.
do $$
begin
  begin
    update public.entries set withdrawal_reason_code = 'other'
     where id = '00000000-0000-0000-0000-000000632036';
    raise exception 'FAIL CHECK: withdrawal_reason_code accepted an unlisted value';
  exception when check_violation then
    raise notice 'PASS entries_withdrawal_reason_code_check rejects an unlisted value';
  end;
end;
$$;

-- A withdrawal later turned into a pull must not keep the stale reason: the
-- stored reason can never disagree with the stored act.
select pg_temp.assert_leave('setup: withdraw 632037 with a reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632037',
  'withdraw', 'judge_change', null, 'withdrawn');
update public.entries set entry_status = 'confirmed'
 where id = '00000000-0000-0000-0000-000000632037';
select pg_temp.assert_leave('pulling clears a reason a withdrawal left behind',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632037',
  'pull', null, null, 'scratched');

-- anon has no EXECUTE grant on the new signature either.
do $$
declare
  v_error text;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform public.withdraw_own_entry('00000000-0000-0000-0000-000000632036',
      '{"entry_status": "scratched"}'::jsonb, null, 'pull', null);
    reset role;
    raise exception 'FAIL anon: the 5-argument withdraw_own_entry is executable by anon';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS anon cannot execute the 5-argument withdraw_own_entry';
  end;
end;
$$;

-- The 3-argument call site is GONE, and an un-updated client's 3-argument call
-- resolves to the defaulted signature and still performs a WITHDRAWAL... except
-- that a withdrawal now needs a reason, so it refuses rather than writing a
-- reasonless one.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'withdraw_own_entry';
  if v_count <> 1 then
    raise exception 'FAIL signature: % withdraw_own_entry overloads exist; named-argument calls are ambiguous', v_count;
  end if;
  raise notice 'PASS exactly one withdraw_own_entry signature exists';
end;
$$;

rollback;
