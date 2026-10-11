-- =============================================================================
-- ASCA Open's 3:00 max time is a fixed rule, not a range
-- =============================================================================
-- Migration 030 (and the Level C clone 20260701130000) seeded the four ASCA Open
-- elements (Container / Interior / Exterior / Vehicle, sections A and C) with
-- max_time_seconds_fixed = NULL and min = max = 180: a "range" with one value, i.e.
-- a fixed 3:00. Class creation reads only max_time_seconds_fixed, so every ASCA
-- Open class was created with time_limit_seconds = NULL and relied on the live
-- scoresheet's silent 180s default.
--
-- MYK9-1086 removes that default (a class with no saved time now runs with no
-- limit and a ringside notice), so these rules must carry their fixed time.
--
-- 1. Set max_time_seconds_fixed = 180 on the 8 asca-scent-detection rules whose
--    range is a single value, and clear the degenerate range.
-- 2. Backfill time_limit_seconds on ASCA classes that have NONE, from their rule.
--    A class that already carries a value keeps it.
--
-- Must be pushed BEFORE the frontend that drops the 180s default is deployed.

DO $$
DECLARE
  v_template_id UUID;
  v_rules INTEGER;
  v_classes INTEGER;
BEGIN
  SELECT id INTO v_template_id
  FROM public.sport_templates
  WHERE sport_code = 'asca-scent-detection';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'asca-scent-detection sport template not found';
  END IF;

  UPDATE public.sport_class_rules
  SET max_time_seconds_fixed = max_time_seconds_min,
      max_time_seconds_min = NULL,
      max_time_seconds_max = NULL,
      updated_at = NOW()
  WHERE sport_template_id = v_template_id
    AND max_time_seconds_fixed IS NULL
    AND max_time_seconds_min IS NOT NULL
    AND max_time_seconds_min = max_time_seconds_max;

  GET DIAGNOSTICS v_rules = ROW_COUNT;

  -- 4 Open elements x sections A and C. Anything else means the ASCA rule set
  -- changed shape and this needs re-checking rather than a partial apply.
  IF v_rules <> 8 THEN
    RAISE EXCEPTION 'Expected 8 single-value ASCA rules, updated %', v_rules;
  END IF;

  UPDATE public.classes c
  SET time_limit_seconds = rule.seconds
  FROM public.trials tr,
       (SELECT DISTINCT element, level, max_time_seconds_fixed AS seconds
          FROM public.sport_class_rules
         WHERE sport_template_id = v_template_id
           AND max_time_seconds_fixed IS NOT NULL) AS rule
  WHERE tr.id = c.trial_id
    AND tr.registry_id = 'ASCA'
    AND c.deleted_at IS NULL
    AND c.time_limit_seconds IS NULL
    AND rule.element = c.element
    AND rule.level = c.level;

  GET DIAGNOSTICS v_classes = ROW_COUNT;

  RAISE NOTICE 'ASCA Open fixed max time: % rules set, % classes backfilled', v_rules, v_classes;
END $$;
