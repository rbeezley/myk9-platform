-- MYK9-494: a judge_assignments write must UPDATE public.classes, or the INCREMENTAL classes
-- replication never re-fetches the class and an already-synced device keeps the old judge on
-- the run schedule until the next full resync.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- WHY THIS ASSERTS ON `version` AND NOT ON `updated_at`
-- `updated_at` is unobservable from inside a test, twice over:
--   * `update_classes_updated_at` (BEFORE UPDATE, `update_updated_at_column`) overwrites
--     NEW.updated_at with NOW() on EVERY update, so a fixture cannot backdate a row to create a
--     contrast — the backdating UPDATE itself stamps the row as fresh;
--   * NOW() is the TRANSACTION timestamp, and every fixture here lives in one transaction, so
--     every row written or touched in it carries the identical value.
-- `classes_version_increment` (BEFORE UPDATE, `increment_replication_version`) does
-- `NEW.version = OLD.version + 1`, so a version bump is exactly "this class row was UPDATEd" —
-- the same event that moves updated_at, observable inside the transaction. The wiring assertion
-- below pins both triggers so this proxy cannot quietly stop meaning what it means.
begin;

-- The proxy is only valid while these two triggers are what they are.
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'classes' and not t.tgisinternal
    and p.proname in ('update_updated_at_column', 'increment_replication_version');
  if n <> 2 then
    raise exception 'FAIL wiring: expected classes to carry both the updated_at and version BEFORE UPDATE triggers, found %', n;
  end if;
  raise notice 'PASS wiring: version bump tracks the same UPDATE that moves updated_at';
end;
$$;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000494001', 'MYK9-494 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000494002', 'MYK9-494 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000494001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000494003', '00000000-0000-0000-0000-000000494002',
  'MYK9-494 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000494004', '00000000-0000-0000-0000-000000494003',
  'Interior Advanced', 'upcoming'),
  ('00000000-0000-0000-0000-000000494005', '00000000-0000-0000-0000-000000494003',
  'Container Novice A', 'upcoming');
insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000494011', 'MYK9-494', 'Judge One'),
  ('00000000-0000-0000-0000-000000494012', 'MYK9-494', 'Judge Two');

create temp table judge_touch_probe (class_id uuid primary key, version integer not null);

-- Re-arms the contrast before each case: whatever happens NEXT is what is being measured.
-- plpgsql, not sql: a plpgsql body is parsed at call time, so the temp table reference cannot
-- be resolved (or cached) at CREATE FUNCTION time.
create function pg_temp.arm() returns void language plpgsql as $$
begin
  delete from judge_touch_probe;
  insert into judge_touch_probe (class_id, version)
  select id, version from public.classes
  where id in ('00000000-0000-0000-0000-000000494004', '00000000-0000-0000-0000-000000494005');
end;
$$;

create function pg_temp.assert_touched(
  label text, target_class_id uuid, expect_touched boolean
) returns void language plpgsql as $$
declare
  touched boolean;
begin
  select c.version > p.version
  into touched
  from public.classes c
  join judge_touch_probe p on p.class_id = c.id
  where c.id = target_class_id;

  if touched is null then
    raise exception 'FAIL %: class % was not armed', label, target_class_id;
  end if;
  if touched is distinct from expect_touched then
    raise exception 'FAIL %: expected touched=% for class %, got %',
      label, expect_touched, target_class_id, touched;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- 0. Positive/negative control for the probe itself: a direct UPDATE of one class must read as
-- touched and its sibling as untouched. Without this, every "not touched" below could be a
-- probe that simply cannot see anything.
select pg_temp.arm();
update public.classes set name = name where id = '00000000-0000-0000-0000-000000494004';
select pg_temp.assert_touched('control: a direct update reads as touched',
  '00000000-0000-0000-0000-000000494004', true);
select pg_temp.assert_touched('control: an untouched sibling reads as untouched',
  '00000000-0000-0000-0000-000000494005', false);

-- 1. INSERT of a class-level assignment touches its class and nothing else.
select pg_temp.arm();
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
values ('00000000-0000-0000-0000-000000494021', '00000000-0000-0000-0000-000000494011',
  '00000000-0000-0000-0000-000000494002', '00000000-0000-0000-0000-000000494003',
  '00000000-0000-0000-0000-000000494004', 'invited');
select pg_temp.assert_touched('insert touches the assigned class',
  '00000000-0000-0000-0000-000000494004', true);
select pg_temp.assert_touched('insert leaves other classes alone',
  '00000000-0000-0000-0000-000000494005', false);

-- 2. A status change (invited -> confirmed) is what actually puts the name on the schedule.
select pg_temp.arm();
update public.judge_assignments set status = 'confirmed'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('confirming an invitation touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 3. A decline must reach the board too — this is the case with no app-side touch at all.
select pg_temp.arm();
update public.judge_assignments set status = 'declined'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('declining touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 4. A swap to another judge touches the class.
select pg_temp.arm();
update public.judge_assignments
set person_id = '00000000-0000-0000-0000-000000494012', status = 'confirmed'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('swapping the judge touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 5. MOVING the assignment to another class touches BOTH classes.
select pg_temp.arm();
update public.judge_assignments set class_id = '00000000-0000-0000-0000-000000494005'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('moving touches the class it left',
  '00000000-0000-0000-0000-000000494004', true);
select pg_temp.assert_touched('moving touches the class it joined',
  '00000000-0000-0000-0000-000000494005', true);

-- 6. A column that does not change WHO is judging must not churn every synced device.
select pg_temp.arm();
update public.judge_assignments set notes = 'bring extra hides'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('an unrelated column does not touch the class',
  '00000000-0000-0000-0000-000000494005', false);

-- 7. DELETE touches the class the assignment is leaving behind.
select pg_temp.arm();
delete from public.judge_assignments where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('delete touches the class',
  '00000000-0000-0000-0000-000000494005', true);

-- 8. A SHOW-level assignment (class_id IS NULL) belongs to no class and touches nothing.
select pg_temp.arm();
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
values ('00000000-0000-0000-0000-000000494022', '00000000-0000-0000-0000-000000494011',
  '00000000-0000-0000-0000-000000494002', null, null, 'confirmed');
select pg_temp.assert_touched('show-level assignment touches no class (a)',
  '00000000-0000-0000-0000-000000494004', false);
select pg_temp.assert_touched('show-level assignment touches no class (b)',
  '00000000-0000-0000-0000-000000494005', false);

rollback;
