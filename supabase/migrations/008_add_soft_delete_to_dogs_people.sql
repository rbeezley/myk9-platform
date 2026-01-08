-- =============================================================================
-- Migration 008: Add Soft Delete Columns to Dogs and People
-- =============================================================================
-- Extends soft delete support to dogs and people tables.
-- Migration 007 covered clubs, shows, trials, classes, entries.
-- =============================================================================

-- =============================================================================
-- DOGS TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE dogs
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on dogs
CREATE INDEX IF NOT EXISTS dogs_deleted_at_idx ON dogs(deleted_at);

-- =============================================================================
-- PEOPLE TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE people
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on people
CREATE INDEX IF NOT EXISTS people_deleted_at_idx ON people(deleted_at);

-- =============================================================================
-- Update RLS policies to respect soft delete
-- =============================================================================

-- Dogs: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "dogs_select_policy" ON dogs;
CREATE POLICY "dogs_select_policy" ON dogs
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));

-- People: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "people_select_policy" ON people;
CREATE POLICY "people_select_policy" ON people
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));
