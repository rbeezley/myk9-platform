-- Behavioral test for 20261115172300_myk9_1975_junior_fee_within_regular_fee.sql
-- (MYK9-1975): trg_shows_junior_fee_within_regular and trg_classes_fee_within_junior_fee.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Rules under test:
--   * a junior fee above the lowest regular fee is refused, with the app's message;
--   * the reverse: lowering the pre-entry or day-of fee below the junior fee is refused;
--   * equal is allowed; NULL or 0 junior fee (no tier) is never checked; a 0 day-of fee
--     is no tier and never the limit;
--   * class fees count only when the show has no pre-entry fee, and a deleted class
--     never counts;
--   * an unrelated update to a row already over the limit still saves (write-only);
--   * service_role, which bypasses RLS, cannot get around it either;
--   * no API role can execute the helper functions.

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

-- Runs p_sql and returns the check_violation message it raised, or 'accepted'.
create function pg_temp.attempt(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'accepted';
exception when check_violation then
  return sqlerrm;
end;
$$;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001975010', 'MYK9-1975 Club');

-- ---------------------------------------------------------------------------
-- 1. Show tiers on INSERT.
-- ---------------------------------------------------------------------------
select pg_temp.expect('insert: junior above the pre-entry fee is refused with the limit named',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              accept_check_payments, accept_cash_payments,
                              pre_entry_fee, day_of_show_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975100', 'MYK9-1975 Over', 'AKC',
            date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
            'draft', true, true, 15, 35, 20)
  $q$),
  'The junior fee can''t be more than $15, the lowest class fee in this show.');

select pg_temp.expect('insert: junior below every tier is accepted',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              accept_check_payments, accept_cash_payments,
                              pre_entry_fee, day_of_show_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975101', 'MYK9-1975 Tiers', 'AKC',
            date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
            'draft', true, true, 30, 35, 15)
  $q$),
  'accepted');

select pg_temp.expect('insert: a day-of fee below the junior fee is the limit',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              accept_check_payments, accept_cash_payments,
                              pre_entry_fee, day_of_show_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975102', 'MYK9-1975 Day Of', 'AKC',
            date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
            'draft', true, true, 30, 12.5, 15)
  $q$),
  'The junior fee can''t be more than $12.50, the lowest class fee in this show.');

select pg_temp.expect('insert: a zero day-of fee is no tier, never the limit',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              accept_check_payments, accept_cash_payments,
                              pre_entry_fee, day_of_show_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975103', 'MYK9-1975 Zero Day Of', 'AKC',
            date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
            'draft', true, true, 30, 0, 15)
  $q$),
  'accepted');

select pg_temp.expect('insert: a zero junior fee is no tier and is never checked',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              accept_check_payments, accept_cash_payments,
                              pre_entry_fee, day_of_show_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975104', 'MYK9-1975 No Tier', 'AKC',
            date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
            'draft', true, true, 0, NULL, 0)
  $q$),
  'accepted');

-- ---------------------------------------------------------------------------
-- 2. Show tiers on UPDATE, both directions (show 101: pre 30, day-of 35, junior 15).
-- ---------------------------------------------------------------------------
select pg_temp.expect('update: raising the junior fee above the pre-entry fee is refused',
  pg_temp.attempt($q$update public.shows set junior_handler_fee = 31
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'The junior fee can''t be more than $30, the lowest class fee in this show.');

select pg_temp.expect('update: a junior fee equal to the lowest fee is accepted',
  pg_temp.attempt($q$update public.shows set junior_handler_fee = 30
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'accepted');

select pg_temp.expect('reverse: lowering the pre-entry fee below the junior fee is refused',
  pg_temp.attempt($q$update public.shows set pre_entry_fee = 25
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'The junior fee can''t be more than $25, the lowest class fee in this show.');

select pg_temp.expect('reverse: lowering the day-of fee below the junior fee is refused',
  pg_temp.attempt($q$update public.shows set day_of_show_fee = 20
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'The junior fee can''t be more than $20, the lowest class fee in this show.');

select pg_temp.expect('reverse: lowering a tier and the junior fee together is accepted',
  pg_temp.attempt($q$update public.shows set pre_entry_fee = 25, junior_handler_fee = 20
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'accepted');

select pg_temp.expect('the stored row is the accepted one',
  (select pre_entry_fee::numeric(10,2)::text || '|' || day_of_show_fee::numeric(10,2)::text
          || '|' || junior_handler_fee::numeric(10,2)::text
     from public.shows where id = '00000000-0000-0000-0000-000001975101'),
  '25.00|35.00|20.00');

-- service_role bypasses RLS; the trigger still holds.
set local role service_role;
select pg_temp.expect('service_role cannot write a junior fee above the limit either',
  pg_temp.attempt($q$update public.shows set junior_handler_fee = 26
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'The junior fee can''t be more than $25, the lowest class fee in this show.');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Write-only: a row saved over the limit before the trigger existed.
-- ---------------------------------------------------------------------------
alter table public.shows disable trigger trg_shows_junior_fee_within_regular;
update public.shows set pre_entry_fee = 10 where id = '00000000-0000-0000-0000-000001975101';
alter table public.shows enable trigger trg_shows_junior_fee_within_regular;

select pg_temp.expect('legacy row: an unrelated edit still saves',
  pg_temp.attempt($q$update public.shows set name = 'MYK9-1975 Renamed'
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'accepted');

select pg_temp.expect('legacy row: a full-row write with the same fees still saves',
  pg_temp.attempt($q$update public.shows
                        set pre_entry_fee = 10, day_of_show_fee = 35, junior_handler_fee = 20
                      where id = '00000000-0000-0000-0000-000001975101'$q$),
  'accepted');

select pg_temp.expect('legacy row: changing a fee that is still below the junior fee is refused',
  pg_temp.attempt($q$update public.shows set pre_entry_fee = 12
                     where id = '00000000-0000-0000-0000-000001975101'$q$),
  'The junior fee can''t be more than $12, the lowest class fee in this show.');

-- ---------------------------------------------------------------------------
-- 4. Class fees: only when the show has no pre-entry fee.
--    Show 110: no pre-entry fee, no day-of fee, junior 15.
--    Show 111: pre-entry 30, junior 15 (class fees never priced).
-- ---------------------------------------------------------------------------
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
values
  ('00000000-0000-0000-0000-000001975110', 'MYK9-1975 Class Fees', 'AKC',
   date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
   'draft', true, true, NULL, NULL, 15),
  ('00000000-0000-0000-0000-000001975111', 'MYK9-1975 Show Fee', 'AKC',
   date '2026-12-12', date '2026-12-12', '00000000-0000-0000-0000-000001975010',
   'draft', true, true, 30, NULL, 15);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000001975210', '00000000-0000-0000-0000-000001975110',
   'MYK9-1975 Trial A', date '2026-12-12', 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000001975211', '00000000-0000-0000-0000-000001975111',
   'MYK9-1975 Trial B', date '2026-12-12', 'AKC', 'Scent Work');

select pg_temp.expect('class: a fee at or above the junior fee is accepted',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975310', '00000000-0000-0000-0000-000001975210',
            'MYK9-1975 Class 1', 'Container', 'Novice', 'upcoming', 'manual', 20)
  $q$),
  'accepted');

select pg_temp.expect('class: a new class below the junior fee is refused',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975311', '00000000-0000-0000-0000-000001975210',
            'MYK9-1975 Class 2', 'Container', 'Novice', 'upcoming', 'manual', 10)
  $q$),
  'The junior fee can''t be more than $10, the lowest class fee in this show.');

select pg_temp.expect('class: a class with no fee is priced at $0, so it is refused',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975312', '00000000-0000-0000-0000-000001975210',
            'MYK9-1975 Class 3', 'Container', 'Novice', 'upcoming', 'manual', NULL)
  $q$),
  'The junior fee can''t be more than $0, the lowest class fee in this show.');

select pg_temp.expect('class: lowering a class fee below the junior fee is refused',
  pg_temp.attempt($q$update public.classes set entry_fee = 12
                     where id = '00000000-0000-0000-0000-000001975310'$q$),
  'The junior fee can''t be more than $12, the lowest class fee in this show.');

select pg_temp.expect('class: a deleted class is never priced, so its fee is not checked',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source,
                                entry_fee, deleted_at)
    values ('00000000-0000-0000-0000-000001975313', '00000000-0000-0000-0000-000001975210',
            'MYK9-1975 Deleted Class', 'Container', 'Novice', 'upcoming', 'manual', 5, now())
  $q$),
  'accepted');

select pg_temp.expect('class: restoring a deleted class below the junior fee is refused',
  pg_temp.attempt($q$update public.classes set deleted_at = NULL
                     where id = '00000000-0000-0000-0000-000001975313'$q$),
  'The junior fee can''t be more than $5, the lowest class fee in this show.');

select pg_temp.expect('show: raising the junior fee above a class fee is refused',
  pg_temp.attempt($q$update public.shows set junior_handler_fee = 25
                     where id = '00000000-0000-0000-0000-000001975110'$q$),
  'The junior fee can''t be more than $20, the lowest class fee in this show.');

select pg_temp.expect('show: a junior fee at the class fee is accepted',
  pg_temp.attempt($q$update public.shows set junior_handler_fee = 20
                     where id = '00000000-0000-0000-0000-000001975110'$q$),
  'accepted');

select pg_temp.expect('class: with a pre-entry fee set, a low class fee is never priced',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975320', '00000000-0000-0000-0000-000001975211',
            'MYK9-1975 Class 4', 'Container', 'Novice', 'upcoming', 'manual', 5)
  $q$),
  'accepted');

-- ---------------------------------------------------------------------------
-- 5. No API role can execute the helpers.
-- ---------------------------------------------------------------------------
select pg_temp.expect('no API role can execute the helpers',
  (has_function_privilege('anon', 'private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid)', 'EXECUTE')
   or has_function_privilege('authenticated', 'private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid)', 'EXECUTE')
   or has_function_privilege('service_role', 'private.lowest_regular_entry_fee(uuid, numeric, numeric, uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'private.junior_fee_limit_message(numeric)', 'EXECUTE')
   or has_function_privilege('authenticated', 'private.junior_fee_limit_message(numeric)', 'EXECUTE')
   or has_function_privilege('authenticated', 'private.shows_junior_fee_within_regular()', 'EXECUTE')
   or has_function_privilege('authenticated', 'private.classes_fee_within_junior_fee()', 'EXECUTE')
  )::text,
  'false');

rollback;
