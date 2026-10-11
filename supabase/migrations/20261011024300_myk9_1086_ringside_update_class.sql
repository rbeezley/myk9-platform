-- =============================================================================
-- ringside_update_class: the judge's ringside write path for a class
-- =============================================================================
-- docs/plan-ringside-set-max-time.md. classes_update RLS allows only
-- can_manage_trial, so every ringside class write by a judge or judge passcode was
-- denied at sync and dead-lettered: the same gap ringside_update_entry closed for
-- entries. Two writes need it:
--   * class status from ringside (start / in progress / complete) -- MYK9-1096: a
--     judge's status change never reached the server;
--   * the class max time -- MYK9-1086: AKC judge-set classes with no saved time now
--     run with no limit, and the judge sets it at ringside.
--
-- SECURITY DEFINER, modelled on the latest ringside_update_entry (20260925143700):
--   * Tiers: manager (site admin / trial secretary / club admin), the class's
--     assigned judge (judge_assignments confirmed|invited), or a judge/admin
--     ringside passcode claim for this show (with the passcode-generation check).
--     Stewards and exhibitors are refused.
--   * Allow-list: status, start_time, time_limit_seconds. Any other key is
--     refused, not ignored, so a client bug cannot silently drop a field. Status is
--     limited to what ringside sends (upcoming / setup / in_progress / completed);
--     cancelling a class stays a manager action on the normal path.
--   * Status semantics are exactly the manager's ringside write on the direct path:
--     only `status` changes; status_source is untouched, so a class whose status is
--     derived is re-derived by refresh_class_scoring_state on its next scoring
--     change, and a status change fires the same push triggers it would for a
--     manager (in_progress -> class status push; completed -> the one-shot class
--     results push).
--   * Rule range (owner decision 2026-10-10), for judges and judge passcodes: a
--     class whose rule has a fixed time (UKC, ASCA Open, AKC fixed) accepts
--     1..fixed; a judge-set range accepts min..max; with no rule, 1..900. Managers
--     are not range-checked (nor are they on the direct path). NULL clears.
--   * Nullable OCC on classes.version (classes_version_increment bumps it); a
--     replay whose value already landed returns the current version (MYK9-740).
-- Returns the class's new version.

CREATE OR REPLACE FUNCTION public.ringside_update_class(
  p_class_id uuid,
  p_fields jsonb,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_registry text;
  v_element text;
  v_level text;
  v_current_version integer;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_has_judge_claim boolean;
  v_bad_key text;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_has_time boolean;
  v_has_status boolean;
  v_has_start boolean;
  v_status text;
  v_start time;
  v_cur_time integer;
  v_cur_status text;
  v_cur_start time;
  v_seconds integer;
  v_fixed integer;
  v_min integer;
  v_max integer;
  v_low integer;
  v_high integer;
  v_new_version integer;
BEGIN
  -- 1. Class context.
  SELECT tr.show_id, tr.registry_id, c.element, c.level, c.version
    INTO v_show_id, v_registry, v_element, v_level, v_current_version
    FROM public.classes c
    JOIN public.trials tr ON tr.id = c.trial_id
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class % not found', p_class_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % has no show/club context', p_class_id USING errcode = '42501';
  END IF;

  -- 2. Caller identity (NULL person for a passcode/anon session).
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers (mirrors ringside_update_entry; no steward tier).
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = p_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF v_has_judge_claim
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to update class %', p_class_id USING errcode = '42501';
  END IF;

  -- 4. Allow-list: refuse anything else.
  SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_fields) AS k
   WHERE k NOT IN ('status', 'start_time', 'time_limit_seconds')
   LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field % cannot be set from ringside', v_bad_key USING errcode = '42501';
  END IF;
  v_has_time := v_fields ? 'time_limit_seconds';
  v_has_status := v_fields ? 'status';
  v_has_start := v_fields ? 'start_time';
  IF NOT (v_has_time OR v_has_status OR v_has_start) THEN
    RAISE EXCEPTION 'Nothing to update' USING errcode = '22023';
  END IF;

  -- 5a. Status: only the values ringside sends.
  IF v_has_status THEN
    v_status := v_fields ->> 'status';
    IF v_status IS NULL OR v_status NOT IN ('upcoming', 'setup', 'in_progress', 'completed') THEN
      RAISE EXCEPTION 'Status % cannot be set from ringside', v_status USING errcode = '22023';
    END IF;
  END IF;

  -- 5b. Start time: HH:MM[:SS] or null.
  IF v_has_start THEN
    BEGIN
      v_start := (v_fields ->> 'start_time')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'start_time must be a time of day' USING errcode = '22023';
    END;
  END IF;

  -- 5c. Max time and rule range. NULL clears the limit.
  IF v_has_time AND jsonb_typeof(v_fields -> 'time_limit_seconds') = 'null' THEN
    v_seconds := NULL;
  ELSIF v_has_time AND jsonb_typeof(v_fields -> 'time_limit_seconds') = 'number' THEN
    -- Every caller, managers included: a real time, never 0 / negative / overflow.
    IF (v_fields ->> 'time_limit_seconds')::numeric < 1
       OR (v_fields ->> 'time_limit_seconds')::numeric > 86400 THEN
      RAISE EXCEPTION 'Max time must be between 1 second and 24 hours' USING errcode = '22023';
    END IF;
    v_seconds := (v_fields ->> 'time_limit_seconds')::numeric::integer;
  ELSIF v_has_time THEN
    RAISE EXCEPTION 'time_limit_seconds must be a number or null' USING errcode = '22023';
  END IF;

  -- The range binds judges and judge passcodes. A manager is the authority on the
  -- class and is never range-checked on the direct path either, so a secretary's
  -- edit that happens to route here must not be refused at sync.
  IF v_has_time AND v_seconds IS NOT NULL AND NOT v_is_manager THEN
    SELECT max(r.max_time_seconds_fixed), min(r.max_time_seconds_min), max(r.max_time_seconds_max)
      INTO v_fixed, v_min, v_max
      FROM public.sport_class_rules r
      JOIN public.sport_templates st ON st.id = r.sport_template_id
     WHERE st.organization = v_registry
       AND r.element = v_element
       AND r.level IS NOT DISTINCT FROM v_level;

    IF v_fixed IS NOT NULL THEN
      v_low := 1; v_high := v_fixed;
    ELSIF v_min IS NOT NULL AND v_max IS NOT NULL THEN
      v_low := v_min; v_high := v_max;
    ELSE
      v_low := 1; v_high := 900;
    END IF;

    IF v_seconds < v_low OR v_seconds > v_high THEN
      RAISE EXCEPTION 'Max time % s is outside the rule range %-% s', v_seconds, v_low, v_high
        USING errcode = '22023';
    END IF;
  END IF;

  -- 6. OCC (nullable) and write. A replay whose write already landed (the
  -- response was lost and the offline queue resends it with the old version) is
  -- success, not a conflict: same rule as ringside_update_entry (MYK9-740).
  SELECT c.time_limit_seconds, c.status, c.start_time
    INTO v_cur_time, v_cur_status, v_cur_start
    FROM public.classes c WHERE c.id = p_class_id;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version
     AND (NOT v_has_time OR v_cur_time IS NOT DISTINCT FROM v_seconds)
     AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
     AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start) THEN
    RETURN v_current_version;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  UPDATE public.classes
     SET time_limit_seconds = CASE WHEN v_has_time THEN v_seconds ELSE time_limit_seconds END,
         status = CASE WHEN v_has_status THEN v_status ELSE status END,
         start_time = CASE WHEN v_has_start THEN v_start ELSE start_time END
   WHERE id = p_class_id
     AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING version INTO v_new_version;

  IF NOT FOUND THEN
    -- Lost a race between the check above and the write. If an identical call
    -- landed in between, this replay already applied: success. Otherwise report
    -- the fresh version in DETAIL so the client rebases its OCC token.
    SELECT c.version, c.time_limit_seconds, c.status, c.start_time
      INTO v_current_version, v_cur_time, v_cur_status, v_cur_start
      FROM public.classes c WHERE c.id = p_class_id;
    IF (NOT v_has_time OR v_cur_time IS NOT DISTINCT FROM v_seconds)
       AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
       AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start) THEN
      RETURN v_current_version;
    END IF;
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) TO authenticated;
