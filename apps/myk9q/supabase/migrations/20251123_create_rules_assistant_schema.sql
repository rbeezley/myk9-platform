-- =====================================================
-- Rules Assistant - Multi-Sport Database Schema
-- Created: 2025-11-23
-- Purpose: AI-powered rules lookup for AKC Scent Work (Phase 1)
--          Designed for multi-organization, multi-sport expansion
-- =====================================================

-- =====================================================
-- Organizations Table
-- =====================================================
CREATE TABLE rule_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,      -- 'AKC', 'UKC', 'NACSW', 'CKC'
  name TEXT NOT NULL,                     -- 'American Kennel Club'
  website TEXT,
  logo_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed organizations (AKC active for Phase 1, others for future)
INSERT INTO rule_organizations (code, name, website, active) VALUES
  ('AKC', 'American Kennel Club', 'https://www.akc.org', true),
  ('UKC', 'United Kennel Club', 'https://www.ukcdogs.com', false),
  ('NACSW', 'National Association of Canine Scent Work', 'https://www.nacsw.net', false),
  ('CKC', 'Canadian Kennel Club', 'https://www.ckc.ca', false);

-- =====================================================
-- Sports/Disciplines Table
-- =====================================================
CREATE TABLE rule_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,      -- 'scent-work', 'nosework', 'obedience'
  name TEXT NOT NULL,                     -- 'Scent Work', 'Nosework'
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed sports (Scent Work active for Phase 1, others for future)
INSERT INTO rule_sports (code, name, description, active) VALUES
  ('scent-work', 'Scent Work', 'AKC Scent Work detection sport', true),
  ('nosework', 'Nosework', 'UKC Nosework detection sport', false),
  ('obedience', 'Obedience', 'Obedience trials and competitions', false),
  ('rally', 'Rally', 'Rally obedience sport', false),
  ('conformation', 'Conformation', 'Breed conformation shows', false);

-- =====================================================
-- Rulebooks Table (Version Management)
-- =====================================================
CREATE TABLE rulebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES rule_organizations(id) ON DELETE CASCADE,
  sport_id UUID REFERENCES rule_sports(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,          -- '2024', 'January 2025'
  effective_date DATE,
  pdf_url TEXT,                          -- Original PDF in Supabase Storage
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, sport_id, version)
);

-- Seed AKC Scent Work rulebook (Phase 1)
INSERT INTO rulebooks (organization_id, sport_id, version, effective_date, active)
SELECT
  (SELECT id FROM rule_organizations WHERE code = 'AKC'),
  (SELECT id FROM rule_sports WHERE code = 'scent-work'),
  '2024',
  '2024-01-01',
  true;

-- =====================================================
-- Rules Table (Flexible Multi-Sport Design)
-- =====================================================
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rulebook_id UUID REFERENCES rulebooks(id) ON DELETE CASCADE,

  -- Rule identification
  section VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Sport-specific categorization (JSONB for flexibility)
  -- Different sports have different category structures:
  -- AKC Scent Work: {"level": "Advanced", "element": "Exterior"}
  -- UKC Nosework:   {"level": "Level 2", "element": "Vehicle"}
  -- Obedience:      {"level": "Novice", "exercise": "Heel on Leash"}
  -- Conformation:   {"breed_group": "Sporting", "section": "General Appearance"}
  categories JSONB,

  -- Search optimization
  keywords TEXT[],             -- Pre-defined keywords for better matching
  measurements JSONB,          -- Structured data (e.g., {"min_area_sq_ft": 800})

  -- Full-text search vector (populated by trigger)
  search_vector tsvector,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================
CREATE INDEX idx_rules_rulebook ON rules(rulebook_id);
CREATE INDEX idx_rules_search_vector ON rules USING GIN(search_vector);
CREATE INDEX idx_rules_categories ON rules USING GIN(categories);
CREATE INDEX idx_rulebooks_org_sport ON rulebooks(organization_id, sport_id);
CREATE INDEX idx_rulebooks_active ON rulebooks(active) WHERE active = true;

-- =====================================================
-- Trigger Function: Update Search Vector
-- =====================================================
CREATE OR REPLACE FUNCTION update_rules_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.keywords, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_search_vector
  BEFORE INSERT OR UPDATE ON rules
  FOR EACH ROW
  EXECUTE FUNCTION update_rules_search_vector();

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================
ALTER TABLE rule_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

-- Public read access (rules are public information)
CREATE POLICY "Organizations are public" ON rule_organizations FOR SELECT USING (true);
CREATE POLICY "Sports are public" ON rule_sports FOR SELECT USING (true);
CREATE POLICY "Rulebooks are public" ON rulebooks FOR SELECT USING (true);
CREATE POLICY "Rules are public" ON rules FOR SELECT USING (true);

-- =====================================================
-- Helper Function: Update Timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rules_timestamp
  BEFORE UPDATE ON rules
  FOR EACH ROW
  EXECUTE FUNCTION update_rules_updated_at();

CREATE TRIGGER trigger_update_rulebooks_timestamp
  BEFORE UPDATE ON rulebooks
  FOR EACH ROW
  EXECUTE FUNCTION update_rules_updated_at();

-- =====================================================
-- Sample Test Data (5 rules for Phase 1 testing)
-- =====================================================
DO $$
DECLARE
  rulebook_uuid UUID;
BEGIN
  -- Get the AKC Scent Work 2024 rulebook ID
  SELECT rb.id INTO rulebook_uuid
  FROM rulebooks rb
  JOIN rule_organizations org ON rb.organization_id = org.id
  JOIN rule_sports sport ON rb.sport_id = sport.id
  WHERE org.code = 'AKC' AND sport.code = 'scent-work' AND rb.version = '2024';

  -- Sample Rule 1: Novice Interior Area Size
  INSERT INTO rules (rulebook_id, section, title, content, categories, keywords, measurements) VALUES (
    rulebook_uuid,
    '2.3.1',
    'Novice Interior Search Area Size',
    'The search area for Novice Interior shall be a minimum of 120 square feet and a maximum of 600 square feet. The area may be divided into multiple rooms or spaces.',
    '{"level": "Novice", "element": "Interior", "category": "Search Area"}'::JSONB,
    ARRAY['area size', 'dimensions', 'square feet', 'novice', 'interior', 'search area', 'minimum', 'maximum'],
    '{"min_area_sq_ft": 120, "max_area_sq_ft": 600, "can_divide_rooms": true}'::JSONB
  );

  -- Sample Rule 2: Advanced Exterior Area Size
  INSERT INTO rules (rulebook_id, section, title, content, categories, keywords, measurements) VALUES (
    rulebook_uuid,
    '3.4.2',
    'Advanced Exterior Search Area Size',
    'The search area for Advanced Exterior shall be a minimum of 800 square feet and a maximum of 2000 square feet. The area must include natural terrain and may include up to 3 inaccessible hides.',
    '{"level": "Advanced", "element": "Exterior", "category": "Search Area"}'::JSONB,
    ARRAY['area size', 'exterior', 'advanced', 'terrain', 'inaccessible hides', 'square feet', 'natural'],
    '{"min_area_sq_ft": 800, "max_area_sq_ft": 2000, "terrain": "natural", "max_inaccessible_hides": 3}'::JSONB
  );

  -- Sample Rule 3: Novice Container Hides
  INSERT INTO rules (rulebook_id, section, title, content, categories, keywords, measurements) VALUES (
    rulebook_uuid,
    '2.5.1',
    'Novice Container Number of Hides',
    'Novice Container shall have a minimum of 1 hide and a maximum of 3 hides. The judge will announce the number of hides prior to the start of the search.',
    '{"level": "Novice", "element": "Container", "category": "Hides"}'::JSONB,
    ARRAY['hides', 'number', 'container', 'novice', 'judge', 'announcement'],
    '{"min_hides": 1, "max_hides": 3, "judge_announces": true}'::JSONB
  );

  -- Sample Rule 4: Excellent Interior Time Limit
  INSERT INTO rules (rulebook_id, section, title, content, categories, keywords, measurements) VALUES (
    rulebook_uuid,
    '4.2.3',
    'Excellent Interior Time Limit',
    'The time limit for Excellent Interior shall be 3 minutes. A 30-second warning will be given. The handler must exit the search area when time expires or risk elimination.',
    '{"level": "Excellent", "element": "Interior", "category": "Time Limit"}'::JSONB,
    ARRAY['time limit', 'excellent', 'interior', '3 minutes', 'warning', '30 seconds', 'elimination'],
    '{"time_limit_minutes": 3, "warning_seconds": 30, "must_exit": true}'::JSONB
  );

  -- Sample Rule 5: Master Buried Leash Requirements
  INSERT INTO rules (rulebook_id, section, title, content, categories, keywords, measurements) VALUES (
    rulebook_uuid,
    '5.6.1',
    'Master Buried Leash Requirements',
    'In Master Buried, dogs may be worked on or off leash at the handler''s discretion. If on leash, it must be a standard 6-foot leash. Retractable leashes are not permitted.',
    '{"level": "Master", "element": "Buried", "category": "Equipment"}'::JSONB,
    ARRAY['leash', 'master', 'buried', 'on leash', 'off leash', '6 foot', 'retractable', 'equipment'],
    '{"leash_optional": true, "max_leash_length_feet": 6, "retractable_allowed": false}'::JSONB
  );

END$$;

-- =====================================================
-- Verification Query (commented out for migration)
-- =====================================================
-- SELECT
--   org.name as organization,
--   sport.name as sport,
--   rb.version,
--   COUNT(r.id) as rule_count
-- FROM rulebooks rb
-- JOIN rule_organizations org ON rb.organization_id = org.id
-- JOIN rule_sports sport ON rb.sport_id = sport.id
-- LEFT JOIN rules r ON rb.id = r.rulebook_id
-- GROUP BY org.name, sport.name, rb.version;
