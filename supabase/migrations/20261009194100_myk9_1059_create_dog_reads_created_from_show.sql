-- MYK9-1059: create_dog_with_registrations records the add-entry show.
--
-- WHY
--
--   20261009174300 added dogs.created_from_show_id (client-set on INSERT; the
--   BEFORE INSERT trigger private.guard_creation_attribution keeps it only when
--   public.can_manage_show(id) is true for the caller, otherwise NULLs it) and
--   dogs.created_by (stamped by that trigger from auth.uid()). The add-entry
--   flow now sends created_from_show_id inside p_dog, but this RPC's dogs
--   INSERT names its columns explicitly, so the key was silently ignored and a
--   dog created through the RPC never recorded its show.
--
-- WHAT CHANGES
--
--   Only the dogs INSERT: created_from_show_id is added to the column list with
--   NULLIF(p_dog->>'created_from_show_id', '')::uuid, parsed the same way as
--   p_dog's id and owner_id (a malformed uuid raises 22P02, as those do; the
--   app only ever sends a show id or nothing). An absent or empty key is NULL.
--   No validation here: the trigger already drops a show the caller cannot
--   manage, and auth.uid() inside this SECURITY DEFINER function still reads
--   the caller's JWT (asserted for created_by in
--   supabase/tests/myk9_1059_creation_attribution_test.sql). created_by is
--   deliberately NOT written here; the trigger stamps it.
--
--   Everything else is copied verbatim from the latest definition
--   (20261002191547_myk9_946_create_dog_ownership_fail_closed, identical to
--   live pg_get_functiondef on 2026-10-09 apart from whitespace): the
--   signature, SECURITY DEFINER, the empty search_path, the MYK9-946
--   fail-closed authorization, the 22023/42501/23505 error codes, the
--   duplicate-registration lookup and the registrations INSERT.
--
--   The ACL is restated as live (proacl: postgres, authenticated,
--   service_role): signed-in callers and service_role, never anon or PUBLIC.

BEGIN;

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
  -- MYK9-946: fail closed. get_my_person_id() is NULL for a caller with no
  -- people row (an anonymous ringside-passcode session), so each arm is
  -- coalesced to false and the caller is refused unless the whole
  -- authorization IS TRUE. `IF NOT (NULL)` used to skip the refusal.
  -- The co-owner arm is gone (owner decision): naming yourself as
  -- co_owner_id admitted any owner_id, and co_owner_id is never written.
  IF (
    coalesce(v_owner_id = public.get_my_person_id(), false)
    OR coalesce(v_is_privileged, false)
  ) IS NOT TRUE THEN
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
    spayed_neutered, deceased, deceased_date, status, updated_at,
    created_from_show_id
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
    NOW(),
    -- MYK9-1059: the add-entry show. The creation-attribution trigger keeps it
    -- only when the caller can manage that show, and stamps created_by itself.
    NULLIF(p_dog->>'created_from_show_id', '')::uuid
  );

  FOR v_reg IN SELECT value FROM jsonb_array_elements(COALESCE(p_registrations, '[]'::jsonb))
  LOOP
    INSERT INTO public.dog_registrations (
      dog_id, organization, registered_name, registration_number, breed, status, created_at
    ) VALUES (
      v_dog_id,
      COALESCE(NULLIF(v_reg->>'organization', ''), 'AKC'),
      NULLIF(v_reg->>'registered_name', ''),
      COALESCE(NULLIF(v_reg->>'registration_number', ''), ''),
      NULLIF(v_reg->>'breed', ''),
      COALESCE(NULLIF(v_reg->>'status', ''), 'pending'),
      COALESCE(NULLIF(v_reg->>'created_at', '')::timestamptz, NOW())
    );
  END LOOP;

  RETURN v_dog_id;
END;
$function$;

-- The live ACL, restated (CREATE OR REPLACE keeps it): signed-in callers and
-- service_role, never anon or PUBLIC.
REVOKE ALL ON FUNCTION public.create_dog_with_registrations(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dog_with_registrations(jsonb, jsonb) TO authenticated, service_role;

COMMIT;
