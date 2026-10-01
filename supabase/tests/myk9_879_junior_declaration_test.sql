-- Behavioral test for 20261001034700_myk9_879_junior_handler_declaration.sql (MYK9-879).
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Rules under test (docs/plan-junior-handler-fee-v2.md; Richard, 2026-09-30:
-- the EXHIBITOR SELF-DECLARES that the handler is under 18):
--   1. entries.junior_fee_declared and entry_cart_items.junior_fee_declared exist,
--      NOT NULL, default false; anon has no access to the entries column and
--      authenticated can read it (the secretary list); no API role gains write
--      beyond the table grants the triggers already police.
--   2. create_online_paid_entry (service_role) records the declaration on a show with
--      a junior tier and stores the fee it was handed, and records NOTHING on a show
--      without one; the 11-argument call still works and records false; there is
--      exactly one overload; only service_role can execute it. It never looks at
--      who owns the dog: the dog below is owned by an ADULT and the declaration
--      still records (the declaration is about the handler).
--   3. A direct client INSERT cannot assert a declaration (forced false), a direct
--      client UPDATE cannot set or clear it, and a definer/owner write is not a
--      direct client write, so a stored declaration survives a client UPDATE.
--   4. Changing a cart line's declaration severs the checkout-session link.
--
-- Fixture patterns from myk9_878_price_entry_fee_test.sql (secretary, direct
-- entries) and myk9_705_656_class_entry_availability_test.sql (published show,
-- exhibitor profile created by handle_new_user, cart + session on service_role).
-- Real column types: entry_fee is numeric(10,2) and renders '15.00'; every fee
-- compared below is cast to a fixed scale first.

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
values ('00000000-0000-0000-0000-000000879801', 'secretary', 'MYK9-879 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000879010', 'MYK9-879 Club');

-- S1: AKC, junior fee 15, pre-entry 30. S2: AKC with NO junior fee.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          junior_handler_fee, default_judge_day_capacity)
values
  ('00000000-0000-0000-0000-000000879101', 'MYK9-879 Junior Tier Show', 'AKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-000000879010', 'published',
   (current_date - 10)::timestamptz, (current_date + 10)::timestamptz, 30, 15, 125),
  ('00000000-0000-0000-0000-000000879102', 'MYK9-879 No Tier Show', 'AKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-000000879010', 'published',
   (current_date - 10)::timestamptz, (current_date + 10)::timestamptz, 30, NULL, 125);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000000879201', '00000000-0000-0000-0000-000000879101',
   'MYK9-879 Trial', current_date + 20, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000879202', '00000000-0000-0000-0000-000000879102',
   'MYK9-879 No Tier Trial', current_date + 20, 'AKC', 'Scent Work');

-- 01..08 on the tier show; 21 on the no-tier show. status_source 'manual' so the
-- derivation trigger cannot rewrite the fixture status.
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
select ('00000000-0000-0000-0000-0000008793' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000879201', 'MYK9-879 Class ' || n,
       'Container', 'Novice', 'upcoming', 'manual', 30
from generate_series(1, 8) as n;
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values ('00000000-0000-0000-0000-000000879321', '00000000-0000-0000-0000-000000879202',
        'MYK9-879 No Tier Class', 'Container', 'Novice', 'upcoming', 'manual', 30);

-- 001 adult owner (the exhibitor: handle_new_user adopts the row by email and
-- creates the exhibitor_profiles row), 002 secretary.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000879001', 'MYK9-879', 'AdultOwner', 'myk9-879-adult@example.test'),
  ('00000000-0000-0000-0000-000000879002', 'MYK9-879', 'Secretary', 'myk9-879-secretary@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000879101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-879-adult@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000879102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-879-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

update public.people set auth_user_id = '00000000-0000-0000-0000-000000879102'
 where id = '00000000-0000-0000-0000-000000879002';

do $$
begin
  if (select count(*) from public.exhibitor_profiles
       where auth_user_id = '00000000-0000-0000-0000-000000879101') <> 1 then
    raise exception 'FIXTURE handle_new_user did not create the exhibitor profile';
  end if;
end $$;

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000879002', id, '00000000-0000-0000-0000-000000879010',
       true, '00000000-0000-0000-0000-000000879102'
from public.roles where name = 'secretary';

-- Dogs owned by the ADULT. One registration per dog (partial unique index
-- dog_registrations_one_primary_per_dog on (dog_id) where is_primary).
insert into public.dogs (id, name, call_name, breed, status, owner_id)
select ('00000000-0000-0000-0000-0000008794' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-879 Dog ' || n, 'D' || n, 'Beagle', 'active',
       '00000000-0000-0000-0000-000000879001'
from generate_series(1, 6) as n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, 'AKC', 'SR879' || substr(d.id::text, 34) || '01', true
from public.dogs d
where d.id::text like '00000000-0000-0000-0000-0000008794%';

-- ---------------------------------------------------------------------------
-- 1. Columns, defaults and grants.
-- ---------------------------------------------------------------------------
select pg_temp.expect('entries.junior_fee_declared is boolean NOT NULL default false',
  (select data_type || '|' || is_nullable || '|' || column_default
     from information_schema.columns
    where table_schema = 'public' and table_name = 'entries'
      and column_name = 'junior_fee_declared'),
  'boolean|NO|false');
select pg_temp.expect('entry_cart_items.junior_fee_declared is boolean NOT NULL default false',
  (select data_type || '|' || is_nullable || '|' || column_default
     from information_schema.columns
    where table_schema = 'public' and table_name = 'entry_cart_items'
      and column_name = 'junior_fee_declared'),
  'boolean|NO|false');
select pg_temp.expect('anon cannot read, insert or update entries.junior_fee_declared',
  (has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'SELECT')
   or has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'INSERT')
   or has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'UPDATE'))::text,
  'false');
select pg_temp.expect('authenticated can read entries.junior_fee_declared',
  has_column_privilege('authenticated', 'public.entries', 'junior_fee_declared', 'SELECT')::text,
  'true');

-- ---------------------------------------------------------------------------
-- 2. create_online_paid_entry, as the webhook calls it (service_role).
-- ---------------------------------------------------------------------------
select pg_temp.expect('exactly one create_online_paid_entry overload exists',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_online_paid_entry'),
  '1');
select pg_temp.expect('anon cannot execute create_online_paid_entry',
  has_function_privilege('anon',
    'public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean)',
    'EXECUTE')::text, 'false');
select pg_temp.expect('authenticated cannot execute create_online_paid_entry',
  has_function_privilege('authenticated',
    'public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean)',
    'EXECUTE')::text, 'false');
select pg_temp.expect('service_role can execute create_online_paid_entry',
  has_function_privilege('service_role',
    'public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean)',
    'EXECUTE')::text, 'true');

set local role service_role;

do $$
declare
  v_exhibitor uuid;
  r record;
  v_declared boolean;
  v_fee text;
begin
  select id into v_exhibitor from public.exhibitor_profiles
   where auth_user_id = '00000000-0000-0000-0000-000000879101';

  -- a. Declared, on a show WITH a junior tier, for a dog owned by an ADULT: recorded,
  --    and the stored fee is exactly the one the webhook verified (15.00).
  select * into r from public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000879401', '00000000-0000-0000-0000-000000879301', NULL, 15,
    NULL, NULL, 'pi_test_879_a', now(),
    '00000000-0000-0000-0000-000000879101', '00000000-0000-0000-0000-000000879201',
    v_exhibitor, true);
  if r.outcome is distinct from 'created_entry' then
    raise exception 'FAIL declared entry was %', r.outcome;
  end if;
  select e.junior_fee_declared, e.entry_fee::numeric(10,2)::text into v_declared, v_fee
    from public.entries e where e.id = r.entry_id;
  if v_declared is distinct from true or v_fee is distinct from '15.00' then
    raise exception 'FAIL declared entry stored declared=%, fee=%', v_declared, v_fee;
  end if;
  raise notice 'PASS a declared junior entry records the declaration and the 15.00 fee, dog owned by an adult';

  -- b. Not declared: false, normal fee.
  select * into r from public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000879402', '00000000-0000-0000-0000-000000879302', NULL, 30,
    NULL, NULL, 'pi_test_879_b', now(),
    '00000000-0000-0000-0000-000000879101', '00000000-0000-0000-0000-000000879201',
    v_exhibitor, false);
  select e.junior_fee_declared, e.entry_fee::numeric(10,2)::text into v_declared, v_fee
    from public.entries e where e.id = r.entry_id;
  if v_declared is distinct from false or v_fee is distinct from '30.00' then
    raise exception 'FAIL undeclared entry stored declared=%, fee=%', v_declared, v_fee;
  end if;
  raise notice 'PASS an undeclared entry records false and the 30.00 fee';

  -- c. The OLD 11-argument call (an older webhook during a rolling deploy) still works
  --    and records false.
  select * into r from public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000879403', '00000000-0000-0000-0000-000000879303', NULL, 30,
    NULL, NULL, 'pi_test_879_c', now(),
    '00000000-0000-0000-0000-000000879101', '00000000-0000-0000-0000-000000879201',
    v_exhibitor);
  select e.junior_fee_declared into v_declared from public.entries e where e.id = r.entry_id;
  if r.outcome is distinct from 'created_entry' or v_declared is distinct from false then
    raise exception 'FAIL 11-argument call returned % declared=%', r.outcome, v_declared;
  end if;
  raise notice 'PASS the 11-argument call still works and records false';

  -- d. Declared on a show with NO junior tier: nothing recorded (it priced nothing).
  select * into r from public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000879404', '00000000-0000-0000-0000-000000879321', NULL, 30,
    NULL, NULL, 'pi_test_879_d', now(),
    '00000000-0000-0000-0000-000000879102', '00000000-0000-0000-0000-000000879202',
    v_exhibitor, true);
  select e.junior_fee_declared, e.entry_fee::numeric(10,2)::text into v_declared, v_fee
    from public.entries e where e.id = r.entry_id;
  if v_declared is distinct from false or v_fee is distinct from '30.00' then
    raise exception 'FAIL no-tier declaration stored declared=%, fee=%', v_declared, v_fee;
  end if;
  raise notice 'PASS a declaration on a show with no junior tier records nothing, fee stays 30.00';

  -- e. A NULL flag is false.
  select * into r from public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000879405', '00000000-0000-0000-0000-000000879304', NULL, 30,
    NULL, NULL, 'pi_test_879_e', now(),
    '00000000-0000-0000-0000-000000879101', '00000000-0000-0000-0000-000000879201',
    v_exhibitor, NULL);
  select e.junior_fee_declared into v_declared from public.entries e where e.id = r.entry_id;
  if v_declared is distinct from false then
    raise exception 'FAIL NULL flag stored %', v_declared;
  end if;
  raise notice 'PASS a NULL flag records false';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3. Direct client writes cannot assert or change the declaration.
-- ---------------------------------------------------------------------------
create function pg_temp.as_user(p_auth uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.as_user('00000000-0000-0000-0000-000000879102');
set local role authenticated;

-- The secretary's direct insert claims a declaration and a 15.00 fee; the
-- declaration is forced false (only create_online_paid_entry records one).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method, junior_fee_declared)
values ('00000000-0000-0000-0000-000000879501', '00000000-0000-0000-0000-000000879406',
        '00000000-0000-0000-0000-000000879305', '00000000-0000-0000-0000-000000879101',
        '00000000-0000-0000-0000-000000879201', 'confirmed', 30, 'pending', 'check', true);

reset role;
select pg_temp.expect('a direct client insert cannot assert a declaration',
  (select junior_fee_declared::text from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'false');

-- A direct client UPDATE cannot set it either (a bare update of the new column must
-- reach the trigger: it is in the trigger's column list).
select pg_temp.as_user('00000000-0000-0000-0000-000000879102');
set local role authenticated;
update public.entries set junior_fee_declared = true, special_requests = 'touched-1'
 where id = '00000000-0000-0000-0000-000000879501';
reset role;
-- Positive control: the UPDATE reached the row (RLS did not silently skip it), so a
-- 'false' below is the trigger's doing, not a statement that never ran.
select pg_temp.expect('the secretary update reached the row',
  (select special_requests from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'touched-1');
select pg_temp.expect('a direct client update cannot set a declaration',
  (select junior_fee_declared::text from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'false');

-- A STORED declaration (written by the owner role, as the webhook's RPC does) survives
-- a client UPDATE that tries to clear it, and the fee stays frozen too.
update public.entries set junior_fee_declared = true, entry_fee = 15
 where id = '00000000-0000-0000-0000-000000879501';
select pg_temp.expect('an owner-role write keeps a declaration (not a direct client write)',
  (select junior_fee_declared::text || '|' || entry_fee::numeric(10,2)::text from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'true|15.00');

select pg_temp.as_user('00000000-0000-0000-0000-000000879102');
set local role authenticated;
update public.entries set junior_fee_declared = false, entry_fee = 30, special_requests = 'touched-2'
 where id = '00000000-0000-0000-0000-000000879501';
reset role;
select pg_temp.expect('the second secretary update reached the row',
  (select special_requests from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'touched-2');
select pg_temp.expect('a direct client update cannot clear a declaration or restore the normal fee',
  (select junior_fee_declared::text || '|' || entry_fee::numeric(10,2)::text from public.entries
    where id = '00000000-0000-0000-0000-000000879501'), 'true|15.00');

-- ---------------------------------------------------------------------------
-- 4. Changing a cart line's declaration severs the checkout session.
-- ---------------------------------------------------------------------------
insert into public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
select '00000000-0000-0000-0000-000000879600', ep.id, '00000000-0000-0000-0000-000000879101',
       'active', now() + interval '30 minutes'
from public.exhibitor_profiles ep
where ep.auth_user_id = '00000000-0000-0000-0000-000000879101';

insert into public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
values ('00000000-0000-0000-0000-000000879701', '00000000-0000-0000-0000-000000879600',
        '00000000-0000-0000-0000-000000879406', '00000000-0000-0000-0000-000000879306', 3000);

select pg_temp.expect('a new cart line defaults to no declaration',
  (select junior_fee_declared::text from public.entry_cart_items
    where id = '00000000-0000-0000-0000-000000879701'), 'false');

-- The session id goes on AFTER the lines: every line insert severs it, and only
-- the checkout service may set one.
set local role service_role;
update public.entry_carts set stripe_checkout_session_id = 'cs_test_myk9_879'
 where id = '00000000-0000-0000-0000-000000879600';
reset role;
select pg_temp.expect('FIXTURE the cart links a session before the declaration changes',
  (select stripe_checkout_session_id from public.entry_carts
    where id = '00000000-0000-0000-0000-000000879600'), 'cs_test_myk9_879');

-- An update that does NOT change the declaration leaves the session alone.
update public.entry_cart_items set junior_fee_declared = false
 where id = '00000000-0000-0000-0000-000000879701';
select pg_temp.expect('rewriting the same declaration keeps the session',
  (select stripe_checkout_session_id from public.entry_carts
    where id = '00000000-0000-0000-0000-000000879600'), 'cs_test_myk9_879');

-- The owner declares the handler a junior: the session is severed.
select pg_temp.as_user('00000000-0000-0000-0000-000000879101');
set local role authenticated;
update public.entry_cart_items set junior_fee_declared = true, entry_fee_cents = 1500
 where id = '00000000-0000-0000-0000-000000879701';
reset role;
select pg_temp.expect('declaring on a cart line severs the checkout session',
  coalesce((select stripe_checkout_session_id from public.entry_carts
    where id = '00000000-0000-0000-0000-000000879600'), 'NULL'), 'NULL');
select pg_temp.expect('the declaration and the 1500-cent quote were stored on the line',
  (select junior_fee_declared::text || '|' || entry_fee_cents::text from public.entry_cart_items
    where id = '00000000-0000-0000-0000-000000879701'), 'true|1500');

rollback;
