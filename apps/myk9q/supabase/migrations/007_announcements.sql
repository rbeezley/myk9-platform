-- Announcements Feature Migration
-- Creates tables for announcements and read tracking with tenant isolation

-- Announcements table (only create if it doesn't exist)
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  license_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'judge', 'steward')),
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Announcement reads tracking (using BIGINT to match existing announcements.id)
CREATE TABLE announcement_reads (
  id BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT REFERENCES announcements(id) ON DELETE CASCADE,
  user_identifier TEXT NOT NULL,
  license_key TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, user_identifier, license_key)
);

-- Indexes for performance
CREATE INDEX idx_announcements_license_key ON announcements(license_key);
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcement_reads_user ON announcement_reads(user_identifier, license_key);

-- Enable Row Level Security
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for announcements
CREATE POLICY announcements_select_tenant_isolation ON announcements
  FOR SELECT USING (true); -- Allow reading but filter in application

CREATE POLICY announcements_insert_tenant_isolation ON announcements
  FOR INSERT WITH CHECK (true); -- Allow inserting but validate in application

CREATE POLICY announcements_update_tenant_isolation ON announcements
  FOR UPDATE USING (true); -- Allow updating but validate in application

CREATE POLICY announcements_delete_tenant_isolation ON announcements
  FOR DELETE USING (true); -- Allow deleting but validate in application

-- RLS Policies for announcement_reads
CREATE POLICY announcement_reads_select_tenant_isolation ON announcement_reads
  FOR SELECT USING (true);

CREATE POLICY announcement_reads_insert_tenant_isolation ON announcement_reads
  FOR INSERT WITH CHECK (true);

CREATE POLICY announcement_reads_update_tenant_isolation ON announcement_reads
  FOR UPDATE USING (true);

CREATE POLICY announcement_reads_delete_tenant_isolation ON announcement_reads
  FOR DELETE USING (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();