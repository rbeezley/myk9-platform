-- Create dog_registrations table (depends on dogs)
CREATE TABLE IF NOT EXISTS dog_registrations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  registered_name TEXT,
  registration_number TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending', 'under_review')),
  application_number TEXT,
  submission_date DATE,
  registration_date DATE,
  certificate TEXT,
  breed TEXT,
  variety TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS dog_registrations_dog_id_idx ON dog_registrations(dog_id);
CREATE INDEX IF NOT EXISTS dog_registrations_organization_idx ON dog_registrations(organization);
CREATE INDEX IF NOT EXISTS dog_registrations_number_idx ON dog_registrations(registration_number);

-- Enable RLS
ALTER TABLE dog_registrations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view dog_registrations"
    ON dog_registrations
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test registrations (using dogs from previous migrations)
INSERT INTO dog_registrations (dog_id, organization, registered_name, registration_number, status, breed, registration_date) 
SELECT 
  d.id, 'AKC', d.name, 'SS12345678', 'active', d.breed, '2020-04-15'::DATE
FROM dogs d WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT 
  d.id, 'UKC', d.name, 'UC98765432', 'active', d.breed, '2019-09-10'::DATE
FROM dogs d WHERE d.name = 'Bella of the Valley'
ON CONFLICT DO NOTHING;