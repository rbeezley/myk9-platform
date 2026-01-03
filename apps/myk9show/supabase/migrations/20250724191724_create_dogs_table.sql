-- Create dogs table (depends on people)
CREATE TABLE IF NOT EXISTS dogs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  call_name TEXT,
  breed TEXT NOT NULL,
  sex TEXT CHECK (sex IN ('male', 'female')),
  date_of_birth DATE,
  color TEXT,
  height TEXT,
  weight TEXT,
  microchip_number TEXT,
  image_url TEXT,
  spayed_neutered BOOLEAN DEFAULT FALSE,
  owner_id UUID REFERENCES people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS dogs_owner_id_idx ON dogs(owner_id);
CREATE INDEX IF NOT EXISTS dogs_breed_idx ON dogs(breed);

-- Enable RLS
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view dogs"
    ON dogs
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test dogs (using people from previous migration)
INSERT INTO dogs (name, call_name, breed, sex, date_of_birth, color, owner_id) 
SELECT 
  'Champion Goldenworth Max', 'Max', 'Golden Retriever', 'male', '2020-03-15'::DATE, 'Golden', p.id
FROM people p WHERE p.first_name = 'John' AND p.last_name = 'Smith'
UNION ALL
SELECT 
  'Bella of the Valley', 'Bella', 'Border Collie', 'female', '2019-08-22'::DATE, 'Black and White', p.id
FROM people p WHERE p.first_name = 'Jane' AND p.last_name = 'Doe'
ON CONFLICT DO NOTHING;