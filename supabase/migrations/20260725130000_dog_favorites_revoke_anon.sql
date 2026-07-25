-- dog_favorites — revoke the anon privileges Postgres granted automatically.
--
-- 20260725120000_dog_favorites.sql deliberately granted nothing to `anon`,
-- because favorites-for-push are signed-in only. Verifying the applied result
-- showed `anon=arwdDxtm/postgres` on the table anyway.
--
-- Cause: this project carries ALTER DEFAULT PRIVILEGES in schema `public`
-- granting anon full table privileges on every newly created table (confirmed
-- via pg_default_acl — both `postgres` and `supabase_admin` are grantors).
-- OMITTING a grant therefore does NOT withhold access here; anon receives
-- everything unless the grant is explicitly revoked.
--
-- The table was never actually reachable by anon: RLS is enabled and all four
-- policies are scoped `TO authenticated`, so an anon request matches no policy
-- and is denied. This restores the intended SECOND layer, so the table stays
-- closed even if a future policy is written `TO public` or RLS is toggled off
-- while debugging.
--
-- Any future table meant to exclude anon needs this REVOKE too — the grant
-- template alone is not sufficient on this project.

REVOKE ALL ON public.dog_favorites FROM anon;

-- Re-assert the intended grants; REVOKE ALL above touches only anon, but
-- stating them keeps the effective ACL readable in one place.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_favorites TO service_role;
