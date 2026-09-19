-- MYK9-664 — move junior-handler identity fields out of the broad people directory.
--
-- Deployment order is intentional:
--   1. create the private boundary and its grants/policies;
--   2. backfill the values while the legacy columns still exist;
--   3. assert that the backfill is lossless;
--   4. remove the legacy columns only after the application reads/writes have moved.
--
-- Rollback before step 4: add the two legacy columns back, copy the values from
-- people_private, then remove people_private. A rollback after step 4 follows the
-- same sequence in reverse and must restore the columns before dropping the table.

BEGIN;

CREATE TABLE public.people_private (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  date_of_birth date,
  junior_handler_numbers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.people_private'::regclass
      AND conname = 'people_private_date_of_birth_plausible'
  ) THEN
    ALTER TABLE public.people_private
      ADD CONSTRAINT people_private_date_of_birth_plausible
      CHECK (
        date_of_birth IS NULL
        OR (date_of_birth > DATE '1900-01-01' AND date_of_birth < DATE '2100-01-01')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.people_private'::regclass
      AND conname = 'people_private_junior_handler_numbers_shape'
  ) THEN
    ALTER TABLE public.people_private
      ADD CONSTRAINT people_private_junior_handler_numbers_shape
      CHECK (
        jsonb_typeof(junior_handler_numbers) = 'object'
        AND junior_handler_numbers - ARRAY['AKC', 'UKC', 'ASCA'] = '{}'::jsonb
        AND (NOT junior_handler_numbers ? 'AKC'
             OR jsonb_typeof(junior_handler_numbers -> 'AKC') = 'string')
        AND (NOT junior_handler_numbers ? 'UKC'
             OR jsonb_typeof(junior_handler_numbers -> 'UKC') = 'string')
        AND (NOT junior_handler_numbers ? 'ASCA'
             OR jsonb_typeof(junior_handler_numbers -> 'ASCA') = 'string')
      );
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS people_private_set_updated_at ON public.people_private;
CREATE TRIGGER people_private_set_updated_at
  BEFORE UPDATE ON public.people_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Explicit API-role decisions. There is deliberately no anon grant: default
-- privileges in this project grant anon CRUD on new public tables unless revoked.
REVOKE ALL ON TABLE public.people_private FROM anon;
REVOKE ALL ON TABLE public.people_private FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.people_private TO authenticated;
GRANT ALL ON TABLE public.people_private TO service_role;

ALTER TABLE public.people_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_private FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_people_private(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_person_id = (SELECT public.get_my_person_id())
      OR (SELECT public.is_site_admin())
      OR EXISTS (
        SELECT 1
        FROM public.entries e
        LEFT JOIN public.dogs d ON d.id = e.dog_id
        WHERE e.deleted_at IS NULL
          AND e.show_id IS NOT NULL
          AND (
            e.handler_id = p_person_id
            OR (e.handler_id IS NULL AND (d.owner_id = p_person_id OR d.co_owner_id = p_person_id))
          )
          AND e.show_id IN (SELECT public.manageable_show_ids())
      );
$$;

COMMENT ON FUNCTION public.can_read_people_private(uuid) IS
  'MYK9-664: self, site-admin, or a manager of a show with an active entry for this handler. The person argument is required; no nullable role wildcard is accepted.';

REVOKE ALL ON FUNCTION public.can_read_people_private(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_people_private(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_people_private(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_write_people_private(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_person_id = (SELECT public.get_my_person_id())
      OR (SELECT public.is_site_admin());
$$;

COMMENT ON FUNCTION public.can_write_people_private(uuid) IS
  'MYK9-664: private fields are writable only by the subject or a site admin. Show managers receive no write arm.';

REVOKE ALL ON FUNCTION public.can_write_people_private(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_people_private(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_people_private(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS people_private_select ON public.people_private;
CREATE POLICY people_private_select ON public.people_private
  FOR SELECT TO authenticated
  USING ((SELECT public.can_read_people_private(people_private.person_id)));

DROP POLICY IF EXISTS people_private_insert ON public.people_private;
CREATE POLICY people_private_insert ON public.people_private
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_people_private(people_private.person_id)));

DROP POLICY IF EXISTS people_private_update ON public.people_private;
CREATE POLICY people_private_update ON public.people_private
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_people_private(people_private.person_id)))
  WITH CHECK ((SELECT public.can_write_people_private(people_private.person_id)));

DROP POLICY IF EXISTS people_private_delete ON public.people_private;
CREATE POLICY people_private_delete ON public.people_private
  FOR DELETE TO authenticated
  USING ((SELECT public.can_write_people_private(people_private.person_id)));

-- The app calls these narrow RPCs until the generated schema types are refreshed
-- from the applied database. The read and write functions repeat the private
-- boundary rather than relying on a caller-provided role or a broad people read.
CREATE OR REPLACE FUNCTION public.get_people_private(p_person_ids uuid[])
RETURNS TABLE (
  person_id uuid,
  date_of_birth date,
  junior_handler_numbers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pp.person_id, pp.date_of_birth, pp.junior_handler_numbers
  FROM public.people_private pp
  WHERE pp.person_id = ANY(COALESCE(p_person_ids, ARRAY[]::uuid[]))
    AND public.can_read_people_private(pp.person_id);
$$;

COMMENT ON FUNCTION public.get_people_private(uuid[]) IS
  'MYK9-664: returns only private profiles the subject, a site admin, or a manager of a related show may read.';

REVOKE ALL ON FUNCTION public.get_people_private(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_people_private(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_people_private(uuid[]) TO authenticated, service_role;

-- Update the public profile and an explicitly-present private patch in one
-- transaction. The previous client flow read private values, wrote them, then
-- updated people and attempted a compensating private write on failure. That
-- read/merge/rollback sequence could overwrite a concurrent edit. This RPC
-- locks the person row first, validates the same public update boundary as the
-- people RLS policy, and applies both patches before returning the merged row.
CREATE OR REPLACE FUNCTION public.update_person_with_private(
  p_person_id uuid,
  p_public_updates jsonb,
  p_private_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person public.people;
  v_private public.people_private;
  v_public jsonb := COALESCE(p_public_updates, '{}'::jsonb);
  v_private_patch jsonb := COALESCE(p_private_updates, '{}'::jsonb);
  v_has_private_patch boolean;
BEGIN
  IF p_person_id IS NULL
     OR jsonb_typeof(v_public) <> 'object'
     OR jsonb_typeof(v_private_patch) <> 'object' THEN
    RAISE EXCEPTION 'Profile update payload must be JSON objects'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_person
  FROM public.people
  WHERE id = p_person_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_person.auth_user_id = (SELECT auth.uid())
    OR (SELECT public.can_manage_show_person(p_person_id))
    OR (SELECT public.is_site_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_public) AS key
    WHERE key NOT IN (
      'first_name', 'last_name', 'email', 'phone', 'street_address',
      'city', 'state', 'zip_code', 'country', 'profile_image', 'status'
    )
  ) THEN
    RAISE EXCEPTION 'Profile update contains an unsupported public field'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_private_patch) AS key
    WHERE key NOT IN ('date_of_birth', 'junior_handler_numbers')
  ) THEN
    RAISE EXCEPTION 'Profile update contains an unsupported private field'
      USING ERRCODE = '22023';
  END IF;

  v_has_private_patch :=
    v_private_patch ? 'date_of_birth'
    OR v_private_patch ? 'junior_handler_numbers';

  IF v_has_private_patch AND NOT public.can_write_people_private(p_person_id) THEN
    RAISE EXCEPTION 'Private person fields may only be changed by the subject or a site admin'
      USING ERRCODE = '42501';
  END IF;

  -- Keep the sign-in identity invariant enforced at the write itself. The app
  -- still performs its friendly preflight check, but this closes the adoption
  -- race between that check and this transaction.
  IF v_public ? 'email'
     AND lower(btrim(v_person.email)) IS DISTINCT FROM lower(btrim(v_public->>'email'))
     AND v_person.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This person signs in with this email address, so it cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET first_name = CASE WHEN v_public ? 'first_name' THEN v_public->>'first_name' ELSE first_name END,
      last_name = CASE WHEN v_public ? 'last_name' THEN v_public->>'last_name' ELSE last_name END,
      email = CASE
        WHEN v_public ? 'email'
          AND v_person.auth_user_id IS NOT NULL
          AND lower(btrim(v_person.email)) = lower(btrim(v_public->>'email'))
          THEN v_person.email
        WHEN v_public ? 'email' THEN v_public->>'email'
        ELSE email
      END,
      phone = CASE WHEN v_public ? 'phone' THEN v_public->>'phone' ELSE phone END,
      street_address = CASE WHEN v_public ? 'street_address' THEN v_public->>'street_address' ELSE street_address END,
      city = CASE WHEN v_public ? 'city' THEN v_public->>'city' ELSE city END,
      state = CASE WHEN v_public ? 'state' THEN v_public->>'state' ELSE state END,
      zip_code = CASE WHEN v_public ? 'zip_code' THEN v_public->>'zip_code' ELSE zip_code END,
      country = CASE WHEN v_public ? 'country' THEN v_public->>'country' ELSE country END,
      profile_image = CASE WHEN v_public ? 'profile_image' THEN v_public->>'profile_image' ELSE profile_image END,
      status = CASE WHEN v_public ? 'status' THEN v_public->>'status' ELSE status END,
      updated_at = now()
  WHERE id = p_person_id
  RETURNING * INTO v_person;

  IF v_has_private_patch THEN
    INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
    VALUES (
      p_person_id,
      CASE WHEN v_private_patch ? 'date_of_birth'
        THEN (v_private_patch->>'date_of_birth')::date ELSE NULL END,
      CASE WHEN v_private_patch ? 'junior_handler_numbers'
        THEN COALESCE(v_private_patch->'junior_handler_numbers', '{}'::jsonb)
        ELSE '{}'::jsonb END
    )
    ON CONFLICT (person_id) DO UPDATE
      SET date_of_birth = CASE WHEN v_private_patch ? 'date_of_birth'
        THEN EXCLUDED.date_of_birth ELSE people_private.date_of_birth END,
          junior_handler_numbers = CASE WHEN v_private_patch ? 'junior_handler_numbers'
        THEN EXCLUDED.junior_handler_numbers ELSE people_private.junior_handler_numbers END;
  END IF;

  SELECT * INTO v_private
  FROM public.people_private
  WHERE person_id = p_person_id;

  RETURN to_jsonb(v_person)
    || jsonb_build_object(
      'date_of_birth', v_private.date_of_birth,
      'junior_handler_numbers', v_private.junior_handler_numbers
    );
END;
$$;

COMMENT ON FUNCTION public.update_person_with_private(uuid, jsonb, jsonb) IS
  'MYK9-664: atomically updates an authorized public person patch and explicitly-present subject/site-admin private fields; locks the person row to prevent stale compensation writes.';

REVOKE ALL ON FUNCTION public.update_person_with_private(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_person_with_private(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_person_with_private(uuid, jsonb, jsonb) TO authenticated, service_role;

-- PostgREST caches the RPC schema. Refresh it after creating the functions so
-- clients can call the new signatures immediately after this migration runs.
NOTIFY pgrst, 'reload schema';

-- Backfill before removing the source columns. Existing values are copied exactly;
-- empty JSON objects do not create needless rows.
INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
SELECT p.id, p.date_of_birth, p.junior_handler_numbers
FROM public.people p
WHERE p.date_of_birth IS NOT NULL
   OR p.junior_handler_numbers <> '{}'::jsonb
ON CONFLICT (person_id) DO UPDATE
  SET date_of_birth = EXCLUDED.date_of_birth,
      junior_handler_numbers = EXCLUDED.junior_handler_numbers;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.people p
    JOIN public.people_private pp ON pp.person_id = p.id
    WHERE p.date_of_birth IS DISTINCT FROM pp.date_of_birth
       OR p.junior_handler_numbers IS DISTINCT FROM pp.junior_handler_numbers
  ) THEN
    RAISE EXCEPTION 'MYK9-664 backfill mismatch between people and people_private';
  END IF;
END;
$$;

-- Application code no longer selects or updates these columns. Dropping them is
-- what makes a broad people-directory query unable to return private data even if
-- a future caller accidentally asks for every people column.
ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_date_of_birth_plausible,
  DROP CONSTRAINT IF EXISTS people_junior_handler_numbers_shape,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS junior_handler_numbers;

COMMIT;
