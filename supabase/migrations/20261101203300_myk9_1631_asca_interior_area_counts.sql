-- =============================================================================
-- ASCA Interior area counts match the rulebook (MYK9-1631)
-- =============================================================================
-- docs/rulebooks/asca-scent-detection-rules.txt, Interior, sections A and C:
--   Novice     1 area
--   Open       1 area                        (was seeded 2)
--   Advanced   1 or 2, the judge's choice    (was seeded 2)
--   Excellent  1 or 2, the judge's choice    (was seeded 3, never allowed)
--
-- Owner decision 2026-11-01: a choosable class starts at 1 area; the judge changes
-- it from the ringside class menu (MYK9-1625). The rule's area_count is copied onto
-- a class when it is created, so every ASCA Interior rule is now 1.
--
-- No ASCA Interior class exists on 2026-11-01 (queried before writing), so there is
-- no class row to correct. max_time_seconds_area2/3 are NULL on all eight rules and
-- stay so: Advanced and Excellent max times are set by the judge per class.

DO $$
DECLARE
  v_template_id uuid;
  v_rules integer;
BEGIN
  SELECT id INTO v_template_id
    FROM public.sport_templates
   WHERE sport_code = 'asca-scent-detection';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'asca-scent-detection sport template not found';
  END IF;

  UPDATE public.sport_class_rules
     SET area_count = 1,
         updated_at = now()
   WHERE sport_template_id = v_template_id
     AND element = 'Interior'
     AND level IN ('Open', 'Advanced', 'Excellent')
     AND area_count IS DISTINCT FROM 1;
  GET DIAGNOSTICS v_rules = ROW_COUNT;

  RAISE NOTICE 'MYK9-1631: % ASCA Interior rule(s) set to 1 area', v_rules;
END;
$$;
