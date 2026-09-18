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
-- allow-list, the status each act writes, and — after the owner's 2026-09-17
-- decision — that BOTH acts are available on a paid entry while NEITHER writes a
-- money column. There is no longer a payment guard on either arm.

-- FIXTURE RULE: every write to entry_fee / payment_method / payment_status /
-- stripe_payment_intent_id happens under `set local role service_role`, in ONE
-- statement, because live triggers (entries_protect_payment_fields,
-- _fields_insert, _payment_status) reserve those columns to the payment service.
-- A paid-online row cannot be assembled in two steps by anyone else, in either
-- order: flipping the method afterwards is refused, and so is marking an online
-- entry paid.

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

-- 1 owner, 6 club secretary (the tier `set_entry_refund_decision` authorises).
--
-- The AUTH rows are real, and they have to be: `set_entry_refund_decision`
-- stamps `refund_decided_by = auth.uid()`, and `entries_refund_decided_by_fkey`
-- points that column at `auth.users(id)`. A caller who only exists as a JWT
-- claim passes every authorization check and then dies 23503 on the write.
--
-- Pattern copied from pull_refund_decision_rls_test.sql, which is green in CI:
-- seed the people UNLINKED first, then insert the auth row with the SAME email,
-- and let handle_new_user() adopt the person. Inserting both halves linked by
-- hand races that trigger into a duplicate auth_user_id.
insert into public.people (id, first_name, last_name, email, auth_user_id)
values
  ('00000000-0000-0000-0000-000000632011', 'MYK9-632', 'Owner',
    'myk9-632-owner@example.test', null),
  ('00000000-0000-0000-0000-000000632016', 'MYK9-632', 'Secretary',
    'myk9-632-secretary@example.test', null);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000632101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-632-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000632106',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-632-secretary@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false);

-- ONE REGISTRY PER SHOW (MYK9-490) is enforced by
-- trg_enforce_show_registry_on_trial: a trial's registry_id must equal
-- derive_registry_id(show.organization). So the ASCA and UKC cases get their OWN
-- shows, with their own trial, class and entry. Flipping 632003's registry under
-- the AKC show is what CI rejected, and rightly — that trigger IS the domain
-- rule.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000632202', 'MYK9-632 ASCA Show', 'ASCA',
    current_date, current_date, '00000000-0000-0000-0000-000000632001', 'published'),
  ('00000000-0000-0000-0000-000000632302', 'MYK9-632 UKC Show', 'UKC',
    current_date, current_date, '00000000-0000-0000-0000-000000632001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000632203', '00000000-0000-0000-0000-000000632202',
    'MYK9-632 ASCA Trial', current_date, 'ASCA'),
  ('00000000-0000-0000-0000-000000632303', '00000000-0000-0000-0000-000000632302',
    'MYK9-632 UKC Trial', current_date, 'UKC');

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000632245', '00000000-0000-0000-0000-000000632203',
    'ASCA Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000632246', '00000000-0000-0000-0000-000000632203',
    'ASCA Interior Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000632345', '00000000-0000-0000-0000-000000632303',
    'UKC Container Novice', 'upcoming');

-- Club-scoped appointment: since the label/permission split a show-scoped
-- user_roles row grants nothing, so the secretary is appointed at the club.
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000632016', id,
  '00000000-0000-0000-0000-000000632001', true,
  '00000000-0000-0000-0000-000000632106'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000632021', 'MYK9-632 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000632011');

-- One per registry: trg_entries_require_dog_registration compares
-- normalize_registry_organization(registration.organization) against the trial's
-- registry, so a dog with only an AKC number cannot enter an ASCA trial.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000632021', 'AKC (American Kennel Club)', 'SR632021', true),
  ('00000000-0000-0000-0000-000000632021', 'ASCA (Australian Shepherd Club of America)',
    'ASCA632021', false),
  ('00000000-0000-0000-0000-000000632021', 'UKC (United Kennel Club)', 'UKC632021', false);

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000063203' || n)::uuid,
  '00000000-0000-0000-0000-000000632021',
  ('00000000-0000-0000-0000-00000063204' || n)::uuid,
  '00000000-0000-0000-0000-000000632002',
  '00000000-0000-0000-0000-000000632003', '00000000-0000-0000-0000-000000632011',
  'confirmed', 'pending', 25, 'no-status'
from generate_series(1, 9) n;

-- 632032 and 632038 are PAID. Written as `service_role`, because that is the
-- only role that may create one: `entries_protect_payment_status` refuses a
-- non-service caller marking an online entry paid, and
-- `entries_protect_payment_fields` refuses flipping payment_method to 'online'
-- on an already-paid row. Setting the money fields in ONE statement under the
-- role that owns them is what the Stripe webhook does; doing it in two, or as
-- anyone else, is what CI rejected.
set local role service_role;
update public.entries set payment_status = 'paid'
 where id in ('00000000-0000-0000-0000-000000632032', '00000000-0000-0000-0000-000000632038');
reset role;

-- Live entries on the ASCA and UKC shows.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values
  ('00000000-0000-0000-0000-000000632235', '00000000-0000-0000-0000-000000632021',
    '00000000-0000-0000-0000-000000632245', '00000000-0000-0000-0000-000000632202',
    '00000000-0000-0000-0000-000000632203', '00000000-0000-0000-0000-000000632011',
    'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000632236', '00000000-0000-0000-0000-000000632021',
    '00000000-0000-0000-0000-000000632246', '00000000-0000-0000-0000-000000632202',
    '00000000-0000-0000-0000-000000632203', '00000000-0000-0000-0000-000000632011',
    'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000632335', '00000000-0000-0000-0000-000000632021',
    '00000000-0000-0000-0000-000000632345', '00000000-0000-0000-0000-000000632302',
    '00000000-0000-0000-0000-000000632303', '00000000-0000-0000-0000-000000632011',
    'confirmed', 'pending', 25, 'no-status');

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
set local role service_role;
update public.entries set payment_method = 'online'
 where id = '00000000-0000-0000-0000-000000632038';
reset role;
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

-- THE SHOW'S REGISTRY narrows the platform allow-list. ASCA has NO in-season
-- withdrawal — bitches in season may compete — so `in_season` on an ASCA entry
-- is a wrong answer, not a reason. The client hides it, but the client learns
-- the registry from an async replica read that can be in flight, empty or
-- failed, so the server must not depend on the caller having waited.
--
-- Each registry has its OWN show. trg_enforce_show_registry_on_trial makes
-- "one registry per show" (MYK9-490) a schema rule, so a trial cannot be flipped
-- under an existing show — which is also why three states this function defends
-- against are asserted as UNREACHABLE at the bottom of this block rather than
-- manufactured here.
select pg_temp.assert_leave('ASCA refuses an in_season withdrawal',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632235',
  'withdraw', 'in_season',
  'withdraw_own_entry: ASCA does not recognise the withdrawal reason in_season');

select pg_temp.assert_leave('ASCA still allows a judge_change withdrawal',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632235',
  'withdraw', 'judge_change', null, 'withdrawn');

-- A pull carries no reason, so the registry has nothing to say about it: an ASCA
-- exhibitor must still be able to leave a class.
select pg_temp.assert_leave('ASCA allows a pull, which carries no reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632236',
  'pull', null, null, 'scratched');

-- UKC recognises BOTH reasons, so the narrowing must not over-reach.
select pg_temp.assert_leave('UKC allows an in_season withdrawal',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632335',
  'withdraw', 'in_season', null, 'withdrawn');

-- The three states step 4b's COALESCE / upper() / not-found branches defend
-- against cannot be built: the schema forbids all three. Asserting THAT is
-- worth more than manufacturing an impossible row, and it is what tells a
-- future reader why the defensive code is still correct to keep.
do $$
BEGIN
  BEGIN
    UPDATE public.trials SET registry_id = 'asca'
     WHERE id = '00000000-0000-0000-0000-000000632203';
    RAISE EXCEPTION 'FAIL: a lower-case registry_id was accepted on an ASCA show';
  EXCEPTION WHEN sqlstate 'MK490' THEN
    NULL;
  END;

  BEGIN
    UPDATE public.trials SET registry_id = '   '
     WHERE id = '00000000-0000-0000-0000-000000632003';
    RAISE EXCEPTION 'FAIL: a blank registry_id was accepted';
  EXCEPTION WHEN sqlstate 'MK490' THEN
    NULL;
  END;

  BEGIN
    UPDATE public.classes SET trial_id = NULL
     WHERE id = '00000000-0000-0000-0000-000000632045';
    RAISE EXCEPTION 'FAIL: classes.trial_id accepted NULL';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;

  RAISE NOTICE
    'PASS the schema forbids a mixed-case, blank or trial-less registry, so step 4b''s fallbacks are defence only';
END;
$$;

-- The row shape the SECRETARY'S QUEUE depends on. `isUnresolvedRemovalRefundDecision`
-- admits a withdrawal only when it is paid ONLINE, still unresolved, and carries
-- one of the two reason codes. If a paid-online withdrawal ever stops looking
-- exactly like this, the exhibitor has paid, is not running, and no surface in
-- the app can resolve their refund.
set local role service_role;
update public.entries set payment_status = 'paid', payment_method = 'online', entry_fee = 40
 where id = '00000000-0000-0000-0000-000000632033';
reset role;
update public.entries set entry_status = 'confirmed', withdrawal_reason_code = null
 where id = '00000000-0000-0000-0000-000000632033';

select pg_temp.assert_leave('a paid-online entry withdraws with a reason',
  '00000000-0000-0000-0000-000000632101', '00000000-0000-0000-0000-000000632033',
  'withdraw', 'in_season', null, 'withdrawn');

do $$
declare
  r record;
begin
  select e.entry_status, e.withdrawal_reason_code, e.payment_status, e.payment_method,
         e.entry_fee, e.refund_amount, e.refunded_at, e.refund_decision,
         e.refund_decided_at, e.withdrawn_at
    into r
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632033';

  if r.entry_status <> 'withdrawn' or r.withdrawal_reason_code <> 'in_season' then
    raise exception 'FAIL paid-online withdrawal: status=% code=%',
      r.entry_status, r.withdrawal_reason_code;
  end if;
  -- Payment fields untouched: the act records, it does not settle.
  if r.payment_status <> 'paid' or r.payment_method <> 'online' or r.entry_fee is distinct from 40 then
    raise exception 'FAIL paid-online withdrawal moved the payment: status=% method=% fee=%',
      r.payment_status, r.payment_method, r.entry_fee;
  end if;
  -- Every refund column NULL: that is what "unresolved" means to the queue.
  if r.refund_amount is not null or r.refunded_at is not null
     or r.refund_decision is not null or r.refund_decided_at is not null then
    raise exception
      'FAIL paid-online withdrawal wrote a refund column: amount=% at=% decision=% decided=%',
      r.refund_amount, r.refunded_at, r.refund_decision, r.refund_decided_at;
  end if;
  if r.withdrawn_at is null then
    raise exception 'FAIL paid-online withdrawal: withdrawn_at was not stamped';
  end if;
  raise notice
    'PASS a paid-online WITHDRAWAL is an unresolved refund decision with no money written';
end;
$$;

-- THE WRITE HALF OF THE QUEUE. The read predicate
-- (`isUnresolvedRemovalRefundDecision`) and `set_entry_refund_decision` must
-- admit the SAME rows, or the tab renders a Deny control whose click raises
-- 22023 and the row never leaves the queue. 632033 is the paid-online
-- withdrawal with a reason code, left by the case above.
--
-- Executed as the club secretary: this function is authorised, not owner-scoped.
do $$
declare
  v_decision text;
  v_decided_at timestamptz;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000632106', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000632106', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000000632033', 'denied');
  reset role;

  select e.refund_decision, e.refund_decided_at into v_decision, v_decided_at
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632033';
  if v_decision is distinct from 'denied' or v_decided_at is null then
    raise exception 'FAIL deny on a withdrawal: decision=% at=%', v_decision, v_decided_at;
  end if;
  raise notice 'PASS a paid-online WITHDRAWAL with a reason can be marked denied';
exception when others then
  reset role;
  if sqlstate = 'P0001' and sqlerrm like 'FAIL%' then raise; end if;
  raise exception 'FAIL deny on a withdrawal: unexpected SQLSTATE %: %', sqlstate, sqlerrm;
end;
$$;

-- REINSTATEMENT clears the decision. The trigger that does this only knew about
-- 'scratched', so a reinstated WITHDRAWAL kept its stale 'denied' and never
-- re-entered the queue — the secretary would have seen a resolved row for an
-- entry that was live again. 632033 was just denied above.
do $$
declare
  r record;
begin
  update public.entries set entry_status = 'confirmed'
   where id = '00000000-0000-0000-0000-000000632033';

  select e.refund_decision, e.refund_decided_at, e.refund_decided_by into r
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632033';

  if r.refund_decision is not null
     or r.refund_decided_at is not null
     or r.refund_decided_by is not null then
    raise exception
      'FAIL reinstate: a withdrawal kept its decision (decision=% at=% by=%)',
      r.refund_decision, r.refund_decided_at, r.refund_decided_by;
  end if;
  raise notice 'PASS reinstating a denied WITHDRAWAL clears the decision';
end;
$$;

-- ...and a CODELESS withdrawn row must NOT be deniable, because the queue does
-- not offer it: that state is a secretary Decline/Reject, not an exhibitor act.
set local role service_role;
update public.entries
   set entry_status = 'withdrawn', withdrawal_reason_code = null,
       payment_status = 'paid', payment_method = 'online'
 where id = '00000000-0000-0000-0000-000000632034';
reset role;

do $$
declare
  v_decision text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000632106', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000632106', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.set_entry_refund_decision('00000000-0000-0000-0000-000000632034', 'denied');
    reset role;
    raise exception 'FAIL: a codeless withdrawn row was accepted for a refund decision';
  exception when invalid_parameter_value then
    reset role;
    if sqlerrm not like 'entry % is not an unresolved paid-online pull or withdrawal' then
      raise exception 'FAIL codeless deny: wrong message %', sqlerrm;
    end if;
  end;

  select e.refund_decision into v_decision
    from public.entries e where e.id = '00000000-0000-0000-0000-000000632034';
  if v_decision is not null then
    raise exception 'FAIL codeless deny: a decision was written anyway (%)', v_decision;
  end if;
  raise notice 'PASS a codeless withdrawn row cannot be marked denied';
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
