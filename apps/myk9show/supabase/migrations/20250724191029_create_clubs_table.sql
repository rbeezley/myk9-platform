-- Create clubs table (no dependencies)
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Create policies (basic read access for authenticated users)
CREATE POLICY "Users can view clubs"
    ON clubs
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert some test clubs
INSERT INTO clubs (name, address, email) VALUES 
  ('Golden State Dog Club', '123 Main St, San Francisco, CA', 'info@goldenstatedog.com'),
  ('Bay Area Kennel Club', '456 Oak Ave, Oakland, CA', 'contact@bayareakennel.org')
ON CONFLICT DO NOTHING;