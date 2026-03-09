-- Migration 053: Club Members & Officers tables
-- Supports club management as a product vertical with organizational roles

-- Club membership roster
CREATE TABLE IF NOT EXISTS club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL DEFAULT 'full'
    CHECK (membership_type IN ('full', 'associate', 'junior', 'honorary')),
  membership_status TEXT NOT NULL DEFAULT 'active'
    CHECK (membership_status IN ('active', 'lapsed', 'suspended', 'resigned')),
  joined_date DATE DEFAULT CURRENT_DATE,
  dues_paid_through DATE,
  voting_eligible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, person_id)
);

-- Club officers / governance positions
CREATE TABLE IF NOT EXISTS club_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  position TEXT NOT NULL
    CHECK (position IN ('president', 'vice_president', 'secretary', 'treasurer', 'board_member')),
  term_start DATE,
  term_end DATE,
  elected_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A person can only hold one instance of a position at a club at a time
  UNIQUE(club_id, person_id, position)
);

-- Indexes
CREATE INDEX idx_club_members_club ON club_members(club_id);
CREATE INDEX idx_club_members_person ON club_members(person_id);
CREATE INDEX idx_club_members_status ON club_members(club_id, membership_status);
CREATE INDEX idx_club_officers_club ON club_officers(club_id);
CREATE INDEX idx_club_officers_person ON club_officers(person_id);

-- RLS
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_officers ENABLE ROW LEVEL SECURITY;

-- Club members: club admins and site admins can manage; members can read their own club
CREATE POLICY club_members_select ON club_members FOR SELECT USING (
  is_club_admin(club_id) OR is_platform_admin()
  OR person_id = auth.uid()
);

CREATE POLICY club_members_insert ON club_members FOR INSERT WITH CHECK (
  is_club_admin(club_id) OR is_platform_admin()
);

CREATE POLICY club_members_update ON club_members FOR UPDATE USING (
  is_club_admin(club_id) OR is_platform_admin()
);

CREATE POLICY club_members_delete ON club_members FOR DELETE USING (
  is_club_admin(club_id) OR is_platform_admin()
);

-- Club officers: same pattern
CREATE POLICY club_officers_select ON club_officers FOR SELECT USING (
  is_club_admin(club_id) OR is_platform_admin()
  OR person_id = auth.uid()
);

CREATE POLICY club_officers_insert ON club_officers FOR INSERT WITH CHECK (
  is_club_admin(club_id) OR is_platform_admin()
);

CREATE POLICY club_officers_update ON club_officers FOR UPDATE USING (
  is_club_admin(club_id) OR is_platform_admin()
);

CREATE POLICY club_officers_delete ON club_officers FOR DELETE USING (
  is_club_admin(club_id) OR is_platform_admin()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_club_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER club_members_updated_at
  BEFORE UPDATE ON club_members
  FOR EACH ROW EXECUTE FUNCTION update_club_members_updated_at();

CREATE TRIGGER club_officers_updated_at
  BEFORE UPDATE ON club_officers
  FOR EACH ROW EXECUTE FUNCTION update_club_members_updated_at();
