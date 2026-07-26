-- MYK9-90 section 5 — the call name becomes the required identifier and
-- public.dogs.name retires to a nullable legacy alias.
--
-- Verified against the applied database (sojmvhhwsjxmfistvzbe) on 2026-07-26,
-- immediately before writing this file:
--
--   select count(*) filter (where call_name is null)              -> 0
--          count(*) filter (where call_name is null and name is null) -> 0
--          count(*) filter (where name is null)                   -> 0
--          count(*)                                               -> 19
--     from public.dogs;
--
-- Every one of the 19 rows already has a call name, so the backfill below is a
-- no-op today and SET NOT NULL cannot fail. The backfill is kept anyway: this
-- file may be applied against a database that has drifted since the count, and
-- a SET NOT NULL that aborts mid-migration on a shared database is the worst
-- available outcome.

BEGIN;

-- 5.1 — defensive backfill, then make the call name required.
UPDATE public.dogs
SET call_name = name
WHERE call_name IS NULL
  AND name IS NOT NULL;

ALTER TABLE public.dogs
  ALTER COLUMN call_name SET NOT NULL;

COMMENT ON COLUMN public.dogs.call_name IS
  'The dog''s call name — the one name every dog has, e.g. "Tera". Required. '
  'This is the identifier the app displays. A registered name is NOT stored '
  'here; it belongs to a registration (public.dog_registrations.registered_name), '
  'because it is scoped to a sanctioning organization.';

-- 5.2 — dogs.name becomes a nullable legacy alias.
ALTER TABLE public.dogs
  ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN public.dogs.name IS
  'LEGACY ALIAS — do not read this as a registered name. Historically the call '
  'name was copied here to satisfy a NOT NULL constraint. Nothing writes it for '
  'new dogs as of MYK9-90, so it is NULL for anything created after this '
  'migration. The registered name lives on public.dog_registrations, scoped to '
  'its organization; the call name lives in public.dogs.call_name. This column '
  'is retained only until every reader is migrated (design open question 2) and '
  'is a candidate for a later DROP.';

-- 5.3 (database half) — stop writing the call name into dogs.name.
--
-- create_dog_with_registrations previously inserted `p_dog->>'name'` verbatim,
-- which is what the client filled with the call name. It now writes NULL when
-- the caller supplies no registered name, and derives call_name from the
-- caller's call_name, falling back to name only so that a caller written
-- against the old shape still produces a valid row rather than a bare 23502.
-- A row with neither raises an explicit error: the call name is now required,
-- and "which column was null" is not a useful thing to make a caller guess.
CREATE OR REPLACE FUNCTION public.create_dog_with_registrations(p_dog jsonb, p_registrations jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_auth uuid;
  v_dog_id      uuid;
  v_owner_id    uuid;
  v_call_name   text;
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

  v_call_name := COALESCE(
    NULLIF(btrim(p_dog->>'call_name'), ''),
    NULLIF(btrim(p_dog->>'name'), '')
  );

  IF v_call_name IS NULL THEN
    RAISE EXCEPTION 'p_dog must include a non-empty call_name'
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
    -- Legacy alias only. No longer fed the call name.
    NULLIF(btrim(p_dog->>'name'), ''),
    NULLIF(p_dog->>'breed', ''),
    NULLIF(p_dog->>'date_of_birth', '')::date,
    NULLIF(p_dog->>'sex', ''),
    NULLIF(p_dog->>'color', ''),
    NULLIF(p_dog->>'weight', ''),
    NULLIF(p_dog->>'height', ''),
    v_owner_id,
    NULLIF(p_dog->>'microchip_number', ''),
    NULLIF(p_dog->>'image_url', ''),
    v_call_name,
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
$function$;

-- create_show_managed_dog (recreated one migration earlier without the flat
-- registry parameters) left call_name nullable. call_name is NOT NULL from this
-- migration on, so it must fall back to the supplied name rather than insert a
-- NULL. dogs.name keeps its value here: this RPC is called with a real
-- registered name typed by a secretary, not with a copied call name.
CREATE OR REPLACE FUNCTION public.create_show_managed_dog(
  p_show_id uuid,
  p_owner_id uuid,
  p_name text,
  p_breed text,
  p_call_name text DEFAULT NULL::text,
  p_sex text DEFAULT NULL::text,
  p_microchip_number text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dog_id    uuid;
  v_call_name text;
BEGIN
  IF NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  v_call_name := COALESCE(NULLIF(btrim(p_call_name), ''), NULLIF(btrim(p_name), ''));

  IF v_call_name IS NULL THEN
    RAISE EXCEPTION 'a call name is required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dogs (
    owner_id,
    name,
    breed,
    call_name,
    sex,
    microchip_number,
    status
  )
  VALUES (
    p_owner_id,
    NULLIF(btrim(p_name), ''),
    btrim(p_breed),
    v_call_name,
    NULLIF(btrim(p_sex), ''),
    NULLIF(btrim(p_microchip_number), ''),
    'active'
  )
  RETURNING id INTO v_dog_id;

  RETURN v_dog_id;
END;
$function$;

COMMIT;
