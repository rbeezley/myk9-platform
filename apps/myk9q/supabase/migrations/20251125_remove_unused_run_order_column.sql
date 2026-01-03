-- ============================================================================
-- Migration: Remove unused run_order column
-- ============================================================================
-- The run_order column was never used in the application. All run ordering
-- uses exhibitor_order instead (with armband_number as fallback).
--
-- This migration:
-- 1. Drops dependent views
-- 2. Drops the run_order column from the entries table
-- 3. Recreates views without run_order
-- ============================================================================

-- Step 1: Drop dependent views first
DROP VIEW IF EXISTS view_entry_with_results CASCADE;
DROP VIEW IF EXISTS view_entry_class_join_normalized CASCADE;

-- Step 2: Drop the run_order column from entries table
ALTER TABLE entries DROP COLUMN IF EXISTS run_order;

-- Step 3: Recreate view_entry_class_join_normalized without run_order

CREATE VIEW view_entry_class_join_normalized AS
SELECT
  e.id,
  e.armband_number,
  e.dog_call_name,
  e.dog_breed,
  e.handler_name,
  e.entry_status,
  e.exhibitor_order,
  e.created_at,
  e.updated_at,
  -- Result columns (now part of entries table after migration 039)
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
  -- Class columns
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.class_status,
  c.self_checkin_enabled,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.area_count,
  -- Trial columns
  t.id AS trial_id,
  t.trial_number,
  t.trial_date,
  -- Show columns
  s.id AS show_id,
  s.license_key,
  s.show_name
FROM entries e
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON c.trial_id = t.id
LEFT JOIN shows s ON t.show_id = s.id;

-- Grant permissions
GRANT SELECT ON view_entry_class_join_normalized TO anon, authenticated;

COMMENT ON VIEW view_entry_class_join_normalized IS 'Pre-joined view of entries with class, trial, and show information. run_order column removed in favor of exhibitor_order.';

-- Step 4: Recreate view_entry_with_results without run_order
-- This view adds a result_text column based on result_status

CREATE VIEW view_entry_with_results AS
SELECT
  e.*,
  CASE
    WHEN e.is_scored = TRUE AND e.result_status = 'qualified' THEN 'Q'
    WHEN e.is_scored = TRUE AND e.result_status = 'nq' THEN 'NQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'absent' THEN 'ABS'
    WHEN e.is_scored = TRUE AND e.result_status = 'excused' THEN 'EX'
    WHEN e.is_scored = TRUE AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text
FROM entries e;

-- Grant permissions
GRANT SELECT ON view_entry_with_results TO anon, authenticated;

COMMENT ON VIEW view_entry_with_results IS 'Entries with computed result_text based on result_status. run_order column removed in favor of exhibitor_order.';
