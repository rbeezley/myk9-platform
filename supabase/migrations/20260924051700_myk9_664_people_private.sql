-- MYK9-664 — a handler's date of birth and junior handler numbers leave `people`.
--
-- Problem. `people_select` admits any caller holding a secretary or club-admin role
-- ANYWHERE (`is_show_manager()` is unscoped), so every such caller could read every
-- person's `date_of_birth` — personal data about a handler who may be a child — and
-- their registry-issued `junior_handler_numbers` (MYK9-570, 20260918154700).
--
-- Owner decisions (Richard, on the issue; final):
--   (a) Show managers can still SET a mail-in junior handler's date of birth and
--       junior handler numbers.
--   (b) Managers must NOT read either back. They see only a derived junior yes/no,
--       per entry, from the trial date. The two values are readable only by the person
--       themself and by site admins.
--
-- Design: a side table, not a column REVOKE on `people`.
--   * `people` carries table-wide SELECT for `authenticated`. Withholding two columns
--     from it means revoking table SELECT and re-granting every other column, and then
--     every `select('*')`, every `insert(...).select()` (RETURNING *) and every
--     `people(*)` embed dies 42501. `createUser` does exactly that today.
--   * A column REVOKE would not reach the SECURITY DEFINER functions that return whole
--     `people` rows (soft_delete_person, the deleted-entity reads, restore_person):
--     they run as the owner and would keep handing the columns to managers. Dropping
--     the columns removes them from every one of those row types at once.
--   * No view and no function body names either column (verified against the live
--     catalog before writing this file: no pg_depend rows beyond the two CHECKs and the
--     default), so the DROP needs no CASCADE.
--   Live rows carrying either value when this was written: 0 of 19. The copy below
--   runs anyway, so the migration is correct on any database it meets.
--
-- Access, restated in one place:
--   read   people_private: RLS — the person's own linked, non-deleted row, or site admin.
--   write  set_person_private_details(): self, site admin, or a manager of a show the
--          person is entered in (can_manage_show_person). Returns nothing, ever.
--   derived entry_handler_junior_flags(): per entry, to managers of that entry's show
--          (and site admins). Returns a boolean, never the date.
--   anon   nothing.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
CREATE TABLE public.people_private (
  person_id uuid PRIMARY KEY REFERENCES public.people (id) ON DELETE CASCADE,
  date_of_birth date,
  junior_handler_numbers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Carried over verbatim from 20260918154700; see that file for the reasoning.
  CONSTRAINT people_private_date_of_birth_plausible CHECK (
    date_of_birth IS NULL
    OR (date_of_birth > DATE '1900-01-01' AND date_of_birth < DATE '2100-01-01')
  ),
  CONSTRAINT people_private_junior_handler_numbers_shape CHECK (
    jsonb_typeof(junior_handler_numbers) = 'object'
    AND junior_handler_numbers - ARRAY['AKC', 'UKC', 'ASCA'] = '{}'::jsonb
    AND (NOT junior_handler_numbers ? 'AKC'
         OR jsonb_typeof(junior_handler_numbers -> 'AKC') = 'string')
    AND (NOT junior_handler_numbers ? 'UKC'
         OR jsonb_typeof(junior_handler_numbers -> 'UKC') = 'string')
    AND (NOT junior_handler_numbers ? 'ASCA'
         OR jsonb_typeof(junior_handler_numbers -> 'ASCA') = 'string')
  )
);

COMMENT ON TABLE public.people_private IS
  'MYK9-664: a person''s date of birth and registry-issued junior handler numbers. '
  'Readable only by the person and site admins (RLS). Written only through '
  'set_person_private_details(). Show managers see a derived junior flag via '
  'entry_handler_junior_flags(), never the values.';

CREATE TRIGGER update_people_private_updated_at
  BEFORE UPDATE ON public.people_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Move the data, then drop the columns from `people`.
-- ---------------------------------------------------------------------------
INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
SELECT p.id, p.date_of_birth, p.junior_handler_numbers
FROM public.people p
WHERE p.date_of_birth IS NOT NULL
   OR p.junior_handler_numbers <> '{}'::jsonb;

ALTER TABLE public.people
  DROP COLUMN date_of_birth,
  DROP COLUMN junior_handler_numbers;

-- ---------------------------------------------------------------------------
-- 3. Grants and RLS. The project's default privileges hand anon full CRUD on
--    every new table, so anon is revoked explicitly. authenticated reads only;
--    every write goes through the definer RPC below.
-- ---------------------------------------------------------------------------
ALTER TABLE public.people_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_private FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.people_private FROM PUBLIC;
REVOKE ALL ON public.people_private FROM anon;
REVOKE ALL ON public.people_private FROM authenticated;
GRANT SELECT ON public.people_private TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_private TO service_role;

-- Self is keyed on auth_user_id, which only a site admin or signup can change since
-- MYK9-710 (people_guard_identity_columns), so it cannot be forged by a manager.
CREATE POLICY people_private_select ON public.people_private
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.id = people_private.person_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The write path.
--
-- p_details is a patch; only the keys present are touched:
--   date_of_birth           'YYYY-MM-DD' sets it, null clears it.
--   junior_handler_numbers  an object merged key by key into the stored map. A string
--                           sets that registry's number (trimmed); null or a blank
--                           string removes it. Keys outside AKC/UKC/ASCA fail the CHECK.
-- Merge, not replace, because a manager cannot see what is stored: a form that shows
-- them one blank input per registry must not wipe the numbers it never displayed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_person_private_details(p_person_id uuid, p_details jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dob date;
  v_set_dob boolean := false;
  v_numbers jsonb;
  v_patch jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'p_details must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- Restated: the person exists and is not soft-deleted, for every caller.
  IF NOT EXISTS (
    SELECT 1 FROM public.people p WHERE p.id = p_person_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = p_person_id AND p.auth_user_id = v_uid AND p.deleted_at IS NULL
    )
    OR public.is_site_admin()
    OR public.can_manage_show_person(p_person_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_details ? 'date_of_birth' THEN
    v_set_dob := true;
    IF jsonb_typeof(p_details -> 'date_of_birth') = 'null' THEN
      v_dob := NULL;
    ELSIF jsonb_typeof(p_details -> 'date_of_birth') = 'string' THEN
      BEGIN
        v_dob := (p_details ->> 'date_of_birth')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'date_of_birth must be a date' USING ERRCODE = '22023';
      END;
      IF v_dob > current_date THEN
        RAISE EXCEPTION 'date_of_birth cannot be in the future' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'date_of_birth must be a date or null' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_patch := p_details -> 'junior_handler_numbers';
  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'junior_handler_numbers must be an object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.people_private (person_id)
  VALUES (p_person_id)
  ON CONFLICT (person_id) DO NOTHING;

  SELECT pp.junior_handler_numbers INTO v_numbers
  FROM public.people_private pp
  WHERE pp.person_id = p_person_id
  FOR UPDATE;

  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) = 'object' THEN
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_patch) LOOP
      IF jsonb_typeof(v_value) = 'null' OR btrim(v_value #>> '{}') = '' THEN
        v_numbers := v_numbers - v_key;
      ELSIF jsonb_typeof(v_value) = 'string' THEN
        v_numbers := v_numbers || jsonb_build_object(v_key, btrim(v_value #>> '{}'));
      ELSE
        RAISE EXCEPTION 'junior handler numbers must be strings' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  UPDATE public.people_private pp
  SET date_of_birth = CASE WHEN v_set_dob THEN v_dob ELSE pp.date_of_birth END,
      junior_handler_numbers = v_numbers
  WHERE pp.person_id = p_person_id;
END;
$$;

COMMENT ON FUNCTION public.set_person_private_details(uuid, jsonb) IS
  'MYK9-664: write a person''s date of birth / junior handler numbers (patch semantics). '
  'Self, site admin, or a manager of a show the person is entered in. Returns nothing.';

REVOKE ALL ON FUNCTION public.set_person_private_details(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_person_private_details(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_person_private_details(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_person_private_details(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The derived flag.
--
-- Mirrors deriveJuniorStatus() in apps/myk9show/src/features/registries/
-- juniorHandlerPolicy.ts exactly — read that file for the rulebook citations:
--   AKC   under 18 on the trial date.
--   UKC   under 18 on January 1 of the trial's year.
--   other (ASCA states no ceiling; an unknown registry has no rule) -> NULL.
-- NULL also for: no date of birth, no trial date, a date of birth after the
-- measuring date (bad data, never "a very young junior").
-- Completed years are computed on calendar fields, the same way the client does.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.handler_is_junior(
  p_date_of_birth date,
  p_trial_date date,
  p_registry_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH measure AS (
    SELECT
      CASE btrim(coalesce(p_registry_id, ''))
        WHEN 'AKC' THEN p_trial_date
        WHEN 'UKC' THEN make_date(extract(year FROM p_trial_date)::int, 1, 1)
        ELSE NULL
      END AS on_date
  ),
  age AS (
    SELECT
      extract(year FROM m.on_date)::int - extract(year FROM p_date_of_birth)::int
        - CASE
            WHEN (extract(month FROM m.on_date), extract(day FROM m.on_date))
               < (extract(month FROM p_date_of_birth), extract(day FROM p_date_of_birth))
            THEN 1 ELSE 0
          END AS years
    FROM measure m
    WHERE m.on_date IS NOT NULL AND p_date_of_birth IS NOT NULL
  )
  SELECT CASE WHEN a.years < 0 THEN NULL ELSE a.years < 18 END
  FROM age a;
$$;

COMMENT ON FUNCTION public.handler_is_junior(date, date, text) IS
  'MYK9-664: SQL twin of deriveJuniorStatus() (juniorHandlerPolicy.ts). true = junior, '
  'false = adult, NULL = cannot be derived. Keep both in step.';

-- Pure, but only ever called from the definer function below; no API role needs it.
REVOKE ALL ON FUNCTION public.handler_is_junior(date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handler_is_junior(date, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.handler_is_junior(date, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handler_is_junior(date, date, text) TO service_role;

CREATE FUNCTION public.entry_handler_junior_flags(p_entry_ids uuid[])
RETURNS TABLE (entry_id uuid, is_junior boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id,
    public.handler_is_junior(pp.date_of_birth, t.date, t.registry_id)
  FROM public.entries e
  JOIN public.classes c ON c.id = e.class_id AND c.deleted_at IS NULL
  JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
  JOIN public.people h ON h.id = e.handler_id AND h.deleted_at IS NULL
  LEFT JOIN public.people_private pp ON pp.person_id = h.id
  WHERE e.id = ANY (p_entry_ids)
    AND e.deleted_at IS NULL
    -- Restated: the trial the class hangs off belongs to the entry's show, and the
    -- caller manages THAT show. A manager of another show gets no row at all.
    AND t.show_id = e.show_id
    AND (SELECT auth.uid()) IS NOT NULL
    AND ((SELECT public.is_site_admin()) OR public.can_manage_show(e.show_id));
$$;

COMMENT ON FUNCTION public.entry_handler_junior_flags(uuid[]) IS
  'MYK9-664: per entry, is the handler a junior at that entry''s trial? Only for entries '
  'in shows the caller manages (or site admin). Never returns the date of birth.';

REVOKE ALL ON FUNCTION public.entry_handler_junior_flags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_handler_junior_flags(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.entry_handler_junior_flags(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entry_handler_junior_flags(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Fail the push rather than ship a readable date of birth.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'people'
      AND column_name IN ('date_of_birth', 'junior_handler_numbers')
  ) THEN
    RAISE EXCEPTION 'people still carries a junior handler PII column';
  END IF;
  IF has_table_privilege('anon', 'public.people_private', 'SELECT')
     OR has_table_privilege('anon', 'public.people_private', 'INSERT')
     OR has_table_privilege('anon', 'public.people_private', 'UPDATE')
     OR has_table_privilege('anon', 'public.people_private', 'DELETE') THEN
    RAISE EXCEPTION 'anon holds a privilege on people_private; it must hold none';
  END IF;
  IF has_table_privilege('authenticated', 'public.people_private', 'INSERT')
     OR has_table_privilege('authenticated', 'public.people_private', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.people_private', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated may only SELECT people_private; writes go through the RPC';
  END IF;
  IF has_function_privilege('anon', 'public.set_person_private_details(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.entry_handler_junior_flags(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute a MYK9-664 function; it must not';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
