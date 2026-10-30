-- =============================================================================
-- Ring phase on classes + ringside_update_class allow-list (MYK9-1513)
-- =============================================================================
-- Owner decision 2026-10-29: ringside's Briefing / Break / Offline Scoring are a
-- separate ring PHASE, not a wider class status. classes.status keeps its
-- vocabulary (the secretary workbench and the server-side completion derivation,
-- 20260712180000, read it unchanged). The phase is only meaningful while the class
-- is in_progress.
--
--   ring_phase       briefing | break | offline_scoring | NULL
--   ring_phase_time  the briefing time, or the "Break until" time (time of day)
--
-- v3's Start Time is the existing revised_expected_start; no new column for it.
--
-- 1. The two columns, with CHECKs. The time belongs to briefing / break only.
-- 2. trg_classes_clear_ring_phase: any write that leaves a class outside in_progress
--    (the derivation completing it, a reopen to setup) clears the phase, so a stale
--    phase never reappears when the class is next in progress.
-- 3. authenticated may read both columns. classes is read through a column
--    allowlist; the latest authenticated list (20261008014300) is restated with the
--    two columns added. anon is unchanged: the phase is staff-facing.
-- 4. ringside_update_class, copied from its latest definition (20261011195300),
--    allow-lists ring_phase, ring_phase_time and revised_expected_start (so a judge
--    can set the ringside Start Time, which the workbench also writes). Everything
--    else, authorization tiers, OCC, replay handling, is unchanged.

BEGIN;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS ring_phase text,
  ADD COLUMN IF NOT EXISTS ring_phase_time time;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_ring_phase_check
    CHECK (ring_phase IS NULL OR ring_phase IN ('briefing', 'break', 'offline_scoring')),
  ADD CONSTRAINT classes_ring_phase_time_check
    CHECK (ring_phase_time IS NULL OR ring_phase IN ('briefing', 'break'));

COMMENT ON COLUMN public.classes.ring_phase IS
  'MYK9-1513: ringside phase of an in_progress class (briefing, break, offline_scoring), else NULL. Cleared when status leaves in_progress.';
COMMENT ON COLUMN public.classes.ring_phase_time IS
  'MYK9-1513: the briefing time or the "Break until" time for ring_phase briefing / break, else NULL.';

CREATE OR REPLACE FUNCTION private.classes_clear_ring_phase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.ring_phase := NULL;
  NEW.ring_phase_time := NULL;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.classes_clear_ring_phase() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_classes_clear_ring_phase ON public.classes;
CREATE TRIGGER trg_classes_clear_ring_phase
  BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM 'in_progress'
        AND (NEW.ring_phase IS NOT NULL OR NEW.ring_phase_time IS NOT NULL))
  EXECUTE FUNCTION private.classes_clear_ring_phase();

GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  has_blank, max_faults, qualifying_threshold, is_scoring_finalized,
  results_released_at, dogs_ahead_notification_count, total_entries_count,
  checked_in_count, scored_count, created_at, updated_at, deleted_at,
  deleted_by, class_number, timer_mode, hides_known, distraction_count,
  is_results_reviewed, time_limit_area2_seconds,
  time_limit_area3_seconds, display_order, results_released_by, version,
  status_source, reopened_after_closeout_at, revised_expected_start,
  judge_signed_off_at, judge_signed_off_by, results_verified_at,
  results_verified_by, ring_phase, ring_phase_time
) ON public.classes TO authenticated;

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
  v_time_keys constant text[] := ARRAY[
    'time_limit_seconds', 'time_limit_area2_seconds', 'time_limit_area3_seconds'];
  v_has_area boolean[] := ARRAY[false, false, false];
  v_area_secs integer[] := ARRAY[NULL, NULL, NULL]::integer[];
  v_cur_area_secs integer[];
  v_key text;
  v_i integer;
  v_has_time boolean;
  v_has_status boolean;
  v_has_start boolean;
  v_has_phase boolean;
  v_has_phase_time boolean;
  v_has_expected boolean;
  v_status text;
  v_start time;
  v_phase text;
  v_phase_time time;
  v_expected timestamptz;
  v_cur_status text;
  v_cur_start time;
  v_cur_phase text;
  v_cur_phase_time time;
  v_cur_expected timestamptz;
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
   WHERE k NOT IN ('status', 'start_time', 'time_limit_seconds',
                   'time_limit_area2_seconds', 'time_limit_area3_seconds',
                   'ring_phase', 'ring_phase_time', 'revised_expected_start')
   LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field % cannot be set from ringside', v_bad_key USING errcode = '42501';
  END IF;
  FOR v_i IN 1..3 LOOP
    v_has_area[v_i] := v_fields ? v_time_keys[v_i];
  END LOOP;
  v_has_time := v_has_area[1] OR v_has_area[2] OR v_has_area[3];
  v_has_status := v_fields ? 'status';
  v_has_start := v_fields ? 'start_time';
  v_has_phase := v_fields ? 'ring_phase';
  v_has_phase_time := v_fields ? 'ring_phase_time';
  v_has_expected := v_fields ? 'revised_expected_start';
  IF NOT (v_has_time OR v_has_status OR v_has_start
          OR v_has_phase OR v_has_phase_time OR v_has_expected) THEN
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

  -- 5b2. Ring phase (MYK9-1513): null, or one of the three phases. The time is the
  -- briefing time or the "Break until" time, a time of day or null. A phase on a class
  -- that is not in progress is cleared by trg_classes_clear_ring_phase, not refused, so
  -- a queued write that replays after the server completed the class does not dead-letter.
  IF v_has_phase THEN
    IF jsonb_typeof(v_fields -> 'ring_phase') = 'null' THEN
      v_phase := NULL;
    ELSIF jsonb_typeof(v_fields -> 'ring_phase') = 'string'
          AND (v_fields ->> 'ring_phase') IN ('briefing', 'break', 'offline_scoring') THEN
      v_phase := v_fields ->> 'ring_phase';
    ELSE
      RAISE EXCEPTION 'ring_phase must be briefing, break, offline_scoring or null'
        USING errcode = '22023';
    END IF;
  END IF;

  IF v_has_phase_time THEN
    BEGIN
      v_phase_time := (v_fields ->> 'ring_phase_time')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'ring_phase_time must be a time of day' USING errcode = '22023';
    END;
  END IF;

  -- 5b3. Expected start: the secretary's revised day-of expectation, an instant or null.
  IF v_has_expected THEN
    BEGIN
      v_expected := (v_fields ->> 'revised_expected_start')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'revised_expected_start must be a timestamp' USING errcode = '22023';
    END;
  END IF;

  -- 5c. Max times, one per area, and the rule range. NULL clears an area's limit.
  FOR v_i IN 1..3 LOOP
    CONTINUE WHEN NOT v_has_area[v_i];
    v_key := v_time_keys[v_i];
    IF jsonb_typeof(v_fields -> v_key) = 'null' THEN
      v_area_secs[v_i] := NULL;
    ELSIF jsonb_typeof(v_fields -> v_key) = 'number' THEN
      -- Every caller, managers included: a real time, never 0 / negative / overflow.
      IF (v_fields ->> v_key)::numeric < 1 OR (v_fields ->> v_key)::numeric > 86400 THEN
        RAISE EXCEPTION 'Max time must be between 1 second and 24 hours' USING errcode = '22023';
      END IF;
      v_area_secs[v_i] := (v_fields ->> v_key)::numeric::integer;
    ELSE
      RAISE EXCEPTION '% must be a number or null', v_key USING errcode = '22023';
    END IF;
  END LOOP;

  -- The range binds judges and judge passcodes, per area. A manager is the
  -- authority on the class and is never range-checked on the direct path either,
  -- so a secretary's edit that happens to route here must not be refused at sync.
  IF v_has_time AND NOT v_is_manager THEN
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

    FOR v_i IN 1..3 LOOP
      IF v_has_area[v_i] AND v_area_secs[v_i] IS NOT NULL
         AND (v_area_secs[v_i] < v_low OR v_area_secs[v_i] > v_high) THEN
        RAISE EXCEPTION 'Max time % s is outside the rule range %-% s', v_area_secs[v_i], v_low, v_high
          USING errcode = '22023';
      END IF;
    END LOOP;
  END IF;

  -- 6. OCC (nullable) and write. A replay whose write already landed (the
  -- response was lost and the offline queue resends it with the old version) is
  -- success, not a conflict: same rule as ringside_update_entry (MYK9-740).
  -- Lock the row and read its version WITH the values compared below, so the replay
  -- check, the version it returns and the write all see one consistent row. No
  -- back-off sleep follows (unlike the entry RPC's containment gate), so the lock
  -- is held only for this call.
  SELECT c.version,
         ARRAY[c.time_limit_seconds, c.time_limit_area2_seconds, c.time_limit_area3_seconds],
         c.status, c.start_time, c.ring_phase, c.ring_phase_time, c.revised_expected_start
    INTO v_current_version, v_cur_area_secs, v_cur_status, v_cur_start,
         v_cur_phase, v_cur_phase_time, v_cur_expected
    FROM public.classes c WHERE c.id = p_class_id
     FOR UPDATE;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version
     AND (NOT v_has_area[1] OR v_cur_area_secs[1] IS NOT DISTINCT FROM v_area_secs[1])
     AND (NOT v_has_area[2] OR v_cur_area_secs[2] IS NOT DISTINCT FROM v_area_secs[2])
     AND (NOT v_has_area[3] OR v_cur_area_secs[3] IS NOT DISTINCT FROM v_area_secs[3])
     AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
     AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start)
     AND (NOT v_has_phase OR v_cur_phase IS NOT DISTINCT FROM v_phase)
     AND (NOT v_has_phase_time OR v_cur_phase_time IS NOT DISTINCT FROM v_phase_time)
     AND (NOT v_has_expected OR v_cur_expected IS NOT DISTINCT FROM v_expected) THEN
    RETURN v_current_version;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  UPDATE public.classes
     SET time_limit_seconds = CASE WHEN v_has_area[1] THEN v_area_secs[1] ELSE time_limit_seconds END,
         time_limit_area2_seconds =
           CASE WHEN v_has_area[2] THEN v_area_secs[2] ELSE time_limit_area2_seconds END,
         time_limit_area3_seconds =
           CASE WHEN v_has_area[3] THEN v_area_secs[3] ELSE time_limit_area3_seconds END,
         status = CASE WHEN v_has_status THEN v_status ELSE status END,
         start_time = CASE WHEN v_has_start THEN v_start ELSE start_time END,
         ring_phase = CASE WHEN v_has_phase THEN v_phase ELSE ring_phase END,
         ring_phase_time = CASE WHEN v_has_phase_time THEN v_phase_time ELSE ring_phase_time END,
         revised_expected_start =
           CASE WHEN v_has_expected THEN v_expected ELSE revised_expected_start END
   WHERE id = p_class_id
     AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING version INTO v_new_version;

  IF NOT FOUND THEN
    -- Lost a race between the check above and the write. If an identical call
    -- landed in between, this replay already applied: success. Otherwise report
    -- the fresh version in DETAIL so the client rebases its OCC token.
    SELECT c.version,
           ARRAY[c.time_limit_seconds, c.time_limit_area2_seconds, c.time_limit_area3_seconds],
           c.status, c.start_time, c.ring_phase, c.ring_phase_time, c.revised_expected_start
      INTO v_current_version, v_cur_area_secs, v_cur_status, v_cur_start,
           v_cur_phase, v_cur_phase_time, v_cur_expected
      FROM public.classes c WHERE c.id = p_class_id;
    IF (NOT v_has_area[1] OR v_cur_area_secs[1] IS NOT DISTINCT FROM v_area_secs[1])
       AND (NOT v_has_area[2] OR v_cur_area_secs[2] IS NOT DISTINCT FROM v_area_secs[2])
       AND (NOT v_has_area[3] OR v_cur_area_secs[3] IS NOT DISTINCT FROM v_area_secs[3])
       AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
       AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start)
       AND (NOT v_has_phase OR v_cur_phase IS NOT DISTINCT FROM v_phase)
       AND (NOT v_has_phase_time OR v_cur_phase_time IS NOT DISTINCT FROM v_phase_time)
       AND (NOT v_has_expected OR v_cur_expected IS NOT DISTINCT FROM v_expected) THEN
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

COMMIT;

NOTIFY pgrst, 'reload schema';
