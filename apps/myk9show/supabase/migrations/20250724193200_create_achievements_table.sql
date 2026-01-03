-- Create achievements table (depends on dogs)
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  
  -- Achievement details
  achievement_type TEXT NOT NULL, -- Title, Championship, etc.
  title TEXT NOT NULL, -- Full title name
  abbreviation TEXT, -- Short form (CH, GCH, etc.)
  
  -- Achievement metadata
  organization TEXT NOT NULL, -- AKC, UKC, etc.
  discipline TEXT, -- Conformation, Agility, Obedience
  level TEXT, -- Novice, Open, Excellent, etc.
  
  -- Earning details
  date_earned DATE NOT NULL,
  points INTEGER, -- Points earned (if applicable)
  location TEXT, -- Where it was earned
  judge_name TEXT, -- Judge who awarded it
  
  -- Certificate information
  certificate_number TEXT,
  certificate_url TEXT, -- Link to digital certificate
  
  -- Additional information
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE, -- Can be revoked
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create competitions table (historical competition records)
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE SET NULL, -- May reference external shows
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL, -- May not have class reference
  
  -- Competition details
  competition_name TEXT NOT NULL,
  competition_date DATE NOT NULL,
  location TEXT,
  
  -- Performance results
  placement TEXT, -- 1st, 2nd, 3rd, etc.
  score TEXT, -- Numeric or text score
  time_seconds DECIMAL(8,3), -- For timed events
  qualified BOOLEAN,
  points_earned INTEGER DEFAULT 0,
  
  -- Competition metadata
  organization TEXT, -- AKC, UKC, etc.
  discipline TEXT, -- Agility, Conformation, etc.
  level TEXT, -- Novice, Open, etc.
  judge_name TEXT,
  
  -- Additional information
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create past_results table (legacy results storage)
CREATE TABLE IF NOT EXISTS past_results (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE SET NULL,
  
  -- Show details
  show_name TEXT NOT NULL,
  show_date DATE NOT NULL,
  show_location TEXT,
  
  -- Class details
  class_name TEXT NOT NULL,
  class_level TEXT,
  
  -- Results
  placement TEXT,
  score TEXT,
  qualified BOOLEAN,
  
  -- Officials
  judge_name TEXT,
  
  -- Additional information
  notes TEXT,
  
  -- Data source tracking
  imported_from TEXT, -- Source of the data
  external_id TEXT, -- ID from external system
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS achievements_dog_id_idx ON achievements(dog_id);
CREATE INDEX IF NOT EXISTS achievements_organization_idx ON achievements(organization);
CREATE INDEX IF NOT EXISTS achievements_discipline_idx ON achievements(discipline);
CREATE INDEX IF NOT EXISTS achievements_date_earned_idx ON achievements(date_earned);
CREATE INDEX IF NOT EXISTS achievements_is_active_idx ON achievements(is_active);

CREATE INDEX IF NOT EXISTS competitions_dog_id_idx ON competitions(dog_id);
CREATE INDEX IF NOT EXISTS competitions_show_id_idx ON competitions(show_id);
CREATE INDEX IF NOT EXISTS competitions_competition_date_idx ON competitions(competition_date);
CREATE INDEX IF NOT EXISTS competitions_organization_idx ON competitions(organization);
CREATE INDEX IF NOT EXISTS competitions_discipline_idx ON competitions(discipline);

CREATE INDEX IF NOT EXISTS past_results_dog_id_idx ON past_results(dog_id);
CREATE INDEX IF NOT EXISTS past_results_show_id_idx ON past_results(show_id);
CREATE INDEX IF NOT EXISTS past_results_show_date_idx ON past_results(show_date);

-- Enable RLS
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view achievements" ON achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view competitions" ON competitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view past results" ON past_results FOR SELECT TO authenticated USING (true);

-- Insert sample achievements
INSERT INTO achievements (dog_id, achievement_type, title, abbreviation, organization, discipline, date_earned, points, judge_name)
SELECT 
  d.id, 'Championship', 'Champion', 'CH', 'AKC', 'Conformation', '2023-08-15'::DATE, 15, 'Mrs. Helen Roberts'
FROM dogs d WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  d.id, 'Agility Title', 'Novice Agility', 'NA', 'AKC', 'Agility', '2023-11-20'::DATE, 3, 'Mr. David Kim'
FROM dogs d WHERE d.name = 'Bella of the Valley'
ON CONFLICT DO NOTHING;

-- Insert sample competitions
INSERT INTO competitions (dog_id, competition_name, competition_date, location, placement, score, qualified, organization, discipline, judge_name)
SELECT 
  d.id, 'Golden Gate KC Specialty', '2024-05-20'::DATE, 'San Francisco, CA', '1st', '95', true, 'AKC', 'Conformation', 'Mrs. Patricia Smith'
FROM dogs d WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  d.id, 'Bay Area Agility Trial', '2024-06-10'::DATE, 'Oakland, CA', '3rd', '87', true, 'AKC', 'Agility', 'Ms. Jennifer Lee'
FROM dogs d WHERE d.name = 'Bella of the Valley'
ON CONFLICT DO NOTHING;