-- Behavioral test for 20260930214300_myk9_878_junior_handler_fee_pricing.sql (MYK9-878):
-- private.price_entry_fee and trg_entries_junior_fee (the offline / direct-insert
-- path). The submit_show_entries half is myk9_878_submit_entries_junior_fee_test.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Rules under test (docs/plan-junior-handler-fee-v2.md; Richard's decision on the
-- Codex P1, MYK9-664 oracle):
--   * the junior fee is charged ONLY on an explicit override by a show secretary or
--     site admin; the override never reads a date of birth, and anyone else asking
--     is refused (42501);
--   * there is NO automatic age- or ownership-derived pricing: a junior owner, an
--     adult owner, an owner with no date of birth, a co-owner and an unrelated
--     junior all pay the normal fee without an override, and varying the trial date
--     (which flips a handler's age) changes nothing: no caller can read an
--     age-dependent price;
--   * a show with no junior fee (NULL or 0) charges the normal fee whatever is asked,
--     and a junior fee above the regular fee is capped at it;
--   * no API role can execute the pricing function;
--   * the trigger reprices ONLY a direct client insert (and only for an override),
--     never a definer / service write, and the fee is frozen against client UPDATEs.
--
-- Fixture pattern from myk9_841_staff_on_behalf_entries_accepted_test.sql: auth.users
-- rows carry the same email as their people row, then people.auth_user_id is set.
-- Dates of birth ARE seeded (junior 2011-06-01, adult 1980-01-01) on purpose: the
-- tests prove they make no difference to any fee.
--
-- Trial date is 2026-10-10 unless a case moves it.

begin;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000878801', 'secretary', 'MYK9-878 fixture', true),
  ('00000000-0000-0000-0000-000000878802', 'club_admin', 'MYK9-878 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000878010', 'MYK9-878 Club');

-- S1: AKC, junior fee 15, pre-entry 30, day-of 45.
-- S2: ASCA (junior status cannot be derived), junior fee 15.
-- S3: AKC with NO junior fee (NULL).
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
values
  ('00000000-0000-0000-0000-000000878101', 'MYK9-878 AKC Show', 'AKC',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000878010', 'published',
   true, true, 30, 45, 15),
  ('00000000-0000-0000-0000-000000878102', 'MYK9-878 ASCA Show', 'ASCA',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000878010', 'published',
   true, true, 30, NULL, 15),
  ('00000000-0000-0000-0000-000000878103', 'MYK9-878 No Junior Fee Show', 'AKC',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000878010', 'published',
   true, true, 30, NULL, NULL);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878101',
   'MYK9-878 AKC Trial', date '2026-10-10', 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000878202', '00000000-0000-0000-0000-000000878102',
   'MYK9-878 ASCA Trial', date '2026-10-10', 'ASCA', 'Scent Work'),
  ('00000000-0000-0000-0000-000000878203', '00000000-0000-0000-0000-000000878103',
   'MYK9-878 No Junior Fee Trial', date '2026-10-10', 'AKC', 'Scent Work');

-- 01..16 on the AKC trial (every (dog, class) pair is used at most once),
-- 21 on the ASCA trial, 31 on the no-junior-fee trial.
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
select ('00000000-0000-0000-0000-0000008783' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000878201', 'MYK9-878 Class ' || n,
       'Container', 'Novice', 'upcoming', 'manual', 30
from generate_series(1, 16) as n;
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values
  ('00000000-0000-0000-0000-000000878321', '00000000-0000-0000-0000-000000878202',
   'MYK9-878 ASCA Class', 'Container', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000878331', '00000000-0000-0000-0000-000000878203',
   'MYK9-878 No Fee Class', 'Container', 'Novice', 'upcoming', 'manual', 30);

-- People. 001 junior owner, 002 adult owner, 003 owner with no date of birth,
-- 004 junior co-owner, 005 unrelated junior, 006 secretary, 007 club admin
-- (passes the entries insert RLS but is not a show secretary).
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000878001', 'MYK9-878', 'JuniorOwner', 'myk9-878-jr-owner@example.test'),
  ('00000000-0000-0000-0000-000000878002', 'MYK9-878', 'AdultOwner', 'myk9-878-adult@example.test'),
  ('00000000-0000-0000-0000-000000878003', 'MYK9-878', 'NoDob', 'myk9-878-nodob@example.test'),
  ('00000000-0000-0000-0000-000000878004', 'MYK9-878', 'JuniorCoOwner', 'myk9-878-jr-co@example.test'),
  ('00000000-0000-0000-0000-000000878005', 'MYK9-878', 'UnrelatedJunior', 'myk9-878-unrelated@example.test'),
  ('00000000-0000-0000-0000-000000878006', 'MYK9-878', 'Secretary', 'myk9-878-secretary@example.test'),
  ('00000000-0000-0000-0000-000000878007', 'MYK9-878', 'ClubAdmin', 'myk9-878-clubadmin@example.test');

insert into public.people_private (person_id, date_of_birth)
values
  ('00000000-0000-0000-0000-000000878001', date '2011-06-01'),
  ('00000000-0000-0000-0000-000000878002', date '1980-01-01'),
  ('00000000-0000-0000-0000-000000878004', date '2011-06-01'),
  ('00000000-0000-0000-0000-000000878005', date '2011-06-01');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000878106', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-878-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000878107', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-878-clubadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

update public.people set auth_user_id = '00000000-0000-0000-0000-000000878106'
 where id = '00000000-0000-0000-0000-000000878006';
update public.people set auth_user_id = '00000000-0000-0000-0000-000000878107'
 where id = '00000000-0000-0000-0000-000000878007';

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000878006', id, '00000000-0000-0000-0000-000000878010',
       true, '00000000-0000-0000-0000-000000878106'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000878007', id, '00000000-0000-0000-0000-000000878010',
       true, '00000000-0000-0000-0000-000000878107'
from public.roles where name = 'club_admin';

-- Dogs. JR owned by the junior; AD by the adult; ND by the no-DOB owner;
-- CO by the adult with the junior as CO-OWNER; OT by the adult (the dog an
-- unrelated junior or a secretary override handles); AS owned by the junior
-- (ASCA show); NJ owned by the junior (no-junior-fee show).
insert into public.dogs (id, name, call_name, breed, status, owner_id, co_owner_id)
values
  ('00000000-0000-0000-0000-000000878401', 'MYK9-878 JR', 'JR', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878001', NULL),
  ('00000000-0000-0000-0000-000000878402', 'MYK9-878 AD', 'AD', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878002', NULL),
  ('00000000-0000-0000-0000-000000878403', 'MYK9-878 ND', 'ND', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878003', NULL),
  ('00000000-0000-0000-0000-000000878404', 'MYK9-878 CO', 'CO', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878002', '00000000-0000-0000-0000-000000878004'),
  ('00000000-0000-0000-0000-000000878405', 'MYK9-878 OT', 'OT', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878002', NULL),
  ('00000000-0000-0000-0000-000000878406', 'MYK9-878 AS', 'AS', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878001', NULL),
  ('00000000-0000-0000-0000-000000878407', 'MYK9-878 NJ', 'NJ', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878001', NULL);

-- ONE registration per dog: dog_registrations_one_primary_per_dog is a partial unique index
-- on (dog_id) WHERE is_primary, and dog_registrations_live_dog_org_unique allows one live row
-- per (dog, org). Every entry below is on an AKC trial, which is all
-- trg_entries_require_dog_registration needs (an AKC registration number).
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, 'AKC', 'SR87' || substr(d.id::text, 34) || '01', true
from public.dogs d
where d.id::text like '00000000-0000-0000-0000-0000008784%';

-- Everything below reads as the secretary, PostgREST-shaped.
create function pg_temp.as_user(p_auth uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
end;
$$;

-- pg_temp.price(show, class, day_of_show, override) -> 'fee|applied'
create function pg_temp.price(p_show uuid, p_class uuid, p_day boolean, p_override boolean)
returns text language sql as $$
  select fee::text || '|' || junior_fee_applied::text
    from private.price_entry_fee(p_show, p_class, p_day, p_override);
$$;

select pg_temp.as_user('00000000-0000-0000-0000-000000878106');

-- ---------------------------------------------------------------------------
-- 1. The pricing function (run as the migration role, as its only callers do).
--    Its signature has no handler and no dog: nothing it returns can depend on
--    anyone's age or ownership.
-- ---------------------------------------------------------------------------
select pg_temp.expect('no override: the normal (pre-entry) fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, false),
  '30|false');
select pg_temp.expect('no override on show day: the day-of fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', true, false),
  '45|false');
select pg_temp.expect('no override on an ASCA show: the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878102', '00000000-0000-0000-0000-000000878321', false, false),
  '30|false');
select pg_temp.expect('no override on a no-junior-fee show: the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331', false, false),
  '30|false');
select pg_temp.expect('secretary override: the junior fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, true),
  '15|true');
select pg_temp.expect('secretary override on show day: still the junior fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', true, true),
  '15|true');
select pg_temp.expect('secretary override on an ASCA show with a junior fee still applies',
  pg_temp.price('00000000-0000-0000-0000-000000878102', '00000000-0000-0000-0000-000000878321', false, true),
  '15|true');
select pg_temp.expect('override on a show with no junior fee charges the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331', false, true),
  '30|false');

-- A junior fee of 0 means "no junior tier" (slice A's convention).
update public.shows set junior_handler_fee = 0 where id = '00000000-0000-0000-0000-000000878101';
select pg_temp.expect('a zero junior fee is no tier: the normal fee even on override',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, true),
  '30|false');
update public.shows set junior_handler_fee = 15 where id = '00000000-0000-0000-0000-000000878101';

-- A junior tier ABOVE the regular fee never exceeds it: regular 10, junior 15 => 10.
update public.shows set pre_entry_fee = 10 where id = '00000000-0000-0000-0000-000000878101';
select pg_temp.expect('junior tier above the regular fee is capped at the regular fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, true),
  '10|true');
update public.shows set pre_entry_fee = 30 where id = '00000000-0000-0000-0000-000000878101';

-- ORACLE-NEGATIVE: the same call, with the trial moved across dates that flip every
-- seeded handler between junior and adult, returns the same fee. (The function has
-- no handler input, and the trial date is not read.)
select pg_temp.expect('trial date 2026: no-override fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, false),
  '30|false');
update public.trials set date = date '2040-10-10' where id = '00000000-0000-0000-0000-000000878201';
select pg_temp.expect('trial date 2040 (every junior is an adult): the same fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, false),
  '30|false');
update public.trials set date = date '2012-10-10' where id = '00000000-0000-0000-0000-000000878201';
select pg_temp.expect('trial date 2012 (the "adult" is a child): the same fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, false),
  '30|false');
update public.trials set date = date '2026-10-10' where id = '00000000-0000-0000-0000-000000878201';

-- Override refused for anyone who is not the show secretary or a site admin,
-- whether or not the show has a junior fee.
select pg_temp.as_user('00000000-0000-0000-0000-000000878107');
do $$
begin
  begin
    perform pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, true);
    raise exception 'FAIL a club admin who is not a secretary charged the junior fee';
  exception when insufficient_privilege then
    raise notice 'PASS override by a non-secretary is refused (42501)';
  end;
  begin
    perform pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331', false, true);
    raise exception 'FAIL a non-secretary override on a no-junior-fee show was answered';
  exception when insufficient_privilege then
    raise notice 'PASS override by a non-secretary is refused even on a show with no junior fee';
  end;
end $$;
select pg_temp.expect('the same non-secretary prices normally without an override',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301', false, false),
  '30|false');
select pg_temp.as_user('00000000-0000-0000-0000-000000878106');

-- ---------------------------------------------------------------------------
-- 2. No API role can execute the pricing function, and none can even try.
-- ---------------------------------------------------------------------------
select pg_temp.expect('anon cannot execute private.price_entry_fee',
  has_function_privilege('anon',
    'private.price_entry_fee(uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('authenticated cannot execute private.price_entry_fee',
  has_function_privilege('authenticated',
    'private.price_entry_fee(uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('service_role cannot execute private.price_entry_fee',
  has_function_privilege('service_role',
    'private.price_entry_fee(uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('no API role can read entries.junior_fee_override_by',
  (has_column_privilege('anon', 'public.entries', 'junior_fee_override_by', 'SELECT')
   or has_column_privilege('authenticated', 'public.entries', 'junior_fee_override_by', 'SELECT'))::text,
  'false');
select pg_temp.expect('private.price_entry_fee names neither people_private nor the junior age derivation',
  (select (prosrc ilike '%people_private%' or prosrc ilike '%entry_handler_is_junior%'
           or prosrc ilike '%handler_is_junior_at%')::text
     from pg_proc where oid = 'private.price_entry_fee(uuid, uuid, boolean, boolean)'::regprocedure),
  'false');

set local role authenticated;
do $$
begin
  begin
    perform private.price_entry_fee(
      '00000000-0000-0000-0000-000000878101'::uuid, '00000000-0000-0000-0000-000000878301'::uuid,
      false, false);
    raise exception 'FAIL an authenticated caller called the pricing function';
  exception when insufficient_privilege then
    raise notice 'PASS an authenticated caller cannot call the pricing function';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The offline path: a DIRECT insert as the authenticated secretary.
--    The client sends the normal fee, as getShowEntryFee would.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000878106');
set local role authenticated;

-- No override: every handler relationship pays the normal fee. dog / class / handler:
-- a. junior owner      JR  c01  001     e. unrelated junior (twice) OT c04, c06  005
-- b. adult owner       AD  c02  002     f. junior co-owner          CO c05       004
-- c. owner, no DOB     ND  c03  003     g. no handler on the row    JR c13
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values
  ('00000000-0000-0000-0000-000000878501', '00000000-0000-0000-0000-000000878401',
   '00000000-0000-0000-0000-000000878301', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
   'confirmed', 30, 'pending', 'check'),
  ('00000000-0000-0000-0000-000000878502', '00000000-0000-0000-0000-000000878402',
   '00000000-0000-0000-0000-000000878302', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878002',
   'confirmed', 30, 'pending', 'check'),
  ('00000000-0000-0000-0000-000000878503', '00000000-0000-0000-0000-000000878403',
   '00000000-0000-0000-0000-000000878303', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878003',
   'confirmed', 30, 'pending', 'check'),
  ('00000000-0000-0000-0000-000000878504', '00000000-0000-0000-0000-000000878405',
   '00000000-0000-0000-0000-000000878304', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
   'confirmed', 30, 'pending', 'check'),
  ('00000000-0000-0000-0000-000000878505', '00000000-0000-0000-0000-000000878404',
   '00000000-0000-0000-0000-000000878305', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878004',
   'confirmed', 30, 'pending', 'check'),
  ('00000000-0000-0000-0000-000000878506', '00000000-0000-0000-0000-000000878405',
   '00000000-0000-0000-0000-000000878306', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
   'confirmed', 30, 'pending', 'check');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878507', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878313', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', 'confirmed', 30, 'pending', 'check');

-- Override REQUEST by the secretary (the client sends the marker; any non-null value
-- is the request): junior fee, stamped with the secretary's PEOPLE id. For an adult
-- owner's dog and for an unrelated handler alike: no date of birth is consulted.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values
  ('00000000-0000-0000-0000-000000878511', '00000000-0000-0000-0000-000000878405',
   '00000000-0000-0000-0000-000000878307', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
   'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000878512', '00000000-0000-0000-0000-000000878402',
   '00000000-0000-0000-0000-000000878308', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878002',
   'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000'),
  -- an override on the no-junior-fee show: normal fee, NO stamp.
  ('00000000-0000-0000-0000-000000878513', '00000000-0000-0000-0000-000000878405',
   '00000000-0000-0000-0000-000000878331', '00000000-0000-0000-0000-000000878103',
   '00000000-0000-0000-0000-000000878203', '00000000-0000-0000-0000-000000878005',
   'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
-- a WAIVED override entry keeps its zero fee; a fee already below the junior fee is
-- never raised (and carries no stamp: the stored fee is not the junior fee).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values
  ('00000000-0000-0000-0000-000000878514', '00000000-0000-0000-0000-000000878401',
   '00000000-0000-0000-0000-000000878309', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
   'confirmed', 0, 'waived', 'waived', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000878515', '00000000-0000-0000-0000-000000878402',
   '00000000-0000-0000-0000-000000878310', '00000000-0000-0000-0000-000000878101',
   '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878002',
   'confirmed', 10, 'pending', 'check', '00000000-0000-0000-0000-000000000000');

-- A NON-secretary who passes the entries insert RLS (the club admin) asks for the
-- override: refused, nothing written. (Inline set_config, not pg_temp helpers: the
-- session is running as `authenticated` here.)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000878107', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000878107","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                                entry_fee, payment_status, payment_method, junior_fee_override_by)
    values ('00000000-0000-0000-0000-000000878516', '00000000-0000-0000-0000-000000878405',
      '00000000-0000-0000-0000-000000878311', '00000000-0000-0000-0000-000000878101',
      '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
      'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
    raise exception 'FAIL a non-secretary direct insert charged the junior fee';
  exception when insufficient_privilege then
    raise notice 'PASS a non-secretary override on a direct insert is refused';
  end;
end $$;
-- ...and the same club admin inserting WITHOUT a request still works (positive control).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878517', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878312', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check');

-- ORACLE-NEGATIVE on the write path: move the trial across dates that flip the
-- junior owner's age, then enter the same junior owner again with no override.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000878106', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000878106","role":"authenticated"}', true);
-- (c14 is entered before the date moves; c15 and c16 after, at 2040 and 2012.)
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878521', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878314', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
reset role;
update public.trials set date = date '2040-10-10' where id = '00000000-0000-0000-0000-000000878201';
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878522', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878315', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
reset role;
update public.trials set date = date '2012-10-10' where id = '00000000-0000-0000-0000-000000878201';
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878523', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878316', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');

-- The fee is FROZEN: a direct client UPDATE (a whole-row upload from a device that
-- still holds a different fee) cannot change entry_fee, in either direction, and
-- cannot forge or clear the stamp.
update public.entries set entry_fee = 30, entry_status = 'confirmed'
 where id = '00000000-0000-0000-0000-000000878511';
update public.entries set entry_fee = 99 where id = '00000000-0000-0000-0000-000000878502';
update public.entries set entry_fee = 0 where id = '00000000-0000-0000-0000-000000878512';
update public.entries set junior_fee_override_by = '00000000-0000-0000-0000-000000878003'
 where id = '00000000-0000-0000-0000-000000878501';
update public.entries set junior_fee_override_by = NULL
 where id = '00000000-0000-0000-0000-000000878511';
reset role;
update public.trials set date = date '2026-10-10' where id = '00000000-0000-0000-0000-000000878201';

create function pg_temp.fee(p_id uuid) returns text language sql as $$
  select entry_fee::numeric(10,2)::text from public.entries where id = p_id;
$$;
create function pg_temp.stamp(p_id uuid) returns text language sql as $$
  select coalesce(junior_fee_override_by::text, 'none') from public.entries where id = p_id;
$$;

select pg_temp.expect('no override, junior owner: the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878501'), '30.00');
select pg_temp.expect('no override, adult owner: the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878502'), '30.00');
select pg_temp.expect('no override, owner with no date of birth: the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878503'), '30.00');
select pg_temp.expect('no override, unrelated junior (first entry): the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878504'), '30.00');
select pg_temp.expect('no override, junior co-owner: the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878505'), '30.00');
select pg_temp.expect('no override, unrelated junior (second entry): the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878506'), '30.00');
select pg_temp.expect('no override, no handler on the row: the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878507'), '30.00');
select pg_temp.expect('oracle-negative: junior owner at trial date 2026',
  pg_temp.fee('00000000-0000-0000-0000-000000878521'), '30.00');
select pg_temp.expect('oracle-negative: the same junior owner at trial date 2040 (an adult)',
  pg_temp.fee('00000000-0000-0000-0000-000000878522'), '30.00');
select pg_temp.expect('oracle-negative: the same junior owner at trial date 2012 (not yet born)',
  pg_temp.fee('00000000-0000-0000-0000-000000878523'), '30.00');
select pg_temp.expect('no override: no stamp anywhere',
  (select count(*)::text from public.entries
    where id in ('00000000-0000-0000-0000-000000878501', '00000000-0000-0000-0000-000000878502',
                 '00000000-0000-0000-0000-000000878503', '00000000-0000-0000-0000-000000878504',
                 '00000000-0000-0000-0000-000000878521', '00000000-0000-0000-0000-000000878522')
      and junior_fee_override_by is not null), '0');

select pg_temp.expect('override, unrelated handler: junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878511'), '15.00');
select pg_temp.expect('override, unrelated handler: stamped with the secretary''s people id',
  pg_temp.stamp('00000000-0000-0000-0000-000000878511'), '00000000-0000-0000-0000-000000878006');
select pg_temp.expect('override, adult owner: junior fee (an explicit choice)',
  pg_temp.fee('00000000-0000-0000-0000-000000878512'), '15.00');
select pg_temp.expect('override on a no-junior-fee show: normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878513'), '30.00');
select pg_temp.expect('override on a no-junior-fee show: no stamp',
  pg_temp.stamp('00000000-0000-0000-0000-000000878513'), 'none');
select pg_temp.expect('a waived override entry keeps its zero fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878514'), '0.00');
select pg_temp.expect('a fee already below the junior fee is never raised',
  pg_temp.fee('00000000-0000-0000-0000-000000878515'), '10.00');
select pg_temp.expect('the refused override wrote no entry',
  (select count(*)::text from public.entries where id = '00000000-0000-0000-0000-000000878516'), '0');
select pg_temp.expect('the club admin''s ordinary insert landed (positive control)',
  pg_temp.fee('00000000-0000-0000-0000-000000878517'), '30.00');

select pg_temp.expect('frozen: an update cannot restore the regular fee over the junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878511'), '15.00');
select pg_temp.expect('frozen: an update cannot raise a stored fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878502'), '30.00');
select pg_temp.expect('frozen: an update cannot zero an overridden fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878512'), '15.00');
select pg_temp.expect('a client update cannot forge the stamp on an unstamped entry',
  pg_temp.stamp('00000000-0000-0000-0000-000000878501'), 'none');
select pg_temp.expect('a client update cannot clear the stamp',
  pg_temp.stamp('00000000-0000-0000-0000-000000878511'), '00000000-0000-0000-0000-000000878006');

-- ---------------------------------------------------------------------------
-- 4. The trigger reprices ONLY a direct client insert. The same override request
--    written as the migration role (what every SECURITY DEFINER writer is) or as
--    service_role (card checkout, webhook, import) keeps the fee it was given.
-- ---------------------------------------------------------------------------
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878601', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878310', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
select pg_temp.expect('definer / migration-role write is NOT repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878601'), '30.00');

set local role service_role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878602', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878311', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
reset role;
select pg_temp.expect('service_role write (checkout, webhook, import) is NOT repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878602'), '30.00');

-- Writers that are not direct client writes may still change the fee.
update public.entries set entry_fee = 22 where id = '00000000-0000-0000-0000-000000878601';
select pg_temp.expect('definer / migration-role UPDATE can change the fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878601'), '22.00');
set local role service_role;
update public.entries set entry_fee = 25 where id = '00000000-0000-0000-0000-000000878602';
reset role;
select pg_temp.expect('service_role UPDATE can change the fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878602'), '25.00');

-- The gate must not leak "direct write" into a later statement of the same
-- transaction: a direct override insert right before a definer one, and back.
select pg_temp.as_user('00000000-0000-0000-0000-000000878106');
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878603', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878312', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
reset role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878604', '00000000-0000-0000-0000-000000878402',
  '00000000-0000-0000-0000-000000878313', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878002',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000000000');
select pg_temp.expect('direct override insert right before a definer write: repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878603'), '15.00');
select pg_temp.expect('definer write right after a direct insert: not repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878604'), '30.00');

rollback;
