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
--   (b) Managers must NOT read either back. They see only a junior yes/no per
--       entry. The two values are readable only by the person themself and by site
--       admins.
--   (c) After Codex's P1 on PR #2412 (option 3): the junior yes/no is RECORDED on
--       the entry, like the junior box ticked on a paper entry form, and never
--       derived from the date of birth on a manager's request. A live derivation
--       ("is this handler a junior at this trial's date?") lets a manager edit the
--       trial date, ask again, and bisect the handler's 18th birthday. See 5.
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
--   write  update_person_details(): the one person-save path. Self, site admin, or a
--          manager of a show the person is entered in (can_manage_show_person). Writes
--          the people columns and the private details in one transaction; never
--          returns the private values.
--   flag   entries.handler_is_junior: written ONLY by the BEFORE trigger
--          trg_entries_handler_is_junior — at entry creation, and on a recompute
--          that only a date-of-birth change (entries not yet run) or a site admin
--          (recompute_entry_handler_junior_flags) can start. Read by managers of the
--          entry's show (and site admins) through recorded_entry_handler_junior_flags();
--          no column grant, so no direct read.
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
  'update_person_details(). Show managers see only the junior flag recorded on each '
  'entry (entries.handler_is_junior), never the values.';

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
-- 4. The write path: ONE function for a person save, so the `people` columns and
--    the private details commit together or not at all.
--
-- Authorization is restated, because a definer function bypasses RLS. It is the
-- `people_update` policy's predicate, copied from its latest definition
-- (20260728130000_consolidate_identity_registration_rls.sql):
--     auth_user_id = auth.uid() OR can_manage_show_person(id) OR is_site_admin()
-- and the same rule governs the private details (decision a: a manager of a show the
-- person is entered in may SET them). The person must exist and not be soft-deleted.
--
-- p_people: only the columns the app's editors send. Any other key is REFUSED
-- (22023), never silently dropped, so a caller that grows a field finds out. Never
-- auth_user_id, status or deleted_at: identity is MYK9-710's, status is MYK9-712's
-- site-admin path, deletion has its own RPC. `email` passes through, so the MYK9-710
-- guard (people_authz_guard_identity_columns, keyed on the `role` GUC, which a definer
-- function does not change) and the sign-in email invariant still fire here.
--
-- p_private is a patch; only the keys present are touched:
--   date_of_birth           'YYYY-MM-DD' sets it, null clears it.
--   junior_handler_numbers  an object merged key by key into the stored map. A string
--                           sets that registry's number (trimmed); null or a blank
--                           string removes it. Keys outside AKC/UKC/ASCA fail the CHECK.
-- Merge, not replace, because a manager cannot see what is stored: a form that shows
-- them one blank input per registry must not wipe the numbers it never displayed.
--
-- p_require_unlinked: the client's email-change race guard (services/database/users/
-- reads.ts). An email change is only offered for an unlinked person; if a signup
-- adopted the row between the client's check and this write, the UPDATE matches no
-- row, NOTHING is written (private details included), and NULL is returned.
--
-- Returns the updated `people` row as jsonb (which no longer carries any PII), or
-- NULL for the race above. Never returns the private values.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_person_details(
  p_person_id uuid,
  p_people jsonb DEFAULT '{}'::jsonb,
  p_private jsonb DEFAULT '{}'::jsonb,
  p_require_unlinked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = p_person_id AND p.auth_user_id = v_uid
    )
    OR public.can_manage_show_person(p_person_id)
    OR public.is_site_admin()
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
$$;

COMMENT ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) IS
  'MYK9-664: the one person-save path. Updates whitelisted people columns and the '
  'people_private patch atomically, under the people_update predicate. Returns the '
  'people row, or NULL when p_require_unlinked and the row has since been linked.';

REVOKE ALL ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_person_details(uuid, jsonb, jsonb, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The junior flag, RECORDED on the entry (owner decision c).
--
-- Why recorded, not derived. A function that answers "is this entry's handler a
-- junior at this trial?" from the date of birth each time it is asked leaks the
-- date of birth to anyone who can also move the trial date: edit the date, ask
-- again, and the flip between junior and adult bisects the 18th birthday in about
-- a dozen edits. So nothing a manager can call derives the flag. It is written
-- onto `entries.handler_is_junior` by ONE BEFORE trigger, and a manager only
-- reads the stored value back.
--
-- When the trigger computes it (every other write leaves it as it was):
--   * INSERT — every entry insert path, whatever issues it: checkout
--     (submit_show_entries), secretary manual entry (a direct insert through the
--     replication layer), move-up (move_up_entry inserts the new entry) and any
--     transfer that creates a row. A value the caller supplies is ignored.
--   * UPDATE under the transaction-local setting myk9.recompute_handler_junior =
--     'on', which only private.recompute_entry_handler_junior() sets, and which
--     only two things call:
--       - the AFTER trigger on people_private, when a handler's date of birth is
--         set or changed: their entries that have not run yet (trial date today or
--         later, not scored);
--       - public.recompute_entry_handler_junior_flags(), site admins only.
-- What does NOT recompute it: a trial date edit (nothing on `trials` touches
-- entries), a class move, a run-order change, or a direct write of the column,
-- which the trigger silently puts back. Changing an entry's HANDLER clears it to
-- NULL (unknown) rather than recomputing: a recompute there would hand a manager
-- the same bisection, one handler swap per probe.
--
-- Residual, stated so nobody mistakes it for a guarantee: a manager who creates a
-- NEW entry for a handler records a fresh answer at that trial's date. Each probe
-- then costs a real entry row (with its status history), which is visible, rather
-- than a silent re-read. That is the paper-form behaviour the owner chose.
--
-- The rule itself mirrors deriveJuniorStatus() in apps/myk9show/src/features/
-- registries/juniorHandlerPolicy.ts exactly — read that file for the rulebook
-- citations:
--   AKC   under 18 on the trial date.
--   UKC   under 18 on January 1 of the trial's year.
--   other (ASCA states no ceiling; an unknown registry has no rule) -> NULL.
-- NULL also for: no date of birth, no trial, a date of birth after the measuring
-- date (bad data, never "a very young junior"). Completed years are computed on
-- calendar fields, the same way the client does. "Not run yet" compares the trial
-- date with the database's current_date (UTC), so on the trial day itself a
-- date-of-birth change still recomputes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.entries ADD COLUMN handler_is_junior boolean;

COMMENT ON COLUMN public.entries.handler_is_junior IS
  'MYK9-664: was the handler a junior at this entry''s trial, recorded when the entry '
  'was created (NULL = unknown). Written only by trg_entries_handler_is_junior; '
  'recomputed only on a date-of-birth change (entries not yet run) or by a site admin. '
  'No column grant: managers read it through recorded_entry_handler_junior_flags().';

-- 5a. The pure rule. In `private`, which no API role can use.
CREATE FUNCTION private.handler_is_junior_at(
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

COMMENT ON FUNCTION private.handler_is_junior_at(date, date, text) IS
  'MYK9-664: SQL twin of deriveJuniorStatus() (juniorHandlerPolicy.ts). true = junior, '
  'false = adult, NULL = cannot be derived. Keep both in step. Called only by the '
  'entry junior-flag trigger path; never by an API role.';

-- 5b. The flag for one entry's handler and trial, as the database stands now.
CREATE FUNCTION private.entry_handler_is_junior(
  p_handler_id uuid,
  p_class_id uuid,
  p_trial_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.handler_is_junior_at(pp.date_of_birth, t.date, t.registry_id)
  FROM public.trials t
  LEFT JOIN public.people_private pp ON pp.person_id = p_handler_id
  WHERE t.id = coalesce(
    (SELECT c.trial_id FROM public.classes c WHERE c.id = p_class_id),
    p_trial_id
  );
$$;

-- 5c. The ONE writer of entries.handler_is_junior. SECURITY DEFINER because it
--     reads people_private, which RLS closes to the manager inserting the entry.
CREATE FUNCTION private.entries_record_handler_is_junior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR current_setting('myk9.recompute_handler_junior', true) = 'on' THEN
    NEW.handler_is_junior :=
      private.entry_handler_is_junior(NEW.handler_id, NEW.class_id, NEW.trial_id);
  ELSIF NEW.handler_id IS DISTINCT FROM OLD.handler_id THEN
    NEW.handler_is_junior := NULL;
  ELSE
    NEW.handler_is_junior := OLD.handler_is_junior;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entries_handler_is_junior
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_record_handler_is_junior();

-- 5d. The recompute. Only rows whose answer actually changes are touched, so an
--     unchanged entry keeps its replication version.
CREATE FUNCTION private.recompute_entry_handler_junior(
  p_entry_ids uuid[],
  p_not_yet_run_only boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('myk9.recompute_handler_junior', 'on', true);

  UPDATE public.entries e
  SET handler_is_junior = private.entry_handler_is_junior(e.handler_id, e.class_id, e.trial_id)
  WHERE e.id = ANY (coalesce(p_entry_ids, '{}'::uuid[]))
    AND e.deleted_at IS NULL
    AND e.handler_is_junior IS DISTINCT FROM
        private.entry_handler_is_junior(e.handler_id, e.class_id, e.trial_id)
    AND (
      NOT p_not_yet_run_only
      OR (
        coalesce(e.is_scored, false) = false
        AND EXISTS (
          SELECT 1
          FROM public.trials t
          WHERE t.id = coalesce(
              (SELECT c.trial_id FROM public.classes c WHERE c.id = e.class_id),
              e.trial_id
            )
            AND t.date >= current_date
        )
      )
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('myk9.recompute_handler_junior', '', true);
  RETURN v_count;
END;
$$;

-- 5e. A handler's date of birth set or changed: record the new answer on their
--     entries that have not run yet. Fires for every writer of people_private
--     (update_person_details, service role), not only the RPC.
CREATE FUNCTION private.people_private_record_entry_junior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.date_of_birth IS NOT DISTINCT FROM OLD.date_of_birth THEN
    RETURN NULL;
  END IF;
  PERFORM private.recompute_entry_handler_junior(
    ARRAY(
      SELECT e.id FROM public.entries e
      WHERE e.handler_id = NEW.person_id AND e.deleted_at IS NULL
    ),
    true
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_people_private_record_entry_junior
  AFTER INSERT OR UPDATE OF date_of_birth ON public.people_private
  FOR EACH ROW EXECUTE FUNCTION private.people_private_record_entry_junior();

REVOKE ALL ON FUNCTION private.handler_is_junior_at(date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.entry_handler_is_junior(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.entries_record_handler_is_junior() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.recompute_entry_handler_junior(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.people_private_record_entry_junior() FROM PUBLIC;

-- 5f. Record the flag on the entries that already exist, as if created now. Only
--     entries whose handler has a date of birth get a non-NULL answer, so only
--     those rows are touched.
SELECT private.recompute_entry_handler_junior(
  ARRAY(SELECT e.id FROM public.entries e WHERE e.deleted_at IS NULL),
  false
);

-- 5g. Site admin: recompute the listed entries from the current date of birth and
--     trial, whatever the trial date. The only caller-driven recompute there is.
CREATE FUNCTION public.recompute_entry_handler_junior_flags(p_entry_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only a site admin can recompute junior handler flags'
      USING ERRCODE = '42501';
  END IF;
  RETURN private.recompute_entry_handler_junior(p_entry_ids, false);
END;
$$;

COMMENT ON FUNCTION public.recompute_entry_handler_junior_flags(uuid[]) IS
  'MYK9-664: site admins only. Recomputes entries.handler_is_junior for the listed '
  'entries from the handler''s current date of birth and the trial as it stands. '
  'Returns the number of entries whose flag changed.';

REVOKE ALL ON FUNCTION public.recompute_entry_handler_junior_flags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_entry_handler_junior_flags(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_entry_handler_junior_flags(uuid[]) TO authenticated;

-- 5h. The manager read: the STORED flag, for entries in shows the caller manages
--     (or any, for a site admin). Reads nothing from people_private.
CREATE FUNCTION public.recorded_entry_handler_junior_flags(p_entry_ids uuid[])
RETURNS TABLE (entry_id uuid, is_junior boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id, e.handler_is_junior
  FROM public.entries e
  WHERE e.id = ANY (p_entry_ids)
    AND e.deleted_at IS NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND ((SELECT public.is_site_admin()) OR public.can_manage_show(e.show_id));
$$;

COMMENT ON FUNCTION public.recorded_entry_handler_junior_flags(uuid[]) IS
  'MYK9-664: the junior flag each entry recorded (entries.handler_is_junior), for '
  'entries in shows the caller manages (or site admin). Never derives it and never '
  'returns the date of birth.';

REVOKE ALL ON FUNCTION public.recorded_entry_handler_junior_flags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recorded_entry_handler_junior_flags(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.recorded_entry_handler_junior_flags(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recorded_entry_handler_junior_flags(uuid[]) TO service_role;

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
  IF has_function_privilege('anon', 'public.update_person_details(uuid, jsonb, jsonb, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recorded_entry_handler_junior_flags(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recompute_entry_handler_junior_flags(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute a MYK9-664 function; it must not';
  END IF;
  -- The flag is read only through the manager-gated function, never the column.
  IF has_column_privilege('anon', 'public.entries', 'handler_is_junior', 'SELECT')
     OR has_column_privilege('authenticated', 'public.entries', 'handler_is_junior', 'SELECT') THEN
    RAISE EXCEPTION 'entries.handler_is_junior is readable directly; it must not be';
  END IF;
  -- Nothing an API role can call derives the flag from a date of birth.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE '%junior%'
      AND 'date'::regtype = ANY (p.proargtypes::oid[]::regtype[])
  ) OR to_regproc('public.entry_handler_junior_flags') IS NOT NULL THEN
    RAISE EXCEPTION 'a public function still derives the junior flag live';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
