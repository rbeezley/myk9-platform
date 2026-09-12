-- MYK9-479: retire classes.judge_name.
--
-- The column was a free-text snapshot of "the judge picked for this class" with
-- NO trigger keeping it in step with judge_assignments (classes carries only
-- broadcast_showday_change, classes_version_increment,
-- trg_notify_class_status_push and update_classes_updated_at). Measured on the
-- applied database on 2026-09-12 it agreed with the assignment graph on 5 of 31
-- classes: 17 carried a name with no assignment (every one the seed's 'Test
-- Judge'), 8 carried an assignment with no name.
--
-- The 2026-03-18 "simplify judge data flow" design kept it as "the per-class
-- assignment" — but judge_assignments.class_id has held that role since the
-- class-level assignment work (20260618120000), and every reader already
-- prefers the assignment: emergency_packet_input, mapDatabaseToClass,
-- rowToClass, resolveClassJudgeName all COALESCE the assignment first and fall
-- through to the column only when it is absent. MYK9-474 deliberately refused
-- to publish it to the TV board for the same reason. One source of truth:
-- judge_assignments → people. Pre-launch, so no compatibility shim.
--
-- Order matters. Two views (view_myk9q_entries, view_stats_summary) and one
-- SECURITY DEFINER function (emergency_packet_input) read c.judge_name; the
-- views hold pg_rewrite dependencies on the column, so they are rebuilt first,
-- keeping a `judge_name` output column (same name, type and position, so
-- CREATE OR REPLACE succeeds and view_judge_stats' GROUP BY stays valid) that
-- is now derived from the confirmed assignment, once per class via LATERAL.
--
-- NOT a pure refactor for every caller. Both views are security_invoker, and
-- people_select admits only the caller's own row and show managers
-- (20260611120000), so for an exhibitor the derived judge_name is NULL where
-- the old column held a value. That is accepted: the three views have no
-- reader in apps/, packages/ or supabase/functions/ (only generated type stubs
-- and tests), and every live judge-name surface routes through the
-- get_show_judges SECURITY DEFINER RPC (20260912211500) instead — see
-- services/database/_shared/judgeNamesByClass.ts. If a view ever regains a
-- non-manager reader, give it the same RPC treatment; do not widen
-- people_select for it.

-- ---------------------------------------------------------------------------
-- 1. view_myk9q_entries — latest prior definition 20260817170000, with
--    security_invoker restored by 20260817190000. Carries the WITH clause
--    inline: CREATE OR REPLACE VIEW resets reloptions (LESSONS
--    replace-view-reloptions).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_myk9q_entries
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.armband::INTEGER as armband,
  e.handler as handler,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.entry_status,
  e.run_order as run_order,
  e.created_at,
  e.updated_at,
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.no_finish_count,
  e.points_earned,
  e.scoring_completed_at,
  c.id AS class_id,
  c.element,
  c.level,
  ja.judge_name,
  c.section,
  c.status AS class_status,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.num_areas AS area_count,
  c.is_scoring_finalized,
  c.results_released_at,
  t.id AS trial_id,
  t.trial_number,
  t.date AS trial_date,
  s.id AS show_id,
  s.license_key,
  s.name AS show_name
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN LATERAL (
  SELECT btrim(concat_ws(' ', p.first_name, p.last_name)) AS judge_name
  FROM public.judge_assignments a
  JOIN public.people p ON p.id = a.person_id AND p.deleted_at IS NULL
  WHERE a.class_id = c.id
    AND a.status = 'confirmed'
  ORDER BY a.confirmed_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1
) ja ON TRUE
LEFT JOIN trials t ON e.trial_id = t.id
LEFT JOIN shows s ON e.show_id = s.id
WHERE e.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. view_stats_summary — same provenance. view_breed_stats, view_judge_stats,
--    view_clean_sweep_dogs and view_fastest_times read from it, so this is a
--    CREATE OR REPLACE, never a DROP (which would need CASCADE and reset ACLs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_stats_summary
WITH (security_invoker = true) AS
SELECT
  s.id as show_id,
  s.name as show_name,
  s.license_key,
  t.id as trial_id,
  t.date as trial_date,
  t.name as trial_name,
  c.id as class_id,
  c.element,
  c.level,
  ja.judge_name,
  e.id as entry_id,
  e.armband::INTEGER as armband_number,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.handler as handler_name,
  e.result_status,
  e.is_scored,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_score as score,
  e.points_earned as qualifying_score,
  CASE WHEN e.result_status = 'qualified' THEN 1 ELSE 0 END as is_qualified,
  CASE WHEN e.search_time_seconds > 0 THEN e.search_time_seconds ELSE NULL END as valid_time
FROM shows s
JOIN trials t ON t.show_id = s.id
JOIN classes c ON c.trial_id = t.id
LEFT JOIN LATERAL (
  SELECT btrim(concat_ws(' ', p.first_name, p.last_name)) AS judge_name
  FROM public.judge_assignments a
  JOIN public.people p ON p.id = a.person_id AND p.deleted_at IS NULL
  WHERE a.class_id = c.id
    AND a.status = 'confirmed'
  ORDER BY a.confirmed_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1
) ja ON TRUE
JOIN entries e ON e.class_id = c.id
LEFT JOIN dogs d ON e.dog_id = d.id
WHERE e.is_scored = true
  AND e.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. emergency_packet_input — copied from 20260824223000 (the LATEST
--    definition; LESSONS replace-function-latest). The only change is in
--    class_rows: cl.judge_name is gone from the projection and from the
--    judge_display_name COALESCE, which now resolves solely through the
--    confirmed assignment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emergency_packet_input(
  p_show_id     uuid,
  p_trial_date  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH show_row AS (
    SELECT s.id, s.name, s.organization, s.start_date, s.end_date, c.name AS club_name
    FROM public.shows s
    LEFT JOIN public.clubs c ON c.id = s.club_id AND c.deleted_at IS NULL
    WHERE s.id = p_show_id
      AND s.deleted_at IS NULL
  ),
  trial_rows AS (
    SELECT
      t.id, t.date, t.name, t.trial_number, t.registry_id,
      public.emergency_packet_registry_key(COALESCE(NULLIF(btrim(t.registry_id), ''), 'AKC'))
        AS registry_key
    FROM public.trials t
    WHERE t.show_id = p_show_id
      AND t.deleted_at IS NULL
      AND (p_trial_date IS NULL OR t.date = p_trial_date)
      AND COALESCE(t.status, '') <> 'cancelled'
  ),
  class_rows AS (
    SELECT
      cl.id, cl.trial_id, cl.name, cl.element, cl.level, cl.section, cl.class_number,
      cl.display_order, cl.start_time,
      cl.time_limit_seconds, cl.time_limit_area2_seconds, cl.time_limit_area3_seconds,
      cl.num_areas, cl.num_hides, cl.distraction_count,
      NULLIF(btrim(ja.judge_full_name), '') AS judge_display_name
    FROM public.classes cl
    JOIN trial_rows t ON t.id = cl.trial_id
    LEFT JOIN LATERAL (
      SELECT btrim(concat_ws(' ', p.first_name, p.last_name)) AS judge_full_name
      FROM public.judge_assignments a
      JOIN public.people p ON p.id = a.person_id AND p.deleted_at IS NULL
      WHERE a.class_id = cl.id
        AND a.status = 'confirmed'
      ORDER BY a.confirmed_at DESC NULLS LAST, a.created_at DESC
      LIMIT 1
    ) ja ON TRUE
    WHERE cl.deleted_at IS NULL
      AND COALESCE(cl.status, '') <> 'cancelled'
  ),
  entry_rows AS (
    SELECT
      e.id,
      NULLIF(btrim(COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '')), '')
        AS armband,
      CASE
        WHEN COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '') ~ '^\s*[0-9]'
          THEN NULLIF(substring(btrim(COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '')) from '^[0-9]{1,9}'), '')::int
        ELSE NULL
      END AS armband_sort,
      e.run_order,
      COALESCE(
        d.call_name,
        'Dog ' || COALESCE(NULLIF(btrim(ab.armband_number), ''), NULLIF(btrim(e.armband), ''), '?')
      ) AS call_name,
      COALESCE(d.breed, '') AS breed,
      CASE WHEN COALESCE(btrim(e.handler), '') = '' THEN 'Unknown Handler' ELSE btrim(e.handler) END
        AS handler,
      registration.registration_number,
      cl.id AS class_id,
      cl.trial_id,
      cl.element AS class_element,
      cl.level   AS class_level,
      public.emergency_packet_section(cl.section) AS class_section
    FROM public.entries e
    JOIN class_rows cl ON cl.id = e.class_id
    JOIN trial_rows t ON t.id = cl.trial_id
    LEFT JOIN public.dogs d ON d.id = e.dog_id AND d.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT a2.armband_number
      FROM public.armbands a2
      WHERE a2.show_id = p_show_id
        AND a2.dog_id = e.dog_id
      ORDER BY a2.assigned_at DESC NULLS LAST
      LIMIT 1
    ) ab ON TRUE
    LEFT JOIN LATERAL (
      SELECT NULLIF(btrim(dr.registration_number), '') AS registration_number
      FROM public.dog_registrations dr
      WHERE dr.dog_id = e.dog_id
        AND public.emergency_packet_registry_key(dr.organization) = t.registry_key
      ORDER BY dr.is_primary DESC, dr.created_at ASC NULLS LAST, dr.id ASC
      LIMIT 1
    ) registration ON TRUE
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.entry_status, '') NOT IN (
        'withdrawn', 'cancelled',
        'not_accepted', 'rejected', 'promotion-expired',
        'scratched',
        'moved',
        'absent'
      )
      AND COALESCE(e.check_in_status, '') <> 'pulled'
  )
  SELECT jsonb_build_object(
    'show', (
      SELECT jsonb_build_object(
        'id', s.id,
        'name', COALESCE(s.name, ''),
        'clubName', s.club_name,
        'organization', s.organization,
        'startDate', COALESCE(s.start_date::date::text, ''),
        'endDate', COALESCE(s.end_date::date::text, s.start_date::date::text, '')
      )
      FROM show_row s
    ),
    'trials', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'date', COALESCE(t.date::text, ''),
        'name', COALESCE(t.name, 'Trial ' || COALESCE(t.trial_number, '')),
        'trialNumber', COALESCE(t.trial_number, ''),
        'registryId', COALESCE(t.registry_id::text, '')
      ) ORDER BY t.date, t.trial_number)
      FROM trial_rows t
    ), '[]'::jsonb),
    'classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cl.id,
        'trialId', COALESCE(cl.trial_id::text, ''),
        'name', COALESCE(cl.name, concat_ws(' ', cl.element, cl.level, cl.section)),
        'element', COALESCE(cl.element, ''),
        'level', COALESCE(cl.level, ''),
        'section', public.emergency_packet_section(cl.section),
        'classNumber', cl.class_number,
        'displayOrder', cl.display_order,
        'judgeName', COALESCE(cl.judge_display_name, ''),
        'ringLabel', NULL,
        'startTime', cl.start_time,
        'timeLimitSeconds', cl.time_limit_seconds,
        'timeLimitArea2Seconds', cl.time_limit_area2_seconds,
        'timeLimitArea3Seconds', cl.time_limit_area3_seconds,
        'numAreas', cl.num_areas,
        'numHides', cl.num_hides,
        'distractionCount', cl.distraction_count
      ) ORDER BY cl.display_order NULLS LAST, cl.element, cl.level)
      FROM class_rows cl
    ), '[]'::jsonb),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'armband', e.armband,
        'runOrder', e.run_order,
        'callName', e.call_name,
        'breed', e.breed,
        'handler', e.handler,
        'registrationNumber', e.registration_number,
        'section', NULL,
        'classId', e.class_id,
        'trialId', e.trial_id,
        'classElement', e.class_element,
        'classLevel', e.class_level,
        'classSection', e.class_section
      ) ORDER BY e.run_order NULLS LAST, e.armband_sort NULLS LAST, e.armband)
      FROM entry_rows e
    ), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM show_row);
$$;

COMMENT ON FUNCTION public.emergency_packet_input(uuid, date) IS
  'Emergency trial packet input as EmergencyPacketInput-shaped JSON. SECURITY DEFINER with soft-delete filters restated; performs NO authorization, so EXECUTE stays limited to service_role (MYK9-228). Judge names resolve through judge_assignments only (MYK9-479).';

REVOKE ALL ON FUNCTION public.emergency_packet_input(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_packet_input(uuid, date) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Drop the column. Its column-level ACL entries (anon=r, authenticated=r)
--    go with it; nothing else depends on it (no policy, index, trigger body or
--    RLS predicate names it — checked against pg_policy, pg_index, pg_proc and
--    pg_depend on the applied database).
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes DROP COLUMN judge_name;

-- ---------------------------------------------------------------------------
-- 5. Restate the two column allowlists WITHOUT judge_name.
--
-- Not needed by Postgres — the DROP already removed the column grants — but the
-- allowlist contract tests (reads.anonColumns.test, anonEntriesGrantContract)
-- and the /admin/health anon-grant probe read the CURRENT column set from the
-- latest GRANT SELECT (...) ON public.classes in this directory, and a reader
-- of the migrations should not have to know that a later DROP edited the
-- 20260731170000 list. A GRANT never narrows (LESSONS grant-never-narrows);
-- here there is nothing to narrow, so restating is a pure no-op on the ACL.
-- ---------------------------------------------------------------------------
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  max_faults, qualifying_threshold, is_scoring_finalized, results_released_at,
  dogs_ahead_notification_count, total_entries_count, checked_in_count,
  scored_count, created_at, updated_at, deleted_at, deleted_by, class_number,
  timer_mode, distraction_count, is_results_reviewed,
  time_limit_area2_seconds, time_limit_area3_seconds, display_order,
  results_released_by, version, status_source, reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  has_blank, max_faults, qualifying_threshold, is_scoring_finalized,
  results_released_at, dogs_ahead_notification_count, total_entries_count,
  checked_in_count, scored_count, created_at, updated_at, deleted_at,
  deleted_by, class_number, timer_mode, hides_known, distraction_count,
  is_results_reviewed, time_limit_area2_seconds,
  time_limit_area3_seconds, display_order, results_released_by, version,
  status_source, reopened_after_closeout_at, revised_expected_start
) ON public.classes TO authenticated;

NOTIFY pgrst, 'reload schema';
