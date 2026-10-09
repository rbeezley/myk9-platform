-- MYK9-1010 (Codex P1, owner-approved fix): let a show's staff fill the BLANK
-- parts of a dog owner's address while taking an entry.
--
-- 20261008183700 made submit_show_entries refuse an AKC entry whose dog's owner
-- has no complete address, and the wizard blocks the class with an in-place
-- fix. For staff that fix saved through update_person_details, which a
-- non-admin secretary may call only under can_manage_show_person: the person
-- must already have a live entry in a show the caller manages. A mail-in
-- secretary keying an owner's FIRST entry therefore could not add the address,
-- and the address gate refused the entry: a deadlock.
--
-- public.fill_entry_owner_address(show, dog, street, city, state, zip):
--
-- 1. AUTHORIZATION: public.can_manage_show(p_show_id), exactly as
--    create_show_managed_person / create_show_managed_dog (20260524121000)
--    authorize the same desk's "create a person/dog for this show" writes:
--    club admin or trial secretary of the show's club, or a platform admin.
--    The show must also be live (deleted_at IS NULL), restated here because
--    can_manage_show deliberately does not filter deleted shows. Refusal is
--    42501.
-- 2. TARGET: the owner (dogs.owner_id) of a live dog. A deleted dog, an
--    unknown dog, a dog with no owner, or a deleted owner is refused (22023).
--    Restated filters, because SECURITY DEFINER drops RLS.
-- 3. WRITE: ONLY street_address, city, state, zip_code, and ONLY where the
--    stored value is NULL or blank after btrim. A non-blank stored part is
--    never overwritten or cleared; a blank input writes nothing. No other
--    column is touched. Inputs are trimmed and length-bounded (200 chars; 20
--    for the ZIP) so this cannot be used to stuff the row.
--    "Fill blanks only" is what makes the wider reach acceptable: unlike
--    update_person_details this needs no prior entry, so it may only add an
--    address that is missing, never change one somebody entered.
-- 4. RESULT: the owner's four stored parts after the write, so the client can
--    show what is now on file.
-- 5. GRANTS: authenticated only. REVOKE from PUBLIC and anon (a definer
--    function is EXECUTE-able by PUBLIC by default).

BEGIN;

CREATE OR REPLACE FUNCTION public.fill_entry_owner_address(
  p_show_id uuid,
  p_dog_id uuid,
  p_street_address text,
  p_city text,
  p_state text,
  p_zip_code text
)
RETURNS TABLE (street_address text, city text, state text, zip_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_street text := NULLIF(btrim(coalesce(p_street_address, '')), '');
  v_city   text := NULLIF(btrim(coalesce(p_city, '')), '');
  v_state  text := NULLIF(btrim(coalesce(p_state, '')), '');
  v_zip    text := NULLIF(btrim(coalesce(p_zip_code, '')), '');
BEGIN
  IF p_show_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.shows s WHERE s.id = p_show_id AND s.deleted_at IS NULL
     )
     OR NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  IF length(v_street) > 200 OR length(v_city) > 200 OR length(v_state) > 200
     OR length(v_zip) > 20 THEN
    RAISE EXCEPTION 'Address part too long' USING ERRCODE = '22023';
  END IF;

  SELECT d.owner_id INTO v_owner_id
  FROM public.dogs d
  JOIN public.people p ON p.id = d.owner_id AND p.deleted_at IS NULL
  WHERE d.id = p_dog_id
    AND d.deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Dog % has no live owner on file', p_dog_id USING ERRCODE = '22023';
  END IF;

  UPDATE public.people p
  SET street_address = coalesce(NULLIF(btrim(p.street_address), ''), v_street, p.street_address),
      city = coalesce(NULLIF(btrim(p.city), ''), v_city, p.city),
      state = coalesce(NULLIF(btrim(p.state), ''), v_state, p.state),
      zip_code = coalesce(NULLIF(btrim(p.zip_code), ''), v_zip, p.zip_code)
  WHERE p.id = v_owner_id
    AND p.deleted_at IS NULL
    AND (
      (NULLIF(btrim(p.street_address), '') IS NULL AND v_street IS NOT NULL)
      OR (NULLIF(btrim(p.city), '') IS NULL AND v_city IS NOT NULL)
      OR (NULLIF(btrim(p.state), '') IS NULL AND v_state IS NOT NULL)
      OR (NULLIF(btrim(p.zip_code), '') IS NULL AND v_zip IS NOT NULL)
    );

  RETURN QUERY
  SELECT p.street_address, p.city, p.state, p.zip_code
  FROM public.people p
  WHERE p.id = v_owner_id;
END;
$$;

COMMENT ON FUNCTION public.fill_entry_owner_address(uuid, uuid, text, text, text, text) IS
  'MYK9-1010: a show manager (can_manage_show) fills only the BLANK street/city/state/ZIP of a live dog''s live owner, so an AKC entry can be taken without a prior entry. Never overwrites or clears a stored part; touches no other column.';

REVOKE ALL ON FUNCTION public.fill_entry_owner_address(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fill_entry_owner_address(uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fill_entry_owner_address(uuid, uuid, text, text, text, text) TO authenticated;

COMMIT;
