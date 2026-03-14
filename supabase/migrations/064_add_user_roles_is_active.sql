-- Add is_active column to user_roles table
-- AuthContext already checks ur.is_active ?? true but the column didn't exist until now
ALTER TABLE user_roles ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

-- Index for efficient filtering of active roles per user
CREATE INDEX IF NOT EXISTS user_roles_user_id_is_active_idx ON user_roles(user_id, is_active);
