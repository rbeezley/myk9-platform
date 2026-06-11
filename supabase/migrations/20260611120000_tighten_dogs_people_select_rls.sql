-- Tighten dogs_select / people_select RLS — restore an actual read boundary.
--
-- Context: 20260602010000 / 20260602040000 simplified both SELECT policies to
-- `deleted_at IS NULL AND auth.uid() IS NOT NULL` for query performance — the prior
-- per-row can_manage_show_dog(dogs.id) / can_manage_show_person(people.id) helpers
-- are CORRELATED scalar subqueries (they reference the row id), so Postgres ran them
-- once per row → O(N x entries) → statement timeouts + a retry storm, and they
-- returned FALSE for a freshly-created dog with no entries (rolling back the
-- createDog `return=representation` INSERT with 42501).
--
-- Side effect of the simplification: ANY authenticated user could read EVERY dog and
-- every person's PII (email, phone). And because the dogs replication sync is
-- `from('dogs').select('*')`, the entire dogs table replicated into every client's
-- IndexedDB; client-side filterByOwnership was the ONLY thing scoping cross-tenant
-- display. See docs/plan-dogs-people-rls-tightening.md.
--
-- Fix: make RLS the real control again WITHOUT reintroducing the timeout. The
-- expensive show-staff branch becomes is_show_manager() — an UNCORRELATED scalar
-- subquery (no row reference), which Postgres hoists into an InitPlan evaluated ONCE
-- per statement, not per row:
--   * Exhibitor (not staff): indexed owner_id/co_owner_id checks per row; the
--     (SELECT is_show_manager()) InitPlan resolves false once → ZERO per-row function
--     calls. They read (and therefore replicate) only their own dogs.
--   * Secretary/admin (staff): (SELECT is_show_manager()) resolves true once → every
--     row passes with no per-row work. Preserves the secretary create-then-read path
--     (day-of-operations/late-entry-dog.ts inserts owner_id = exhibitor, reads back).
--
-- Tightening dogs_select also auto-scopes the replica: the sync `select('*')` now only
-- returns RLS-permitted rows, so exhibitor caches stop ingesting the whole table. No
-- replication-layer change is needed.
--
-- Residual / post-launch hardening (intentional — see plan doc):
--   * Staff read all dogs/people platform-wide, not just their managed shows (mirrors
--     the existing dogs_insert_secretary breadth). Show-scoping needs the per-row helper
--     that caused the timeout; defer until a denormalized show-visibility index exists.
--   * email/phone stay readable on rows the viewer can already see; column-level masking
--     is a separate follow-up.

BEGIN;

-- Cheap, parameterless "is this user show staff anywhere?" gate.
-- Composed from the existing, maintained role helpers rather than hardcoding role
-- names — is_site_admin() is the canonical admin check (site_admin), is_trial_secretary()
-- (no club arg) matches secretary/trial_secretary in any club, has_role('club_admin')
-- covers club admins. This keeps the policy correct if the canonical role set changes
-- and avoids duplicating a role-name list that has accreted dead names (platform_admin,
-- trial_secretary were removed from the seed in migrations 066/124 but linger in older
-- IN-lists). STABLE so a `(SELECT …)` call site is hoisted into a per-statement InitPlan
-- rather than re-evaluated per row; the inner helpers are SECURITY DEFINER and bypass
-- user_roles RLS.
CREATE OR REPLACE FUNCTION public.is_show_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_site_admin()
      OR public.is_trial_secretary()
      OR public.has_role('club_admin');
$$;

REVOKE ALL ON FUNCTION public.is_show_manager() FROM public;
GRANT EXECUTE ON FUNCTION public.is_show_manager() TO authenticated;

-- dogs: owner/co-owner self-service OR show staff. No per-row function — the only
-- per-row predicates are the indexed owner_id/co_owner_id equality checks.
DROP POLICY IF EXISTS dogs_select ON public.dogs;
CREATE POLICY dogs_select ON public.dogs
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT public.get_my_person_id())
      OR co_owner_id = (SELECT public.get_my_person_id())
      OR (SELECT public.is_show_manager())
    )
  );

-- people: self OR show staff. Mirrors the pre-simplification accepted policy
-- (self OR can_manage_show_person OR is_site_admin) with the correlated per-row
-- can_manage_show_person(people.id) replaced by the InitPlan gate. site_admin /
-- platform_admin are included in is_show_manager(), so no separate admin branch.
DROP POLICY IF EXISTS people_select ON public.people;
CREATE POLICY people_select ON public.people
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT public.is_show_manager())
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
