-- Create entry_status_history table (depends on entries)
CREATE TABLE IF NOT EXISTS entry_status_history (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  
  -- Status change details
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'paid', 'confirmed', 'scheduled', 'competing', 'completed', 'withdrawn', 'scratched')),
  previous_status TEXT CHECK (previous_status IN ('draft', 'submitted', 'paid', 'confirmed', 'scheduled', 'competing', 'completed', 'withdrawn', 'scratched')),
  
  -- Change metadata
  changed_by TEXT NOT NULL, -- User who made the change
  reason TEXT, -- Optional reason for the change
  
  -- Timestamps
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS entry_status_history_entry_id_idx ON entry_status_history(entry_id);
CREATE INDEX IF NOT EXISTS entry_status_history_status_idx ON entry_status_history(status);
CREATE INDEX IF NOT EXISTS entry_status_history_changed_at_idx ON entry_status_history(changed_at);
CREATE INDEX IF NOT EXISTS entry_status_history_changed_by_idx ON entry_status_history(changed_by);

-- Enable RLS
ALTER TABLE entry_status_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view entry status history"
    ON entry_status_history
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test status history (using entries from previous migration)
INSERT INTO entry_status_history (entry_id, status, previous_status, changed_by, reason) 
SELECT 
  e.id, 'draft', NULL, 'System', 'Entry created'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  e.id, 'submitted', 'draft', 'John Smith', 'Entry submitted by owner'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  e.id, 'paid', 'submitted', 'System', 'Payment confirmed'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  e.id, 'confirmed', 'paid', 'Secretary', 'Entry accepted by show secretary'
FROM entries e
JOIN dogs d ON e.dog_id = d.id
WHERE d.name = 'Champion Goldenworth Max'
ON CONFLICT DO NOTHING;