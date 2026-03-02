-- Migration 042: Manual Results for Title Tracking
-- Sprint 3: Exhibitors can enter historical results from non-platform trials.
-- These count toward title progress identically to platform-scored results.

CREATE TABLE IF NOT EXISTS manual_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Organization & sport
  organization TEXT NOT NULL,
  sport_template_id UUID REFERENCES sport_templates(id),

  -- Show/trial info
  show_name TEXT NOT NULL,
  trial_date DATE NOT NULL,
  judge TEXT,
  location TEXT,

  -- Class details (element/level vocabulary from sport_class_rules)
  element TEXT NOT NULL,
  level TEXT NOT NULL,
  section TEXT,

  -- Result
  result_status TEXT NOT NULL DEFAULT 'qualified'
    CHECK (result_status IN ('qualified', 'nq', 'absent', 'excused', 'withdrawn')),

  -- Optional scoring details
  search_time_seconds NUMERIC,
  placement INTEGER CHECK (placement >= 0),
  points_earned INTEGER DEFAULT 0,

  -- Meta
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_manual_results_dog_id ON manual_results(dog_id);
CREATE INDEX idx_manual_results_owner_id ON manual_results(owner_id);
CREATE INDEX idx_manual_results_trial_date ON manual_results(trial_date DESC);
CREATE INDEX idx_manual_results_dog_element_level ON manual_results(dog_id, element, level);
CREATE INDEX idx_manual_results_result_status ON manual_results(result_status);

-- Reuse existing updated_at trigger function
CREATE TRIGGER manual_results_updated_at
  BEFORE UPDATE ON manual_results
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

-- RLS: owner-based CRUD
ALTER TABLE manual_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own manual results"
  ON manual_results FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own manual results"
  ON manual_results FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own manual results"
  ON manual_results FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own manual results"
  ON manual_results FOR DELETE
  USING (auth.uid() = owner_id);
