-- Create people table (no dependencies)
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  profile_image TEXT,
  roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view people"
    ON people
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert test people
INSERT INTO people (first_name, last_name, email, phone, roles) VALUES 
  ('John', 'Smith', 'john.smith@email.com', '555-123-4567', '{"exhibitor"}'),
  ('Jane', 'Doe', 'jane.doe@email.com', '555-987-6543', '{"judge", "secretary"}'),
  ('Mike', 'Johnson', 'mike.johnson@email.com', '555-555-5555', '{"handler"}')
ON CONFLICT DO NOTHING;