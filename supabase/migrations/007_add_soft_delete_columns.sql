-- =============================================================================
-- Migration 007: Add Soft Delete Columns
-- =============================================================================
-- Adds deleted_at and deleted_by columns to tables that need soft delete support.
-- This enables audit trails and data recovery for deleted records.
-- =============================================================================

-- =============================================================================
-- CLUBS TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on clubs
CREATE INDEX IF NOT EXISTS clubs_deleted_at_idx ON clubs(deleted_at);

-- =============================================================================
-- SHOWS TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE shows
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on shows
CREATE INDEX IF NOT EXISTS shows_deleted_at_idx ON shows(deleted_at);

-- =============================================================================
-- TRIALS TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE trials
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on trials
CREATE INDEX IF NOT EXISTS trials_deleted_at_idx ON trials(deleted_at);

-- =============================================================================
-- CLASSES TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on classes
CREATE INDEX IF NOT EXISTS classes_deleted_at_idx ON classes(deleted_at);

-- =============================================================================
-- ENTRIES TABLE - Add soft delete columns
-- =============================================================================
ALTER TABLE entries
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for soft delete queries on entries
CREATE INDEX IF NOT EXISTS entries_deleted_at_idx ON entries(deleted_at);

-- =============================================================================
-- Update RLS policies to respect soft delete
-- =============================================================================

-- Clubs: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "clubs_select_policy" ON clubs;
CREATE POLICY "clubs_select_policy" ON clubs
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));

-- Shows: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "shows_select_policy" ON shows;
CREATE POLICY "shows_select_policy" ON shows
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));

-- Trials: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "trials_select_policy" ON trials;
CREATE POLICY "trials_select_policy" ON trials
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));

-- Classes: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "classes_select_policy" ON classes;
CREATE POLICY "classes_select_policy" ON classes
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));

-- Entries: Only show non-deleted records to regular users
DROP POLICY IF EXISTS "entries_select_policy" ON entries;
CREATE POLICY "entries_select_policy" ON entries
    FOR SELECT USING (deleted_at IS NULL OR auth.uid() IN (
        SELECT user_id FROM user_roles WHERE role_id IN (
            SELECT id FROM roles WHERE name = 'admin'
        )
    ));
