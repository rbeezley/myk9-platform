-- =============================================================================
-- Migration 20260618150000: create_dog_with_registrations RPC
--
-- Context:
-- addDog in useDogStoreCompat.ts wrote to dogs and dog_registrations across
-- two round-trips with no transaction guard. If the registrations INSERT
-- failed, the dog row existed without its registrations — a silent partial
-- write with no rollback.
--
-- Fix: SECURITY DEFINER RPC that accepts a full dog payload and a
-- registrations array as JSONB and inserts all rows in a single implicit
-- PL/pgSQL transaction. Any exception rolls back the entire batch.
--
-- Authorization mirrors the dogs_insert RLS policy (migration 006 / 147):
-- caller must be the owner (auth.uid() = owner_id) or a site admin.
-- =============================================================================

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

  IF v_caller_auth <> v_owner_id AND NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'not authorized to create a dog for owner %', v_owner_id
      USING ERRCODE = '42501';
  END IF;

  -- Insert dog row
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
    (p_dog->'spayed_neutered')::boolean,
    COALESCE((p_dog->'deceased')::boolean, FALSE),
    NULLIF(p_dog->>'deceased_date', '')::date,
    COALESCE(NULLIF(p_dog->>'status', ''), 'active'),
    NOW()
  );

  -- Insert registrations (empty array = no-op)
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
  'Atomically creates a dog with its registrations in a single transaction. Any failure rolls back the whole batch. Authorization mirrors dogs_insert RLS: caller must be the owner (auth.uid() = owner_id) or a site admin.';
