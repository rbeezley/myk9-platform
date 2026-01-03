-- Create volunteer scheduling tables for Trial Secretary steward management
-- These tables store volunteers, roles, and assignments for show scheduling
-- All data is isolated by license_key for multi-tenancy
-- Uses TEXT IDs for compatibility with client-generated identifiers

-- ============================================
-- VOLUNTEER ROLES TABLE
-- ============================================
-- Custom roles per show (Gate Steward, Timer, Ring Steward, etc.)
-- ID is a semantic slug like 'gate-steward', 'timer', etc.

CREATE TABLE IF NOT EXISTS volunteer_roles (
  id TEXT NOT NULL,
  license_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_ring_role BOOLEAN NOT NULL DEFAULT true,  -- true = per-class, false = general duty
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (license_key, id),
  UNIQUE(license_key, name)
);

-- ============================================
-- VOLUNTEERS TABLE
-- ============================================
-- People who can be assigned to roles
-- ID is client-generated (timestamp + random string)

CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  is_exhibitor BOOLEAN NOT NULL DEFAULT false,
  exhibitor_id BIGINT,  -- References entries table (no FK for flexibility)
  entered_class_ids BIGINT[] DEFAULT '{}',  -- Classes they're entered in (conflict detection)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLASS ASSIGNMENTS TABLE
-- ============================================
-- Per-class role assignments (Gate Steward for Class 1, etc.)
-- Maps volunteers to specific classes and roles

CREATE TABLE IF NOT EXISTS volunteer_class_assignments (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  class_id BIGINT NOT NULL,  -- References classes table
  role_id TEXT NOT NULL,     -- References volunteer_roles.id
  volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate assignments
  UNIQUE(class_id, role_id, volunteer_id)
);

-- ============================================
-- GENERAL ASSIGNMENTS TABLE
-- ============================================
-- Non-class-specific role assignments (Hospitality, Equipment, etc.)

CREATE TABLE IF NOT EXISTS volunteer_general_assignments (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  role_id TEXT NOT NULL,     -- References volunteer_roles.id
  volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  description TEXT,          -- e.g., "Morning shift", "Setup before Trial 2"
  time_range TEXT,           -- e.g., "8:00 AM - 12:00 PM"
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate assignments to same role
  UNIQUE(role_id, volunteer_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_volunteer_roles_license_key
  ON volunteer_roles(license_key);

CREATE INDEX IF NOT EXISTS idx_volunteers_license_key
  ON volunteers(license_key);

CREATE INDEX IF NOT EXISTS idx_volunteer_class_assignments_license_key
  ON volunteer_class_assignments(license_key);

CREATE INDEX IF NOT EXISTS idx_volunteer_class_assignments_class_id
  ON volunteer_class_assignments(class_id);

CREATE INDEX IF NOT EXISTS idx_volunteer_general_assignments_license_key
  ON volunteer_general_assignments(license_key);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE volunteer_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_general_assignments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on volunteer_roles"
  ON volunteer_roles FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on volunteers"
  ON volunteers FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on volunteer_class_assignments"
  ON volunteer_class_assignments FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on volunteer_general_assignments"
  ON volunteer_general_assignments FOR ALL TO service_role USING (true);

-- Anon/authenticated users can manage their show's data
CREATE POLICY "Users can manage their show volunteer_roles"
  ON volunteer_roles FOR ALL TO anon, authenticated USING (true);

CREATE POLICY "Users can manage their show volunteers"
  ON volunteers FOR ALL TO anon, authenticated USING (true);

CREATE POLICY "Users can manage their show volunteer_class_assignments"
  ON volunteer_class_assignments FOR ALL TO anon, authenticated USING (true);

CREATE POLICY "Users can manage their show volunteer_general_assignments"
  ON volunteer_general_assignments FOR ALL TO anon, authenticated USING (true);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_volunteer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_volunteer_roles_updated_at
  BEFORE UPDATE ON volunteer_roles
  FOR EACH ROW EXECUTE FUNCTION update_volunteer_updated_at();

CREATE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION update_volunteer_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE volunteer_roles IS 'Custom volunteer roles per show (Gate Steward, Timer, Hospitality, etc.)';
COMMENT ON TABLE volunteers IS 'Volunteers available for scheduling at a show';
COMMENT ON TABLE volunteer_class_assignments IS 'Per-class volunteer assignments (e.g., Gate Steward for Class 5)';
COMMENT ON TABLE volunteer_general_assignments IS 'General duty assignments not tied to specific classes';
