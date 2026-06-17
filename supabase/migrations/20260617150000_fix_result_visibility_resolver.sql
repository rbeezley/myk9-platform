-- Fix resolve_class_result_visibility — it referenced three tables that no longer
-- exist: show_result_visibility_defaults, trial_result_visibility_overrides,
-- class_result_visibility_overrides (all dropped by migration
-- 103_drop_duplicate_visibility_tables.sql). As a result every anon read through
-- view_public_entry_results errored with
--   relation "public.show_result_visibility_defaults" does not exist
-- which broke public/exhibitor scored-results display entirely.
--
-- Repoint at the surviving consolidated tables:
--   show_result_visibility_defaults     -> show_visibility_settings
--   trial_result_visibility_overrides   -> trial_visibility_overrides
--   class_result_visibility_overrides   -> class_visibility_overrides
--
-- Column differences handled:
--   * the overrides use `preset` (the dropped tables used `preset_name`).
--   * The SHOW base reads its materialized timing columns DIRECTLY — no preset
--     expansion. show_visibility_settings.*_timing are NOT NULL and stored
--     already-resolved: the app write path expands the chosen preset into the
--     columns (`placement_timing := input ?? PRESET_CONFIGS[preset].placement`),
--     and the canonical resolveVisibilityCascade treats the show as the resolved
--     base. Expanding the preset here instead would be wrong against NOT NULL
--     columns (a COALESCE over the column would always win and silently discard
--     the preset). Preset-expansion lives only at the trial/class override layers,
--     whose timing columns are nullable (so a non-null value is an intentional
--     per-field override).
--
-- Behavior is otherwise identical to the original resolver (class state derivation,
-- per-field _result_timing_visible, fail-closed on unknown class). The helper
-- functions _result_visibility_preset / _result_timing_visible are unchanged.

CREATE OR REPLACE FUNCTION public.resolve_class_result_visibility(p_class_id uuid)
 RETURNS TABLE(placement_visible boolean, qualification_visible boolean, time_visible boolean, faults_visible boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trial_id uuid;
  v_show_id uuid;
  v_status text;
  v_finalized boolean;
  v_released timestamptz;
  v_state text;
  tp text; tq text; tt text; tf text;   -- resolved timings (placement/qual/time/faults)
  ov record;
BEGIN
  -- 1. Class context
  SELECT c.trial_id, t.show_id, c.status, c.is_scoring_finalized, c.results_released_at
    INTO v_trial_id, v_show_id, v_status, v_finalized, v_released
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    -- Unknown class: hide everything (fail closed)
    RETURN QUERY SELECT false, false, false, false;
    RETURN;
  END IF;

  -- 2. Base = show settings. The show row stores FULLY-RESOLVED timing columns:
  --    the app write path expands the chosen preset into the columns
  --    (`placement_timing := input ?? PRESET_CONFIGS[preset].placement`, see
  --    apps/myk9show/src/services/database/visibility upsertShowVisibility), and the
  --    canonical cascade (`resolveVisibilityCascade`) treats the show as the resolved
  --    base — it does NOT expand a show-level preset. So read the timing columns
  --    directly (do NOT preset-expand here; that would let a non-'open' show whose
  --    columns are already resolved be re-derived incorrectly). Hardcoded 'open'
  --    defaults only when no show row exists.
  SELECT
    COALESCE(s.placement_timing, 'class_complete'),
    COALESCE(s.qualification_timing, 'immediate'),
    COALESCE(s.time_timing, 'immediate'),
    COALESCE(s.faults_timing, 'immediate')
  INTO tp, tq, tt, tf
  FROM public.show_visibility_settings s
  WHERE s.show_id = v_show_id;

  IF NOT FOUND THEN
    tp := 'class_complete'; tq := 'immediate'; tt := 'immediate'; tf := 'immediate';
  END IF;

  -- 3. Trial override (preset expands as new base, then per-field non-null wins)
  SELECT * INTO ov FROM public.trial_visibility_overrides WHERE trial_id = v_trial_id;
  IF FOUND THEN
    IF ov.preset IS NOT NULL THEN
      tp := public._result_visibility_preset(ov.preset, 'placement');
      tq := public._result_visibility_preset(ov.preset, 'qualification');
      tt := public._result_visibility_preset(ov.preset, 'time');
      tf := public._result_visibility_preset(ov.preset, 'faults');
    END IF;
    tp := COALESCE(ov.placement_timing, tp);
    tq := COALESCE(ov.qualification_timing, tq);
    tt := COALESCE(ov.time_timing, tt);
    tf := COALESCE(ov.faults_timing, tf);
  END IF;

  -- 4. Class override (same precedence)
  SELECT * INTO ov FROM public.class_visibility_overrides WHERE class_id = p_class_id;
  IF FOUND THEN
    IF ov.preset IS NOT NULL THEN
      tp := public._result_visibility_preset(ov.preset, 'placement');
      tq := public._result_visibility_preset(ov.preset, 'qualification');
      tt := public._result_visibility_preset(ov.preset, 'time');
      tf := public._result_visibility_preset(ov.preset, 'faults');
    END IF;
    tp := COALESCE(ov.placement_timing, tp);
    tq := COALESCE(ov.qualification_timing, tq);
    tt := COALESCE(ov.time_timing, tt);
    tf := COALESCE(ov.faults_timing, tf);
  END IF;

  -- 5. Class state (a scoring-finalized class is treated as completed even if status lags)
  IF v_released IS NOT NULL THEN
    v_state := 'released';
  ELSIF lower(COALESCE(v_status, '')) = 'completed' OR v_finalized IS TRUE THEN
    v_state := 'completed';
  ELSE
    v_state := 'in_progress';
  END IF;

  -- 6. Per-field visibility
  RETURN QUERY SELECT
    public._result_timing_visible(tp, v_state),
    public._result_timing_visible(tq, v_state),
    public._result_timing_visible(tt, v_state),
    public._result_timing_visible(tf, v_state);
END;
$function$;
