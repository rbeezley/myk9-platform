-- MYK9-1931: the show's fee is the default; a class's own fee wins when one is set.
--
-- Behavioral test for 20261115072007_myk9_1931_class_fee_wins.sql, run only in CI
-- (scripts/qa/run-behavioral-sql-tests.sh).
--
--   A. the pricing matrix: private.price_entry_fee for every row of the SHARED CASES
--      table below. The client runs the same rows through getShowEntryFee
--      (apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/
--      getShowEntryFee.sharedCases.test.ts parses this block), and so does checkout's
--      authoritativeEntryFeeCents (apps/myk9show/supabase/functions/_shared/
--      authoritativeFee.sharedCases.test.ts), so all three return the same fee
--   B. the clean-up: a copied fee is emptied, a zero is emptied, a different fee is
--      kept, a fee on a show with no pre-entry fee is kept; running it again changes
--      nothing
--   C. a show whose fee changes after its classes exist charges the new fee in classes
--      without their own; an existing entry keeps the fee it was charged
--   D. no API role can execute the changed functions
--
-- Fixtures roll back.

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
values ('00000000-0000-0000-0000-000001931801', 'secretary', 'MYK9-1931 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001931010', 'MYK9-1931 Club');

-- The junior fee is charged only on a show secretary's override, so the cases price as one.
insert into public.people (id, first_name, last_name, email)
values ('00000000-0000-0000-0000-000001931006', 'MYK9-1931', 'Secretary',
        'myk9-1931-secretary@example.test');
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000001931106', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-1931-secretary@example.test', '', now(), now(),
        now(), '{}', '{}', false, false, false);
update public.people set auth_user_id = '00000000-0000-0000-0000-000001931106'
 where id = '00000000-0000-0000-0000-000001931006';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001931006', id, '00000000-0000-0000-0000-000001931010',
       true, '00000000-0000-0000-0000-000001931106'
from public.roles where name = 'secretary';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001931106', true);
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000001931106', 'role', 'authenticated')::text,
  true);

-- ---------------------------------------------------------------------------
-- A. The pricing matrix. One show, trial and class per row.
-- Columns: label, show pre-entry fee, show day-of fee, class fee, junior fee,
-- day-of entry, junior override, expected fee. Keep one row per line: the client
-- test parses these lines.
-- ---------------------------------------------------------------------------
create temp table fee_cases (
  n integer generated always as identity,
  label text, pre numeric, dos numeric, class_fee numeric, junior numeric,
  day_of boolean, junior_override boolean, expected numeric
) on commit drop;

-- BEGIN SHARED CASES
insert into fee_cases (label, pre, dos, class_fee, junior, day_of, junior_override, expected) values
  ('show fee only', 25, 30, NULL, NULL, false, false, 25),
  ('show fee only, day-of', 25, 30, NULL, NULL, true, false, 30),
  ('class fee set', 25, 30, 40, NULL, false, false, 40),
  ('class fee set, day-of adds the show surcharge', 25, 30, 40, NULL, true, false, 45),
  ('class fee zero is the show fee', 25, 30, 0, NULL, false, false, 25),
  ('class fee zero is the show fee, day-of', 25, 30, 0, NULL, true, false, 30),
  ('class fee empty is the show fee', 25, NULL, NULL, NULL, false, false, 25),
  ('class fee equal to the show fee', 25, 30, 25, NULL, false, false, 25),
  ('class fee below the show fee', 25, 30, 20, NULL, false, false, 20),
  ('day-of with a zero day-of fee and a class fee', 25, 0, 40, NULL, true, false, 40),
  ('day-of with a zero day-of fee and no class fee', 25, 0, NULL, NULL, true, false, 25),
  ('day-of fee below pre-entry adds nothing to a class fee', 25, 20, 40, NULL, true, false, 40),
  ('day-of fee below pre-entry still prices a class without a fee', 25, 20, NULL, NULL, true, false, 20),
  ('free pre-entry, day-of surcharge on a class fee', 0, 10, 40, NULL, true, false, 50),
  ('no show fee, class fee', NULL, NULL, 28, NULL, false, false, 28),
  ('no show fee, no class fee is free', NULL, NULL, NULL, NULL, false, false, 0),
  ('no show fee, class fee zero is free', NULL, NULL, 0, NULL, false, false, 0),
  ('no pre-entry fee, day-of adds nothing to a class fee', NULL, 30, 40, NULL, true, false, 40),
  ('junior in a dearer class', 25, 30, 40, 15, false, true, 15),
  ('junior in a dearer class, day-of', 25, 30, 40, 15, true, true, 15),
  ('junior in a class without a fee', 25, 30, NULL, 15, false, true, 15),
  ('junior fee not requested in a dearer class', 25, 30, 40, 15, false, false, 40);
-- END SHARED CASES

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
select ('00000000-0000-0000-0000-0000019311' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-1931 Show ' || n, 'AKC', current_date + 30, current_date + 30,
       '00000000-0000-0000-0000-000001931010', 'draft', pre, dos, junior
  from fee_cases;

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
select ('00000000-0000-0000-0000-0000019312' || lpad(n::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000019311' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-1931 Trial ' || n, current_date + 30, 'AKC', 'Scent Work'
  from fee_cases;

insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
select ('00000000-0000-0000-0000-0000019313' || lpad(n::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000019312' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-1931 Class ' || n, 'Container', 'Novice', 'upcoming', 'manual', class_fee
  from fee_cases;

do $$
declare
  r     record;
  v_fee numeric;
begin
  for r in select * from fee_cases order by n loop
    select p.fee into v_fee
      from private.price_entry_fee(
             ('00000000-0000-0000-0000-0000019311' || lpad(r.n::text, 2, '0'))::uuid,
             ('00000000-0000-0000-0000-0000019313' || lpad(r.n::text, 2, '0'))::uuid,
             r.day_of, r.junior_override) p;
    perform pg_temp.expect('price: ' || r.label, v_fee::numeric(10,2)::text,
                           r.expected::numeric(10,2)::text);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- B. The clean-up. Show 90: pre-entry 25. Show 91: no pre-entry fee.
-- ---------------------------------------------------------------------------
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
values
  ('00000000-0000-0000-0000-000001931190', 'MYK9-1931 Clean-up Show', 'AKC', current_date + 30,
   current_date + 30, '00000000-0000-0000-0000-000001931010', 'published', true, true, 25, 30),
  ('00000000-0000-0000-0000-000001931191', 'MYK9-1931 No-fee Show', 'AKC', current_date + 30,
   current_date + 30, '00000000-0000-0000-0000-000001931010', 'draft', false, false, NULL, NULL);
insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000001931290', '00000000-0000-0000-0000-000001931190',
   'MYK9-1931 Clean-up Trial', current_date + 30, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000001931291', '00000000-0000-0000-0000-000001931191',
   'MYK9-1931 No-fee Trial', current_date + 30, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values
  ('00000000-0000-0000-0000-000001931390', '00000000-0000-0000-0000-000001931290',
   'MYK9-1931 Copied', 'Container', 'Novice', 'upcoming', 'manual', 25),
  ('00000000-0000-0000-0000-000001931391', '00000000-0000-0000-0000-000001931290',
   'MYK9-1931 Zero', 'Interior', 'Novice', 'upcoming', 'manual', 0),
  ('00000000-0000-0000-0000-000001931392', '00000000-0000-0000-0000-000001931290',
   'MYK9-1931 Detective', 'Detective', 'Novice', 'upcoming', 'manual', 40),
  ('00000000-0000-0000-0000-000001931393', '00000000-0000-0000-0000-000001931290',
   'MYK9-1931 Empty', 'Buried', 'Novice', 'upcoming', 'manual', NULL),
  ('00000000-0000-0000-0000-000001931394', '00000000-0000-0000-0000-000001931291',
   'MYK9-1931 Own fee, no show fee', 'Container', 'Novice', 'upcoming', 'manual', 28);

-- Runs over the whole database, as the migration does (the matrix's zero and copied
-- classes are emptied too; section A already priced them).
select private.clear_copied_class_fees();

select pg_temp.expect('clean-up: a copied fee is emptied',
  (select coalesce(entry_fee::text, 'NULL') from public.classes
    where id = '00000000-0000-0000-0000-000001931390'), 'NULL');
select pg_temp.expect('clean-up: a zero fee is emptied',
  (select coalesce(entry_fee::text, 'NULL') from public.classes
    where id = '00000000-0000-0000-0000-000001931391'), 'NULL');
select pg_temp.expect('clean-up: a different fee is kept',
  (select entry_fee::numeric(10,2)::text from public.classes
    where id = '00000000-0000-0000-0000-000001931392'), '40.00');
select pg_temp.expect('clean-up: an empty fee stays empty',
  (select coalesce(entry_fee::text, 'NULL') from public.classes
    where id = '00000000-0000-0000-0000-000001931393'), 'NULL');
select pg_temp.expect('clean-up: a fee on a show with no pre-entry fee is kept',
  (select entry_fee::numeric(10,2)::text from public.classes
    where id = '00000000-0000-0000-0000-000001931394'), '28.00');
select pg_temp.expect('clean-up: a second run changes nothing',
  (select private.clear_copied_class_fees()::text), '0');

select pg_temp.expect('clean-up: the emptied copy still prices at the show fee',
  (select fee::numeric(10,2)::text
     from private.price_entry_fee('00000000-0000-0000-0000-000001931190',
                                  '00000000-0000-0000-0000-000001931390', false, false)),
  '25.00');

-- ---------------------------------------------------------------------------
-- C. A show fee change reaches classes without their own; existing entries keep theirs.
-- ---------------------------------------------------------------------------
update public.shows set pre_entry_fee = 28
 where id = '00000000-0000-0000-0000-000001931190';
select pg_temp.expect('a show fee change is charged in a class without its own fee',
  (select fee::numeric(10,2)::text
     from private.price_entry_fee('00000000-0000-0000-0000-000001931190',
                                  '00000000-0000-0000-0000-000001931390', false, false)),
  '28.00');
select pg_temp.expect('a show fee change does not move a class with its own fee',
  (select fee::numeric(10,2)::text
     from private.price_entry_fee('00000000-0000-0000-0000-000001931190',
                                  '00000000-0000-0000-0000-000001931392', false, false)),
  '40.00');

-- An entry already made at $40 keeps $40 when its class's fee changes: nothing reprices it.
insert into public.dogs (id, name, call_name, breed, status, owner_id)
values ('00000000-0000-0000-0000-000001931401', 'MYK9-1931 Dog', 'Dog', 'Beagle', 'active',
        '00000000-0000-0000-0000-000001931006');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000001931401', 'AKC', 'SR19310001', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method)
values ('00000000-0000-0000-0000-000001931501', '00000000-0000-0000-0000-000001931401',
        '00000000-0000-0000-0000-000001931392', '00000000-0000-0000-0000-000001931190',
        '00000000-0000-0000-0000-000001931290', 'confirmed', 40, 'pending', 'check');
update public.classes set entry_fee = 50
 where id = '00000000-0000-0000-0000-000001931392';
select pg_temp.expect('an existing entry keeps the fee it was charged',
  (select entry_fee::numeric(10,2)::text from public.entries
    where id = '00000000-0000-0000-0000-000001931501'), '40.00');
select pg_temp.expect('a new entry in that class is priced at the new class fee',
  (select fee::numeric(10,2)::text
     from private.price_entry_fee('00000000-0000-0000-0000-000001931190',
                                  '00000000-0000-0000-0000-000001931392', false, false)),
  '50.00');

-- ---------------------------------------------------------------------------
-- D. Grants.
-- ---------------------------------------------------------------------------
select pg_temp.expect('no API role can execute the MYK9-1931 functions',
  (select count(*)::text
     from unnest(array[
            'private.price_entry_fee(uuid, uuid, boolean, boolean)',
            'private.show_lowest_regular_fee(uuid, numeric, numeric)',
            'private.classes_junior_fee_limit()',
            'private.clear_copied_class_fees()'
          ]) as fn,
          unnest(array['anon', 'authenticated', 'service_role']) as r
    where has_function_privilege(r, fn, 'EXECUTE')),
  '0');

rollback;
