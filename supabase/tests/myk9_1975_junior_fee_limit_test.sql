-- MYK9-1975: the junior handler fee can never be set above the lowest regular fee.
--
-- Behavioral test for 20261115062527_myk9_1975_junior_fee_not_above_regular_fee.sql, run only
-- in CI (scripts/qa/run-behavioral-sql-tests.sh).
--
--   A. a show insert or fee update that leaves the junior fee above the pre-entry fee, or above
--      a day-of fee > 0, is refused with 23514 and a sentence naming the limit; equal is allowed;
--      a junior fee of NULL or 0 (no tier) and a day-of fee of 0 are never limits
--   B. with no pre-entry fee, the live class fees are the limit (a soft-deleted class is not,
--      and a class with no fee counts as $0, which is what checkout charges for it):
--      a show write and a class write are both refused; with a pre-entry fee a class fee is not
--      priced, so it is not limited
--   C. an existing show already over the limit keeps working: a write that changes no fee, and
--      an INSERT ... ON CONFLICT DO NOTHING that re-uses its id, are not refused
--   D. no API role can execute the new functions; checkout pricing is unchanged (LEAST)
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

-- Runs p_sql and returns 'ok', or SQLSTATE|message when it raised.
create function pg_temp.attempt(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || '|' || sqlerrm;
end;
$$;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001975010', 'MYK9-1975 Club');

-- S1: pre-entry 15, day-of 25, junior 15 (at the limit).
-- S3: no pre-entry fee, junior 12; classes priced at their own fee.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
values
  ('00000000-0000-0000-0000-000001975101', 'MYK9-1975 Show 1', 'AKC', current_date + 30,
   current_date + 30, '00000000-0000-0000-0000-000001975010', 'draft', 15, 25, 15),
  ('00000000-0000-0000-0000-000001975103', 'MYK9-1975 Show 3', 'AKC', current_date + 30,
   current_date + 30, '00000000-0000-0000-0000-000001975010', 'draft', NULL, NULL, 12);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000001975201', '00000000-0000-0000-0000-000001975101',
   'MYK9-1975 Trial 1', current_date + 30, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000001975203', '00000000-0000-0000-0000-000001975103',
   'MYK9-1975 Trial 3', current_date + 30, 'AKC', 'Scent Work');

insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values
  ('00000000-0000-0000-0000-000001975301', '00000000-0000-0000-0000-000001975201',
   'MYK9-1975 Class 1', 'Container', 'Novice', 'upcoming', 'manual', 15),
  ('00000000-0000-0000-0000-000001975331', '00000000-0000-0000-0000-000001975203',
   'MYK9-1975 Class 3a', 'Container', 'Novice', 'upcoming', 'manual', 20),
  ('00000000-0000-0000-0000-000001975332', '00000000-0000-0000-0000-000001975203',
   'MYK9-1975 Class 3b', 'Interior', 'Novice', 'upcoming', 'manual', 12.5);

-- ---------------------------------------------------------------------------
-- A. Show-level tiers.
-- ---------------------------------------------------------------------------
select pg_temp.expect('a new show with a junior fee above its pre-entry fee is refused',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              pre_entry_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975102', 'MYK9-1975 Show 2', 'AKC', current_date + 30,
            current_date + 30, '00000000-0000-0000-0000-000001975010', 'draft', 15, 20)
  $q$),
  '23514|The junior fee can''t be more than $15, the lowest class fee in this show.');

select pg_temp.expect('raising the junior fee above the pre-entry fee is refused',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 16
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  '23514|The junior fee can''t be more than $15, the lowest class fee in this show.');

select pg_temp.expect('lowering the pre-entry fee below the junior fee is refused',
  pg_temp.attempt($q$
    update public.shows set pre_entry_fee = 10.5
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  '23514|The junior fee can''t be more than $10.50, the lowest class fee in this show.');

select pg_temp.expect('a day-of fee below the junior fee is refused',
  pg_temp.attempt($q$
    update public.shows set day_of_show_fee = 12
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  '23514|The junior fee can''t be more than $12, the lowest class fee in this show.');

select pg_temp.expect('a day-of fee of 0 is no tier and no limit',
  pg_temp.attempt($q$
    update public.shows set day_of_show_fee = 0
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  'ok');

select pg_temp.expect('a junior fee equal to the lowest fee is allowed',
  pg_temp.attempt($q$
    update public.shows set pre_entry_fee = 20, junior_handler_fee = 20
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  'ok');

select pg_temp.expect('lowering the pre-entry and junior fees in one write is allowed',
  pg_temp.attempt($q$
    update public.shows set pre_entry_fee = 9, junior_handler_fee = 8
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  'ok');

select pg_temp.expect('a junior fee of 0 is no tier: the pre-entry fee may go lower',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 0, pre_entry_fee = 1
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  'ok');

select pg_temp.expect('a NULL junior fee is no tier',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = NULL, pre_entry_fee = 0
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  'ok');

select pg_temp.expect('a pre-entry fee of 0 is charged as 0, so any junior fee is above it',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 5
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  '23514|The junior fee can''t be more than $0, the lowest class fee in this show.');

-- Back to pre-entry 15, junior 15 for B.
update public.shows set pre_entry_fee = 15, day_of_show_fee = 25, junior_handler_fee = 15
 where id = '00000000-0000-0000-0000-000001975101';

-- ---------------------------------------------------------------------------
-- B. Class fees, reached only when the show has no pre-entry fee.
-- ---------------------------------------------------------------------------
select pg_temp.expect('with no pre-entry fee, a junior fee above the lowest class fee is refused',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 13
     where id = '00000000-0000-0000-0000-000001975103'
  $q$),
  '23514|The junior fee can''t be more than $12.50, the lowest class fee in this show.');

select pg_temp.expect('with no pre-entry fee, lowering a class fee below the junior fee is refused',
  pg_temp.attempt($q$
    update public.classes set entry_fee = 11
     where id = '00000000-0000-0000-0000-000001975331'
  $q$),
  '23514|A class fee can''t be less than the junior fee of $12. Lower the junior fee first.');

select pg_temp.expect('with no pre-entry fee, a new class below the junior fee is refused',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975333', '00000000-0000-0000-0000-000001975203',
            'MYK9-1975 Class 3c', 'Exterior', 'Novice', 'upcoming', 'manual', 10)
  $q$),
  '23514|A class fee can''t be less than the junior fee of $12. Lower the junior fee first.');

select pg_temp.expect('a class fee equal to the junior fee is allowed',
  pg_temp.attempt($q$
    update public.classes set entry_fee = 12
     where id = '00000000-0000-0000-0000-000001975331'
  $q$),
  'ok');

-- A class with no fee is charged $0 at checkout (price_entry_fee's COALESCE), so with no
-- pre-entry fee it counts as a fee of 0.
select pg_temp.expect('with no pre-entry fee, a new class with no fee is refused',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975334', '00000000-0000-0000-0000-000001975203',
            'MYK9-1975 Class 3d', 'Buried', 'Novice', 'upcoming', 'manual', NULL)
  $q$),
  '23514|A class fee can''t be less than the junior fee of $12. Lower the junior fee first.');

select pg_temp.expect('with no pre-entry fee, clearing a class fee is refused',
  pg_temp.attempt($q$
    update public.classes set entry_fee = NULL
     where id = '00000000-0000-0000-0000-000001975332'
  $q$),
  '23514|A class fee can''t be less than the junior fee of $12. Lower the junior fee first.');

select pg_temp.expect('with a pre-entry fee, a class with no fee is not priced and not limited',
  pg_temp.attempt($q$
    insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
    values ('00000000-0000-0000-0000-000001975302', '00000000-0000-0000-0000-000001975201',
            'MYK9-1975 Class 1b', 'Buried', 'Novice', 'upcoming', 'manual', NULL)
  $q$),
  'ok');
delete from public.classes where id = '00000000-0000-0000-0000-000001975302';

-- A legacy class with no fee (written before the limit) makes the show's limit $0.
alter table public.classes disable trigger trg_classes_junior_fee_limit;
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values ('00000000-0000-0000-0000-000001975335', '00000000-0000-0000-0000-000001975203',
        'MYK9-1975 Class 3e', 'Handler Discrimination', 'Novice', 'upcoming', 'manual', NULL);
alter table public.classes enable trigger trg_classes_junior_fee_limit;
select pg_temp.expect('with no pre-entry fee, a live class with no fee makes the limit $0',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 11
     where id = '00000000-0000-0000-0000-000001975103'
  $q$),
  '23514|The junior fee can''t be more than $0, the lowest class fee in this show.');
update public.classes set deleted_at = now()
 where id = '00000000-0000-0000-0000-000001975335';


select pg_temp.expect('with a pre-entry fee, a class fee is not priced and not limited',
  pg_temp.attempt($q$
    update public.classes set entry_fee = 14
     where id = '00000000-0000-0000-0000-000001975301'
  $q$),
  'ok');

select pg_temp.expect('removing the pre-entry fee makes the class fees the limit',
  pg_temp.attempt($q$
    update public.shows set pre_entry_fee = NULL, day_of_show_fee = NULL
     where id = '00000000-0000-0000-0000-000001975101'
  $q$),
  '23514|The junior fee can''t be more than $14, the lowest class fee in this show.');

-- A soft-deleted class is never entered, so its fee is not a limit. Class 3a ($12) goes;
-- class 3b ($12.50) is the lowest live fee.
update public.classes set deleted_at = now()
 where id = '00000000-0000-0000-0000-000001975331';
select pg_temp.expect('a soft-deleted class fee is not a limit',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 12.5
     where id = '00000000-0000-0000-0000-000001975103'
  $q$),
  'ok');
select pg_temp.expect('the remaining live class fee still is',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 12.51
     where id = '00000000-0000-0000-0000-000001975103'
  $q$),
  '23514|The junior fee can''t be more than $12.50, the lowest class fee in this show.');

-- ---------------------------------------------------------------------------
-- C. A show already over the limit (written before this migration) keeps working.
-- ---------------------------------------------------------------------------
alter table public.shows disable trigger trg_shows_junior_fee_limit;
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          pre_entry_fee, junior_handler_fee)
values ('00000000-0000-0000-0000-000001975104', 'MYK9-1975 Legacy Show', 'AKC', current_date + 30,
        current_date + 30, '00000000-0000-0000-0000-000001975010', 'draft', 10, 20);
alter table public.shows enable trigger trg_shows_junior_fee_limit;

select pg_temp.expect('a legacy show over the limit can still be renamed',
  pg_temp.attempt($q$
    update public.shows set name = 'MYK9-1975 Legacy Show Renamed'
     where id = '00000000-0000-0000-0000-000001975104'
  $q$),
  'ok');

select pg_temp.expect('a full-row write that changes no fee is not refused',
  pg_temp.attempt($q$
    update public.shows
       set pre_entry_fee = pre_entry_fee, day_of_show_fee = day_of_show_fee,
           junior_handler_fee = junior_handler_fee
     where id = '00000000-0000-0000-0000-000001975104'
  $q$),
  'ok');

select pg_temp.expect('an ON CONFLICT DO NOTHING insert re-using its id is not refused',
  pg_temp.attempt($q$
    insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                              pre_entry_fee, junior_handler_fee)
    values ('00000000-0000-0000-0000-000001975104', 'MYK9-1975 Retry', 'AKC', current_date + 30,
            current_date + 30, '00000000-0000-0000-0000-000001975010', 'draft', 10, 20)
    on conflict (id) do nothing
  $q$),
  'ok');

select pg_temp.expect('changing a fee on the legacy show is checked',
  pg_temp.attempt($q$
    update public.shows set junior_handler_fee = 19
     where id = '00000000-0000-0000-0000-000001975104'
  $q$),
  '23514|The junior fee can''t be more than $10, the lowest class fee in this show.');

-- ---------------------------------------------------------------------------
-- D. Grants, and checkout pricing unchanged.
-- ---------------------------------------------------------------------------
select pg_temp.expect('no API role can execute the MYK9-1975 functions',
  (select count(*)::text
     from unnest(array[
            'private.show_lowest_regular_fee(uuid, numeric, numeric)',
            'private.format_fee_dollars(numeric)',
            'private.shows_junior_fee_limit()',
            'private.classes_junior_fee_limit()'
          ]) as fn,
          unnest(array['anon', 'authenticated', 'service_role']) as r
    where has_function_privilege(r, fn, 'EXECUTE')),
  '0');

-- The legacy show (pre-entry 10, junior 20) still prices a junior entry at LEAST: 10.
-- price_entry_fee checks is_show_secretary for an override, so price without one and
-- assert the normal fee, then confirm the function body still takes LEAST.
insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values ('00000000-0000-0000-0000-000001975204', '00000000-0000-0000-0000-000001975104',
        'MYK9-1975 Trial 4', current_date + 30, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
values ('00000000-0000-0000-0000-000001975341', '00000000-0000-0000-0000-000001975204',
        'MYK9-1975 Class 4', 'Container', 'Novice', 'upcoming', 'manual', 10);
select pg_temp.expect('checkout still prices the legacy show at its regular fee',
  (select fee::numeric(10,2)::text
     from private.price_entry_fee('00000000-0000-0000-0000-000001975104',
                                  '00000000-0000-0000-0000-000001975341', false, false)),
  '10.00');
select pg_temp.expect('price_entry_fee still caps the junior fee with LEAST',
  (select (pg_get_functiondef('private.price_entry_fee(uuid, uuid, boolean, boolean)'::regprocedure)
           like '%LEAST(v_junior_fee, v_normal)%')::text),
  'true');

rollback;
