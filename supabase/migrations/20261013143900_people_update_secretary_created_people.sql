-- A secretary may edit a mail-in person she brought into the platform, not only one
-- already entered in her show (MYK9-1134, the person counterpart of MYK9-1127).
--
-- Incident (2026-10-13 walk of MYK9-1112): in Add Entry -> Quick Create a secretary
-- created a mail-in person, opened Edit Details, changed the last name and saved.
-- update_person_details answered 403 "Permission denied" on every attempt: it admitted
-- only the person themselves, a site admin, or can_manage_show_person(), which needs an
-- existing entry in a show the caller manages. A person created in Quick Create has no
-- entry yet, so the edit could never be saved.
--
-- Two arms are added, matching dog_edit_allowed() (20261012224900), and both apply ONLY
-- to a person with no sign-in account (auth_user_id IS NULL):
--   * created_from_show_id is a show the caller can manage. guard_creation_attribution
--     drops it on INSERT unless the caller can manage that show and freezes it on
--     UPDATE, so it cannot be forged to gain access.
--   * created_by is the caller AND the caller still holds a staff role. created_by is
--     stamped from auth.uid() on INSERT and frozen on UPDATE by the same trigger.
-- A person who has a sign-in account owns their record: these arms never reach them,
-- even if a secretary originally created the row and the person later signed up and was
-- adopted. The identity and status guards are unchanged and still run on every write:
-- people_guard_identity_columns (auth_user_id and email, MYK9-710) and
-- people_protect_status (account suspension, MYK9-712).
--
-- The whole rule lives in ONE function, person_edit_allowed(), used by the people_update
-- policy (fed the row's own columns, so it never re-reads public.people from inside a
-- people policy), by update_person_details / update_person_details_versioned, by
-- person_email_lock_facts() (the edit panel's email-lock read), and by can_edit_person(),
-- the UI's question. The two RPC bodies are copied from the live
-- definitions (latest migrations 20260924231700 and 20261009214700); only their
-- authorization block changes.

CREATE OR REPLACE FUNCTION public.person_edit_allowed(
  p_person_id uuid,
  p_auth_user_id uuid,
  p_created_by uuid,
  p_created_from_show_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    (p_auth_user_id IS NOT NULL AND p_auth_user_id = (SELECT auth.uid()))
    OR (SELECT public.is_site_admin())
    OR public.can_manage_show_person(p_person_id)
    OR (
      p_auth_user_id IS NULL
      AND (
        (
          p_created_from_show_id IS NOT NULL
          AND public.can_manage_show(p_created_from_show_id)
        )
        OR (
          p_created_by IS NOT NULL
          AND p_created_by = (SELECT auth.uid())
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active = true
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('secretary', 'club_admin', 'site_admin', 'platform_admin')
          )
        )
      )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.person_edit_allowed(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_edit_allowed(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- The UI's question: "may I edit this person?". SECURITY INVOKER on purpose: it reads the
-- person under the caller's own people_select. NULL, not false, when no row comes back: a
-- person created on a device and not uploaded yet is not on the server, and "not here yet"
-- must not read as "no" (the client treats NULL as unanswered).
CREATE OR REPLACE FUNCTION public.can_edit_person(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT public.person_edit_allowed(p.id, p.auth_user_id, p.created_by, p.created_from_show_id)
  FROM public.people p
  WHERE p.id = p_person_id
    AND p.deleted_at IS NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_edit_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_person(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "people_update" ON public.people;
CREATE POLICY "people_update" ON public.people
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.person_edit_allowed(people.id, people.auth_user_id, people.created_by, people.created_from_show_id))
  )
  WITH CHECK (
    (SELECT public.person_edit_allowed(people.id, people.auth_user_id, people.created_by, people.created_from_show_id))
  );

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
    'zip_code', 'country', 'profile_image'
  ];
  v_unknown text;
  v_row jsonb;
  v_dob date;
  v_numbers jsonb;
  v_patch jsonb;
  v_key text;
  v_value jsonb;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.people p WHERE p.id = p_person_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  -- MYK9-1134: the one edit rule, shared with the people_update policy.
  IF NOT EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = p_person_id
      AND public.person_edit_allowed(p.id, p.auth_user_id, p.created_by, p.created_from_show_id)
  ) THEN
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
      profile_image = CASE WHEN v_people ? 'profile_image' THEN v_people ->> 'profile_image' ELSE p.profile_image END
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

CREATE OR REPLACE FUNCTION public.update_person_details_versioned(p_person_id uuid, p_expected_version integer, p_people jsonb DEFAULT '{}'::jsonb, p_private jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_people jsonb := coalesce(p_people, '{}'::jsonb);
  v_current integer;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- D2: email edits stay online-only. Checked before anything else, so a queued
  -- email change can never reach the identity guards from an offline device.
  IF jsonb_typeof(v_people) = 'object' AND v_people ? 'email' THEN
    RAISE EXCEPTION 'An email address can only be changed while online.'
      USING ERRCODE = '22023';
  END IF;

  -- Same existence and authorization predicate as update_person_details, checked
  -- before the version is read so a refusal reveals nothing about the row.
  IF NOT EXISTS (
    SELECT 1 FROM public.people p WHERE p.id = p_person_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  -- MYK9-1134: the one edit rule, shared with the people_update policy.
  IF NOT EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = p_person_id
      AND public.person_edit_allowed(p.id, p.auth_user_id, p.created_by, p.created_from_show_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Lock the row so the version cannot move between the check and the write.
  SELECT p.version INTO v_current
  FROM public.people p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict updating person % (expected %)',
      p_person_id, p_expected_version
      USING ERRCODE = '40001', DETAIL = v_current::text;
  END IF;

  v_row := public.update_person_details(p_person_id, v_people, p_private, false);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Person % was not updated', p_person_id USING ERRCODE = '42501';
  END IF;

  RETURN (v_row ->> 'version')::integer;
END;
$function$;

-- The edit panel's email-lock read answers "only for a person the caller may already
-- update" (personEmailLock.ts). Keep that true by reading the same one rule; copied from
-- the live definition (20260923211700), only the authorization predicate changes.
CREATE OR REPLACE FUNCTION public.person_email_lock_facts(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.person_email_lock_facts_unchecked(p.id)
    from public.people p
   where p.id = p_person_id
     and p.deleted_at is null
     and public.person_edit_allowed(p.id, p.auth_user_id, p.created_by, p.created_from_show_id);
$function$;

-- Restate the live grants (unchanged): authenticated and service_role only, never anon.
REVOKE EXECUTE ON FUNCTION public.person_email_lock_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_email_lock_facts(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_details_versioned(uuid, integer, jsonb, jsonb) TO authenticated, service_role;
