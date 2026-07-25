-- MYK9-93 round-2 review repairs.

-- ---------------------------------------------------------------------------
-- 1. people.email — one more anon-reachable embed column, same class as the
--    dogs/people regression fixed in 20260725170000.
-- ---------------------------------------------------------------------------
-- 20260725170000 enumerated useShowJudges.ts but missed the LARGER embed on the
-- same public page: services/database/shows/reads.postgrest.ts:78 and :335 select
--   judge:people!judge_assignments_person_id_fkey(id, first_name, last_name, email)
-- and services/database/shows/reads.ts:161 calls postgrestGetShowById UNCAUGHT on
-- the guest path (replication is cold-empty for a guest), so a 42501 fails the whole
-- /shows/:id request rather than degrading. Reproduced against staging:
--   permission denied for table people
--
-- As with the other embed grants this conveys no data — people_select is
-- TO authenticated, so anon matches zero rows and the embed resolves to null.
-- It is granted only so PostgREST can plan the join.
--
-- GUARD: people_select must stay TO authenticated. If it is ever widened to admit
-- anon, this grant would expose judge email addresses. See the contract test in
-- apps/myk9show/src/test/database/anonEntriesGrantContract.test.ts.

GRANT SELECT (email) ON public.people TO anon;

COMMENT ON POLICY people_select ON public.people IS
  'MYK9-93: TO authenticated — anon matches zero rows. anon holds a column-scoped '
  'SELECT grant (id, first_name, last_name, email) solely so PostgREST embeds on the '
  'public show pages resolve to null instead of 42501. Widening this policy to admit '
  'anon would expose judge email addresses — re-scope the grant first.';

-- Correction to the 20260725170000 header: it cited
-- services/database/classes/reads.ts as the "guest cold-store classes tab"
-- justification. The guest path is services/database/classes/publicReads.ts, whose
-- PUBLIC_CLASS_SELECT deliberately joins no entries/dogs/people. The dogs/people
-- grants remain justified by the TV board and the public show detail page.

-- ---------------------------------------------------------------------------
-- 2. Default FUNCTION privileges — revoke from PUBLIC, not just anon.
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE on new functions to the PUBLIC pseudo-role by default,
-- and anon inherits it. Revoking from anon alone (20260725170000) therefore does not
-- close the trap for functions created later. authenticated and service_role keep
-- their own explicit default grants, so this does not affect them.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON FUNCTIONS FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON TABLES FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'MYK9-93: could not revoke supabase_admin default PUBLIC privileges. '
                'Run as supabase_admin to finish.';
END $$;

NOTIFY pgrst, 'reload schema';
