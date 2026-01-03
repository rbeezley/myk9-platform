-- Migration: Add CHECK constraints for score validation
-- Purpose: Prevent invalid score values at the database level
--
-- This migration adds constraints to the entries table to ensure:
-- - Time values are non-negative
-- - Fault counts are non-negative
-- - Score values are non-negative
--
-- NOTE: final_placement already has a constraint (entries_final_placement_check)
--
-- IMPORTANT: These constraints allow NULL values (optional fields)
-- but reject invalid values when provided.

-- ============================================
-- ENTRIES TABLE CONSTRAINTS
-- ============================================

-- Search time must be non-negative (NULL or 0 allowed for unscored entries)
ALTER TABLE entries
ADD CONSTRAINT entries_search_time_non_negative
CHECK (search_time_seconds IS NULL OR search_time_seconds >= 0);

-- Area times must be non-negative
ALTER TABLE entries
ADD CONSTRAINT entries_area1_time_non_negative
CHECK (area1_time_seconds IS NULL OR area1_time_seconds >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_area2_time_non_negative
CHECK (area2_time_seconds IS NULL OR area2_time_seconds >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_area3_time_non_negative
CHECK (area3_time_seconds IS NULL OR area3_time_seconds >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_area4_time_non_negative
CHECK (area4_time_seconds IS NULL OR area4_time_seconds >= 0);

-- Total faults must be non-negative
ALTER TABLE entries
ADD CONSTRAINT entries_total_faults_non_negative
CHECK (total_faults IS NULL OR total_faults >= 0);

-- Area faults must be non-negative
ALTER TABLE entries
ADD CONSTRAINT entries_area1_faults_non_negative
CHECK (area1_faults IS NULL OR area1_faults >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_area2_faults_non_negative
CHECK (area2_faults IS NULL OR area2_faults >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_area3_faults_non_negative
CHECK (area3_faults IS NULL OR area3_faults >= 0);

-- Total score must be non-negative
ALTER TABLE entries
ADD CONSTRAINT entries_total_score_non_negative
CHECK (total_score IS NULL OR total_score >= 0);

-- Points possible must be non-negative
-- NOTE: points_earned CAN be negative for nationals point systems (penalty points)
ALTER TABLE entries
ADD CONSTRAINT entries_points_possible_non_negative
CHECK (points_possible IS NULL OR points_possible >= 0);

-- Find counts must be non-negative
ALTER TABLE entries
ADD CONSTRAINT entries_total_correct_finds_non_negative
CHECK (total_correct_finds IS NULL OR total_correct_finds >= 0);

ALTER TABLE entries
ADD CONSTRAINT entries_total_incorrect_finds_non_negative
CHECK (total_incorrect_finds IS NULL OR total_incorrect_finds >= 0);

-- ============================================
-- CLASSES TABLE CONSTRAINTS
-- ============================================

-- Time limits must be positive (if specified)
ALTER TABLE classes
ADD CONSTRAINT classes_time_limit_positive
CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0);

ALTER TABLE classes
ADD CONSTRAINT classes_time_limit_area2_positive
CHECK (time_limit_area2_seconds IS NULL OR time_limit_area2_seconds > 0);

ALTER TABLE classes
ADD CONSTRAINT classes_time_limit_area3_positive
CHECK (time_limit_area3_seconds IS NULL OR time_limit_area3_seconds > 0);

-- Area count must be positive (if specified)
ALTER TABLE classes
ADD CONSTRAINT classes_area_count_positive
CHECK (area_count IS NULL OR area_count > 0);

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON CONSTRAINT entries_search_time_non_negative ON entries IS
'Ensures search times are never negative. NULL or 0 indicates unscored entry.';

COMMENT ON CONSTRAINT entries_total_faults_non_negative ON entries IS
'Ensures fault counts are never negative. NULL or 0 indicates no faults.';

COMMENT ON CONSTRAINT entries_total_score_non_negative ON entries IS
'Ensures scores are never negative. NULL or 0 indicates unscored entry.';
