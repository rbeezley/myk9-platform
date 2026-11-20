-- =============================================================================
-- MYK9-2292 (plan-premium-completeness, Phase 5c, ASCA B2c): a judge's affiliation (ASCA
-- Scent Detection rules §1.5.7), e.g. "ASCA-approved judge, Region 4", entered once on the
-- judge's person record and printed beside their name on an ASCA premium.
--
-- WHY people AND NOT judge_assignments. The affiliation is the judge's standing, true at every
-- show they judge; judge_assignments is one row per judge per class per show, so it would be
-- retyped for every show and every class. people already holds the judge-only residence
-- (city, state) the premium prints beside the same name.
--
-- GRANTS / RLS. No new table. public.people keeps its grants: authenticated holds table-wide
-- SELECT (row visibility is RLS, unchanged) and anon holds only a COLUMN allowlist
-- (id, first_name, last_name, ...) that this column is NOT added to, so anon cannot read it.
-- No GRANT or REVOKE is issued for the column: a column-level GRANT would put a column ACL on
-- a table that carries none for authenticated. Writes go through update_person_details (the one
-- person-save path, SECURITY DEFINER, gated by person_edit_allowed), which is restated below
-- with the column added to its editable list; the people_update policy is unchanged.
-- Effective access is asserted by supabase/tests/myk9_2292_judge_affiliation_test.sql.
--
-- The function body is copied unchanged from 20261013143900_people_update_secretary_created_people.sql
-- (the latest definition); only 'judge_affiliation' in v_editable and in the UPDATE is new, and a
-- blank value is stored as NULL ("not set").
-- =============================================================================

BEGIN;

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS judge_affiliation text;

ALTER TABLE public.people
  ADD CONSTRAINT people_judge_affiliation_length
  CHECK (judge_affiliation IS NULL OR char_length(judge_affiliation) <= 200);

COMMENT ON COLUMN public.people.judge_affiliation IS
  'MYK9-2292: ASCA §1.5.7 judge affiliation, free text (e.g. "ASCA-approved judge, Region 4"). NULL = not set. Printed beside the judge on an ASCA premium list.';

CREATE OR REPLACE FUNCTION public.update_person_details(p_person_id uuid, p_people jsonb DEFAULT '{}'::jsonb, p_private jsonb DEFAULT '{}'::jsonb, p_require_unlinked boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_people jsonb := coalesce(p_people, '{}'::jsonb);
  v_private jsonb := coalesce(p_private, '{}'::jsonb);
  v_editable text[] := ARRAY[
    'first_name', 'last_name', 'email', 'phone', 'street_address', 'city', 'state',
    'zip_code', 'country', 'profile_image', 'judge_affiliation'
  ];
  v_unknown text;
  v_row jsonb;
  v_dob date;
  v_numbers jsonb;
  v_patch jsonb;
  v_key text;
  v_value jsonb;
  v_auth_user_id uuid;
  v_created_by uuid;
  v_created_from_show_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_people) <> 'object' OR jsonb_typeof(v_private) <> 'object' THEN
    RAISE EXCEPTION 'p_people and p_private must be JSON objects' USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(k, ', ') INTO v_unknown
  FROM jsonb_object_keys(v_people) AS k
  WHERE k <> ALL (v_editable);
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'These person fields cannot be changed here: %', v_unknown
      USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(k, ', ') INTO v_unknown
  FROM jsonb_object_keys(v_private) AS k
  WHERE k NOT IN ('date_of_birth', 'junior_handler_numbers');
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown private detail: %', v_unknown USING ERRCODE = '22023';
  END IF;

  -- MYK9-1134: lock the row BEFORE deciding, then apply the one edit rule (shared with
  -- the people_update policy) to the locked, current row. Checking first and locking
  -- later let a concurrent signup adoption link an account between the two, and this
  -- definer function would then write a person the caller may no longer edit.
  SELECT p.auth_user_id, p.created_by, p.created_from_show_id
    INTO v_auth_user_id, v_created_by, v_created_from_show_id
  FROM public.people p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  IF NOT public.person_edit_allowed(p_person_id, v_auth_user_id, v_created_by, v_created_from_show_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Validate the private patch BEFORE writing anything.
  IF v_private ? 'date_of_birth' THEN
    IF jsonb_typeof(v_private -> 'date_of_birth') = 'null' THEN
      v_dob := NULL;
    ELSIF jsonb_typeof(v_private -> 'date_of_birth') = 'string' THEN
      BEGIN
        v_dob := (v_private ->> 'date_of_birth')::date;
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

  v_patch := v_private -> 'junior_handler_numbers';
  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'junior_handler_numbers must be an object' USING ERRCODE = '22023';
  END IF;

  -- The people row first: the race guard decides whether anything is written.
  UPDATE public.people p
  SET first_name = CASE WHEN v_people ? 'first_name' THEN v_people ->> 'first_name' ELSE p.first_name END,
      last_name = CASE WHEN v_people ? 'last_name' THEN v_people ->> 'last_name' ELSE p.last_name END,
      email = CASE WHEN v_people ? 'email' THEN v_people ->> 'email' ELSE p.email END,
      phone = CASE WHEN v_people ? 'phone' THEN v_people ->> 'phone' ELSE p.phone END,
      street_address = CASE WHEN v_people ? 'street_address' THEN v_people ->> 'street_address' ELSE p.street_address END,
      city = CASE WHEN v_people ? 'city' THEN v_people ->> 'city' ELSE p.city END,
      state = CASE WHEN v_people ? 'state' THEN v_people ->> 'state' ELSE p.state END,
      zip_code = CASE WHEN v_people ? 'zip_code' THEN v_people ->> 'zip_code' ELSE p.zip_code END,
      country = CASE WHEN v_people ? 'country' THEN v_people ->> 'country' ELSE p.country END,
      profile_image = CASE WHEN v_people ? 'profile_image' THEN v_people ->> 'profile_image' ELSE p.profile_image END,
      judge_affiliation = CASE WHEN v_people ? 'judge_affiliation' THEN nullif(btrim(v_people ->> 'judge_affiliation'), '') ELSE p.judge_affiliation END
  WHERE p.id = p_person_id
    AND p.deleted_at IS NULL
    AND (NOT coalesce(p_require_unlinked, false) OR p.auth_user_id IS NULL)
  RETURNING to_jsonb(p) INTO v_row;

  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_private <> '{}'::jsonb THEN
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
    SET date_of_birth = CASE WHEN v_private ? 'date_of_birth' THEN v_dob ELSE pp.date_of_birth END,
        junior_handler_numbers = v_numbers
    WHERE pp.person_id = p_person_id;
  END IF;

  RETURN v_row;
END;
$function$;

-- Restate the live grants (unchanged): authenticated and service_role only, never anon.
REVOKE EXECUTE ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) TO authenticated, service_role;

COMMIT;
