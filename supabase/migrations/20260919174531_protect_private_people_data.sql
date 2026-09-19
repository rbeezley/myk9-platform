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

CREATE INDEX IF NOT EXISTS people_private_person_id_idx
  ON public.people_private (person_id);

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
-- from the applied database. Both functions repeat the private boundary rather
-- than relying on a caller-provided role or a broad people read.
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

CREATE OR REPLACE FUNCTION public.upsert_people_private(
  p_person_id uuid,
  p_date_of_birth date,
  p_junior_handler_numbers jsonb
)
RETURNS TABLE (
  person_id uuid,
  date_of_birth date,
  junior_handler_numbers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_person_id IS NULL OR NOT public.can_write_people_private(p_person_id) THEN
    RAISE EXCEPTION 'Private person fields may only be changed by the subject or a site admin'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
  VALUES (p_person_id, p_date_of_birth, COALESCE(p_junior_handler_numbers, '{}'::jsonb))
  ON CONFLICT (person_id) DO UPDATE
    SET date_of_birth = EXCLUDED.date_of_birth,
        junior_handler_numbers = EXCLUDED.junior_handler_numbers;

  RETURN QUERY
    SELECT pp.person_id, pp.date_of_birth, pp.junior_handler_numbers
    FROM public.people_private pp
    WHERE pp.person_id = p_person_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_people_private(uuid, date, jsonb) IS
  'MYK9-664: subject/site-admin private profile write. Relationship-scoped show managers are intentionally denied.';

REVOKE ALL ON FUNCTION public.upsert_people_private(uuid, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_people_private(uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_people_private(uuid, date, jsonb) TO authenticated, service_role;

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
