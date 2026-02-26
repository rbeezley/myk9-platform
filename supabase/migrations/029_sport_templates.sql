-- =============================================================================
-- Migration 029: Sport Templates System
-- =============================================================================
-- Creates the multi-sport template system: sport_templates (identity),
-- sport_class_rules (element x level matrix), sport_titles (title definitions).
-- Adds sport_type column to trials table.
--
-- These tables replace the hardcoded TypeScript rules files with database-driven
-- configuration. The class creation wizard and scoresheets read from these tables
-- instead of akcScentWorkRules.ts, UKC scoresheet logic, etc.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. sport_templates: one row per sport
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sport_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization TEXT NOT NULL,
  sport_name TEXT NOT NULL,
  sport_code TEXT NOT NULL UNIQUE,
  elements TEXT[] NOT NULL,
  levels TEXT[] NOT NULL,
  section_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (section_mode IN ('none', 'novice-only', 'all-levels')),
  divisions TEXT[] DEFAULT '{}',
  operational_config JSONB DEFAULT '{}',
  export_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. sport_class_rules: element x level matrix
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sport_class_rules (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  sport_template_id UUID NOT NULL REFERENCES sport_templates(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  level TEXT,                          -- NULL for standalone classes (e.g. Detective)
  class_name TEXT NOT NULL,
  section TEXT,
  display_order INTEGER DEFAULT 0,
  max_time_seconds_fixed INTEGER,
  max_time_seconds_min INTEGER,
  max_time_seconds_max INTEGER,
  hide_count_fixed INTEGER,
  hide_count_min INTEGER,
  hide_count_max INTEGER,
  hides_known BOOLEAN DEFAULT TRUE,
  area_count INTEGER DEFAULT 1,
  has_blank BOOLEAN DEFAULT FALSE,
  distraction_count_min INTEGER DEFAULT 0,
  distraction_count_max INTEGER DEFAULT 0,
  timer_mode TEXT DEFAULT 'single'
    CHECK (timer_mode IN ('single', 'dual')),
  odors TEXT[] DEFAULT '{}',
  default_entry_fee DECIMAL(10,2),
  mrv_minutes DECIMAL(4,1),
  field_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sport_template_id, element, level, section)
);

-- ---------------------------------------------------------------------------
-- 3. sport_titles: title definitions (tracking engine is Phase 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sport_titles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  sport_template_id UUID NOT NULL REFERENCES sport_templates(id) ON DELETE CASCADE,
  abbreviation TEXT NOT NULL,
  full_name TEXT NOT NULL,
  title_type TEXT NOT NULL
    CHECK (title_type IN ('element', 'level', 'elite', 'champion', 'grand_champion', 'continuation')),
  required_legs INTEGER NOT NULL,
  required_elements TEXT[] DEFAULT '{}',
  prerequisite_title_id UUID REFERENCES sport_titles(id),
  supersedes_title_ids UUID[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sport_template_id, abbreviation)
);

-- ---------------------------------------------------------------------------
-- 4. Add sport_type to trials
-- ---------------------------------------------------------------------------
ALTER TABLE trials ADD COLUMN IF NOT EXISTS sport_type TEXT DEFAULT 'akc-scent-work';
CREATE INDEX IF NOT EXISTS trials_sport_type_idx ON trials(sport_type);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sport_class_rules_template_idx
  ON sport_class_rules(sport_template_id);
CREATE INDEX IF NOT EXISTS sport_class_rules_element_level_idx
  ON sport_class_rules(sport_template_id, element, level);
CREATE INDEX IF NOT EXISTS sport_titles_template_idx
  ON sport_titles(sport_template_id);

-- ---------------------------------------------------------------------------
-- 6. RLS — reference data: public read, admin-only write
-- ---------------------------------------------------------------------------
ALTER TABLE sport_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_class_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_titles ENABLE ROW LEVEL SECURITY;

-- Anyone can read sport templates (including anon for public pages)
CREATE POLICY "sport_templates_select" ON sport_templates
  FOR SELECT USING (true);
CREATE POLICY "sport_class_rules_select" ON sport_class_rules
  FOR SELECT USING (true);
CREATE POLICY "sport_titles_select" ON sport_titles
  FOR SELECT USING (true);

-- Only platform admins can modify sport templates
CREATE POLICY "sport_templates_modify" ON sport_templates
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
CREATE POLICY "sport_class_rules_modify" ON sport_class_rules
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
CREATE POLICY "sport_titles_modify" ON sport_titles
  FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
