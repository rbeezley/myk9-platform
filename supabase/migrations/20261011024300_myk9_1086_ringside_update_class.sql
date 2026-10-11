-- =============================================================================
-- ringside_update_class: a judge sets a class's max time at ringside
-- =============================================================================
-- docs/plan-ringside-set-max-time.md. AKC leaves Interior, Exterior, Detective and
-- Handler Discrimination above Novice to the judge, and since MYK9-1086 a class with
-- no saved time runs with no limit and tells the judge so. The judge sets it at
-- ringside, but classes_update RLS allows only can_manage_trial, so a judge's write
-- would be denied at sync. Same gap ringside_update_entry closed for entries.
--
-- SECURITY DEFINER, modelled on the latest ringside_update_entry (20260925143700):
--   * Tiers: manager (site admin / trial secretary / club admin), the class's
--     assigned judge (judge_assignments confirmed|invited), or a judge/admin
--     ringside passcode claim for this show (with the passcode-generation check).
--     Stewards and exhibitors are refused.
--   * Allow-list: time_limit_seconds only. Any other key is refused, not ignored, so
--     a client bug cannot silently drop a field.
--   * Rule range (owner decision 2026-10-10): a class whose rule has a fixed time
--     (UKC, ASCA Open, AKC fixed) accepts 1..fixed; a judge-set range accepts
--     min..max; with no rule, 1..900. NULL clears the limit (managers and judges).
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

  -- 4. Allow-list: refuse anything but time_limit_seconds.
  SELECT k INTO v_bad_key
    FROM jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)) AS k
   WHERE k <> 'time_limit_seconds'
   LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field % cannot be set from ringside', v_bad_key USING errcode = '42501';
  END IF;
  IF NOT (coalesce(p_fields, '{}'::jsonb) ? 'time_limit_seconds') THEN
    RAISE EXCEPTION 'Nothing to update' USING errcode = '22023';
  END IF;

  -- 5. Value and rule range. NULL clears the limit.
  IF jsonb_typeof(p_fields -> 'time_limit_seconds') = 'null' THEN
    v_seconds := NULL;
  ELSIF jsonb_typeof(p_fields -> 'time_limit_seconds') = 'number' THEN
    v_seconds := (p_fields ->> 'time_limit_seconds')::numeric::integer;
  ELSE
    RAISE EXCEPTION 'time_limit_seconds must be a number or null' USING errcode = '22023';
  END IF;

  IF v_seconds IS NOT NULL THEN
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
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version
     AND (SELECT c.time_limit_seconds FROM public.classes c WHERE c.id = p_class_id)
         IS NOT DISTINCT FROM v_seconds THEN
    RETURN v_current_version;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = format('current_version=%s', v_current_version);
  END IF;

  UPDATE public.classes
     SET time_limit_seconds = v_seconds
   WHERE id = p_class_id
     AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING version INTO v_new_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001';
  END IF;

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) TO authenticated;
