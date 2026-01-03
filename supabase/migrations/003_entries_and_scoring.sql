-- =============================================================================
-- Migration 003: Entries and Scoring
-- =============================================================================
-- Creates the entries table with integrated scoring data.
-- This follows myK9Q's merged approach (entries + results in one table)
-- for better performance (1 write per score vs 2).
--
-- Combines:
-- - myK9Show entry registration fields
-- - myK9Q scoring/result fields (from migration 039)
-- =============================================================================

-- =============================================================================
-- ENTRIES TABLE (combined entry + scoring)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),

  -- Foreign keys
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,
  handler_id UUID REFERENCES people(id) ON DELETE SET NULL,

  -- ==========================================================================
  -- ENTRY REGISTRATION (myK9Show)
  -- ==========================================================================

  -- Status tracking
  entry_status TEXT DEFAULT 'no-status' CHECK (entry_status IN (
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'checked-in', 'competing', 'completed', 'withdrawn', 'scratched', 'absent'
  )),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'paid', 'refunded', 'waived'
  )),

  -- Registration data
  handler TEXT,  -- Denormalized handler name for display
  entry_fee DECIMAL(10,2),
  submitted_at TIMESTAMPTZ,
  special_requests TEXT,

  -- Run order and scheduling
  armband TEXT,
  run_order INTEGER,
  jump_height TEXT,
  preferred_judge TEXT,
  move_up_requested BOOLEAN DEFAULT FALSE,

  -- ==========================================================================
  -- SCORING DATA (myK9Q - merged from results table)
  -- ==========================================================================

  -- Scoring state
  is_scored BOOLEAN DEFAULT FALSE,
  is_in_ring BOOLEAN DEFAULT FALSE,
  result_status TEXT DEFAULT 'pending' CHECK (result_status IN (
    'pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn'
  )),

  -- Timing
  ring_entry_time TIMESTAMPTZ,
  ring_exit_time TIMESTAMPTZ,
  scoring_started_at TIMESTAMPTZ,
  scoring_completed_at TIMESTAMPTZ,

  -- Search/run time (scent work, agility, etc.)
  search_time_seconds NUMERIC DEFAULT 0,

  -- Multi-area timing (scent work with multiple search areas)
  area1_time_seconds NUMERIC DEFAULT 0,
  area2_time_seconds NUMERIC DEFAULT 0,
  area3_time_seconds NUMERIC DEFAULT 0,
  area4_time_seconds NUMERIC DEFAULT 0,

  -- Scoring - finds and faults
  total_correct_finds INTEGER DEFAULT 0,
  total_incorrect_finds INTEGER DEFAULT 0,
  total_faults INTEGER DEFAULT 0,
  no_finish_count INTEGER DEFAULT 0,

  -- Per-area scoring (for multi-area scent work)
  area1_correct INTEGER DEFAULT 0,
  area1_incorrect INTEGER DEFAULT 0,
  area1_faults INTEGER DEFAULT 0,
  area2_correct INTEGER DEFAULT 0,
  area2_incorrect INTEGER DEFAULT 0,
  area2_faults INTEGER DEFAULT 0,
  area3_correct INTEGER DEFAULT 0,
  area3_incorrect INTEGER DEFAULT 0,
  area3_faults INTEGER DEFAULT 0,

  -- Calculated scores
  total_score NUMERIC DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  points_possible INTEGER DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  penalty_points INTEGER DEFAULT 0,

  -- Time limit handling
  time_over_limit BOOLEAN DEFAULT FALSE,
  time_limit_exceeded_seconds NUMERIC DEFAULT 0,

  -- Placement
  final_placement INTEGER DEFAULT 0 CHECK (final_placement >= 0),

  -- Judge info
  judge_notes TEXT,
  judge_signature TEXT,
  judge_signature_timestamp TIMESTAMPTZ,
  disqualification_reason TEXT,

  -- Video review
  has_video_review BOOLEAN DEFAULT FALSE,
  video_review_notes TEXT,

  -- ==========================================================================
  -- MULTI-TENANT & SYNC
  -- ==========================================================================
  license_key TEXT,

  -- Offline sync support
  local_id TEXT,  -- Client-side ID for offline-first
  sync_version INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,

  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Foreign key indexes
CREATE INDEX IF NOT EXISTS entries_dog_id_idx ON entries(dog_id);
CREATE INDEX IF NOT EXISTS entries_class_id_idx ON entries(class_id);
CREATE INDEX IF NOT EXISTS entries_show_id_idx ON entries(show_id);
CREATE INDEX IF NOT EXISTS entries_trial_id_idx ON entries(trial_id);
CREATE INDEX IF NOT EXISTS entries_handler_id_idx ON entries(handler_id);

-- Status indexes
CREATE INDEX IF NOT EXISTS entries_entry_status_idx ON entries(entry_status);
CREATE INDEX IF NOT EXISTS entries_payment_status_idx ON entries(payment_status);
CREATE INDEX IF NOT EXISTS entries_result_status_idx ON entries(result_status);

-- Scoring indexes
CREATE INDEX IF NOT EXISTS entries_is_scored_idx ON entries(is_scored);
CREATE INDEX IF NOT EXISTS entries_final_placement_idx ON entries(final_placement);
CREATE INDEX IF NOT EXISTS entries_class_scored_idx ON entries(class_id, is_scored);

-- Multi-tenant index
CREATE INDEX IF NOT EXISTS entries_license_key_idx ON entries(license_key);

-- Run order index (for ordering within a class)
CREATE INDEX IF NOT EXISTS entries_class_run_order_idx ON entries(class_id, run_order);

-- Unique constraint: prevent duplicate entries (same dog in same class)
CREATE UNIQUE INDEX IF NOT EXISTS entries_dog_class_unique_idx
  ON entries(dog_id, class_id)
  WHERE entry_status NOT IN ('withdrawn', 'scratched');

-- =============================================================================
-- ENTRY STATUS HISTORY (for audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entry_status_history (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES people(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS entry_status_history_entry_id_idx ON entry_status_history(entry_id);
CREATE INDEX IF NOT EXISTS entry_status_history_changed_at_idx ON entry_status_history(changed_at);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View for entries with computed result text (like myK9Q's view_entry_with_results)
CREATE OR REPLACE VIEW view_entry_with_results AS
SELECT
  e.*,
  -- Computed result display text
  CASE
    WHEN e.is_scored = TRUE AND e.result_status = 'qualified' THEN 'Q'
    WHEN e.is_scored = TRUE AND e.result_status = 'nq' THEN 'NQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'absent' THEN 'ABS'
    WHEN e.is_scored = TRUE AND e.result_status = 'excused' THEN 'EX'
    WHEN e.is_scored = TRUE AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text,
  -- Dog info (denormalized for display)
  d.name as dog_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  -- Class info
  c.name as class_name,
  c.level as class_level,
  c.element as class_element
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id;

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE TRIGGER update_entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 003: Entries and scoring created successfully' as status;
