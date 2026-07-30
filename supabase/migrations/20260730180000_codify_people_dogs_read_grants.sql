-- MYK9-126 follow-on: codify two load-bearing grants that exist on the live
-- project but in NO migration — discovered when the entries_manager_policy
-- behavioral test became the first CI SQL test to read public.entries directly
-- as `authenticated` on a migrations-only database.
--
-- The entries_select RLS policy's handler and dog-owner arms are invoker-
-- evaluated EXISTS subqueries over public.people and public.dogs. Evaluating
-- the policy therefore requires `authenticated` to hold SELECT on both tables;
-- without them, EVERY authenticated read of public.entries fails with
-- "permission denied for table people" no matter which policy arm would match.
-- The live project has held full pre-migration-era grants on these tables
-- since before grants were tracked (verified via pg_class.relacl 2026-07-30:
-- authenticated=arwdDxtm on both), so production never noticed; only a
-- migrations-faithful rebuild (CI `supabase db reset`, disaster recovery)
-- breaks. This migration records the minimal read dependency; it is a no-op
-- on the live project.
--
-- Row visibility remains gated by RLS on people (119/20260611120000) and dogs
-- (20260612090000); these grants do not widen what any caller can see.
-- The broader live-vs-migrations grant drift on the other pre-rule core
-- tables is MYK9-93 territory, not this migration's scope.

GRANT SELECT ON public.people TO authenticated;
GRANT SELECT ON public.dogs TO authenticated;

-- Anon decision (required by the grant-decision contract): re-affirm the
-- column-scoped anon allowlists from 20260725170000 unchanged — anon gets
-- exactly the embed columns, never table-wide SELECT. Do NOT use REVOKE ALL
-- here: it would destroy these column grants (the MYK9-93 trap). The live
-- project also carries an untracked anon grant on people.email beyond this
-- allowlist; that discrepancy is deliberately NOT codified here and is left
-- to the MYK9-93 drift audit.
GRANT SELECT (id, name, call_name, breed, image_url) ON public.dogs   TO anon;
GRANT SELECT (id, first_name, last_name)             ON public.people TO anon;
