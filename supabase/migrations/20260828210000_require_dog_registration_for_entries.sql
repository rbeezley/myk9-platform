-- =============================================================================
-- Require a registration number to enter a dog (owner decision, 2026-08-28).
--
-- An entry without a registration number occupies a capacity spot for a dog that
-- cannot compete on show day. The rule already existed in the UI
-- (`components/shows/RegistrationWorkflow/registrationPrerequisite.ts`) but was
-- enforced ONLY there: `public.entries` carries no constraint and none of its 17
-- triggers checks registration, and replication writes go straight to the table
-- with no service layer in between. That is how 1270 of 1271 existing entries
-- came to reference dogs with no registration.
--
-- Scope decisions:
--   * INSERT only. Existing rows are left alone deliberately, and UPDATE is not
--     guarded so that move-ups and status changes on legacy entries keep working.
--     A move-up that re-points a legacy entry at another class is therefore still
--     able to carry a dog with no number -- accepted, and recorded here so it is
--     not mistaken for an oversight.
--   * The conformation-puppy carve-out is preserved: AKC permits entering a puppy
--     in conformation before registration completes, and the UI already encodes
--     it. Dropping it here would make the database stricter than the rulebook.
--   * SECURITY DEFINER is required, not incidental: `dog_registrations` is
--     RLS-protected and a secretary entering someone else's dog would otherwise
--     read zero rows and be rejected for a registration that exists. The function
--     returns nothing but a pass/fail, so it leaks no registration data.
--
-- The registry is resolved per TRIAL, not per show: a show can host AKC, UKC and
-- ASCA trials side by side (the demo show does). This mirrors
-- `getTrialRegistry`, which defaults a blank `registry_id` to AKC.
-- =============================================================================

BEGIN;

-- Mirrors `normalizeOrganization` in features/dogs/identity/resolveDogIdentity.ts.
-- `dog_registrations.organization` is free text and has drifted: the live database
-- holds both 'AKC' and 'AKC (American Kennel Club)'. An exact match would reject
-- most real registrations.
CREATE OR REPLACE FUNCTION public.normalize_registry_organization(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE upper(btrim(regexp_replace(coalesce(raw, ''), '\(.*$', '')))
    WHEN ''                                       THEN NULL
    WHEN 'AMERICAN KENNEL CLUB'                   THEN 'AKC'
    WHEN 'UNITED KENNEL CLUB'                     THEN 'UKC'
    WHEN 'AUSTRALIAN SHEPHERD CLUB OF AMERICA'    THEN 'ASCA'
    WHEN 'CANADIAN KENNEL CLUB'                   THEN 'CKC'
    WHEN 'FEDERATION CYNOLOGIQUE INTERNATIONALE'  THEN 'FCI'
    ELSE upper(btrim(regexp_replace(coalesce(raw, ''), '\(.*$', '')))
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_registry_organization(text) FROM PUBLIC;
-- Explicit role decisions. anon never resolves registries; authenticated may, so
-- client-side and database-side normalisation cannot drift apart unnoticed.
REVOKE EXECUTE ON FUNCTION public.normalize_registry_organization(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_registry_organization(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_registry_organization(text) TO service_role;

CREATE OR REPLACE FUNCTION public.entries_require_dog_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_registry     text;
  v_trial_type   text;
  v_class_meta   text;
  v_has_number   boolean;
BEGIN
  IF NEW.dog_id IS NULL OR NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(nullif(btrim(t.registry_id), ''), 'AKC'),
    coalesce(t.trial_type, ''),
    lower(concat_ws(' ', c.name, c.element, c.level))
  INTO v_registry, v_trial_type, v_class_meta
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = NEW.class_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Conformation puppy classes may be entered before registration completes.
  IF lower(v_trial_type) LIKE '%conformation%' AND v_class_meta LIKE '%puppy%' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.dog_registrations r
    WHERE r.dog_id = NEW.dog_id
      AND btrim(coalesce(r.registration_number, '')) <> ''
      AND public.normalize_registry_organization(r.organization)
          = public.normalize_registry_organization(v_registry)
  )
  INTO v_has_number;

  IF NOT v_has_number THEN
    RAISE EXCEPTION
      'This dog has no % registration number. A registration number is required to enter.',
      v_registry
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.entries_require_dog_registration() FROM PUBLIC;
-- Trigger functions are invoked by the trigger, never called directly, so no API
-- role gets EXECUTE. Stated explicitly rather than left to inference.
REVOKE EXECUTE ON FUNCTION public.entries_require_dog_registration() FROM anon;
REVOKE EXECUTE ON FUNCTION public.entries_require_dog_registration() FROM authenticated;

DROP TRIGGER IF EXISTS trg_entries_require_dog_registration ON public.entries;
CREATE TRIGGER trg_entries_require_dog_registration
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.entries_require_dog_registration();

COMMENT ON FUNCTION public.entries_require_dog_registration() IS
  'Rejects an INSERT into public.entries when the dog has no registration number '
  'for the trial''s registry. Mirrors registrationPrerequisite.ts, including the '
  'conformation-puppy exception. INSERT only by design -- see migration header.';

COMMIT;
