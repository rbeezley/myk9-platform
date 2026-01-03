-- Create search_history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL, -- Will reference auth.users in production
  
  -- Search details
  search_term TEXT NOT NULL,
  search_type TEXT NOT NULL CHECK (search_type IN ('dogs', 'people', 'shows', 'clubs', 'classes', 'entries', 'global')),
  search_context TEXT, -- Additional context about the search
  
  -- Search results
  results_count INTEGER DEFAULT 0,
  results_found BOOLEAN DEFAULT FALSE,
  
  -- Search metadata
  search_filters JSONB, -- Applied filters
  search_sort JSONB, -- Sort criteria used
  search_duration_ms INTEGER, -- How long the search took
  
  -- User interaction
  clicked_result_id TEXT, -- Which result was clicked (if any)
  clicked_result_position INTEGER, -- Position of clicked result
  session_id TEXT, -- Group searches by session
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create search_analytics table (aggregated search data)
CREATE TABLE IF NOT EXISTS search_analytics (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Search term analysis
  search_term TEXT NOT NULL,
  search_type TEXT NOT NULL,
  
  -- Usage statistics
  frequency INTEGER DEFAULT 1, -- How many times searched
  success_rate DECIMAL(5,2) DEFAULT 0.0, -- Percentage of successful searches
  avg_results_count DECIMAL(8,2) DEFAULT 0.0, -- Average number of results
  avg_click_position DECIMAL(5,2), -- Average position of clicked results
  
  -- Performance metrics
  avg_search_duration_ms INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 1,
  successful_searches INTEGER DEFAULT 0,
  
  -- Time tracking
  first_searched_at TIMESTAMPTZ,
  last_searched_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Data aggregation
  last_aggregated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create show_registrations table
CREATE TABLE IF NOT EXISTS show_registrations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  
  -- Registration details
  registration_type TEXT NOT NULL CHECK (registration_type IN ('exhibitor', 'handler', 'vendor', 'spectator')),
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Payment information
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'cancelled')),
  total_amount DECIMAL(10,2) DEFAULT 0.00,
  payment_method TEXT,
  payment_reference TEXT,
  
  -- Registration metadata
  number_of_entries INTEGER DEFAULT 0, -- How many entries for this registration
  special_requests TEXT,
  dietary_requirements TEXT,
  
  -- Check-in status
  checked_in BOOLEAN DEFAULT FALSE,
  check_in_time TIMESTAMPTZ,
  
  -- Contact preferences
  preferred_contact_method TEXT CHECK (preferred_contact_method IN ('email', 'phone', 'text')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create armbands table
CREATE TABLE IF NOT EXISTS armbands (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  
  -- Armband details
  armband_number TEXT NOT NULL,
  armband_color TEXT, -- For different divisions/heights
  
  -- Print management
  print_status TEXT DEFAULT 'pending' CHECK (print_status IN ('pending', 'printed', 'reprinted', 'cancelled')),
  printed_at TIMESTAMPTZ,
  printed_by TEXT,
  reprint_count INTEGER DEFAULT 0,
  
  -- Check-in management
  check_in_status TEXT DEFAULT 'not_checked_in' CHECK (check_in_status IN ('not_checked_in', 'checked_in', 'present', 'absent', 'scratched')),
  checked_in_at TIMESTAMPTZ,
  checked_in_by TEXT,
  
  -- Ring management
  ring_assignment TEXT,
  run_order INTEGER,
  called_to_ring BOOLEAN DEFAULT FALSE,
  called_at TIMESTAMPTZ,
  
  -- Special notes
  notes TEXT,
  special_instructions TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for search_history
CREATE INDEX IF NOT EXISTS search_history_user_id_idx ON search_history(user_id);
CREATE INDEX IF NOT EXISTS search_history_search_term_idx ON search_history(search_term);
CREATE INDEX IF NOT EXISTS search_history_search_type_idx ON search_history(search_type);
CREATE INDEX IF NOT EXISTS search_history_created_at_idx ON search_history(created_at);
CREATE INDEX IF NOT EXISTS search_history_session_id_idx ON search_history(session_id);

-- Create indexes for search_analytics
CREATE INDEX IF NOT EXISTS search_analytics_search_term_idx ON search_analytics(search_term);
CREATE INDEX IF NOT EXISTS search_analytics_search_type_idx ON search_analytics(search_type);
CREATE INDEX IF NOT EXISTS search_analytics_frequency_idx ON search_analytics(frequency);
CREATE INDEX IF NOT EXISTS search_analytics_last_searched_at_idx ON search_analytics(last_searched_at);
CREATE UNIQUE INDEX IF NOT EXISTS search_analytics_unique_idx ON search_analytics(search_term, search_type);

-- Create indexes for show_registrations
CREATE INDEX IF NOT EXISTS show_registrations_show_id_idx ON show_registrations(show_id);
CREATE INDEX IF NOT EXISTS show_registrations_person_id_idx ON show_registrations(person_id);
CREATE INDEX IF NOT EXISTS show_registrations_registration_type_idx ON show_registrations(registration_type);
CREATE INDEX IF NOT EXISTS show_registrations_payment_status_idx ON show_registrations(payment_status);
CREATE INDEX IF NOT EXISTS show_registrations_checked_in_idx ON show_registrations(checked_in);

-- Create indexes for armbands
CREATE INDEX IF NOT EXISTS armbands_entry_id_idx ON armbands(entry_id);
CREATE INDEX IF NOT EXISTS armbands_class_id_idx ON armbands(class_id);
CREATE INDEX IF NOT EXISTS armbands_armband_number_idx ON armbands(armband_number);
CREATE INDEX IF NOT EXISTS armbands_print_status_idx ON armbands(print_status);
CREATE INDEX IF NOT EXISTS armbands_check_in_status_idx ON armbands(check_in_status);
CREATE INDEX IF NOT EXISTS armbands_run_order_idx ON armbands(run_order);
CREATE UNIQUE INDEX IF NOT EXISTS armbands_entry_unique_idx ON armbands(entry_id);

-- Enable RLS
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE armbands ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view search history" ON search_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view search analytics" ON search_analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view show registrations" ON show_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view armbands" ON armbands FOR SELECT TO authenticated USING (true);

-- Insert sample search history
INSERT INTO search_history (user_id, search_term, search_type, results_count, results_found, search_duration_ms) VALUES
(extensions.uuid_generate_v4(), 'golden retriever', 'dogs', 3, true, 45),
(extensions.uuid_generate_v4(), 'agility trial', 'shows', 5, true, 32),
(extensions.uuid_generate_v4(), 'john smith', 'people', 1, true, 28)
ON CONFLICT DO NOTHING;

-- Insert sample search analytics
INSERT INTO search_analytics (search_term, search_type, frequency, success_rate, avg_results_count, total_searches, successful_searches) VALUES
('golden retriever', 'dogs', 5, 100.0, 3.2, 5, 5),
('agility', 'shows', 12, 91.7, 4.5, 12, 11),
('border collie', 'dogs', 3, 100.0, 2.7, 3, 3)
ON CONFLICT DO NOTHING;

-- Insert sample show registrations  
INSERT INTO show_registrations (show_id, person_id, registration_type, payment_status, total_amount, number_of_entries)
SELECT 
  s.id, p.id, 'exhibitor', 'paid', 75.00, 3
FROM shows s, people p 
WHERE s.name = 'Spring Specialty Show 2025' AND p.first_name = 'John' AND p.last_name = 'Smith'
ON CONFLICT DO NOTHING;

-- Insert sample armbands
INSERT INTO armbands (entry_id, class_id, armband_number, print_status, check_in_status, run_order)
SELECT 
  e.id, e.class_id, e.armband, 'printed', 'checked_in', e.run_order
FROM entries e WHERE e.armband IS NOT NULL
ON CONFLICT DO NOTHING;