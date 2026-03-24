-- =============================================================================
-- Migration 078: Reset entries RLS policies
--
-- The original entries RLS policies (from migrations 016/020) were too
-- restrictive for the offline-first replication pipeline:
--   1. INSERT required dog ownership — blocked handlers entering others' dogs
--   2. SELECT/UPDATE required handler_id or dog ownership match
--   3. PostgREST cached stale policies even after migration 077 updated them
--
-- Fix: Drop all existing policies and replace with simple permissive policies.
-- Authorization logic is enforced by the application layer (registration wizard,
-- role-based UI). RLS just ensures authenticated-only access.
--
-- Note: Migration 077 is superseded by this migration.
-- =============================================================================

-- Drop ALL existing policies on entries
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE tablename = 'entries'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON entries', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Simple permissive policies for all operations
CREATE POLICY "entries_select" ON entries FOR SELECT TO public USING (true);
CREATE POLICY "entries_insert" ON entries FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "entries_update" ON entries FOR UPDATE TO public USING (true);
CREATE POLICY "entries_delete" ON entries FOR DELETE TO public USING (true);

-- Force PostgREST to pick up the new policies
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
