-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL, -- Will reference auth.users in production
  
  -- Preference type and data
  preference_type TEXT NOT NULL, -- navigation, ui_settings, dashboard, etc.
  preference_data JSONB NOT NULL DEFAULT '{}',
  
  -- Metadata
  last_updated_device TEXT, -- Device/browser that last updated
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create draft_entries table (for incomplete entry forms)
CREATE TABLE IF NOT EXISTS draft_entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL, -- Will reference auth.users in production
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  
  -- Draft data
  draft_data JSONB NOT NULL DEFAULT '{}', -- Complete form state
  form_step INTEGER DEFAULT 1, -- Which step of multi-step form
  total_steps INTEGER DEFAULT 1,
  
  -- Draft metadata
  draft_name TEXT, -- User-provided name for the draft
  auto_saved BOOLEAN DEFAULT TRUE, -- Auto-saved vs manually saved
  
  -- Progress tracking
  completion_percentage INTEGER DEFAULT 0, -- 0-100
  validation_errors JSONB, -- Current validation issues
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create template_fields table (extends class_templates)
CREATE TABLE IF NOT EXISTS template_fields (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  template_id UUID REFERENCES class_templates(id) ON DELETE CASCADE,
  
  -- Field definition
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'select', 'multiselect', 'date', 'time')),
  field_label TEXT NOT NULL,
  field_description TEXT,
  
  -- Field configuration
  field_values JSONB, -- Options for select fields, validation rules, etc.
  is_required BOOLEAN DEFAULT FALSE,
  is_optional BOOLEAN DEFAULT TRUE,
  default_value TEXT,
  
  -- Field ordering and grouping
  field_order INTEGER DEFAULT 0,
  field_group TEXT, -- Group fields together
  
  -- Validation rules
  validation_rules JSONB, -- Min/max values, regex patterns, etc.
  
  -- Field state
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS user_preferences_preference_type_idx ON user_preferences(preference_type);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_unique_idx ON user_preferences(user_id, preference_type);

CREATE INDEX IF NOT EXISTS draft_entries_user_id_idx ON draft_entries(user_id);
CREATE INDEX IF NOT EXISTS draft_entries_show_id_idx ON draft_entries(show_id);
CREATE INDEX IF NOT EXISTS draft_entries_updated_at_idx ON draft_entries(updated_at);
CREATE INDEX IF NOT EXISTS draft_entries_last_accessed_at_idx ON draft_entries(last_accessed_at);

CREATE INDEX IF NOT EXISTS template_fields_template_id_idx ON template_fields(template_id);
CREATE INDEX IF NOT EXISTS template_fields_field_type_idx ON template_fields(field_type);
CREATE INDEX IF NOT EXISTS template_fields_field_order_idx ON template_fields(field_order);
CREATE INDEX IF NOT EXISTS template_fields_is_active_idx ON template_fields(is_active);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_fields ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view user preferences" ON user_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view draft entries" ON draft_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view template fields" ON template_fields FOR SELECT TO authenticated USING (true);

-- Insert sample user preferences
INSERT INTO user_preferences (user_id, preference_type, preference_data) VALUES
(extensions.uuid_generate_v4(), 'navigation', '{"sidebar_collapsed": false, "default_page": "dashboard", "theme": "light"}'::jsonb),
(extensions.uuid_generate_v4(), 'dashboard', '{"widgets": ["recent_entries", "upcoming_shows", "dog_health"], "layout": "grid"}'::jsonb),
(extensions.uuid_generate_v4(), 'ui_settings', '{"table_page_size": 25, "show_advanced_filters": true, "auto_save_drafts": true}'::jsonb)
ON CONFLICT DO NOTHING;

-- Insert sample template fields
INSERT INTO template_fields (template_id, field_name, field_type, field_label, field_description, is_required, field_order, validation_rules)
SELECT 
  ct.id, 'jump_height', 'select', 'Jump Height', 'Select the appropriate jump height for your dog', true, 1, 
  '{"options": ["8\"", "12\"", "16\"", "20\"", "24\""]}'::jsonb
FROM class_templates ct WHERE ct.name = 'AKC Novice Standard'
UNION ALL
SELECT 
  ct.id, 'handler_name', 'text', 'Handler Name', 'Name of the person handling the dog', true, 2,
  '{"min_length": 2, "max_length": 100}'::jsonb
FROM class_templates ct WHERE ct.name = 'AKC Novice Standard'
ON CONFLICT DO NOTHING;