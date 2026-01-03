-- Create judge_qualifications table (depends on people)
CREATE TABLE IF NOT EXISTS judge_qualifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  
  -- Qualification details
  organization TEXT NOT NULL, -- AKC, UKC, etc.
  qualification_level TEXT NOT NULL, -- Provisional, Regular, etc.
  disciplines TEXT[] NOT NULL, -- Agility, Conformation, Obedience
  
  -- Qualification dates
  date_obtained DATE NOT NULL,
  expiration_date DATE,
  
  -- Approval information
  approved_by TEXT,
  approval_number TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  suspension_reason TEXT, -- If suspended
  suspension_date DATE,
  
  -- Additional information
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create judge_certifications table (depends on people)
CREATE TABLE IF NOT EXISTS judge_certifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  
  -- Certification details
  certification_name TEXT NOT NULL,
  issuing_body TEXT NOT NULL, -- AKC, UKC, USDAA, etc.
  certification_number TEXT,
  
  -- Certification dates
  date_obtained DATE NOT NULL,
  expiration_date DATE,
  
  -- Renewal information
  renewal_required BOOLEAN DEFAULT FALSE,
  next_renewal_date DATE,
  continuing_education_hours INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Additional information
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create judge_assignments table (depends on shows and people)
CREATE TABLE IF NOT EXISTS judge_assignments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  judge_id UUID REFERENCES people(id) ON DELETE CASCADE,
  
  -- Assignment details
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('judge', 'ring_steward', 'chief_steward', 'show_secretary')),
  assigned_classes TEXT[], -- Class IDs or names they're assigned to
  assigned_rings TEXT[], -- Ring numbers
  
  -- Assignment metadata
  assignment_date DATE NOT NULL,
  assignment_status TEXT DEFAULT 'confirmed' CHECK (assignment_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  
  -- Compensation
  compensation_amount DECIMAL(10,2),
  expenses_covered BOOLEAN DEFAULT FALSE,
  travel_provided BOOLEAN DEFAULT FALSE,
  
  -- Assignment notes
  special_requirements TEXT,
  notes TEXT,
  
  -- Contact information
  confirmed_by TEXT, -- Who confirmed the assignment
  confirmed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS judge_qualifications_person_id_idx ON judge_qualifications(person_id);
CREATE INDEX IF NOT EXISTS judge_qualifications_organization_idx ON judge_qualifications(organization);
CREATE INDEX IF NOT EXISTS judge_qualifications_disciplines_idx ON judge_qualifications USING GIN (disciplines);
CREATE INDEX IF NOT EXISTS judge_qualifications_is_active_idx ON judge_qualifications(is_active);
CREATE INDEX IF NOT EXISTS judge_qualifications_expiration_date_idx ON judge_qualifications(expiration_date);

CREATE INDEX IF NOT EXISTS judge_certifications_person_id_idx ON judge_certifications(person_id);
CREATE INDEX IF NOT EXISTS judge_certifications_issuing_body_idx ON judge_certifications(issuing_body);
CREATE INDEX IF NOT EXISTS judge_certifications_is_active_idx ON judge_certifications(is_active);
CREATE INDEX IF NOT EXISTS judge_certifications_expiration_date_idx ON judge_certifications(expiration_date);

CREATE INDEX IF NOT EXISTS judge_assignments_show_id_idx ON judge_assignments(show_id);
CREATE INDEX IF NOT EXISTS judge_assignments_judge_id_idx ON judge_assignments(judge_id);
CREATE INDEX IF NOT EXISTS judge_assignments_assignment_type_idx ON judge_assignments(assignment_type);
CREATE INDEX IF NOT EXISTS judge_assignments_assignment_status_idx ON judge_assignments(assignment_status);

-- Create unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS judge_assignments_unique_idx ON judge_assignments(show_id, judge_id, assignment_type);

-- Enable RLS
ALTER TABLE judge_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view judge qualifications" ON judge_qualifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view judge certifications" ON judge_certifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view judge assignments" ON judge_assignments FOR SELECT TO authenticated USING (true);

-- Insert sample judge qualifications
INSERT INTO judge_qualifications (person_id, organization, qualification_level, disciplines, date_obtained, expiration_date, approved_by)
SELECT 
  p.id, 'AKC', 'Regular', ARRAY['Conformation', 'Agility'], '2018-06-15'::DATE, '2028-06-15'::DATE, 'AKC Judging Committee'
FROM people p WHERE p.first_name = 'Mike' AND p.last_name = 'Johnson'
ON CONFLICT DO NOTHING;

-- Insert sample judge certifications
INSERT INTO judge_certifications (person_id, certification_name, issuing_body, date_obtained, expiration_date)
SELECT 
  p.id, 'Agility Judge Certification', 'AKC', '2018-06-15'::DATE, '2026-06-15'::DATE
FROM people p WHERE p.first_name = 'Mike' AND p.last_name = 'Johnson'
ON CONFLICT DO NOTHING;

-- Insert sample judge assignments
INSERT INTO judge_assignments (show_id, judge_id, assignment_type, assigned_classes, assignment_date, assignment_status, compensation_amount)
SELECT 
  s.id, p.id, 'judge', ARRAY['Novice Standard', 'Open Standard'], s.start_date, 'confirmed', 500.00
FROM shows s, people p 
WHERE s.name = 'Spring Specialty Show 2025' AND p.first_name = 'Mike' AND p.last_name = 'Johnson'
ON CONFLICT DO NOTHING;