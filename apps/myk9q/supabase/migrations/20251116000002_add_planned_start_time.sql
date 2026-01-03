-- Add planned_start_time to classes table
-- Note: planned_start_time already exists in trials table from a previous migration
-- This migration adds it to classes and updates the views to include it

-- Add planned_start_time to classes table
ALTER TABLE classes
ADD COLUMN planned_start_time TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN classes.planned_start_time IS 'Scheduled start time for the class (optional)';
COMMENT ON COLUMN trials.planned_start_time IS 'Scheduled start time for the trial (optional)';

-- Update view_class_summary to include planned_start_time
DROP VIEW IF EXISTS view_class_summary CASCADE;

CREATE VIEW view_class_summary AS
SELECT
    c.id AS class_id,
    c.element,
    c.level,
    c.section,
    c.judge_name,
    c.class_status,
    c.class_order,
    c.self_checkin_enabled,
    c.realtime_results_enabled,
    c.is_completed,
    c.time_limit_seconds,
    c.time_limit_area2_seconds,
    c.time_limit_area3_seconds,
    c.area_count,
    c.briefing_time,
    c.break_until,
    c.start_time,
    c.actual_start_time,
    c.actual_end_time,
    c.planned_start_time,
    t.id AS trial_id,
    t.trial_number,
    t.trial_date,
    t.trial_name,
    s.id AS show_id,
    s.license_key,
    s.show_name,
    s.club_name,
    COUNT(e.id) AS total_entries,
    COUNT(CASE WHEN e.is_scored = true THEN 1 ELSE NULL END) AS scored_entries,
    COUNT(CASE WHEN e.entry_status = 'checked-in' THEN 1 ELSE NULL END) AS checked_in_count,
    COUNT(CASE WHEN e.entry_status = 'at-gate' THEN 1 ELSE NULL END) AS at_gate_count,
    COUNT(CASE WHEN e.entry_status = 'in-ring' THEN 1 ELSE NULL END) AS in_ring_count,
    COUNT(CASE WHEN e.result_status = 'qualified' THEN 1 ELSE NULL END) AS qualified_count,
    COUNT(CASE WHEN e.result_status = 'nq' THEN 1 ELSE NULL END) AS nq_count
FROM classes c
JOIN trials t ON c.trial_id = t.id
JOIN shows s ON t.show_id = s.id
LEFT JOIN entries e ON c.id = e.class_id
GROUP BY c.id, t.id, s.id
ORDER BY t.trial_date, c.class_order, c.element, c.level;

COMMENT ON VIEW view_class_summary IS 'Aggregated class statistics with trial and show context, including planned start times';

-- Update view_trial_summary_normalized to include planned_start_time
DROP VIEW IF EXISTS view_trial_summary_normalized CASCADE;

CREATE VIEW view_trial_summary_normalized AS
SELECT
    t.id AS trial_id,
    t.show_id,
    t.trial_name,
    t.trial_date,
    t.trial_number,
    t.trial_type,
    t.planned_start_time,
    s.show_name,
    s.club_name,
    s.license_key
FROM trials t
JOIN shows s ON t.show_id = s.id
ORDER BY t.trial_date, t.trial_number;

COMMENT ON VIEW view_trial_summary_normalized IS 'Trial summary with show context, including planned start times';
