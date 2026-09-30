-- Behavioral test for 20260930214300_myk9_878_junior_handler_fee_pricing.sql (MYK9-878):
-- private.price_entry_fee and trg_entries_junior_fee (the offline / direct-insert
-- path). The submit_show_entries half is myk9_878_submit_entries_junior_fee_test.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Rules under test (docs/plan-junior-handler-fee-v2.md; MYK9-875 comment):
--   * junior fee only for the dog's owner / co-owner who is a junior at the trial
--     (age only; no date of birth, ASCA, or an adult => the normal fee);
--   * a show secretary / site admin may explicitly charge it for any entry; that
--     never reads a date of birth, and anyone else asking is refused;
--   * a show with no junior fee (NULL or 0) charges the normal fee whatever is asked;
--   * the two-entry bootstrap: a manager cannot turn an unrelated handler into a
--     priced relationship by creating one entry and then another;
--   * no API role can execute the pricing function (the MYK9-664 oracle rule);
--   * the trigger reprices ONLY a direct client insert, never a definer / service
--     write, and only ever lowers a fee to the junior fee.
--
-- Fixture pattern from myk9_841_staff_on_behalf_entries_accepted_test.sql: auth.users
-- rows carry the same email as their people row, then people.auth_user_id is set.
--
-- Trial date is fixed (2026-10-10) so ages are deterministic:
--   junior = born 2011-06-01 (15 on the trial date; also 15 for UKC on 2026-01-01)
--   adult  = born 1980-01-01

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

-- 01..13 on the AKC trial (every (dog, class) pair is used at most once),
-- 21 on the ASCA trial, 31 on the no-junior-fee trial.
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
select ('00000000-0000-0000-0000-0000008783' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000878201', 'MYK9-878 Class ' || n,
       'Container', 'Novice', 'upcoming', 'manual', 30
from generate_series(1, 13) as n;
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

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, o.org, 'SR87' || substr(d.id::text, 34) || (case o.org when 'AKC' then '01' else '02' end), true
from public.dogs d
cross join (values ('AKC'), ('ASCA')) as o(org)
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

-- pg_temp.price(show, class, dog, handler, day_of_show, override) -> 'fee|applied'
create function pg_temp.price(p_show uuid, p_class uuid, p_dog uuid, p_handler uuid,
                              p_day boolean, p_override boolean)
returns text language sql as $$
  select fee::text || '|' || junior_fee_applied::text
    from private.price_entry_fee(p_show, p_class, p_dog, p_handler, p_day, p_override);
$$;

select pg_temp.as_user('00000000-0000-0000-0000-000000878106');

-- ---------------------------------------------------------------------------
-- 1. The pricing function (run as the migration role, as its only callers do).
-- ---------------------------------------------------------------------------
select pg_temp.expect('junior owner is priced at the junior fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', '00000000-0000-0000-0000-000000878001', false, false),
  '15|true');
select pg_temp.expect('adult owner is priced at the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878402', '00000000-0000-0000-0000-000000878002', false, false),
  '30|false');
select pg_temp.expect('owner with no date of birth is priced at the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878403', '00000000-0000-0000-0000-000000878003', false, false),
  '30|false');
select pg_temp.expect('an ASCA show never derives a junior, even for a young owner',
  pg_temp.price('00000000-0000-0000-0000-000000878102', '00000000-0000-0000-0000-000000878321',
    '00000000-0000-0000-0000-000000878406', '00000000-0000-0000-0000-000000878001', false, false),
  '30|false');
select pg_temp.expect('an unrelated junior handler is priced at the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878405', '00000000-0000-0000-0000-000000878005', false, false),
  '30|false');
select pg_temp.expect('a junior CO-OWNER is priced at the junior fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878404', '00000000-0000-0000-0000-000000878004', false, false),
  '15|true');
select pg_temp.expect('a dog with no handler is priced at the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', NULL, false, false),
  '30|false');
select pg_temp.expect('a NULL-fee show charges the normal fee to a junior owner',
  pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331',
    '00000000-0000-0000-0000-000000878407', '00000000-0000-0000-0000-000000878001', false, false),
  '30|false');
select pg_temp.expect('the day-of fee is the normal fee on show day (adult)',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878402', '00000000-0000-0000-0000-000000878002', true, false),
  '45|false');
select pg_temp.expect('the junior fee is unchanged on show day (junior owner)',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', '00000000-0000-0000-0000-000000878001', true, false),
  '15|true');

-- Override: the secretary (caller) charges the junior fee to an unrelated handler
-- and to a no-date-of-birth handler; no date of birth is consulted.
select pg_temp.expect('secretary override charges the junior fee to an unrelated handler',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878405', '00000000-0000-0000-0000-000000878005', false, true),
  '15|true');
select pg_temp.expect('secretary override needs no date of birth',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878405', '00000000-0000-0000-0000-000000878003', false, true),
  '15|true');
select pg_temp.expect('secretary override charges the junior fee even to an ADULT (an explicit choice)',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878402', '00000000-0000-0000-0000-000000878002', false, true),
  '15|true');
select pg_temp.expect('secretary override on an ASCA show with a junior fee still applies',
  pg_temp.price('00000000-0000-0000-0000-000000878102', '00000000-0000-0000-0000-000000878321',
    '00000000-0000-0000-0000-000000878406', '00000000-0000-0000-0000-000000878003', false, true),
  '15|true');
select pg_temp.expect('override on a show with no junior fee charges the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331',
    '00000000-0000-0000-0000-000000878407', '00000000-0000-0000-0000-000000878001', false, true),
  '30|false');

-- A junior fee of 0 means "no junior tier" (slice A's convention).
update public.shows set junior_handler_fee = 0 where id = '00000000-0000-0000-0000-000000878101';
select pg_temp.expect('a zero junior fee is no tier: the normal fee',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', '00000000-0000-0000-0000-000000878001', false, false),
  '30|false');
update public.shows set junior_handler_fee = 15 where id = '00000000-0000-0000-0000-000000878101';

-- A junior tier configured ABOVE the regular fee never exceeds it: regular 10,
-- junior 15 => 10 (derived and override alike).
update public.shows set pre_entry_fee = 10 where id = '00000000-0000-0000-0000-000000878101';
select pg_temp.expect('junior tier above the regular fee is capped at the regular fee (derived)',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', '00000000-0000-0000-0000-000000878001', false, false),
  '10|true');
select pg_temp.expect('junior tier above the regular fee is capped at the regular fee (override)',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878405', '00000000-0000-0000-0000-000000878005', false, true),
  '10|true');
update public.shows set pre_entry_fee = 30 where id = '00000000-0000-0000-0000-000000878101';

-- Override refused for anyone who is not the show secretary or a site admin,
-- whether or not the show has a junior fee.
select pg_temp.as_user('00000000-0000-0000-0000-000000878107');
do $$
begin
  begin
    perform pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
      '00000000-0000-0000-0000-000000878405', '00000000-0000-0000-0000-000000878005', false, true);
    raise exception 'FAIL a club admin who is not a secretary charged the junior fee';
  exception when insufficient_privilege then
    raise notice 'PASS override by a non-secretary is refused (42501)';
  end;
  begin
    perform pg_temp.price('00000000-0000-0000-0000-000000878103', '00000000-0000-0000-0000-000000878331',
      '00000000-0000-0000-0000-000000878407', '00000000-0000-0000-0000-000000878001', false, true);
    raise exception 'FAIL a non-secretary override on a no-junior-fee show was answered';
  exception when insufficient_privilege then
    raise notice 'PASS override by a non-secretary is refused even on a show with no junior fee';
  end;
end $$;
select pg_temp.expect('the same non-secretary prices the normal way without an override',
  pg_temp.price('00000000-0000-0000-0000-000000878101', '00000000-0000-0000-0000-000000878301',
    '00000000-0000-0000-0000-000000878401', '00000000-0000-0000-0000-000000878001', false, false),
  '15|true');
select pg_temp.as_user('00000000-0000-0000-0000-000000878106');

-- ---------------------------------------------------------------------------
-- 2. Oracle rule: no API role can execute the pricing function or the triggers'
--    helpers, and none can even try.
-- ---------------------------------------------------------------------------
select pg_temp.expect('anon cannot execute private.price_entry_fee',
  has_function_privilege('anon',
    'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('authenticated cannot execute private.price_entry_fee',
  has_function_privilege('authenticated',
    'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('service_role cannot execute private.price_entry_fee',
  has_function_privilege('service_role',
    'private.price_entry_fee(uuid, uuid, uuid, uuid, boolean, boolean)', 'EXECUTE')::text, 'false');
select pg_temp.expect('no API role can read entries.junior_fee_override_by',
  (has_column_privilege('anon', 'public.entries', 'junior_fee_override_by', 'SELECT')
   or has_column_privilege('authenticated', 'public.entries', 'junior_fee_override_by', 'SELECT'))::text,
  'false');

set local role authenticated;
do $$
begin
  begin
    perform private.price_entry_fee(
      '00000000-0000-0000-0000-000000878101'::uuid, '00000000-0000-0000-0000-000000878301'::uuid,
      '00000000-0000-0000-0000-000000878401'::uuid, '00000000-0000-0000-0000-000000878001'::uuid,
      false, false);
    raise exception 'FAIL an authenticated caller priced an entry with a chosen handler';
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

-- a. junior owner -> repriced to the junior fee.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878501', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878301', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
-- b. adult owner -> untouched.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878502', '00000000-0000-0000-0000-000000878402',
  '00000000-0000-0000-0000-000000878302', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878002',
  'confirmed', 30, 'pending', 'check');
-- c. unrelated junior handler, TWO entries (the bootstrap): neither is priced junior,
--    and the first does not make the second one priced junior.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878503', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878303', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878504', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878304', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check');
-- d. junior CO-OWNER -> junior fee.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878505', '00000000-0000-0000-0000-000000878404',
  '00000000-0000-0000-0000-000000878305', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878004',
  'confirmed', 30, 'pending', 'check');
-- e. override REQUEST by the secretary (any non-null value is the request; the client
--    sends its own user id) for an unrelated handler -> junior fee, stamped with the
--    secretary's PEOPLE id, never the value the client sent.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878506', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878306', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000878106');
-- f. a WAIVED junior owner entry keeps its zero fee.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878507', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878307', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 0, 'waived', 'waived');
-- g. a junior owner entry the client already priced BELOW the junior fee is not raised.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878508', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878308', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 10, 'pending', 'check');
-- h. junior owner on the NO-junior-fee show keeps the client's fee.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878509', '00000000-0000-0000-0000-000000878407',
  '00000000-0000-0000-0000-000000878331', '00000000-0000-0000-0000-000000878103',
  '00000000-0000-0000-0000-000000878203', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
-- i. an override request on the no-junior-fee show: normal fee, NO stamp.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_override_by)
values ('00000000-0000-0000-0000-000000878510', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878331', '00000000-0000-0000-0000-000000878103',
  '00000000-0000-0000-0000-000000878203', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000878106');
-- j. no handler on the row: normal fee.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878511', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878309', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', 'confirmed', 30, 'pending', 'check');

-- k. a NON-secretary who passes the entries insert RLS (the club admin) asks for the
--    override: refused, and nothing is written. (Inline set_config, not pg_temp
--    helpers: the session is running as `authenticated` here.)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000878107', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000878107","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                                entry_fee, payment_status, payment_method, junior_fee_override_by)
    values ('00000000-0000-0000-0000-000000878512', '00000000-0000-0000-0000-000000878405',
      '00000000-0000-0000-0000-000000878310', '00000000-0000-0000-0000-000000878101',
      '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
      'confirmed', 30, 'pending', 'check', '00000000-0000-0000-0000-000000878107');
    raise exception 'FAIL a non-secretary direct insert charged the junior fee';
  exception when insufficient_privilege then
    raise notice 'PASS a non-secretary override on a direct insert is refused';
  end;
end $$;
-- ...and the same club admin inserting WITHOUT a request still works (positive control
-- for the refusal above: the insert policy lets them in, only the override is refused).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878513', '00000000-0000-0000-0000-000000878405',
  '00000000-0000-0000-0000-000000878311', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878005',
  'confirmed', 30, 'pending', 'check');

-- l. A client cannot forge or change the stamp after the fact.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000878106', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000878106","role":"authenticated"}', true);
update public.entries set junior_fee_override_by = '00000000-0000-0000-0000-000000878003'
 where id = '00000000-0000-0000-0000-000000878501';
update public.entries set junior_fee_override_by = NULL
 where id = '00000000-0000-0000-0000-000000878506';
-- m. The fee is FROZEN: a direct client UPDATE (a whole-row upload from a device
--    that still holds the regular fee) cannot change entry_fee, in either direction.
update public.entries set entry_fee = 30, entry_status = 'confirmed'
 where id = '00000000-0000-0000-0000-000000878501';
update public.entries set entry_fee = 99 where id = '00000000-0000-0000-0000-000000878502';
update public.entries set entry_fee = 0 where id = '00000000-0000-0000-0000-000000878506';
reset role;

create function pg_temp.fee(p_id uuid) returns text language sql as $$
  select entry_fee::numeric(10,2)::text from public.entries where id = p_id;
$$;
create function pg_temp.stamp(p_id uuid) returns text language sql as $$
  select coalesce(junior_fee_override_by::text, 'none') from public.entries where id = p_id;
$$;

select pg_temp.expect('direct insert, junior owner: stored fee is the junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878501'), '15.00');
select pg_temp.expect('direct insert, junior owner: no stamp (derived, not an override)',
  pg_temp.stamp('00000000-0000-0000-0000-000000878501'), 'none');
select pg_temp.expect('direct insert, adult owner: stored fee is untouched',
  pg_temp.fee('00000000-0000-0000-0000-000000878502'), '30.00');
select pg_temp.expect('two-entry bootstrap: first entry for an unrelated junior is the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878503'), '30.00');
select pg_temp.expect('two-entry bootstrap: second entry is still the normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878504'), '30.00');
select pg_temp.expect('direct insert, junior co-owner: junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878505'), '15.00');
select pg_temp.expect('direct insert, secretary override: junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878506'), '15.00');
select pg_temp.expect('direct insert, secretary override: stamped with the secretary''s people id',
  pg_temp.stamp('00000000-0000-0000-0000-000000878506'), '00000000-0000-0000-0000-000000878006');
select pg_temp.expect('a waived junior entry keeps its zero fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878507'), '0.00');
select pg_temp.expect('a fee already below the junior fee is never raised',
  pg_temp.fee('00000000-0000-0000-0000-000000878508'), '10.00');
select pg_temp.expect('no-junior-fee show: the client''s fee stands',
  pg_temp.fee('00000000-0000-0000-0000-000000878509'), '30.00');
select pg_temp.expect('override request on a no-junior-fee show: normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878510'), '30.00');
select pg_temp.expect('override request on a no-junior-fee show: no stamp',
  pg_temp.stamp('00000000-0000-0000-0000-000000878510'), 'none');
select pg_temp.expect('no handler on the row: normal fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878511'), '30.00');
select pg_temp.expect('the refused override wrote no entry',
  (select count(*)::text from public.entries where id = '00000000-0000-0000-0000-000000878512'), '0');
select pg_temp.expect('the club admin''s ordinary insert landed (positive control)',
  pg_temp.fee('00000000-0000-0000-0000-000000878513'), '30.00');
select pg_temp.expect('a client update cannot forge the stamp on a derived entry',
  pg_temp.stamp('00000000-0000-0000-0000-000000878501'), 'none');
select pg_temp.expect('frozen: an update cannot restore the regular fee over the junior fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878501'), '15.00');
select pg_temp.expect('frozen: an update cannot raise a stored fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878502'), '30.00');
select pg_temp.expect('frozen: an update cannot zero an overridden fee',
  pg_temp.fee('00000000-0000-0000-0000-000000878506'), '15.00');
select pg_temp.expect('a client update cannot clear the stamp',
  pg_temp.stamp('00000000-0000-0000-0000-000000878506'), '00000000-0000-0000-0000-000000878006');

-- ---------------------------------------------------------------------------
-- 4. The trigger reprices ONLY a direct client insert. The same junior-owner row
--    written as the migration role (what every SECURITY DEFINER writer is) or as
--    service_role (card checkout, webhook, import) keeps the fee it was given.
-- ---------------------------------------------------------------------------
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878601', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878310', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
select pg_temp.expect('definer / migration-role write is NOT repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878601'), '30.00');

set local role service_role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878602', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878311', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
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
-- transaction: after the authenticated inserts above, a migration-role insert
-- (row 878601) already proved it; once more, in the opposite order.
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878603', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878312', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
reset role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000000878604', '00000000-0000-0000-0000-000000878401',
  '00000000-0000-0000-0000-000000878313', '00000000-0000-0000-0000-000000878101',
  '00000000-0000-0000-0000-000000878201', '00000000-0000-0000-0000-000000878001',
  'confirmed', 30, 'pending', 'check');
select pg_temp.expect('direct insert right before a definer write: repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878603'), '15.00');
select pg_temp.expect('definer write right after a direct insert: not repriced',
  pg_temp.fee('00000000-0000-0000-0000-000000878604'), '30.00');

rollback;
