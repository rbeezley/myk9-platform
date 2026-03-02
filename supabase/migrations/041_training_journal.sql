-- Migration 041: Training Journal System
-- Sprint 2: Training journal entries + milestones tables

-- Training journal entries
CREATE TABLE IF NOT EXISTS training_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes INTEGER,
  location TEXT,
  sport_tag TEXT,
  assessment TEXT CHECK (assessment IN ('breakthrough', 'solid', 'needs_work', 'regression')),
  linked_result_id UUID, -- FK to entries for "trained this after NQ on 2/10"
  notes TEXT,
  goals TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Training milestones
CREATE TABLE IF NOT EXISTS training_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  linked_title_id UUID, -- FK to sport_titles for auto-generated milestones
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_training_journal_entries_dog_id ON training_journal_entries(dog_id);
CREATE INDEX idx_training_journal_entries_owner_id ON training_journal_entries(owner_id);
CREATE INDEX idx_training_journal_entries_date ON training_journal_entries(date DESC);
CREATE INDEX idx_training_journal_entries_sport_tag ON training_journal_entries(sport_tag);

CREATE INDEX idx_training_milestones_dog_id ON training_milestones(dog_id);
CREATE INDEX idx_training_milestones_owner_id ON training_milestones(owner_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_training_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_journal_entries_updated_at
  BEFORE UPDATE ON training_journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

CREATE TRIGGER training_milestones_updated_at
  BEFORE UPDATE ON training_milestones
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

-- RLS: owner can CRUD their own entries
ALTER TABLE training_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training entries"
  ON training_journal_entries FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own training entries"
  ON training_journal_entries FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own training entries"
  ON training_journal_entries FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own training entries"
  ON training_journal_entries FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can view own milestones"
  ON training_milestones FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own milestones"
  ON training_milestones FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own milestones"
  ON training_milestones FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own milestones"
  ON training_milestones FOR DELETE
  USING (auth.uid() = owner_id);
