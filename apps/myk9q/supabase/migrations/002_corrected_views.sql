-- Corrected Views for AKC Nationals Scoring
-- Based on actual tbl_entry_queue table structure

BEGIN;

-- Drop existing views if they exist
DROP VIEW IF EXISTS view_nationals_leaderboard;
DROP VIEW IF EXISTS view_nationals_qualifiers;

-- View: Current Leaderboard (Top 100 + Rankings)
-- CORRECTED to match actual tbl_entry_queue columns
CREATE OR REPLACE VIEW view_nationals_leaderboard AS
SELECT
  nr.entry_id,
  nr.armband,
  eq.call_name,
  eq.breed,
  eq.handler as handler_name,
  '' as handler_location, -- No location data in tbl_entry_queue
  nr.total_points,
  nr.total_time_seconds,
  nr.day1_points,
  nr.day2_points,
  nr.day3_points,
  nr.rank,
  nr.qualified_for_finals,
  nr.eliminated,
  nr.withdrawal,
  -- Element completion status
  nr.container_completed,
  nr.buried_completed,
  nr.interior_completed,
  nr.exterior_completed,
  nr.hd_challenge_completed,
  -- Calculate completion percentage
  (CASE WHEN nr.container_completed THEN 1 ELSE 0 END +
   CASE WHEN nr.buried_completed THEN 1 ELSE 0 END +
   CASE WHEN nr.interior_completed THEN 1 ELSE 0 END +
   CASE WHEN nr.exterior_completed THEN 1 ELSE 0 END +
   CASE WHEN nr.hd_challenge_completed THEN 1 ELSE 0 END)::FLOAT / 5.0 * 100 as completion_percentage,
  nr.updated_at
FROM nationals_rankings nr
LEFT JOIN tbl_entry_queue eq ON nr.entry_id = eq.id
WHERE nr.mobile_app_lic_key = eq.mobile_app_lic_key OR eq.mobile_app_lic_key IS NULL
ORDER BY nr.rank ASC NULLS LAST, nr.total_points DESC, nr.total_time_seconds ASC;

-- View: Top 100 Qualifiers for Finals
CREATE OR REPLACE VIEW view_nationals_qualifiers AS
SELECT
  vl.*,
  na.preliminary_rank,
  na.qualification_date,
  na.finals_points,
  na.finals_rank,
  na.championship_rank,
  na.national_champion,
  na.reserve_champion,
  na.top_10_finish
FROM view_nationals_leaderboard vl
LEFT JOIN nationals_advancement na ON vl.entry_id = na.entry_id
WHERE vl.qualified_for_finals = true
ORDER BY vl.rank ASC;

COMMIT;

-- Test the corrected views
SELECT 'Corrected views created successfully' as status;
SELECT COUNT(*) as leaderboard_view_count FROM view_nationals_leaderboard;