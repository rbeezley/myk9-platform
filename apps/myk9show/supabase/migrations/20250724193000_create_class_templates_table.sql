-- Create class_templates table (core template system)
CREATE TABLE IF NOT EXISTS class_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  organization TEXT NOT NULL, -- AKC, UKC, etc.
  show_type TEXT, -- Agility, Conformation, etc.
  description TEXT,
  
  -- Template configuration
  fields JSONB DEFAULT '{}', -- Dynamic field definitions
  class_pattern TEXT, -- Pattern for generating class names
  entry_fee_default DECIMAL(10,2),
  max_entries_default INTEGER,
  jump_heights TEXT[], -- Available jump heights
  breed_restrictions TEXT[], -- Breed limitations
  
  -- Time and scheduling
  estimated_duration INTEGER, -- in minutes
  start_time_default TIME,
  
  -- Template metadata
  created_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE, -- System vs user-created
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS class_templates_organization_idx ON class_templates(organization);
CREATE INDEX IF NOT EXISTS class_templates_show_type_idx ON class_templates(show_type);
CREATE INDEX IF NOT EXISTS class_templates_is_active_idx ON class_templates(is_active);
CREATE INDEX IF NOT EXISTS class_templates_created_by_idx ON class_templates(created_by);

-- Enable RLS
ALTER TABLE class_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view class templates"
    ON class_templates
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert sample class templates
INSERT INTO class_templates (name, organization, show_type, description, entry_fee_default, max_entries_default, estimated_duration, jump_heights) VALUES
('AKC Novice Standard', 'AKC', 'Agility', 'Novice level standard agility course', 25.00, 30, 90, ARRAY['8"', '12"', '16"', '20"', '24"']),
('AKC Open Jumpers', 'AKC', 'Agility', 'Open level jumpers course', 30.00, 25, 60, ARRAY['8"', '12"', '16"', '20"', '24"']),
('UKC Agility I', 'UKC', 'Agility', 'UKC Agility Level I', 20.00, 35, 75, ARRAY['8"', '12"', '16"', '20"', '26"']),
('Conformation - Best in Show', 'AKC', 'Conformation', 'Best in Show competition', 35.00, 7, 30, ARRAY[]::TEXT[])
ON CONFLICT DO NOTHING;