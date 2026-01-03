-- Create classes table (depends on show_trials)
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  trial_id UUID REFERENCES show_trials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  entry_fee DECIMAL(10,2),
  jump_heights TEXT[],
  max_entries INTEGER,
  allow_waitlist BOOLEAN DEFAULT FALSE,
  max_dogs_per_handler INTEGER,
  level TEXT,
  breed_restrictions TEXT[],
  age_min INTEGER,
  age_max INTEGER,
  height_min DECIMAL(5,2),
  height_max DECIMAL(5,2),
  handler_age_min INTEGER,
  handler_age_max INTEGER,
  start_time TIME,
  estimated_duration INTEGER, -- in minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS classes_trial_id_idx ON classes(trial_id);
CREATE INDEX IF NOT EXISTS classes_level_idx ON classes(level);

-- Enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view classes"
    ON classes
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test classes (using trials from previous migration)
INSERT INTO classes (trial_id, name, description, entry_fee, level, max_entries, start_time, estimated_duration) 
SELECT 
  st.id, 'Novice Standard', 'Novice level standard agility course', 25.00, 'Novice', 30, '08:00'::TIME, 90
FROM show_trials st WHERE st.name = 'Agility Trial 1'
UNION ALL
SELECT 
  st.id, 'Open Standard', 'Open level standard agility course', 30.00, 'Open', 25, '10:00'::TIME, 120
FROM show_trials st WHERE st.name = 'Agility Trial 1'
UNION ALL
SELECT 
  st.id, 'Excellent Standard', 'Excellent level standard agility course', 35.00, 'Excellent', 20, '13:00'::TIME, 150
FROM show_trials st WHERE st.name = 'Agility Trial 2'
ON CONFLICT DO NOTHING;