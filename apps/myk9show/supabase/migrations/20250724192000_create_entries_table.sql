-- Create entries table (depends on dogs, classes)
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  
  -- Entry status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'paid', 'confirmed', 'scheduled', 'competing', 'completed', 'withdrawn', 'scratched')),
  
  -- Registration data
  submitted_at TIMESTAMPTZ,
  handler TEXT,
  handler_id UUID REFERENCES people(id),
  entry_fee DECIMAL(10,2),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  special_requests TEXT,
  armband TEXT,
  run_order INTEGER,
  jump_height TEXT,
  preferred_judge TEXT,
  move_up_requested BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS entries_dog_id_idx ON entries(dog_id);
CREATE INDEX IF NOT EXISTS entries_class_id_idx ON entries(class_id);
CREATE INDEX IF NOT EXISTS entries_show_id_idx ON entries(show_id);
CREATE INDEX IF NOT EXISTS entries_status_idx ON entries(status);
CREATE INDEX IF NOT EXISTS entries_payment_status_idx ON entries(payment_status);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS entries_dog_class_unique_idx ON entries(dog_id, class_id) WHERE status NOT IN ('withdrawn', 'scratched');

-- Enable RLS
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view entries"
    ON entries
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test entries (using dogs and classes from previous migrations)
INSERT INTO entries (dog_id, class_id, show_id, status, handler, entry_fee, payment_status, armband, run_order) 
SELECT 
  d.id, c.id, s.id, 'confirmed', 'John Smith', 25.00, 'paid', 'A001', 1
FROM dogs d, classes c, shows s
WHERE d.name = 'Champion Goldenworth Max' 
  AND c.name = 'Novice Standard'
  AND s.name = 'Spring Specialty Show 2025'
UNION ALL
SELECT 
  d.id, c.id, s.id, 'confirmed', 'Jane Doe', 30.00, 'paid', 'A002', 2
FROM dogs d, classes c, shows s
WHERE d.name = 'Bella of the Valley' 
  AND c.name = 'Open Standard'
  AND s.name = 'Spring Specialty Show 2025'
ON CONFLICT DO NOTHING;