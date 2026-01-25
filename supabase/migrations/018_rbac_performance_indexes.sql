-- Migration 018: RBAC Performance Indexes
-- =============================================================================
-- Adds missing indexes for RBAC scope filtering to improve query performance
-- =============================================================================

-- Index for filtering user_roles by show_id (scope filtering)
CREATE INDEX IF NOT EXISTS user_roles_show_id_idx ON user_roles(show_id)
  WHERE show_id IS NOT NULL;

-- Index for filtering user_roles by club_id (scope filtering)
CREATE INDEX IF NOT EXISTS user_roles_club_id_idx ON user_roles(club_id)
  WHERE club_id IS NOT NULL;

-- Composite index for the common query pattern: find user's roles with scope
-- Covers: WHERE user_id = X AND (show_id = Y OR club_id = Z)
CREATE INDEX IF NOT EXISTS user_roles_user_scope_idx
  ON user_roles(user_id, show_id, club_id);

-- Index on role_permissions.role_id for faster joins
-- (The UNIQUE constraint creates index on (role_id, permission_id) but
-- a single-column index on role_id can be more efficient for joins)
CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx
  ON role_permissions(role_id);

-- =============================================================================
-- Verification
-- =============================================================================
SELECT 'Migration 018: RBAC performance indexes created successfully' as status;
