-- MYK9-1151: an offline dog create merged onto an existing dog keeps its
-- sibling registrations. Based on 20261015030017 (MYK9-1117), the latest
-- accepted function definition. Only the early-return branch changes: before
-- returning the existing dog, each OTHER registration in the payload is
-- inserted onto it when (a) the dog has no live registration in that
-- organization (dog_registrations_live_dog_org_unique) and (b) no live dog
-- holds that organization/number (dog_registrations_live_org_number_unique).
-- Both are checked explicitly (no ON CONFLICT DO NOTHING: a silent no-op may be
-- another tenant's row). A skipped row is silent by owner decision and never
-- fails the create. Authorization, signature, SECURITY DEFINER, search_path and
-- ACL are unchanged. The sibling loop alone is gated to a secretary, site admin
-- or the matched dog's owner/co-owner (a club admin merges but writes nothing).

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
  v_sibling jsonb;
  v_sibling_org text;
  v_sibling_number text;
  v_sibling_constraint text;
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
        -- Authorization parity with dog_registrations_insert RLS: the early
        -- return admits any club admin, but writing onto the matched dog is
        -- limited to a secretary, a site admin, or the dog's own owner/co-owner.
        -- A caller outside that set silently skips the siblings and still gets
        -- the existing dog back. Ownership is the CALLER's person, never
        -- v_owner_id: a privileged caller (a club admin) may name any owner in
        -- p_dog, so the payload cannot vouch for itself. For everyone else
        -- v_owner_id already equals get_my_person_id() (checked above).
        IF public.is_trial_secretary()
          OR public.is_site_admin()
          OR v_existing_owner_id = public.get_my_person_id()
          OR v_existing_co_owner_id = public.get_my_person_id()
        THEN
          FOR v_sibling IN SELECT value FROM jsonb_array_elements(p_registrations)
          LOOP
            v_sibling_org := COALESCE(NULLIF(v_sibling->>'organization', ''), 'AKC');
            v_sibling_number := COALESCE(NULLIF(v_sibling->>'registration_number', ''), '');

            -- The registration that matched is already on the existing dog.
            IF public.normalize_dog_registration_organization(v_sibling_org)
                 = public.normalize_dog_registration_organization(COALESCE(NULLIF(v_reg->>'organization', ''), 'AKC'))
              AND public.normalize_dog_registration_number(v_sibling_number)
                 = public.normalize_dog_registration_number(v_reg->>'registration_number')
            THEN
              CONTINUE;
            END IF;

            -- The dog already has a registration in this organization.
            IF EXISTS (
              SELECT 1 FROM public.dog_registrations dr
              WHERE dr.dog_id = v_existing_dog_id
                AND dr.dog_deleted_at IS NULL
                AND public.normalize_dog_registration_organization(dr.organization)
                  = public.normalize_dog_registration_organization(v_sibling_org)
            ) THEN
              CONTINUE;
            END IF;

            -- The number belongs to another live dog.
            IF public.normalize_dog_registration_number(v_sibling_number) <> ''
              AND EXISTS (
                SELECT 1 FROM public.dog_registrations dr
                WHERE dr.dog_deleted_at IS NULL
                  AND public.normalize_dog_registration_organization(dr.organization)
                    = public.normalize_dog_registration_organization(v_sibling_org)
                  AND public.normalize_dog_registration_number(dr.registration_number)
                    = public.normalize_dog_registration_number(v_sibling_number)
              )
            THEN
              CONTINUE;
            END IF;

            -- The EXISTS checks above race a concurrent merge onto the same dog:
            -- both can pass before either insert commits. Each sibling insert is
            -- its own subtransaction, so the loser of that race skips just this
            -- sibling (as if the check had seen it) instead of failing the whole
            -- create, which the mutation queue would treat as permanent. Only the
            -- three uniqueness constraints the checks stand in for are absorbed;
            -- any other error, including other unique violations, re-raises.
            BEGIN
              INSERT INTO public.dog_registrations (
                dog_id, organization, registered_name, registration_number, breed, status, registration_date, created_at
              ) VALUES (
                v_existing_dog_id,
                v_sibling_org,
                NULLIF(v_sibling->>'registered_name', ''),
                v_sibling_number,
                NULLIF(v_sibling->>'breed', ''),
                COALESCE(NULLIF(v_sibling->>'status', ''), 'pending'),
                NULLIF(v_sibling->>'registration_date', '')::date,
                COALESCE(NULLIF(v_sibling->>'created_at', '')::timestamptz, NOW())
              );
            EXCEPTION WHEN unique_violation THEN
              GET STACKED DIAGNOSTICS v_sibling_constraint = CONSTRAINT_NAME;
              IF v_sibling_constraint NOT IN (
                'dog_registrations_live_org_number_unique',
                'dog_registrations_live_dog_org_unique',
                'dog_registrations_dog_id_organization_key'
              ) THEN
                RAISE;
              END IF;
            END;
          END LOOP;

        END IF;

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
      dog_id, organization, registered_name, registration_number, breed, status, registration_date, created_at
    ) VALUES (
      v_dog_id,
      COALESCE(NULLIF(v_reg->>'organization', ''), 'AKC'),
      NULLIF(v_reg->>'registered_name', ''),
      COALESCE(NULLIF(v_reg->>'registration_number', ''), ''),
      NULLIF(v_reg->>'breed', ''),
      COALESCE(NULLIF(v_reg->>'status', ''), 'pending'),
      NULLIF(v_reg->>'registration_date', '')::date,
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
