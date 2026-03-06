-- Judge availability preferences for show matching
CREATE TABLE IF NOT EXISTS judge_availability (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  -- Date range the judge is generally available
  start_date DATE,
  end_date DATE,

  -- Capacity
  max_shows_per_month INTEGER DEFAULT 4 CHECK (max_shows_per_month BETWEEN 1 AND 30),

  -- Travel
  travel_radius_miles INTEGER DEFAULT 100 CHECK (travel_radius_miles >= 0),

  -- Overall status
  availability_status TEXT DEFAULT 'available'
    CHECK (availability_status IN ('available', 'busy', 'unavailable')),

  -- Blackout dates stored as array (simple, no need for separate table yet)
  blackout_dates DATE[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One availability record per judge
  CONSTRAINT judge_availability_person_unique UNIQUE (person_id)
);

CREATE INDEX IF NOT EXISTS judge_availability_person_id_idx
  ON judge_availability(person_id);
CREATE INDEX IF NOT EXISTS judge_availability_status_idx
  ON judge_availability(availability_status);
CREATE INDEX IF NOT EXISTS judge_availability_dates_idx
  ON judge_availability(start_date, end_date);

-- Updated_at trigger
CREATE TRIGGER update_judge_availability_updated_at
  BEFORE UPDATE ON judge_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE judge_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_availability FORCE ROW LEVEL SECURITY;

-- Judges can read/write their own availability
CREATE POLICY "Users can view own availability"
  ON judge_availability FOR SELECT
  USING (person_id IN (
    SELECT id FROM people WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own availability"
  ON judge_availability FOR ALL
  USING (person_id IN (
    SELECT id FROM people WHERE auth_user_id = auth.uid()
  ));

-- Show secretaries/admins can view all judge availability (for matching)
CREATE POLICY "Secretaries can view all availability"
  ON judge_availability FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM people
    WHERE auth_user_id = auth.uid()
    AND ('secretary' = ANY(roles) OR 'admin' = ANY(roles))
  ));

-- Platform admins can manage all availability
CREATE POLICY "Admins can manage all availability"
  ON judge_availability FOR ALL
  USING (is_platform_admin());
