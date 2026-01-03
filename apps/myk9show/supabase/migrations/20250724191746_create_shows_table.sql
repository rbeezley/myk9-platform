-- Create shows table (depends on clubs)
CREATE TABLE IF NOT EXISTS shows (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  location TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'accepting_entries', 'closed', 'completed', 'cancelled')),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  entry_open_date DATE,
  entry_close_date DATE,
  pre_entry_fee DECIMAL(10,2),
  day_of_show_fee DECIMAL(10,2),
  chairman TEXT,
  secretary TEXT,
  chief_steward TEXT,
  max_entries_per_dog INTEGER,
  max_total_entries INTEGER,
  allow_non_owner_handlers BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS shows_club_id_idx ON shows(club_id);
CREATE INDEX IF NOT EXISTS shows_start_date_idx ON shows(start_date);
CREATE INDEX IF NOT EXISTS shows_status_idx ON shows(status);

-- Enable RLS
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view shows"
    ON shows
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test shows (using clubs from first migration)
INSERT INTO shows (name, type, start_date, end_date, location, status, club_id, entry_open_date, entry_close_date, pre_entry_fee, chairman, secretary) 
SELECT 
  'Spring Specialty Show 2025', 'Specialty', '2025-05-15'::DATE, '2025-05-16'::DATE, 'Golden Gate Park, San Francisco', 'accepting_entries', 
  c.id, '2025-03-01'::DATE, '2025-05-01'::DATE, 45.00, 'Susan Miller', 'Bob Johnson'
FROM clubs c WHERE c.name = 'Golden State Dog Club'
UNION ALL
SELECT 
  'Bay Area All-Breed Show', 'All-Breed', '2025-06-20'::DATE, '2025-06-22'::DATE, 'Alameda County Fairgrounds', 'draft',
  c.id, '2025-04-01'::DATE, '2025-06-10'::DATE, 35.00, 'Linda Davis', 'Mike Wilson'
FROM clubs c WHERE c.name = 'Bay Area Kennel Club'
ON CONFLICT DO NOTHING;