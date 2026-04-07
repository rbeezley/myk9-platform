-- Fix organization_agreements: add created_at column and updated_at trigger
-- Migration 122 was pushed without these; this migration applies them to existing installs.

ALTER TABLE organization_agreements
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER set_organization_agreements_updated_at
  BEFORE UPDATE ON organization_agreements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
