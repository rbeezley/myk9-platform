-- Keep trials.registry_id consistent with the parent show's organization — server-side.
--
-- registry_id is a denormalized projection of shows.organization onto each trial
-- (write-path Phase 1). The client-side resync (resyncTrialRegistry) can only reach
-- trials present in the caller's local replica, so a show whose org is changed before
-- its trials have synced into IndexedDB would silently keep stale registry_id — the
-- exact drift Phase 3 aims to prevent. This trigger makes the invariant authoritative:
-- whenever a show's organization actually changes, every one of its trials is
-- re-derived, independent of any client's replica state.
--
-- Derivation mirrors the client deriveRegistryId(): the TRIMMED organization when it
-- names a configured registry (AKC/UKC/ASCA), else 'AKC' (the column default / fallback).
-- The btrim is load-bearing — deriveRegistryId() trims before matching, so ' UKC ' must
-- resolve to 'UKC' here too, or the authoritative trigger would overwrite to AKC what the
-- client wrote as UKC. btrim(NULL) is NULL and NULL IN (...) is NULL, so a null org falls
-- to 'AKC' just as deriveRegistryId(null) does.
-- Idempotent: only rows whose registry_id would actually change are touched, and the
-- WHERE guard means re-running the same org value is a no-op.

begin;

CREATE OR REPLACE FUNCTION public.sync_trial_registry_from_show()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_registry_id text;
BEGIN
  -- Only act on a real organization change.
  IF NEW.organization IS NOT DISTINCT FROM OLD.organization THEN
    RETURN NEW;
  END IF;

  -- btrim mirrors deriveRegistryId()'s .trim(): ' UKC ' -> 'UKC', not 'AKC'.
  v_registry_id := CASE
    WHEN btrim(NEW.organization) IN ('AKC', 'UKC', 'ASCA') THEN btrim(NEW.organization)
    ELSE 'AKC'
  END;

  UPDATE public.trials
     SET registry_id = v_registry_id,
         updated_at = NOW()
   WHERE show_id = NEW.id
     AND registry_id IS DISTINCT FROM v_registry_id;

  RETURN NEW;
END;
$$;

-- AFTER UPDATE OF organization: fires only when the organization column is in the
-- UPDATE's SET list; the IS NOT DISTINCT FROM guard above filters no-op writes.
DROP TRIGGER IF EXISTS trg_sync_trial_registry_from_show ON public.shows;
CREATE TRIGGER trg_sync_trial_registry_from_show
  AFTER UPDATE OF organization ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_trial_registry_from_show();

COMMENT ON FUNCTION public.sync_trial_registry_from_show() IS
  'Trigger fn: on a shows.organization change, re-derive registry_id (AKC/UKC/ASCA, else AKC) for every child trial. Authoritative server-side backstop for the client resyncTrialRegistry, which is replica-bound.';

commit;
