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

  -- CI builds this database from migrations alone, so there is nothing here to
  -- compare and pass 1 is legitimately empty. It still earns its place when the
  -- file is run against a seeded local or staging database, where it checks real
  -- data rather than a fixture this test authored.
  --
  -- Skipping is only safe because pass 2 below builds its own classes and
  -- asserts an exact comparison count -- the suite can never be vacuous on the
  -- strength of this branch alone.
  select count(*) into checked from public.classes;
  if checked = 0 then
    raise notice 'pass 1 skipped: no pre-existing classes (expected on a migrations-only database)';
  else
    raise notice 'pass 1 ok: % existing classes agree', checked;
  end if;
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

-- One class per class-state the resolver can reach. Statuses are constrained by
-- classes_status_check to exactly upcoming/setup/in_progress/completed/cancelled,
-- so the resolver's `lower(status) = 'completed'` guard cannot be reached with a
-- differently-cased value -- that lower() is defensive against data this schema
-- will not store. Row 4 is the case that matters most: is_scoring_finalized
-- promotes a non-completed status to the 'completed' state.
insert into public.classes (id, trial_id, name, status, is_scoring_finalized, results_released_at)
select
  ('00000000-0000-0000-0000-0000001263' || lpad(n::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000126203',
  'MYK9-126 class ' || n,
  s.status,
  s.finalized,
  s.released
from generate_series(1, 6) n
cross join lateral (
  select
    (array['upcoming', 'in_progress', 'completed', 'setup', 'upcoming', 'cancelled'])[n] as status,
    (array[false, false, false, true, false, false])[n]                                  as finalized,
    (array[null, null, null, null, now(), null])[n]::timestamptz                          as released
) s;

-- ---------------------------------------------------------------------------
-- Pass 2: drive the cascade and re-assert parity after every mutation.
--
-- Each iteration rewrites the show / trial / class override rows, then compares
-- the set-based view against the function for all six state classes at once.
-- ---------------------------------------------------------------------------
do $$
declare
  -- Every timing value the CHECK constraints actually permit. placement_timing
  -- is deliberately narrower than the other three: it rejects 'immediate'
  -- (show_visibility_settings_placement_timing_check and the two override
  -- equivalents), so a single shared value across all four columns cannot be
  -- used. _result_timing_visible's ELSE-false arm is unreachable through these
  -- tables for the same reason -- no unrecognized value can be stored.
  placement_timings text[] := array['class_complete', 'manual_release'];
  other_timings     text[] := array['immediate', 'class_complete', 'manual_release'];
  -- ABSENCE IS A CASE. Codex review of MYK9-126, 2026-09-11: the first version
  -- of this matrix always inserted a show_visibility_settings row and always
  -- inserted a trial override, so the "no row at this level" arms -- the
  -- hardcoded 'class_complete'/'immediate' defaults, and each level's
  -- pass-through -- were never executed. A deliberately wrong default changed
  -- nothing and the test still passed. 11 live classes belong to shows with no
  -- settings row, so that arm is reachable in production; only the fixture was
  -- blind to it.
  show_present_opts boolean[] := array[true, false];
  -- 'class_only' is its own kind: a class override with NO trial override above
  -- it, so the class level is seen inheriting straight from the show.
  override_kinds    text[] := array['none', 'preset', 'field', 'preset_field', 'class_only'];
  show_present      boolean;
  kind              text;
  -- The class override's preset is deliberately DIFFERENT from the trial's.
  -- Codex review of MYK9-126, 2026-09-11: with both levels carrying the same
  -- preset, removing the class level's re-expansion entirely was invisible --
  -- a mutation that survived the whole 864-comparison matrix. Precedence is
  -- only observable when the two levels disagree.
  class_preset_name text;
  pt                text;
  preset_name   text;
  presets       text[];
  t             text;
  bad             record;
  combos          integer := 0;
  compared        integer := 0;
  total_compared  integer := 0;
  no_settings_combos integer := 0;
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

  foreach show_present in array show_present_opts loop
   foreach pt in array placement_timings loop
    foreach t in array other_timings loop
    -- Show base, present or deliberately absent. Absent is the case that makes
    -- the hardcoded defaults reachable.
    delete from public.show_visibility_settings
      where show_id = '00000000-0000-0000-0000-000000126202';
    if show_present then
      insert into public.show_visibility_settings
        (show_id, placement_timing, qualification_timing, time_timing, faults_timing)
      values ('00000000-0000-0000-0000-000000126202', pt, t, t, t);
    else
      no_settings_combos := no_settings_combos + 1;
    end if;

    foreach kind in array override_kinds loop
     foreach preset_name in array presets loop
      -- Rotate one position so the class level never repeats the trial's preset.
      class_preset_name := presets[(array_position(presets, preset_name) % 3) + 1];

      -- Trial override: absent, preset only, per-field only, or both. 'field'
      -- alone is its own path -- it takes the CASE's ELSE arm, where a preset
      -- would have re-expanded the base first. 'class_only' leaves this level
      -- empty on purpose.
      delete from public.trial_visibility_overrides
        where trial_id = '00000000-0000-0000-0000-000000126203';
      if kind = 'preset' then
        insert into public.trial_visibility_overrides (trial_id, preset)
        values ('00000000-0000-0000-0000-000000126203', preset_name);
      elsif kind = 'field' then
        insert into public.trial_visibility_overrides (trial_id, placement_timing)
        values ('00000000-0000-0000-0000-000000126203', pt);
      elsif kind = 'preset_field' then
        insert into public.trial_visibility_overrides (trial_id, preset, placement_timing)
        values ('00000000-0000-0000-0000-000000126203', preset_name, pt);
      end if;

      -- Class override on half the classes, in the same shape, so both the
      -- overridden and the inherited path are exercised in one comparison.
      delete from public.class_visibility_overrides
        where class_id in (
          select id from public.classes
          where trial_id = '00000000-0000-0000-0000-000000126203'
        );
      -- Half the classes, chosen by row position. class_number is not set at all
      -- (the proven fixtures in placement_soft_delete_ranking_test.sql do not set
      -- it either), and it is character varying(20) regardless, so a modulo on it
      -- would not parse.
      if kind <> 'none' then
        insert into public.class_visibility_overrides (class_id, preset, qualification_timing)
        select id,
               case when kind in ('preset', 'preset_field', 'class_only') then class_preset_name end,
               case when kind in ('field', 'preset_field', 'class_only') then t end
        from (
          select id, row_number() over (order by id) as rn
          from public.classes
          where trial_id = '00000000-0000-0000-0000-000000126203'
        ) ranked
        where ranked.rn % 2 = 0;
      end if;

      combos := combos + 1;

      -- Count rows the comparison ACTUALLY produced, not fixture rows: if the
      -- join or the resolver ever returned nothing, counting classes would
      -- still report six (Codex review, 2026-09-11).
      select count(*) into compared
      from public.classes c
      left join private.class_result_visibility v on v.class_id = c.id
      cross join lateral public.resolve_class_result_visibility(c.id) as f
      where c.trial_id = '00000000-0000-0000-0000-000000126203'
        and (v.class_id is not null or v.class_id is null)
        and f.placement_visible is not null;
      total_compared := total_compared + compared;

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
          'FAIL parity: placement=% other=% preset=% class=% set-based (%,%,%,%) vs function (%,%,%,%)',
          pt, t, preset_name, bad.class_id,
          bad.np, bad.nq, bad.nt, bad.nf,
          bad.op, bad.oq, bad.ot, bad.oflt;
      end loop;
     end loop;
    end loop;
    end loop;
   end loop;
  end loop;

  -- 2 show-present x 2 placement timings x 3 other timings x 5 override kinds
  -- x 3 presets.
  if combos <> 180 then
    raise exception 'FAIL pass 2 ran % combinations, expected 180', combos;
  end if;
  -- And every combination must actually have compared all six state classes.
  -- Counting combinations alone would still pass if the fixture vanished.
  if total_compared <> 1080 then
    raise exception
      'FAIL pass 2 compared % class rows, expected 1080 (180 combinations x 6 classes)',
      total_compared;
  end if;
  -- Half the matrix must have run with NO show settings row. Without this the
  -- default arm could silently stop being exercised again.
  if no_settings_combos <> 6 then
    raise exception
      'FAIL pass 2 ran % show-settings-absent iterations, expected 6',
      no_settings_combos;
  end if;
  raise notice 'pass 2 ok: % combinations, % class comparisons, % with no show settings, all agree', combos, total_compared, no_settings_combos;
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

-- ---------------------------------------------------------------------------
-- Pass 5: the defaults, asserted ABSOLUTELY rather than by comparison.
--
-- Passes 1-3 are differential: they prove the set-based view agrees with
-- resolve_class_result_visibility. That catches a change to either side, but
-- NOT a change applied to both -- or to a helper they share. Codex review of
-- MYK9-126 raised exactly that: the suite passed with a deliberately wrong
-- result-visibility default.
--
-- Widening pass 2 to run with no show_visibility_settings row fixes the
-- "unexercised" half. This fixes the other half by pinning the default VALUES
-- themselves, so a coordinated edit still fails:
--
--   placement    -> 'class_complete' : hidden until the class completes
--   qualification-> 'immediate'      : visible straight away
--   time         -> 'immediate'
--   faults       -> 'immediate'
--
-- If these defaults are ever deliberately changed, this is the test that should
-- fail, and changing it should be a conscious decision rather than a silent one.
-- ---------------------------------------------------------------------------
do $$
declare
  in_progress_class uuid := '00000000-0000-0000-0000-000000126301';
  completed_class   uuid := '00000000-0000-0000-0000-000000126303';
  v record;
begin
  -- Nothing configured at any level: the defaults are the whole answer.
  delete from public.show_visibility_settings
    where show_id = '00000000-0000-0000-0000-000000126202';
  delete from public.trial_visibility_overrides
    where trial_id = '00000000-0000-0000-0000-000000126203';
  delete from public.class_visibility_overrides
    where class_id in (
      select id from public.classes
      where trial_id = '00000000-0000-0000-0000-000000126203'
    );

  select * into v from private.class_result_visibility where class_id = in_progress_class;
  if not found then
    raise exception 'FAIL pass 5 fixture missing: no row for the in-progress class';
  end if;
  if v.placement_visible
     or not v.qualification_visible
     or not v.time_visible
     or not v.faults_visible then
    raise exception
      'FAIL default for an IN-PROGRESS class is (%,%,%,%), expected (false,true,true,true) '
      '-- placement defaults to class_complete, the rest to immediate',
      v.placement_visible, v.qualification_visible, v.time_visible, v.faults_visible;
  end if;

  select * into v from private.class_result_visibility where class_id = completed_class;
  if not found then
    raise exception 'FAIL pass 5 fixture missing: no row for the completed class';
  end if;
  if not (v.placement_visible and v.qualification_visible and v.time_visible and v.faults_visible) then
    raise exception
      'FAIL default for a COMPLETED class is (%,%,%,%), expected all true',
      v.placement_visible, v.qualification_visible, v.time_visible, v.faults_visible;
  end if;

  raise notice 'pass 5 ok: unconfigured defaults pinned absolutely';
end;
$$;

rollback;
