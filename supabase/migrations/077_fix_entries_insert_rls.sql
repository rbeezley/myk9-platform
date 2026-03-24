-- =============================================================================
-- Migration 077: Fix entries INSERT RLS policy
--
-- The existing policy (from migration 016) only allows inserting entries for
-- dogs you own (owner_id/co_owner_id check). This is too restrictive:
--   1. Handlers may enter dogs they don't own (common in shows)
--   2. Handler may be a text-only name (no handler_id / people record)
--   3. Secretaries creating entries on behalf of exhibitors
--
-- Fix: Allow any authenticated user to insert entries. Authorization logic
-- (who can enter which dogs) is enforced by the application layer (registration
-- wizard). RLS on SELECT/UPDATE/DELETE still restricts who can view and modify
-- entries after creation.
-- =============================================================================

DROP POLICY IF EXISTS "entries_insert" ON entries;

CREATE POLICY "entries_insert" ON entries
  FOR INSERT TO authenticated
  WITH CHECK (true);
