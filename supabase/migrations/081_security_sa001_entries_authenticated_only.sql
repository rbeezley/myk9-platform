-- =============================================================================
-- Migration 081: SA-001 — Restrict entries table to authenticated users
--
-- CRITICAL: Entries policies used TO public, allowing anonymous users to
-- read, create, modify, and delete all entries. Changed to TO authenticated.
--
-- Per migration 077 rationale, INSERT remains permissive for authenticated
-- users (handlers enter dogs they don't own). Authorization enforced at
-- application layer.
-- =============================================================================

-- Drop the public-facing policies from migration 078
DROP POLICY IF EXISTS "entries_select" ON entries;
DROP POLICY IF EXISTS "entries_insert" ON entries;
DROP POLICY IF EXISTS "entries_update" ON entries;
DROP POLICY IF EXISTS "entries_delete" ON entries;

-- Recreate with TO authenticated (not TO public)
CREATE POLICY "entries_select" ON entries
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "entries_insert" ON entries
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "entries_update" ON entries
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "entries_delete" ON entries
  FOR DELETE TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
