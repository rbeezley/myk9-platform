-- ============================================================================
-- Migration: Rename is_completed to is_scoring_finalized
-- ============================================================================
-- Renames the boolean flag that indicates scoring is complete and results
-- are ready to display (per visibility rules).
--
-- Rationale: "is_completed" was confusing because:
-- - It overlapped semantically with class_status = 'completed' (workflow status)
-- - "is_scoring_finalized" clearly means "scoring done, results are final"
--
-- class_status: Operational workflow (no-status -> setup -> briefing -> in_progress -> completed)
-- is_scoring_finalized: Boolean flag for "results are ready to show"
-- ============================================================================

-- Step 1: Rename the column in the classes table
ALTER TABLE classes
RENAME COLUMN is_completed TO is_scoring_finalized;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN classes.is_scoring_finalized IS
  'Boolean flag indicating scoring is complete and results are final. Used by visibility system to determine when placement/time/faults can be shown to exhibitors. Distinct from class_status which tracks operational workflow.';

-- Step 3: Recreate view_class_summary with new column name
DROP VIEW IF EXISTS view_class_summary CASCADE;

CREATE OR REPLACE VIEW public.view_class_summary AS
SELECT
  -- Class identification
  c.id as class_id,
  c.element,
  c.level,
  c.section,
  c.judge_name,
  c.class_status,
  c.class_order,

  -- Class configuration
  c.self_checkin_enabled,
  c.realtime_results_enabled,
  c.is_scoring_finalized,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.area_count,

  -- Class timing
  c.briefing_time,
  c.break_until,
  c.start_time,
  c.actual_start_time,
  c.actual_end_time,
  c.planned_start_time,

  -- Trial information
  t.id as trial_id,
  t.trial_number,
  t.trial_date,
  t.trial_name,

  -- Show information
  s.id as show_id,
  s.license_key,
  s.show_name,
  s.club_name,

  -- Aggregated entry counts
  COUNT(e.id) as total_entries,
  COUNT(CASE WHEN e.is_scored = true THEN 1 END) as scored_entries,
  COUNT(CASE WHEN e.entry_status = 'checked-in' THEN 1 END) as checked_in_count,
  COUNT(CASE WHEN e.entry_status = 'at-gate' THEN 1 END) as at_gate_count,
  COUNT(CASE WHEN e.entry_status = 'in-ring' THEN 1 END) as in_ring_count,
  COUNT(CASE WHEN e.result_status = 'qualified' THEN 1 END) as qualified_count,
  COUNT(CASE WHEN e.result_status = 'nq' THEN 1 END) as nq_count
FROM
  classes c
  INNER JOIN trials t ON c.trial_id = t.id
  INNER JOIN shows s ON t.show_id = s.id
  LEFT JOIN entries e ON c.id = e.class_id
GROUP BY
  c.id, t.id, s.id
ORDER BY
  t.trial_date, c.class_order, c.element, c.level;

-- Grant permissions
GRANT SELECT ON view_class_summary TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.view_class_summary IS
  'Pre-aggregated class statistics with entry counts. is_scoring_finalized indicates results are final (renamed from is_completed for clarity).';
