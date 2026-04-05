-- Migration 111: Restrict people SELECT to authenticated users only
--
-- The /people and /users/:id UI routes were removed (dc00b017) because of
-- privacy concerns. The underlying RLS policy was intentionally left open for
-- handler lookups and catalogs, but allowed unauthenticated enumeration via
-- the public anon key. Handler lookups happen inside the registration wizard,
-- which requires login — so restricting to `authenticated` is safe and closes
-- the anon enumeration vector.

DROP POLICY IF EXISTS "people_select" ON people;

-- Authenticated users can view non-deleted people (handler lookups, catalogs).
-- Admins can also see soft-deleted records.
CREATE POLICY "people_select" ON people
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    OR (SELECT is_platform_admin())
  );
