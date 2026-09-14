-- MYK9-490: one sanctioning registry per show.
--
-- DOMAIN RULE (Richard, 2026-09-14): a single show may NOT carry trials from different
-- sanctioning organizations. Several SPORTS under one organization are fine — an AKC show
-- running AKC Scent Work alongside AKC Obedience is a normal show. A cross-registry cluster
-- (a club running AKC on Saturday and UKC on Sunday) is TWO shows, not one.
--
-- WHY A TRIGGER AND NOT A CHECK
-- `trials.registry_id` is per-trial, so the rule spans rows: "this trial's registry must equal
-- every sibling trial's registry". A CHECK constraint sees one row and cannot express it.
--
-- WHAT THE SHOW'S REGISTRY *IS* — the existing rule, not a second one
-- `20260701120000_sync_trial_registry_on_show_org_change.sql` already states it:
-- `trials.registry_id` is a DENORMALIZED PROJECTION of `shows.organization`, derived as the
-- trimmed organization when it names a configured registry (AKC/UKC/ASCA), else 'AKC'. The
-- client says the same thing in `deriveRegistryId()`, and the show-creation wizard derives the
-- registry ONCE from `show.organization` and stamps it on every trial it creates
-- (`buildCreateShowPayload.ts`, `useShowCreationWizardActions.ts`).
--
-- So this migration does not invent a rule. It makes the EXISTING projection authoritative on
-- the write path: a trial whose registry_id disagrees with its show's organization is refused.
-- That implies the sibling rule for free — every trial in a show resolves to the same value —
-- and it is strictly more specific, so there is only ever one answer to "what registry is this
-- show?".
--
-- The derivation was duplicated verbatim in the sync trigger and would have been duplicated a
-- third time here; it is extracted into `public.derive_registry_id(text)` instead and the sync
-- trigger is rebuilt on top of it (copied from 20260701120000, the LATEST migration defining
-- it), so the two can no longer drift apart.
--
-- EXISTING ROWS ARE NOT VALIDATED
-- The trigger is BEFORE INSERT OR UPDATE OF registry_id, show_id — it fires on new writes only.
-- A live read-only audit on 2026-09-14 found exactly ONE violating show: `Heartland Scent Work
-- Classic` (`dededede-…010`, organization AKC) carrying a UKC and an ASCA trial. Validating
-- existing rows at migration time would therefore fail the push on a fixture. The seed is
-- corrected separately in `supabase/seed-demo.sql` (same PR); the migration deliberately stays
-- additive so `supabase db push` is safe on a database that still holds the old seed.
--
-- The btrim is load-bearing: `deriveRegistryId()` trims before matching, so ' UKC ' must
-- resolve to 'UKC' here too. btrim(NULL) is NULL and NULL IN (...) is NULL, so a null
-- organization falls through to 'AKC' exactly as `deriveRegistryId(null)` does.

begin;

-- ---------------------------------------------------------------------------
-- The one derivation, shared by the enforcement trigger and the sync trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_registry_id(p_organization text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN btrim(p_organization) IN ('AKC', 'UKC', 'ASCA') THEN btrim(p_organization)
    ELSE 'AKC'
  END;
$fn$;

COMMENT ON FUNCTION public.derive_registry_id(text) IS
  'MYK9-490: the single server-side definition of a show''s registry — the trimmed '
  'shows.organization when it names a configured registry (AKC/UKC/ASCA), else AKC. '
  'Mirrors the client deriveRegistryId(). Used by sync_trial_registry_from_show() and '
  'enforce_show_registry_on_trial() so the projection cannot drift between them.';

-- Callable by nobody: it is an internal helper for two triggers, not an API surface. A trigger
-- fires its function regardless of EXECUTE privileges, and this helper is invoked from inside
-- those trigger bodies, so revoking it costs nothing and closes a handle on a function that
-- would otherwise be reachable over PostgREST RPC.
REVOKE ALL ON FUNCTION public.derive_registry_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_registry_id(text) FROM anon;
REVOKE ALL ON FUNCTION public.derive_registry_id(text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: the function must read `public.shows` to learn the show's organization, and
-- the writer of a trial is not guaranteed SELECT on that show row under RLS (a draft show, an
-- anonymous ringside session, a support path). Without DEFINER the lookup would find no row and
-- the guard would silently pass — the worst possible failure mode for a guard. It reads exactly
-- one column of one show, writes nothing, and returns no data.
CREATE OR REPLACE FUNCTION public.enforce_show_registry_on_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_organization text;
  v_show_found boolean := false;
  v_show_registry text;
BEGIN
  SELECT s.organization, true
    INTO v_organization, v_show_found
    FROM public.shows s
   WHERE s.id = NEW.show_id;

  -- No show row: the foreign key will reject this write on its own. Raising here would replace
  -- a clear FK error with a confusing registry one.
  IF NOT v_show_found THEN
    RETURN NEW;
  END IF;

  v_show_registry := public.derive_registry_id(v_organization);

  IF NEW.registry_id IS DISTINCT FROM v_show_registry THEN
    RAISE EXCEPTION
      'This show is sanctioned by %. Every trial in it must be a % trial — trials from another organization belong to their own show.',
      v_show_registry, v_show_registry
      USING ERRCODE = 'MK490',
            DETAIL = format(
              'trial %s requested registry_id %L; show %s (organization %L) resolves to %L',
              COALESCE(NEW.id::text, '(new)'), NEW.registry_id, NEW.show_id,
              v_organization, v_show_registry
            ),
            HINT = 'Create a separate show for the other organization''s trials, or change this show''s organization.';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_show_registry_on_trial() IS
  'MYK9-490: refuses a trial whose registry_id disagrees with its show''s organization '
  '(public.derive_registry_id). One sanctioning registry per show; several sports under one '
  'registry are fine. Raises SQLSTATE MK490 so the show-creation wizard can surface a typed '
  'message. BEFORE INSERT OR UPDATE OF registry_id, show_id — pre-existing rows are not '
  'revalidated.';

REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM authenticated;

-- Column-scoped on UPDATE: a trial's name, date, status and pipeline stage churn constantly and
-- none of them can break the invariant. Only registry_id (the value under test) and show_id
-- (which changes WHICH show it is tested against) can.
DROP TRIGGER IF EXISTS trg_enforce_show_registry_on_trial ON public.trials;
CREATE TRIGGER trg_enforce_show_registry_on_trial
  BEFORE INSERT OR UPDATE OF registry_id, show_id ON public.trials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_show_registry_on_trial();

-- ---------------------------------------------------------------------------
-- Rebuild the sync trigger on the shared derivation.
--
-- Body copied from 20260701120000 (the latest — and only — migration defining it), with the
-- inline CASE replaced by public.derive_registry_id(). Behaviour is unchanged: same trimming,
-- same AKC fallback, same idempotent WHERE guard. The cascade it performs now passes through
-- trg_enforce_show_registry_on_trial above and is consistent by construction — it writes
-- exactly the value the enforcement trigger derives.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_trial_registry_from_show()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_registry_id text;
BEGIN
  -- Only act on a real organization change.
  IF NEW.organization IS NOT DISTINCT FROM OLD.organization THEN
    RETURN NEW;
  END IF;

  v_registry_id := public.derive_registry_id(NEW.organization);

  UPDATE public.trials
     SET registry_id = v_registry_id,
         updated_at = NOW()
   WHERE show_id = NEW.id
     AND registry_id IS DISTINCT FROM v_registry_id;

  RETURN NEW;
END;
$fn$;

-- Same decision as the other two: a trigger fires its function regardless of EXECUTE
-- privileges, so no client role needs a handle on it. Restated here because this migration
-- REPLACES the function and a replace carries the decision with it.
REVOKE ALL ON FUNCTION public.sync_trial_registry_from_show() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_trial_registry_from_show() FROM anon;
REVOKE ALL ON FUNCTION public.sync_trial_registry_from_show() FROM authenticated;

COMMENT ON FUNCTION public.sync_trial_registry_from_show() IS
  'Trigger fn: on a shows.organization change, re-derive registry_id for every child trial via '
  'public.derive_registry_id (AKC/UKC/ASCA, else AKC). Authoritative server-side backstop for '
  'the client resyncTrialRegistry, which is replica-bound. Since MYK9-490 the derivation is '
  'shared with enforce_show_registry_on_trial() so the two cannot drift.';

commit;

NOTIFY pgrst, 'reload schema';
