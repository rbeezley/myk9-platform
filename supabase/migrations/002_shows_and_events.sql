-- =============================================================================
-- Migration 002: Shows and Events
-- =============================================================================
-- Creates tables for show/event management:
-- - shows: Dog show events
-- - trials: Trials within shows (competition days)
-- - classes: Individual classes/runs within trials
--
-- Combines myK9Show's show management with myK9Q's scoring configuration.
-- =============================================================================

-- =============================================================================
-- SHOWS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS shows (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),

  -- Basic info
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'Specialty', 'All-Breed', 'Match', 'Seminar', etc.
  description TEXT,

  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  entry_open_date DATE,
  entry_close_date DATE,

  -- Location
  location TEXT,
  venue_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'published', 'accepting_entries', 'closed',
    'in_progress', 'completed', 'cancelled'
  )),

  -- Organization
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  chairman TEXT,
  secretary TEXT,
  chief_steward TEXT,

  -- Entry configuration
  pre_entry_fee DECIMAL(10,2),
  day_of_show_fee DECIMAL(10,2),
  max_entries_per_dog INTEGER,
  max_total_entries INTEGER,
  allow_non_owner_handlers BOOLEAN DEFAULT TRUE,

  -- myK9Q: Result visibility controls
  results_visible_to_all BOOLEAN DEFAULT TRUE,
  results_released_at TIMESTAMPTZ,

  -- Multi-tenant support
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS shows_club_id_idx ON shows(club_id);
CREATE INDEX IF NOT EXISTS shows_license_key_idx ON shows(license_key);
CREATE INDEX IF NOT EXISTS shows_start_date_idx ON shows(start_date);
CREATE INDEX IF NOT EXISTS shows_status_idx ON shows(status);

-- =============================================================================
-- TRIALS TABLE (individual competition days within a show)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trials (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  date DATE NOT NULL,
  trial_number TEXT,

  -- Status
  status TEXT DEFAULT 'planned' CHECK (status IN (
    'planned', 'published', 'check_in', 'in_progress',
    'scoring', 'completed', 'cancelled'
  )),

  -- Entry limits
  max_entries_per_dog INTEGER,
  max_total_entries INTEGER,
  max_entries_per_handler INTEGER,

  -- myK9Q: Timing
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  planned_start_time TIMESTAMPTZ,

  -- myK9Q: Self check-in
  allow_self_checkin BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS trials_show_id_idx ON trials(show_id);
CREATE INDEX IF NOT EXISTS trials_date_idx ON trials(date);
CREATE INDEX IF NOT EXISTS trials_status_idx ON trials(status);

-- =============================================================================
-- CLASSES TABLE (individual runs/classes within trials)
-- =============================================================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,

  -- Classification
  level TEXT,          -- 'Novice', 'Open', 'Excellent', 'Master', etc.
  element TEXT,        -- For scent work: 'Container', 'Interior', 'Exterior', etc.
  division TEXT,       -- Size division if applicable
  competition_type TEXT, -- 'AKC Scent Work', 'UKC Nosework', 'Fast CAT', etc.

  -- Entry configuration
  entry_fee DECIMAL(10,2),
  max_entries INTEGER,
  allow_waitlist BOOLEAN DEFAULT FALSE,
  max_dogs_per_handler INTEGER,

  -- Eligibility restrictions
  breed_restrictions TEXT[],
  jump_heights TEXT[],
  age_min INTEGER,
  age_max INTEGER,
  height_min DECIMAL(5,2),
  height_max DECIMAL(5,2),
  handler_age_min INTEGER,
  handler_age_max INTEGER,

  -- Scheduling
  start_time TIME,
  estimated_duration INTEGER,  -- minutes
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'no-status' CHECK (status IN (
    'no-status', 'check-in', 'in-progress', 'completed', 'cancelled'
  )),

  -- myK9Q: Scoring configuration
  time_limit_seconds INTEGER,
  num_hides INTEGER DEFAULT 1,
  num_areas INTEGER DEFAULT 1,
  has_blank BOOLEAN DEFAULT FALSE,
  max_faults INTEGER,
  qualifying_threshold DECIMAL(5,2),

  -- myK9Q: Scoring state
  is_scoring_finalized BOOLEAN DEFAULT FALSE,
  results_released_at TIMESTAMPTZ,

  -- myK9Q: Check-in and ordering
  dogs_ahead_notification_count INTEGER DEFAULT 5,
  total_entries_count INTEGER DEFAULT 0,
  checked_in_count INTEGER DEFAULT 0,
  scored_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS classes_trial_id_idx ON classes(trial_id);
CREATE INDEX IF NOT EXISTS classes_level_idx ON classes(level);
CREATE INDEX IF NOT EXISTS classes_element_idx ON classes(element);
CREATE INDEX IF NOT EXISTS classes_status_idx ON classes(status);
CREATE INDEX IF NOT EXISTS classes_competition_type_idx ON classes(competition_type);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE TRIGGER update_shows_updated_at
  BEFORE UPDATE ON shows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trials_updated_at
  BEFORE UPDATE ON trials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 002: Shows and events created successfully' as status;
