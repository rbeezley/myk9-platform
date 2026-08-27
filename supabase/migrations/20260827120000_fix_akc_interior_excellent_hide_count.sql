-- =============================================================================
-- MYK9-127: correct the AKC Interior Excellent hide total
--
-- AKC Interior Excellent has three total hides. The judge chooses how those
-- hides are distributed between the two search areas, but that undisclosed
-- distribution does not make the class total unknown. The original seed
-- conflated those two facts and recorded a judge-set 1-3 band.
--
-- The class backfill is intentionally registry-scoped. UKC and ASCA use their
-- own rule data, including known bands and unknown judge-set counts, and must
-- not inherit AKC's rule correction.
-- =============================================================================

DO $$
DECLARE
  v_rule_count integer;
BEGIN
  SELECT count(*)
    INTO v_rule_count
    FROM public.sport_class_rules AS r
    JOIN public.sport_templates AS st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Interior'
     AND r.level = 'Excellent'
     AND r.section IS NULL;

  IF v_rule_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one AKC Interior Excellent rule, found %', v_rule_count;
  END IF;
END;
$$;

UPDATE public.sport_class_rules AS r
   SET hide_count_fixed = 3,
       hide_count_min = NULL,
       hide_count_max = NULL,
       hides_known = TRUE,
       updated_at = now()
  FROM public.sport_templates AS st
 WHERE st.id = r.sport_template_id
   AND st.organization = 'AKC'
   AND st.sport_code = 'akc-scent-work'
   AND r.element = 'Interior'
   AND r.level = 'Excellent'
   AND r.section IS NULL;

UPDATE public.classes AS c
   SET num_hides = 3,
       hides_known = TRUE,
       updated_at = now()
  FROM public.trials AS t
 WHERE t.id = c.trial_id
   AND t.registry_id = 'AKC'
   AND c.element = 'Interior'
   AND c.level = 'Excellent';

COMMENT ON COLUMN public.classes.num_hides IS
  'Actual class hide count. The base column is not client-readable because judge-set unknown counts are protected. Public fixed counts are derived from sport_class_rules; authorized officials receive actual counts through get_show_class_hide_counts(show_id). See MYK9-127.';
