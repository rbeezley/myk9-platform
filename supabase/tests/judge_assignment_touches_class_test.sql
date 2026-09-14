-- MYK9-494: a judge_assignments write must move public.classes.updated_at, or the INCREMENTAL
-- classes replication never re-fetches the class and an already-synced device keeps the old
-- judge on the run schedule until the next full resync.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
begin;

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

-- Backdate both classes so any touch is unmistakable.
update public.classes set updated_at = now() - interval '2 days'
where id in ('00000000-0000-0000-0000-000000494004', '00000000-0000-0000-0000-000000494005');

create function pg_temp.assert_touched(
  label text, class_id uuid, expect_touched boolean
) returns void language plpgsql as $$
declare
  touched boolean;
begin
  select c.updated_at > now() - interval '1 minute'
  into touched
  from public.classes c
  where c.id = class_id;

  if touched is distinct from expect_touched then
    raise exception 'FAIL %: expected touched=% for class %, got %',
      label, expect_touched, class_id, touched;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function pg_temp.backdate() returns void language sql as $$
  update public.classes set updated_at = now() - interval '2 days'
  where id in ('00000000-0000-0000-0000-000000494004', '00000000-0000-0000-0000-000000494005');
$$;

-- 1. INSERT of a class-level assignment touches its class and nothing else.
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
values ('00000000-0000-0000-0000-000000494021', '00000000-0000-0000-0000-000000494011',
  '00000000-0000-0000-0000-000000494002', '00000000-0000-0000-0000-000000494003',
  '00000000-0000-0000-0000-000000494004', 'invited');
select pg_temp.assert_touched('insert touches the assigned class',
  '00000000-0000-0000-0000-000000494004', true);
select pg_temp.assert_touched('insert leaves other classes alone',
  '00000000-0000-0000-0000-000000494005', false);

-- 2. A status change (invited -> confirmed) is what actually puts the name on the schedule.
select pg_temp.backdate();
update public.judge_assignments set status = 'confirmed'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('confirming an invitation touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 3. A decline must reach the board too — this is the case with no app-side touch at all.
select pg_temp.backdate();
update public.judge_assignments set status = 'declined'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('declining touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 4. A swap to another judge touches the class.
select pg_temp.backdate();
update public.judge_assignments
set person_id = '00000000-0000-0000-0000-000000494012', status = 'confirmed'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('swapping the judge touches the class',
  '00000000-0000-0000-0000-000000494004', true);

-- 5. MOVING the assignment to another class touches BOTH classes.
select pg_temp.backdate();
update public.judge_assignments set class_id = '00000000-0000-0000-0000-000000494005'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('moving touches the class it left',
  '00000000-0000-0000-0000-000000494004', true);
select pg_temp.assert_touched('moving touches the class it joined',
  '00000000-0000-0000-0000-000000494005', true);

-- 6. A column that does not change WHO is judging must not churn every synced device.
select pg_temp.backdate();
update public.judge_assignments set notes = 'bring extra hides'
where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('an unrelated column does not touch the class',
  '00000000-0000-0000-0000-000000494005', false);

-- 7. DELETE touches the class the assignment is leaving behind.
select pg_temp.backdate();
delete from public.judge_assignments where id = '00000000-0000-0000-0000-000000494021';
select pg_temp.assert_touched('delete touches the class',
  '00000000-0000-0000-0000-000000494005', true);

-- 8. A SHOW-level assignment (class_id IS NULL) belongs to no class and touches nothing.
select pg_temp.backdate();
insert into public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
values ('00000000-0000-0000-0000-000000494022', '00000000-0000-0000-0000-000000494011',
  '00000000-0000-0000-0000-000000494002', null, null, 'confirmed');
select pg_temp.assert_touched('show-level assignment touches no class (a)',
  '00000000-0000-0000-0000-000000494004', false);
select pg_temp.assert_touched('show-level assignment touches no class (b)',
  '00000000-0000-0000-0000-000000494005', false);

rollback;
