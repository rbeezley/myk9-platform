-- AKC Scent Work Master National - Scoring Database Schema (Fixed)
-- Migration: 001_nationals_scoring_fixed
-- Created: 2025-01-15
--
-- STATUS: Dormant (No current nationals scheduled)
-- LAST USED: 2024
--
-- ⚠️ IMPORTANT: Database schema retained for future nationals events.
-- This is the corrected version with proper column names.
--
-- Description: Complete scoring system for single group of 200 exhibitors (Fixed column names)

BEGIN;

-- Table: nationals_scores
-- Individual element scores for each dog/element combination
CREATE TABLE IF NOT EXISTS nationals_scores (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  armband VARCHAR(10) NOT NULL,
  element_type VARCHAR(20) NOT NULL CHECK (element_type IN ('CONTAINER', 'BURIED', 'INTERIOR', 'EXTERIOR', 'HD_CHALLENGE')),
  day INTEGER NOT NULL CHECK (day IN (1, 2, 3)),
  judge_id INTEGER,
  
  -- Scoring components
  points INTEGER DEFAULT 0,
  time_seconds INTEGER DEFAULT 0,
  alerts_correct INTEGER DEFAULT 0,
  alerts_incorrect INTEGER DEFAULT 0,
  faults INTEGER DEFAULT 0,
  finish_call_errors INTEGER DEFAULT 0,
  
  -- Special statuses
  excused BOOLEAN DEFAULT FALSE,
  disqualified BOOLEAN DEFAULT FALSE,
  no_time BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  scored_by VARCHAR(100),
  notes TEXT,
  mobile_app_lic_key VARCHAR(100),
  
  -- Constraints
  CONSTRAINT unique_entry_element_day UNIQUE (entry_id, element_type, day),
  CONSTRAINT valid_time CHECK (time_seconds >= 0 AND time_seconds <= 120),
  CONSTRAINT valid_alerts CHECK (alerts_correct >= 0 AND alerts_incorrect >= 0),
  CONSTRAINT valid_faults CHECK (faults >= 0),
  CONSTRAINT valid_finish_errors CHECK (finish_call_errors >= 0)
);

-- Table: nationals_rankings
-- Aggregated rankings and totals for each exhibitor
CREATE TABLE IF NOT EXISTS nationals_rankings (
  entry_id INTEGER PRIMARY KEY,
  armband VARCHAR(10) NOT NULL UNIQUE,
  
  -- Point totals
  total_points INTEGER DEFAULT 0,
  day1_points INTEGER DEFAULT 0,
  day2_points INTEGER DEFAULT 0,
  day3_points INTEGER DEFAULT 0,
  
  -- Time totals (in seconds)
  total_time_seconds INTEGER DEFAULT 0,
  day1_time_seconds INTEGER DEFAULT 0,
  day2_time_seconds INTEGER DEFAULT 0,
  day3_time_seconds INTEGER DEFAULT 0,
  
  -- Element completion tracking
  container_completed BOOLEAN DEFAULT FALSE,
  buried_completed BOOLEAN DEFAULT FALSE,
  interior_completed BOOLEAN DEFAULT FALSE,
  exterior_completed BOOLEAN DEFAULT FALSE,
  hd_challenge_completed BOOLEAN DEFAULT FALSE,
  
  -- Advancement tracking
  rank INTEGER,
  qualified_for_finals BOOLEAN DEFAULT FALSE,
  final_rank INTEGER,
  
  -- Status tracking
  eliminated BOOLEAN DEFAULT FALSE,
  withdrawal BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  mobile_app_lic_key VARCHAR(100)
);

-- Table: nationals_advancement
-- Finals qualification tracking and criteria
CREATE TABLE IF NOT EXISTS nationals_advancement (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  armband VARCHAR(10) NOT NULL,
  
  -- Preliminary results (Days 1-2)
  preliminary_points INTEGER DEFAULT 0,
  preliminary_time_seconds INTEGER DEFAULT 0,
  preliminary_rank INTEGER,
  
  -- Qualification status
  qualified_for_finals BOOLEAN DEFAULT FALSE,
  qualification_date TIMESTAMPTZ,
  
  -- Finals results (Day 3)
  finals_points INTEGER DEFAULT 0,
  finals_time_seconds INTEGER DEFAULT 0,
  finals_rank INTEGER,
  
  -- Final championship standing
  championship_points INTEGER DEFAULT 0,
  championship_rank INTEGER,
  
  -- Awards and recognitions
  national_champion BOOLEAN DEFAULT FALSE,
  reserve_champion BOOLEAN DEFAULT FALSE,
  top_10_finish BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  mobile_app_lic_key VARCHAR(100),
  
  CONSTRAINT unique_entry_advancement UNIQUE (entry_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_nationals_scores_entry_day ON nationals_scores(entry_id, day);
CREATE INDEX IF NOT EXISTS idx_nationals_scores_element_day ON nationals_scores(element_type, day);
CREATE INDEX IF NOT EXISTS idx_nationals_scores_scored_at ON nationals_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_nationals_scores_armband ON nationals_scores(armband);
CREATE INDEX IF NOT EXISTS idx_nationals_scores_license ON nationals_scores(mobile_app_lic_key);

CREATE INDEX IF NOT EXISTS idx_nationals_rankings_rank ON nationals_rankings(rank);
CREATE INDEX IF NOT EXISTS idx_nationals_rankings_points ON nationals_rankings(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_nationals_rankings_qualified ON nationals_rankings(qualified_for_finals, rank);
CREATE INDEX IF NOT EXISTS idx_nationals_rankings_armband ON nationals_rankings(armband);
CREATE INDEX IF NOT EXISTS idx_nationals_rankings_license ON nationals_rankings(mobile_app_lic_key);

CREATE INDEX IF NOT EXISTS idx_nationals_advancement_qualified ON nationals_advancement(qualified_for_finals, preliminary_rank);
CREATE INDEX IF NOT EXISTS idx_nationals_advancement_finals_rank ON nationals_advancement(finals_rank);
CREATE INDEX IF NOT EXISTS idx_nationals_advancement_championship ON nationals_advancement(championship_rank);
CREATE INDEX IF NOT EXISTS idx_nationals_advancement_armband ON nationals_advancement(armband);

-- Leaderboard Views (Fixed to work with actual table structure)
-- View: Current Leaderboard (Top 100 + Rankings)
CREATE OR REPLACE VIEW view_nationals_leaderboard AS
SELECT 
  nr.entry_id,
  nr.armband,
  eq.call_name,
  eq.breed,
  eq.handler as handler_name,
  COALESCE(eq.handler_city, eq.handler_location, '') as handler_location,
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

-- View: Element Progress Summary
CREATE OR REPLACE VIEW view_element_progress AS
SELECT 
  element_type,
  day,
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE points > 0) as successful_entries,
  COUNT(*) FILTER (WHERE excused = true) as excused_entries,
  COUNT(*) FILTER (WHERE disqualified = true) as disqualified_entries,
  AVG(points) FILTER (WHERE NOT excused AND NOT disqualified) as avg_points,
  MAX(points) as max_points,
  AVG(time_seconds) FILTER (WHERE NOT excused AND NOT disqualified) as avg_time_seconds,
  MIN(time_seconds) FILTER (WHERE NOT excused AND NOT disqualified) as fastest_time_seconds
FROM nationals_scores
GROUP BY element_type, day
ORDER BY day, element_type;

-- View: Judge Performance Summary
CREATE OR REPLACE VIEW view_judge_summary AS
SELECT 
  COALESCE(jp.name, 'Judge ' || ns.judge_id::TEXT, 'Unassigned') as judge_name,
  ns.element_type,
  ns.day,
  COUNT(*) as dogs_judged,
  COUNT(*) FILTER (WHERE ns.excused = true) as dogs_excused,
  AVG(ns.points) FILTER (WHERE NOT ns.excused) as avg_points_awarded,
  AVG(ns.time_seconds) FILTER (WHERE NOT ns.excused) as avg_time_seconds
FROM nationals_scores ns
LEFT JOIN judge_profiles jp ON ns.judge_id = jp.id
GROUP BY jp.name, ns.judge_id, ns.element_type, ns.day
ORDER BY ns.day, ns.element_type;

-- Trigger: Update rankings when scores change
CREATE OR REPLACE FUNCTION update_nationals_rankings()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the rankings table when scores are inserted/updated
  INSERT INTO nationals_rankings (entry_id, armband, mobile_app_lic_key)
  VALUES (NEW.entry_id, NEW.armband, NEW.mobile_app_lic_key)
  ON CONFLICT (entry_id) DO NOTHING;
  
  -- Recalculate totals for this entry
  UPDATE nationals_rankings SET
    day1_points = COALESCE((
      SELECT SUM(points) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 1 AND NOT excused
    ), 0),
    day2_points = COALESCE((
      SELECT SUM(points) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 2 AND NOT excused
    ), 0),
    day3_points = COALESCE((
      SELECT SUM(points) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 3 AND NOT excused
    ), 0),
    day1_time_seconds = COALESCE((
      SELECT SUM(time_seconds) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 1
    ), 0),
    day2_time_seconds = COALESCE((
      SELECT SUM(time_seconds) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 2
    ), 0),
    day3_time_seconds = COALESCE((
      SELECT SUM(time_seconds) FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND day = 3
    ), 0),
    container_completed = EXISTS(
      SELECT 1 FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND element_type = 'CONTAINER'
    ),
    buried_completed = EXISTS(
      SELECT 1 FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND element_type = 'BURIED'
    ),
    interior_completed = EXISTS(
      SELECT 1 FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND element_type = 'INTERIOR'
    ),
    exterior_completed = EXISTS(
      SELECT 1 FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND element_type = 'EXTERIOR'
    ),
    hd_challenge_completed = EXISTS(
      SELECT 1 FROM nationals_scores 
      WHERE entry_id = NEW.entry_id AND element_type = 'HD_CHALLENGE'
    ),
    updated_at = NOW()
  WHERE entry_id = NEW.entry_id;
  
  -- Update total points and time
  UPDATE nationals_rankings SET
    total_points = day1_points + day2_points + day3_points,
    total_time_seconds = day1_time_seconds + day2_time_seconds + day3_time_seconds
  WHERE entry_id = NEW.entry_id;
  
  -- Determine finals qualification (top 100 after Day 2)
  UPDATE nationals_rankings SET
    qualified_for_finals = (
      SELECT COUNT(*) FROM nationals_rankings nr2 
      WHERE (nr2.day1_points + nr2.day2_points) > (day1_points + day2_points)
      OR (nr2.day1_points + nr2.day2_points = day1_points + day2_points 
          AND (nr2.day1_time_seconds + nr2.day2_time_seconds) < (day1_time_seconds + day2_time_seconds))
    ) < 100
  WHERE entry_id = NEW.entry_id 
  AND day1_points > 0 
  AND day2_points > 0;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_nationals_rankings
  AFTER INSERT OR UPDATE ON nationals_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_nationals_rankings();

-- Function: Calculate final rankings
CREATE OR REPLACE FUNCTION calculate_nationals_rankings()
RETURNS void AS $$
BEGIN
  -- Calculate preliminary rankings (Days 1-2)
  WITH ranked_prelims AS (
    SELECT 
      entry_id,
      ROW_NUMBER() OVER (
        ORDER BY (day1_points + day2_points) DESC, 
                 (day1_time_seconds + day2_time_seconds) ASC
      ) as preliminary_rank
    FROM nationals_rankings
    WHERE day1_points > 0 AND day2_points > 0
  )
  UPDATE nationals_rankings nr SET
    rank = rp.preliminary_rank
  FROM ranked_prelims rp
  WHERE nr.entry_id = rp.entry_id;
  
  -- Calculate final rankings (including Day 3)
  WITH ranked_finals AS (
    SELECT 
      entry_id,
      ROW_NUMBER() OVER (
        ORDER BY total_points DESC, total_time_seconds ASC
      ) as final_rank
    FROM nationals_rankings
    WHERE qualified_for_finals = true AND day3_points > 0
  )
  UPDATE nationals_rankings nr SET
    final_rank = rf.final_rank
  FROM ranked_finals rf
  WHERE nr.entry_id = rf.entry_id;
  
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Verification queries
SELECT 'nationals_scores table created' as status;
SELECT 'nationals_rankings table created' as status;
SELECT 'nationals_advancement table created' as status;
SELECT 'Indexes created' as status;
SELECT 'Views created' as status;
SELECT 'Triggers and functions created' as status;