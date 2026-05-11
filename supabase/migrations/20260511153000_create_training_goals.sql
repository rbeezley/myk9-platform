CREATE TABLE IF NOT EXISTS training_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date DATE,
  sport_tag TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_goals_dog_id_idx ON training_goals(dog_id);
CREATE INDEX IF NOT EXISTS training_goals_owner_id_idx ON training_goals(owner_id);
CREATE INDEX IF NOT EXISTS training_goals_completed_at_idx ON training_goals(completed_at);

CREATE TRIGGER training_goals_updated_at
  BEFORE UPDATE ON training_goals
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

ALTER TABLE training_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training goals"
  ON training_goals FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own training goals"
  ON training_goals FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own training goals"
  ON training_goals FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own training goals"
  ON training_goals FOR DELETE
  USING (auth.uid() = owner_id);
