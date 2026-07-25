-- MYK9-93 Phase 2 fix — repair two regressions introduced by 20260725160000.
--
-- Both were caught in review and reproduced against staging over real PostgREST.
--
-- REGRESSION 1 (critical, data exposure). 20260616120000_public_results_release_gate.sql
-- deliberately gave anon a COLUMN-level SELECT on public.entries: 14 safe columns, with
-- table-level SELECT revoked so withheld results and payment PII stayed unreachable.
-- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` destroys column grants too, and
-- the replacement `GRANT SELECT ON public.entries TO anon` was table-wide — so anon could
-- read total_score, final_placement, result_status, judge_notes, special_requests,
-- entry_fee, payment_status and stripe_payment_intent_id directly, routing around
-- view_public_entry_results. Verified exploitable on staging before this fix.
--
-- REGRESSION 2 (high, availability). PostgREST requires table-level SELECT on every
-- EMBEDDED relation, not just the queried one. `dogs` and `people` are embedded by
-- anon-reachable queries, so revoking their (previously default-granted) anon SELECT
-- turned a null/empty embed into a hard 42501 that fails the WHOLE request:
--   * public TV board /tv/:showId — services/database/tv-display/postgrest.ts
--     `entries(... dogs(name, call_name, breed, image_url))`
--     and `classes(... judge_assignments(people(first_name, last_name)))`
--   * public show detail /shows/:id — hooks/queries/useShowJudges.ts
--     `judge_assignments(people!inner(id, first_name, last_name))`
--   * guest cold-store classes tab — services/database/classes/reads.ts
--
-- Note these grants expose no data: dogs_select and people_select are both
-- `TO authenticated`, so anon still matches zero rows. The grant exists only so the
-- embed degrades to null/empty as it did before, instead of erroring. Column-scoped
-- to the embedded columns so the blast radius stays bounded if RLS ever loosens.

-- ---------------------------------------------------------------------------
-- 1. entries — restore the release-gate column allowlist.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.entries FROM anon;
REVOKE SELECT ON public.entries FROM PUBLIC;

GRANT SELECT (
  id,
  class_id,
  trial_id,
  show_id,
  dog_id,
  armband,
  handler,
  run_order,
  is_in_ring,
  is_scored,
  check_in_status,
  entry_status,
  jump_height,
  created_at
) ON public.entries TO anon;

COMMENT ON TABLE public.entries IS
  'MYK9-93 / release gate: anon holds a COLUMN-level SELECT allowlist only — never '
  'GRANT SELECT ON public.entries TO anon table-wide, and remember that REVOKE ALL '
  'drops column grants. Results and payment fields must reach anon only through '
  'view_public_entry_results.';

-- ---------------------------------------------------------------------------
-- 2. dogs / people — column-scoped grants so anon PostgREST embeds resolve.
-- ---------------------------------------------------------------------------

GRANT SELECT (id, name, call_name, breed, image_url) ON public.dogs   TO anon;
GRANT SELECT (id, first_name, last_name)             ON public.people TO anon;

COMMENT ON POLICY dogs_select ON public.dogs IS
  'MYK9-93: TO authenticated — anon matches zero rows. anon holds a column-scoped '
  'SELECT grant purely so PostgREST embeds (TV board, public show detail) return an '
  'empty embed instead of 42501; it conveys no data on its own.';

-- ---------------------------------------------------------------------------
-- 3. Close the FUNCTIONS half of the default-privilege trap (plan Phase 2.1).
-- ---------------------------------------------------------------------------
-- Omitted from 20260725160000. Affects only functions created after this point;
-- an anon-callable RPC must now carry an explicit GRANT EXECUTE ... TO anon.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON FUNCTIONS FROM anon';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'MYK9-93: could not revoke supabase_admin default FUNCTION privileges '
                'for anon. Run as supabase_admin to finish.';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Make PostgREST pick up the new ACLs immediately.
-- ---------------------------------------------------------------------------
-- Omitted from both prior migrations; 69 other migrations in this repo do this after
-- policy/grant changes.

NOTIFY pgrst, 'reload schema';
