-- MYK9-1162: Add Dog asks for the registry number first. An exhibitor cannot see
-- another owner's dog (dogs_select / dog_registrations_select), so the client
-- cannot tell from its own copy that a number is already in use. This answers
-- that one question, yes or no, and nothing else: no dog id, owner or details.
--
-- Comparison mirrors create_dog_with_registrations (latest definition
-- 20261009194100): normalized organization (blank means AKC) and normalized
-- number, against registrations of LIVE dogs. An empty normalized number is never
-- "taken", exactly as that function skips it.

BEGIN;

CREATE OR REPLACE FUNCTION public.registry_identity_taken(
  p_organization        text,
  p_registration_number text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_org    text;
BEGIN
  v_number := public.normalize_dog_registration_number(p_registration_number);
  IF v_number = '' THEN
    RETURN false;
  END IF;

  v_org := public.normalize_dog_registration_organization(
    COALESCE(NULLIF(p_organization, ''), 'AKC')
  );

  RETURN EXISTS (
    SELECT 1
    FROM public.dog_registrations dr
    JOIN public.dogs d ON d.id = dr.dog_id
    WHERE d.deleted_at IS NULL
      AND public.normalize_dog_registration_organization(dr.organization) = v_org
      AND public.normalize_dog_registration_number(dr.registration_number) = v_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registry_identity_taken(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registry_identity_taken(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.registry_identity_taken(text, text) TO authenticated;

COMMENT ON FUNCTION public.registry_identity_taken(text, text) IS
  'MYK9-1162: true when a live dog already holds this registry identity (normalized organization, blank = AKC; normalized number; empty number is never taken). Returns a boolean only, so an exhibitor learns a number is in use without seeing another owner''s dog. Authenticated only.';

COMMIT;
