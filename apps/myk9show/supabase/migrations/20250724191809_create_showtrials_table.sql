-- Create show_trials table (depends on shows)
CREATE TABLE IF NOT EXISTS show_trials (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  trial_number TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'published', 'in_progress', 'completed', 'cancelled')),
  max_entries_per_dog INTEGER,
  max_total_entries INTEGER,
  max_entries_per_handler INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS show_trials_show_id_idx ON show_trials(show_id);
CREATE INDEX IF NOT EXISTS show_trials_date_idx ON show_trials(date);

-- Enable RLS
ALTER TABLE show_trials ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view show_trials"
    ON show_trials
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test trials (using shows from previous migration)
INSERT INTO show_trials (show_id, name, date, trial_number, status, max_total_entries) 
SELECT 
  s.id, 'Agility Trial 1', s.start_date, 'T001', 'planned', 100
FROM shows s WHERE s.name = 'Spring Specialty Show 2025'
UNION ALL
SELECT 
  s.id, 'Agility Trial 2', s.start_date + INTERVAL '1 day', 'T002', 'planned', 100
FROM shows s WHERE s.name = 'Spring Specialty Show 2025'
UNION ALL
SELECT 
  s.id, 'Conformation Trial', s.start_date, 'C001', 'planned', 150
FROM shows s WHERE s.name = 'Bay Area All-Breed Show'
ON CONFLICT DO NOTHING;