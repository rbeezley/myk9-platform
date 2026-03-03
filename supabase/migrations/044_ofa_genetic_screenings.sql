-- Migration 044: OFA/Health Screenings & Genetic Screenings
-- Phase 2: Premium exhibitor health record sub-features.
-- OFA = orthopedic/health certifications (hips, elbows, etc.)
-- Genetic = DNA test results from providers like Embark, Wisdom Panel.

-- =============================================
-- OFA SCREENINGS
-- =============================================

CREATE TABLE IF NOT EXISTS ofa_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  test_type TEXT NOT NULL
    CHECK (test_type IN ('hips', 'elbows', 'eyes', 'heart', 'patella', 'thyroid')),
  test_date DATE NOT NULL,
  result TEXT,                   -- e.g. "Good", "Excellent", "Fair"
  certification_number TEXT,     -- e.g. "OFA-123456"
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('normal', 'carrier', 'affected', 'pending')),
  veterinarian TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ofa_screenings_dog_id ON ofa_screenings(dog_id);
CREATE INDEX idx_ofa_screenings_owner_id ON ofa_screenings(owner_id);

CREATE TRIGGER ofa_screenings_updated_at
  BEFORE UPDATE ON ofa_screenings
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

ALTER TABLE ofa_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OFA screenings"
  ON ofa_screenings FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own OFA screenings"
  ON ofa_screenings FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own OFA screenings"
  ON ofa_screenings FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own OFA screenings"
  ON ofa_screenings FOR DELETE
  USING (auth.uid() = owner_id);

-- =============================================
-- GENETIC SCREENINGS
-- =============================================

CREATE TABLE IF NOT EXISTS genetic_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider TEXT NOT NULL,        -- Embark, Wisdom Panel, Paw Print Genetics, etc.
  test_date DATE NOT NULL,
  -- Unified array of marker results and breed-specific markers:
  -- [{marker: "DM", result: "Clear", status: "clear"}, ...]
  results JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_genetic_screenings_dog_id ON genetic_screenings(dog_id);
CREATE INDEX idx_genetic_screenings_owner_id ON genetic_screenings(owner_id);

CREATE TRIGGER genetic_screenings_updated_at
  BEFORE UPDATE ON genetic_screenings
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

ALTER TABLE genetic_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own genetic screenings"
  ON genetic_screenings FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own genetic screenings"
  ON genetic_screenings FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own genetic screenings"
  ON genetic_screenings FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own genetic screenings"
  ON genetic_screenings FOR DELETE
  USING (auth.uid() = owner_id);
