-- Create show_templates table
CREATE TABLE IF NOT EXISTS show_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  organization TEXT NOT NULL, -- AKC, UKC, etc.
  description TEXT,
  
  -- Template data structure
  template_data JSONB DEFAULT '{}', -- Complete show template configuration
  
  -- Default show settings
  default_entry_fee DECIMAL(10,2),
  default_max_entries INTEGER,
  default_duration_days INTEGER DEFAULT 1,
  
  -- Template metadata
  created_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE, -- Can other users use this template
  
  -- Usage statistics
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS show_templates_organization_idx ON show_templates(organization);
CREATE INDEX IF NOT EXISTS show_templates_is_active_idx ON show_templates(is_active);
CREATE INDEX IF NOT EXISTS show_templates_is_public_idx ON show_templates(is_public);
CREATE INDEX IF NOT EXISTS show_templates_created_by_idx ON show_templates(created_by);

-- Enable RLS
ALTER TABLE show_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view show templates"
    ON show_templates
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert sample show templates
INSERT INTO show_templates (name, organization, description, default_entry_fee, default_max_entries, default_duration_days, template_data) VALUES
('AKC Agility Trial Weekend', 'AKC', 'Standard 2-day agility trial template', 28.00, 100, 2, 
 '{"trials": [{"name": "Agility Trial 1", "classes": ["Novice Standard", "Open Standard", "Excellent Standard"]}, {"name": "Agility Trial 2", "classes": ["Novice JWW", "Open JWW", "Excellent JWW"]}]}'::jsonb),
('UKC Single Day Show', 'UKC', 'Single day UKC agility show', 22.00, 75, 1,
 '{"trials": [{"name": "UKC Agility", "classes": ["Agility I", "Agility II", "Agility III"]}]}'::jsonb),
('AKC Specialty Show', 'AKC', 'Breed specialty conformation show', 35.00, 50, 1,
 '{"trials": [{"name": "Conformation", "classes": ["Puppy", "Open", "Winners"]}]}'::jsonb)
ON CONFLICT DO NOTHING;