-- MYK9-93 Phase 2 — make the grant layer mean something again.
--
-- This project carries ALTER DEFAULT PRIVILEGES in schema public granting anon
-- arwdDxtm on every newly created table (grantors: postgres and supabase_admin).
-- Consequence: omitting a GRANT does NOT withhold access, so all 54 public tables
-- gave anon full CRUD and RLS was the only protecting layer.
--
-- After this migration:
--   * new tables created by our migrations grant anon nothing by default;
--   * existing tables grant anon nothing, except the explicit allowlist below.
--
-- The allowlist is derived mechanically: a policy is anon-reachable iff its USING
-- clause is satisfiable with auth.uid() null. Everything else on role `public` is
-- gated by auth.uid() and is authenticated-only in practice.
--
-- Grants are orthogonal to RLS; both still apply. Nothing here loosens RLS.

-- ---------------------------------------------------------------------------
-- 1. Stop the bleeding for future tables.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- The supabase_admin-grantor default applies to tables created by Supabase itself
-- rather than by our migrations, and altering it requires membership in that role.
-- Attempt it; warn rather than abort if this database does not allow it.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON SEQUENCES FROM anon';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'MYK9-93: could not revoke supabase_admin default privileges for anon. '
                'Tables created by supabase_admin (not by our migrations) will still '
                'default-grant anon. Run as supabase_admin to finish.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Clear anon on everything that exists today.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Re-grant the anon-reachable allowlist.
-- ---------------------------------------------------------------------------
-- Public reference data — rules, sports, titles, templates, help content.
GRANT SELECT ON public.rule_organizations   TO anon;
GRANT SELECT ON public.rule_sports          TO anon;
GRANT SELECT ON public.rulebooks            TO anon;
GRANT SELECT ON public.rules                TO anon;
GRANT SELECT ON public.sport_class_rules    TO anon;
GRANT SELECT ON public.sport_templates      TO anon;
GRANT SELECT ON public.sport_titles         TO anon;
GRANT SELECT ON public.show_templates       TO anon;
GRANT SELECT ON public.template_fields      TO anon;
GRANT SELECT ON public.user_guide           TO anon;

-- Published show data — backs the public show pages and the anon TV / at-show boards.
-- Each is additionally row-filtered by RLS on show status.
GRANT SELECT ON public.shows                        TO anon;
GRANT SELECT ON public.trials                       TO anon;
GRANT SELECT ON public.classes                      TO anon;
GRANT SELECT ON public.entries                      TO anon;
GRANT SELECT ON public.armbands                     TO anon;
GRANT SELECT ON public.judge_assignments            TO anon;
GRANT SELECT ON public.clubs                        TO anon;
GRANT SELECT ON public.achievements                 TO anon;
GRANT SELECT ON public.show_visibility_settings     TO anon;
GRANT SELECT ON public.trial_visibility_overrides   TO anon;
GRANT SELECT ON public.class_visibility_overrides   TO anon;

-- The one anon write path: the pre-launch platform waitlist signup form.
-- Row shape is validated by the anon_can_insert_waitlist policy; no SELECT.
GRANT INSERT ON public.platform_waitlist TO anon;

-- The public results release gate. A definer-rights view, so it does not need
-- base-table grants — but anon does need to reach the view itself.
GRANT SELECT ON public.view_public_entry_results TO anon;

-- ---------------------------------------------------------------------------
-- 4. Notes for the next person.
-- ---------------------------------------------------------------------------
-- The remaining public views are security_invoker = true, so they resolve under the
-- caller's grants and RLS. Anon has no UI path to them and its RLS already returns
-- nothing, so they are intentionally left without anon grants — anon now gets a
-- permission error instead of an empty result. That is the intended outcome.
--
-- Verify from the APPLIED database, never the migration text:
--   select unnest(relacl)::text from pg_class where oid = 'public.<table>'::regclass;
-- information_schema.role_table_grants only shows grants visible to the querying role
-- and cannot prove absence.
