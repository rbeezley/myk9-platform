-- Migration 054: Registrations table for confirmation number persistence
-- One registration per person per show, with auto-generated MK9-XXXXXX confirmation numbers

-- ==========================================================================
-- REGISTRATIONS TABLE
-- ==========================================================================

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_number TEXT UNIQUE NOT NULL,
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  handler_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'paid', 'refunded', 'waived'
  )),
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One registration per person per show
CREATE UNIQUE INDEX idx_registrations_show_handler ON registrations(show_id, handler_id);

-- ==========================================================================
-- CONFIRMATION NUMBER SEQUENCE + TRIGGER
-- ==========================================================================

CREATE SEQUENCE registration_confirmation_seq START 1;

CREATE OR REPLACE FUNCTION generate_confirmation_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.confirmation_number := 'MK9-' || LPAD(nextval('registration_confirmation_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_confirmation_number
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION generate_confirmation_number();

-- ==========================================================================
-- ADD registration_id FK TO ENTRIES
-- ==========================================================================

ALTER TABLE entries ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES registrations(id);
CREATE INDEX IF NOT EXISTS idx_entries_registration_id ON entries(registration_id);

-- ==========================================================================
-- RLS POLICIES
-- ==========================================================================

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Handlers can read their own registrations
CREATE POLICY registrations_select_own ON registrations
  FOR SELECT USING (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Handlers can insert their own registrations
CREATE POLICY registrations_insert_own ON registrations
  FOR INSERT WITH CHECK (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Handlers can update their own registrations
CREATE POLICY registrations_update_own ON registrations
  FOR UPDATE USING (
    handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );

-- Platform admins can read all registrations
CREATE POLICY registrations_select_admin ON registrations
  FOR SELECT USING (is_platform_admin());

-- Platform admins can insert any registration
CREATE POLICY registrations_insert_admin ON registrations
  FOR INSERT WITH CHECK (is_platform_admin());

-- Platform admins can update any registration
CREATE POLICY registrations_update_admin ON registrations
  FOR UPDATE USING (is_platform_admin());

-- ==========================================================================
-- UPDATED_AT TRIGGER
-- ==========================================================================

CREATE TRIGGER set_registrations_updated_at
  BEFORE UPDATE ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
