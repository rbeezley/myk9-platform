-- ============================================================================
-- Migration 040: Recreate view_entry_class_join_normalized
-- ============================================================================
-- After migration 039 merged results into entries, the view was dropped by CASCADE
-- This migration recreates the view without the results table join

DROP VIEW IF EXISTS view_entry_class_join_normalized CASCADE;

CREATE VIEW view_entry_class_join_normalized AS
SELECT
  e.id,
  e.armband_number,
  e.dog_call_name,
  e.dog_breed,
  e.handler_name,
  e.entry_status,
  e.run_order,
  e.exhibitor_order,
  e.created_at,
  e.updated_at,
  -- Result columns now part of entries table
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

COMMENT ON VIEW view_entry_class_join_normalized IS 'Pre-joined view of entries with class, trial, and show information. After migration 039, result columns come directly from entries table instead of results join.';
