-- Migration: 015_create_user_preferences_table
-- Purpose: Store user settings and preferences with cloud sync support
-- Created: 2025-01-20

-- Create user_preferences table for cloud sync of settings
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Auth user ID or anonymous device ID
  device_id TEXT, -- Optional device identifier for multi-device sync
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(user_id, device_id) -- One preference record per user per device
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON user_preferences(updated_at);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY user_preferences_select_policy ON user_preferences
  FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Users can insert their own preferences
CREATE POLICY user_preferences_insert_policy ON user_preferences
  FOR INSERT
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Users can update their own preferences
CREATE POLICY user_preferences_update_policy ON user_preferences
  FOR UPDATE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Users can delete their own preferences
CREATE POLICY user_preferences_delete_policy ON user_preferences
  FOR DELETE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Add comments for documentation
COMMENT ON TABLE user_preferences IS 'Stores user settings and preferences with cloud sync support';
COMMENT ON COLUMN user_preferences.user_id IS 'User authentication ID or anonymous device ID';
COMMENT ON COLUMN user_preferences.device_id IS 'Optional device identifier for multi-device sync';
COMMENT ON COLUMN user_preferences.settings IS 'JSON blob containing all user settings';
COMMENT ON COLUMN user_preferences.version IS 'Settings schema version for migration support';
COMMENT ON COLUMN user_preferences.last_synced_at IS 'Last time settings were successfully synced';
