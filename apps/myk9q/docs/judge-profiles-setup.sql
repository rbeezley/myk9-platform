-- AKC Scent Work Master National 2025 - Judge Profiles Setup
-- Run this script in Supabase SQL Editor to create judge profiles table and initial data

-- Create judge profiles table
CREATE TABLE IF NOT EXISTS judge_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  photo_url TEXT,
  judging_since INTEGER,
  home_state TEXT,
  specialties TEXT[],
  fun_facts TEXT[],
  akc_number TEXT,
  bio_text TEXT,
  day_assignments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the 4 judges for AKC Scent Work Master National 2025
-- Based on premium list - Day 1 and Day 2 assignments

INSERT INTO judge_profiles (
  name, 
  specialties, 
  day_assignments,
  bio_text
) VALUES 

-- Group A Judges
(
  'Silke Satzinger',
  ARRAY['Container', 'Interior', 'Detection'],
  '{
    "day1": {"element": "Container", "group": "A"},
    "day2": {"element": "Interior", "group": "A"}
  }'::jsonb,
  'Experienced AKC Scent Work Judge specializing in container and interior searches.'
),

(
  'Carol Chase', 
  ARRAY['Buried', 'Exterior', 'Nosework'],
  '{
    "day1": {"element": "Buried", "group": "A"},
    "day2": {"element": "Exterior", "group": "A"}
  }'::jsonb,
  'Expert in outdoor scent detection with extensive buried and exterior search experience.'
),

(
  'Mary Quinn',
  ARRAY['Interior', 'Buried', 'Handler Discrimination'], 
  '{
    "day1": {"element": "Interior", "group": "A"},
    "day2": {"element": "Buried", "group": "A"}
  }'::jsonb,
  'Versatile judge with expertise across multiple scent work disciplines.'
),

(
  'Peter Betchley',
  ARRAY['Exterior', 'Handler Discrimination', 'Detection'],
  '{
    "day1": {"element": "Exterior", "group": "A"}, 
    "day2": {"element": "Handler Discrimination", "group": "A"}
  }'::jsonb,
  'Specialist in exterior searches and handler discrimination challenges.'
),

-- Group B Judges  
(
  'Richard Beezley',
  ARRAY['Container', 'Interior', 'Detection'],
  '{
    "day1": {"element": "Container", "group": "B"},
    "day2": {"element": "Interior", "group": "B"}
  }'::jsonb,
  'Professional scent work judge with strong background in container and interior elements.'
),

(
  'Terri Eyer',
  ARRAY['Buried', 'Exterior', 'Nosework'],
  '{
    "day1": {"element": "Buried", "group": "B"},
    "day2": {"element": "Exterior", "group": "B"}
  }'::jsonb,
  'Expert outdoor judge specializing in buried hides and exterior search areas.'
),

(
  'Kathryn Butts',
  ARRAY['Interior', 'Buried', 'Detection'],
  '{
    "day1": {"element": "Interior", "group": "B"},
    "day2": {"element": "Buried", "group": "B"}
  }'::jsonb,
  'Experienced interior and buried search judge with national-level expertise.'
),

(
  'Kimberly Melton Hall',
  ARRAY['Exterior', 'Handler Discrimination', 'Detection'],
  '{
    "day1": {"element": "Exterior", "group": "B"},
    "day2": {"element": "Handler Discrimination", "group": "B"}
  }'::jsonb,
  'Professional judge specializing in challenging exterior environments and handler discrimination.'
);

-- Finals Day Judges (Day 3)
INSERT INTO judge_profiles (
  name,
  specialties, 
  day_assignments,
  bio_text
) VALUES 
(
  'Donna Morgan Murray',
  ARRAY['Combined Elements', 'Master Level', 'Championships'],
  '{
    "day3": {"element": "Combined Elements", "role": "Finals Judge 1"}
  }'::jsonb,
  'Elite championship judge for combined element searches at master level competition.'
),

(
  'David Conroy',
  ARRAY['Combined Elements', 'Master Level', 'Championships'], 
  '{
    "day3": {"element": "Combined Elements", "role": "Finals Judge 2"}
  }'::jsonb,
  'Master level judge with expertise in complex combined element championship rounds.'
);

-- Create other supporting tables

-- TV messages table for announcements
CREATE TABLE IF NOT EXISTS tv_messages (
  id SERIAL PRIMARY KEY,
  trial_id INTEGER,
  message_type TEXT NOT NULL CHECK (message_type IN ('announcement', 'alert', 'info', 'achievement')),
  message_text TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event statistics for historical data
CREATE TABLE IF NOT EXISTS event_statistics (
  id SERIAL PRIMARY KEY,
  event_date DATE NOT NULL,
  trial_id INTEGER,
  statistic_type TEXT NOT NULL,
  statistic_key TEXT NOT NULL,
  statistic_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample TV messages
INSERT INTO tv_messages (message_type, message_text, priority) VALUES
('announcement', 'Welcome to the INAUGURAL AKC Scent Work Master National Championship!', 10),
('info', 'Handlers briefing begins at 8:30 AM each morning', 5),
('info', 'Handler Discrimination Challenge available Day 2', 3),
('announcement', 'Check-in available via myK9Q app or Secretary table', 4),
('info', 'Official event photos available after each day', 2);

-- Enable Row Level Security (optional - for future admin access)
-- ALTER TABLE judge_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tv_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE event_statistics ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_judge_profiles_name ON judge_profiles(name);
CREATE INDEX IF NOT EXISTS idx_tv_messages_active ON tv_messages(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_event_statistics_date_type ON event_statistics(event_date, statistic_type);

-- Verify the data was inserted correctly
SELECT 
  name,
  array_to_string(specialties, ', ') as specialties,
  day_assignments,
  bio_text
FROM judge_profiles 
ORDER BY id;

-- Show active messages
SELECT message_type, message_text, priority 
FROM tv_messages 
WHERE active = true 
ORDER BY priority DESC;

COMMIT;