-- Fix user_roles RLS to explicitly allow inserts for authenticated users.
-- The existing "user_roles_all" policy uses FOR ALL with USING(true) but
-- PostgreSQL requires WITH CHECK for INSERT operations. Replacing with
-- explicit per-operation policies.

DROP POLICY IF EXISTS "user_roles_all" ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update" ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete" ON user_roles;

-- Authenticated users can select, insert, update, and delete user_roles
CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_roles_update" ON user_roles
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "user_roles_delete" ON user_roles
  FOR DELETE TO authenticated
  USING (true);
