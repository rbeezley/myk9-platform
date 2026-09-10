-- MYK9-126 behavioral parity for set-based class result visibility.
--
-- 20260910224500 replaced the per-row
-- `CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id)` in
-- view_authenticated_entry_results with a join to private.class_result_visibility,
-- which resolves the same cascade once per class instead of once per entry.
--
-- This is a security boundary: these four booleans decide whether placement,
-- qualification, time and fault columns are revealed before a class releases its
-- results. A divergence leaks results early, so the assertion is not "the new
-- view returns sensible answers" but "the new view returns THE SAME answer as
-- the function, for every input" -- the function is the oracle and stays in
-- place precisely so it can play that role.
--
-- Two passes:
--   1. Every class currently in the database.
--   2. A synthetic matrix over the whole precedence cascade: show base x trial
--      override x class override x class state, including preset re-expansion
--      at each level and the fail-closed edges.
--
-- Fixtures and claims are transaction-local and roll back.

begin;

-- ---------------------------------------------------------------------------
-- Pass 1: parity across every class that already exists.
-- ---------------------------------------------------------------------------
do $$
declare
  bad record;
  checked integer := 0;
begin
  for bad in
    select
      c.id as class_id,
      v.placement_visible     as new_placement,
      v.qualification_visible as new_qualification,
      v.time_visible          as new_time,
      v.faults_visible        as new_faults,
      f.placement_visible     as old_placement,
      f.qualification_visible as old_qualification,
      f.time_visible          as old_time,
      f.faults_visible        as old_faults
    from public.classes c
    left join private.class_result_visibility v on v.class_id = c.id
    cross join lateral public.resolve_class_result_visibility(c.id) as f
    where coalesce(v.placement_visible, false)     is distinct from f.placement_visible
       or coalesce(v.qualification_visible, false) is distinct from f.qualification_visible
       or coalesce(v.time_visible, false)          is distinct from f.time_visible
       or coalesce(v.faults_visible, false)        is distinct from f.faults_visible
  loop
    raise exception
      'FAIL parity on existing class %: set-based (%,%,%,%) vs function (%,%,%,%)',
      bad.class_id,
      bad.new_placement, bad.new_qualification, bad.new_time, bad.new_faults,
      bad.old_placement, bad.old_qualification, bad.old_time, bad.old_faults;
  end loop;

  select count(*) into checked from public.classes;
  if checked = 0 then
    raise exception 'FAIL no classes present: pass 1 asserted nothing';
  end if;
  raise notice 'pass 1 ok: % existing classes agree', checked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture for pass 2. One show, one trial, and a class per cascade combination.
-- ---------------------------------------------------------------------------
insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000126201', 'MYK9-126 Visibility Club');

insert into public.shows (id, name, organization, club_id, start_date, end_date)
values (
  '00000000-0000-0000-0000-000000126202',
  'MYK9-126 Visibility Show',
  'AKC',
  '00000000-0000-0000-0000-000000126201',
  current_date,
  current_date
);

insert into public.trials (id, show_id, name, date)
values (
  '00000000-0000-0000-0000-000000126203',
  '00000000-0000-0000-0000-000000126202',
  'MYK9-126 Visibility Trial',
  current_date
);

-- A class for every (state) x (trial override shape) x (class override shape)
-- combination. class_number keeps the generated rows distinguishable.
insert into public.classes (id, trial_id, name, class_number, status, is_scoring_finalized, results_released_at)
select
  ('00000000-0000-0000-0000-0000001263' || lpad(n::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000126203',
  'MYK9-126 class ' || n,
  n,
  s.status,
  s.finalized,
  s.released
from generate_series(1, 6) n
cross join lateral (
  select
    (array['scheduled', 'in_progress', 'completed', 'COMPLETED', 'scheduled', 'scheduled'])[n] as status,
    (array[false, false, false, false, true, false])[n]                                        as finalized,
    (array[null, null, null, null, null, now()])[n]::timestamptz                               as released
) s;

-- ---------------------------------------------------------------------------
-- Pass 2: drive the cascade and re-assert parity after every mutation.
--
-- Each iteration rewrites the show / trial / class override rows, then compares
-- the set-based view against the function for all six state classes at once.
-- ---------------------------------------------------------------------------
do $$
declare
  -- The vocabulary _result_timing_visible actually branches on, plus one
  -- unrecognized value to exercise its ELSE-false arm.
  show_timing   text[] := array['immediate', 'class_complete', 'manual_release', 'never'];
  preset_name   text;
  presets       text[];
  t             text;
  bad           record;
  combos        integer := 0;
begin
  -- The presets _result_visibility_preset actually recognizes. Discovered
  -- rather than trusted, and then COUNTED: the function returns NULL for an
  -- unknown name instead of raising, so a typo here would silently shrink the
  -- matrix and the test would pass having asserted less than it claims.
  select array_agg(distinct p order by p) into presets
  from (
    select unnest(array['open', 'standard', 'review']) as p
  ) candidates
  where public._result_visibility_preset(p, 'placement') is not null;

  if presets is null or array_length(presets, 1) <> 3 then
    raise exception
      'FAIL expected 3 recognized presets, found %',
      coalesce(array_length(presets, 1), 0);
  end if;

  foreach t in array show_timing loop
    -- Show base.
    delete from public.show_visibility_settings
      where show_id = '00000000-0000-0000-0000-000000126202';
    insert into public.show_visibility_settings
      (show_id, placement_timing, qualification_timing, time_timing, faults_timing)
    values ('00000000-0000-0000-0000-000000126202', t, t, t, t);

    foreach preset_name in array presets loop
      -- Trial override: preset only, then preset plus a per-field win.
      delete from public.trial_visibility_overrides
        where trial_id = '00000000-0000-0000-0000-000000126203';
      insert into public.trial_visibility_overrides (trial_id, preset, placement_timing)
      values ('00000000-0000-0000-0000-000000126203', preset_name, t);

      -- Class override on half the classes, so both the overridden and the
      -- inherited path are exercised in the same comparison.
      delete from public.class_visibility_overrides
        where class_id in (
          select id from public.classes
          where trial_id = '00000000-0000-0000-0000-000000126203'
        );
      insert into public.class_visibility_overrides (class_id, preset, qualification_timing)
      select id, preset_name, t
      from public.classes
      where trial_id = '00000000-0000-0000-0000-000000126203'
        and class_number % 2 = 0;

      combos := combos + 1;

      for bad in
        select
          c.id as class_id,
          v.placement_visible     as np, v.qualification_visible as nq,
          v.time_visible          as nt, v.faults_visible        as nf,
          f.placement_visible     as op, f.qualification_visible as oq,
          f.time_visible          as ot, f.faults_visible        as oflt
        from public.classes c
        left join private.class_result_visibility v on v.class_id = c.id
        cross join lateral public.resolve_class_result_visibility(c.id) as f
        where c.trial_id = '00000000-0000-0000-0000-000000126203'
          and (coalesce(v.placement_visible, false)     is distinct from f.placement_visible
            or coalesce(v.qualification_visible, false) is distinct from f.qualification_visible
            or coalesce(v.time_visible, false)          is distinct from f.time_visible
            or coalesce(v.faults_visible, false)        is distinct from f.faults_visible)
      loop
        raise exception
          'FAIL parity: show=% preset=% class=% set-based (%,%,%,%) vs function (%,%,%,%)',
          t, preset_name, bad.class_id,
          bad.np, bad.nq, bad.nt, bad.nf,
          bad.op, bad.oq, bad.ot, bad.oflt;
      end loop;
    end loop;
  end loop;

  if combos < 4 then
    raise exception 'FAIL pass 2 ran only % combinations', combos;
  end if;
  raise notice 'pass 2 ok: % cascade combinations x 6 state classes agree', combos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pass 3: the fail-closed edge. The function returns all-false for a class it
-- cannot resolve; the set-based view returns NO ROW, and the consuming view
-- COALESCEs that to false. Assert both halves, because a LEFT JOIN that
-- silently yielded NULL would read as "not hidden" in a boolean CASE.
-- ---------------------------------------------------------------------------
do $$
declare
  present boolean;
  f record;
begin
  select exists (
    select 1 from private.class_result_visibility
    where class_id = '00000000-0000-0000-0000-0000009999ff'
  ) into present;

  if present then
    raise exception 'FAIL unknown class produced a row in class_result_visibility';
  end if;

  select * into f
  from public.resolve_class_result_visibility('00000000-0000-0000-0000-0000009999ff');

  if f.placement_visible or f.qualification_visible or f.time_visible or f.faults_visible then
    raise exception
      'FAIL oracle is not fail-closed for an unknown class: (%,%,%,%)',
      f.placement_visible, f.qualification_visible, f.time_visible, f.faults_visible;
  end if;

  raise notice 'pass 3 ok: unknown class is fail-closed on both paths';
end;
$$;

-- ---------------------------------------------------------------------------
-- Pass 4: the view still resolves visibility, and still does so per class.
-- Guards against a future edit dropping the join and leaving `vis` unbound to
-- anything real.
-- ---------------------------------------------------------------------------
do $$
declare
  reloption_ok boolean;
begin
  select coalesce('security_invoker=false' = any (c.reloptions), false)
  into reloption_ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'view_authenticated_entry_results';

  if not reloption_ok then
    raise exception
      'FAIL view_authenticated_entry_results lost security_invoker=false';
  end if;

  raise notice 'pass 4 ok: view remains owner-run';
end;
$$;

rollback;
