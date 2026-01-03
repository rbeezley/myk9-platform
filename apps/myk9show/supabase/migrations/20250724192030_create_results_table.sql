-- Create results table (depends on entries)
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  
  -- Competition timing
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  
  -- Performance data
  score TEXT,
  time_seconds DECIMAL(8,3), -- For precise timing (e.g., agility)
  placement TEXT,
  faults INTEGER DEFAULT 0,
  
  -- Qualification status
  qualified BOOLEAN,
  qualification TEXT, -- Qualified, Not Qualified, Absent, Excused, etc.
  qualification_reason TEXT, -- Reason for NQ, Excused, or Withdrawn
  
  -- Judging information
  judge_notes TEXT,
  recorded_by TEXT NOT NULL, -- Judge/steward who recorded result
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS results_entry_id_idx ON results(entry_id);
CREATE INDEX IF NOT EXISTS results_placement_idx ON results(placement);
CREATE INDEX IF NOT EXISTS results_qualified_idx ON results(qualified);
CREATE INDEX IF NOT EXISTS results_recorded_by_idx ON results(recorded_by);

-- Create unique constraint - one result per entry
CREATE UNIQUE INDEX IF NOT EXISTS results_entry_unique_idx ON results(entry_id);

-- Enable RLS
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view results"
    ON results
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test results (using entries from previous migration)
INSERT INTO results (entry_id, score, time_seconds, placement, qualified, qualification, recorded_by, judge_notes) 
SELECT 
  e.id, '95', 45.23, '1st', true, 'Qualified', 'Judge Mary Wilson', 'Excellent run, very smooth'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
JOIN classes c ON e.class_id = c.id
WHERE d.name = 'Champion Goldenworth Max' 
  AND c.name = 'Novice Standard'
UNION ALL
SELECT 
  e.id, '87', 52.18, '3rd', true, 'Qualified', 'Judge Mary Wilson', 'Good run, minor handling error'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
JOIN classes c ON e.class_id = c.id
WHERE d.name = 'Bella of the Valley' 
  AND c.name = 'Open Standard'
ON CONFLICT DO NOTHING;