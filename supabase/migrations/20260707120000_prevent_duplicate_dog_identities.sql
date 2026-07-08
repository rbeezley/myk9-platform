-- Prevent duplicate live dogs from sharing the same registry identity.
--
-- Read-only duplicate inventory query to run before pushing this migration:
--
--   SELECT
--     public.normalize_dog_registration_organization(dr.organization) AS organization_key,
--     public.normalize_dog_registration_number(dr.registration_number) AS registration_number_key,
--     array_agg(dr.dog_id ORDER BY dr.dog_id) AS dog_ids,
--     count(DISTINCT dr.dog_id) AS dog_count
--   FROM public.dog_registrations dr
--   JOIN public.dogs d ON d.id = dr.dog_id
--   WHERE d.deleted_at IS NULL
--     AND public.normalize_dog_registration_number(dr.registration_number) <> ''
--   GROUP BY 1, 2
--   HAVING count(DISTINCT dr.dog_id) > 1;

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_dog_registration_organization(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'AKC%' THEN 'AKC'
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'UKC%' THEN 'UKC'
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'CKC%' THEN 'CKC'
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'FCI%' THEN 'FCI'
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'ASCA%' THEN 'ASCA'
    WHEN pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))) LIKE 'KC%' THEN 'KC'
    ELSE pg_catalog.regexp_replace(
      pg_catalog.upper(pg_catalog.btrim(COALESCE(value, ''))),
      '\s+',
      ' ',
      'g'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_dog_registration_number(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.upper(COALESCE(value, '')),
    '[^A-Z0-9]',
    '',
    'g'
  );
$$;

ALTER TABLE public.dog_registrations
  ADD COLUMN IF NOT EXISTS dog_deleted_at timestamptz;

UPDATE public.dog_registrations dr
SET dog_deleted_at = d.deleted_at
FROM public.dogs d
WHERE d.id = dr.dog_id
  AND dr.dog_deleted_at IS DISTINCT FROM d.deleted_at;

CREATE OR REPLACE FUNCTION public.sync_dog_registration_deleted_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT d.deleted_at
    INTO NEW.dog_deleted_at
  FROM public.dogs d
  WHERE d.id = NEW.dog_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_dog_registration_deleted_marker ON public.dog_registrations;
CREATE TRIGGER sync_dog_registration_deleted_marker
  BEFORE INSERT OR UPDATE OF dog_id ON public.dog_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_dog_registration_deleted_marker();

CREATE OR REPLACE FUNCTION public.sync_dog_registration_deleted_markers_for_dog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    UPDATE public.dog_registrations
    SET dog_deleted_at = NEW.deleted_at
    WHERE dog_id = NEW.id
      AND dog_deleted_at IS DISTINCT FROM NEW.deleted_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_dog_registration_deleted_markers_for_dog ON public.dogs;
CREATE TRIGGER sync_dog_registration_deleted_markers_for_dog
  AFTER UPDATE OF deleted_at ON public.dogs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_dog_registration_deleted_markers_for_dog();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.dog_registrations dr
    WHERE dr.dog_deleted_at IS NULL
      AND public.normalize_dog_registration_number(dr.registration_number) <> ''
    GROUP BY
      public.normalize_dog_registration_organization(dr.organization),
      public.normalize_dog_registration_number(dr.registration_number)
    HAVING count(DISTINCT dr.dog_id) > 1
  ) THEN
    RAISE EXCEPTION 'dog_registrations contains duplicate live registry identities; run the inventory query in migration 20260707120000 before applying';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dog_registrations dr
    WHERE dr.dog_deleted_at IS NULL
    GROUP BY dr.dog_id, public.normalize_dog_registration_organization(dr.organization)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'dog_registrations contains duplicate live organizations for a dog; normalize/merge rows before applying migration 20260707120000';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS dog_registrations_live_org_number_unique
  ON public.dog_registrations (
    public.normalize_dog_registration_organization(organization),
    public.normalize_dog_registration_number(registration_number)
  )
  WHERE dog_deleted_at IS NULL
    AND public.normalize_dog_registration_number(registration_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS dog_registrations_live_dog_org_unique
  ON public.dog_registrations (
    dog_id,
    public.normalize_dog_registration_organization(organization)
  )
  WHERE dog_deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_dog_with_registrations(
  p_dog           jsonb,
  p_registrations jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth uuid;
  v_dog_id      uuid;
  v_owner_id    uuid;
  v_reg         jsonb;
  v_existing_dog_id uuid;
  v_existing_owner_id uuid;
  v_existing_co_owner_id uuid;
  v_is_privileged boolean;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_dog_id   := (p_dog->>'id')::uuid;
  v_owner_id := (p_dog->>'owner_id')::uuid;

  IF v_dog_id IS NULL THEN
    RAISE EXCEPTION 'p_dog must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'p_dog must include a non-null owner_id'
      USING ERRCODE = '22023';
  END IF;

  v_is_privileged := public.is_trial_secretary()
    OR public.is_club_admin()
    OR public.is_site_admin();

  -- Mirror dogs_insert RLS: owner_id is a people.id, not an auth.uid().
  IF NOT (
    v_owner_id = public.get_my_person_id()
    OR (p_dog->>'co_owner_id') IS NOT NULL AND (p_dog->>'co_owner_id')::uuid = public.get_my_person_id()
    OR v_is_privileged
  ) THEN
    RAISE EXCEPTION 'not authorized to create a dog for owner %', v_owner_id
      USING ERRCODE = '42501';
  END IF;

  -- Exact duplicate registry identities should point at the existing dog
  -- when the caller owns/manages it. Otherwise the unique index remains the
  -- final guardrail and the app shows a plain duplicate message.
  FOR v_reg IN SELECT value FROM jsonb_array_elements(COALESCE(p_registrations, '[]'::jsonb))
  LOOP
    IF public.normalize_dog_registration_number(v_reg->>'registration_number') = '' THEN
      CONTINUE;
    END IF;

    SELECT d.id, d.owner_id, d.co_owner_id
      INTO v_existing_dog_id, v_existing_owner_id, v_existing_co_owner_id
    FROM public.dog_registrations dr
    JOIN public.dogs d ON d.id = dr.dog_id
    WHERE d.deleted_at IS NULL
      AND public.normalize_dog_registration_organization(dr.organization)
        = public.normalize_dog_registration_organization(COALESCE(NULLIF(v_reg->>'organization', ''), 'AKC'))
      AND public.normalize_dog_registration_number(dr.registration_number)
        = public.normalize_dog_registration_number(v_reg->>'registration_number')
    LIMIT 1;

    IF v_existing_dog_id IS NOT NULL THEN
      IF v_is_privileged
        OR v_existing_owner_id = v_owner_id
        OR v_existing_co_owner_id = v_owner_id
        OR v_existing_owner_id = public.get_my_person_id()
        OR v_existing_co_owner_id = public.get_my_person_id()
      THEN
        RETURN v_existing_dog_id;
      END IF;

      RAISE EXCEPTION 'registration number already belongs to another dog'
        USING ERRCODE = '23505',
              CONSTRAINT = 'dog_registrations_live_org_number_unique';
    END IF;
  END LOOP;

  INSERT INTO public.dogs (
    id, name, breed, date_of_birth, sex, color, weight, height,
    owner_id, microchip_number, image_url, call_name,
    spayed_neutered, deceased, deceased_date, status, updated_at
  ) VALUES (
    v_dog_id,
    p_dog->>'name',
    NULLIF(p_dog->>'breed', ''),
    NULLIF(p_dog->>'date_of_birth', '')::date,
    NULLIF(p_dog->>'sex', ''),
    NULLIF(p_dog->>'color', ''),
    NULLIF(p_dog->>'weight', ''),
    NULLIF(p_dog->>'height', ''),
    v_owner_id,
    NULLIF(p_dog->>'microchip_number', ''),
    NULLIF(p_dog->>'image_url', ''),
    NULLIF(p_dog->>'call_name', ''),
    NULLIF(p_dog->>'spayed_neutered', '')::boolean,
    COALESCE(NULLIF(p_dog->>'deceased', '')::boolean, FALSE),
    NULLIF(p_dog->>'deceased_date', '')::date,
    COALESCE(NULLIF(p_dog->>'status', ''), 'active'),
    NOW()
  );

  FOR v_reg IN SELECT value FROM jsonb_array_elements(COALESCE(p_registrations, '[]'::jsonb))
  LOOP
    INSERT INTO public.dog_registrations (
      dog_id, organization, registered_name, registration_number, breed, status
    ) VALUES (
      v_dog_id,
      COALESCE(NULLIF(v_reg->>'organization', ''), 'AKC'),
      NULLIF(v_reg->>'registered_name', ''),
      COALESCE(NULLIF(v_reg->>'registration_number', ''), ''),
      NULLIF(v_reg->>'breed', ''),
      COALESCE(NULLIF(v_reg->>'status', ''), 'pending')
    );
  END LOOP;

  RETURN v_dog_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dog_with_registrations(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dog_with_registrations(jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_dog_with_registrations(jsonb, jsonb) IS
  'Atomically creates a dog with registrations, or returns an existing authorized dog id when an exact live registry identity already exists.';

COMMIT;
