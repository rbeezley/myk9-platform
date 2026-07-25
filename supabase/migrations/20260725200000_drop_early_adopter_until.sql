-- Task 8.2 of openspec/changes/exhibitor-journey-completion:
-- remove the legacy `people.early_adopter_until` entitlement storage.
--
-- Founding membership now lives in `subscription_entitlement_grants` as a
-- grant of type 'founding', created by the 3A backfill
-- (20260724120000_subscription_entitlement_grants.sql) with the legacy end
-- date preserved. Every application caller was migrated off the column first
-- (task 8.1) — `useSubscriptionGate` reads founding status from the
-- entitlement resolver, and `useExhibitorProfile` no longer selects it.
--
-- This migration removes, in order:
--   1. the two protection triggers on public.people
--   2. their SECURITY DEFINER function
--   3. the column itself
--
-- The preflight below ABORTS the migration rather than losing data if the
-- grants do not fully account for the column's contents.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight: the grant table must fully reproduce the column before it is safe
-- to drop. Three ways that could be false, all fatal:
--   A. a person has a legacy date with no founding grant  -> data would be LOST
--   B. a founding grant has no legacy date                -> backfill mismatch
--   C. a founding grant's end date drifted from the legacy value
--
-- (B) and (C) do not by themselves lose data, but either means the two stores
-- disagree, and a disagreement here is exactly what task 8.1 forbids
-- proceeding through. Fail loudly instead of guessing which side is right.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unmatched_legacy integer;
  v_orphan_founding  integer;
  v_drifted          integer;
BEGIN
  SELECT count(*) INTO v_unmatched_legacy
  FROM public.people p
  WHERE p.early_adopter_until IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.subscription_entitlement_grants g
      WHERE g.person_id = p.id AND g.grant_type = 'founding'
    );

  SELECT count(*) INTO v_orphan_founding
  FROM public.subscription_entitlement_grants g
  WHERE g.grant_type = 'founding'
    AND NOT EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = g.person_id AND p.early_adopter_until IS NOT NULL
    );

  SELECT count(*) INTO v_drifted
  FROM public.people p
  JOIN public.subscription_entitlement_grants g
    ON g.person_id = p.id AND g.grant_type = 'founding'
  WHERE p.early_adopter_until IS NOT NULL
    AND g.ends_at IS DISTINCT FROM p.early_adopter_until;

  IF v_unmatched_legacy > 0 OR v_orphan_founding > 0 OR v_drifted > 0 THEN
    RAISE EXCEPTION
      'early_adopter_until parity check FAILED — not dropping the column. unmatched_legacy=%, orphan_founding=%, drifted=%. Reconcile before re-running.',
      v_unmatched_legacy, v_orphan_founding, v_drifted;
  END IF;

  RAISE NOTICE 'PASS parity: every early_adopter_until value is reproduced by a founding grant';
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Protection triggers.
--
-- These existed to stop anyone but a site admin (or service_role/postgres)
-- changing the column. With the column gone they have nothing to protect —
-- the equivalent guard for grants is RLS plus the admin-only grant/revoke
-- RPCs, which is strictly stronger because it also records actor and reason.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS people_protect_early_adopter_trigger ON public.people;
DROP TRIGGER IF EXISTS people_protect_early_adopter_insert_trigger ON public.people;

-- 2. The trigger function, now unreferenced.
DROP FUNCTION IF EXISTS public.people_protect_early_adopter();

-- 3. The column.
ALTER TABLE public.people DROP COLUMN IF EXISTS early_adopter_until;

COMMIT;

-- ===========================================================================
-- ROLLBACK — reconstruct the column from grant history
-- ===========================================================================
--
-- The data is recoverable because founding grants retain their end dates; the
-- backfill was 1:1 and this migration refuses to run unless it still is. Run
-- the block below as a privileged role to restore the pre-migration state.
--
-- Note the one thing that does NOT round-trip: the legacy column had no
-- concept of revocation, so a founding grant revoked AFTER this migration ran
-- would be reconstructed as though it were never revoked. Reconstruct from
-- unrevoked grants only (as below) and treat the result as "founding grants
-- that are still valid", which is what the column meant in practice.
--
--   BEGIN;
--
--   ALTER TABLE public.people
--     ADD COLUMN IF NOT EXISTS early_adopter_until timestamptz;
--
--   -- Latest unrevoked founding grant per person. MAX() rather than an
--   -- arbitrary row: a person may have received a later non-overlapping gift,
--   -- and the column only ever held one date.
--   UPDATE public.people p
--   SET early_adopter_until = g.ends_at
--   FROM (
--     SELECT person_id, max(ends_at) AS ends_at
--     FROM public.subscription_entitlement_grants
--     WHERE grant_type = 'founding'
--       AND revoked_at IS NULL
--       AND superseded_at IS NULL
--     GROUP BY person_id
--   ) g
--   WHERE g.person_id = p.id;
--
--   CREATE OR REPLACE FUNCTION public.people_protect_early_adopter()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO ''
--   AS $fn$
--   begin
--     if tg_op = 'UPDATE'
--       and new.early_adopter_until is not distinct from old.early_adopter_until
--     then
--       return new;
--     end if;
--     if session_user = 'postgres'
--       or (select current_setting('role', true)) = 'service_role'
--       or public.is_site_admin()
--     then
--       return new;
--     end if;
--     raise exception 'Permission denied: early_adopter_until can only be changed by site admins'
--       using errcode = '42501';
--   end;
--   $fn$;
--
--   CREATE TRIGGER people_protect_early_adopter_trigger
--     BEFORE UPDATE ON public.people
--     FOR EACH ROW EXECUTE FUNCTION public.people_protect_early_adopter();
--
--   CREATE TRIGGER people_protect_early_adopter_insert_trigger
--     BEFORE INSERT ON public.people
--     FOR EACH ROW EXECUTE FUNCTION public.people_protect_early_adopter();
--
--   COMMIT;
--
-- After restoring, regenerate `packages/supabase/src/types/database.types.ts`
-- and revert the task 8.1 application changes — the client no longer selects
-- the column, so restoring it alone changes nothing user-visible.
