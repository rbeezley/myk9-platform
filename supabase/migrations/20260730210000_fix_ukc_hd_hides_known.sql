-- =============================================================================
-- UKC Handler Discrimination: the hide count is set by the rules, not the judge
-- =============================================================================
-- Follows 20260730200000, which set hide_count_fixed = 1 on all 8 UKC HD rows but
-- left `hides_known` as seeded — true for Novice/Advanced, false for Excellent/Master.
-- That leaves the two upper levels self-contradictory.
--
-- `hides_known` records whether the hide COUNT is fixed by the rules, not whether the
-- hide's LOCATION is blind to the handler. Both consumers agree:
--
--   sport-template-types.ts formatHideDescription()
--     const known = rule.hides_known ? 'Rules' : 'Judge';
--     return `Set by ${known}: ${rule.hide_count_fixed}`;
--
--   ClassRequirementsPanel.tsx
--     requirements.hides_known ? 'Number of hides known to handler'
--                              : 'Number of hides unknown (blind)'
--
-- Every UKC HD search has exactly one target — the handler's own scented article among
-- 12 boxes (rulebook Ch. 11 §§6–8, §10). The count is 1 by rule at every level and is
-- never a judge's choice, so `hides_known` is true throughout. Left as false, HD
-- Excellent and Master render "Set by Judge: 1" and "Number of hides unknown (blind)"
-- for a class whose count is definitionally 1.
--
-- (The hide's LOCATION is indeed blind at every HD level — the judge places the box while
-- the handler faces away, and Master forbids showing handlers their box. That is a
-- different property and this column does not record it.)
--
-- I previously declined to touch this column, reasoning that no rulebook sentence mapped
-- onto it. That was the wrong place to look: the column's meaning is defined by its two
-- consumers above, not by the rulebook.
-- =============================================================================

DO $$
DECLARE
  v_template_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT id INTO v_template_id
  FROM public.sport_templates
  WHERE sport_code = 'ukc-nosework';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'ukc-nosework sport template not found';
  END IF;

  -- Guard: this only makes sense while every HD row carries a fixed count of 1.
  IF EXISTS (
    SELECT 1 FROM public.sport_class_rules
    WHERE sport_template_id = v_template_id
      AND element = 'Handler Discrimination'
      AND hide_count_fixed IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION 'Expected every UKC HD row to have hide_count_fixed = 1 before marking counts known';
  END IF;

  UPDATE public.sport_class_rules
  SET hides_known = TRUE,
      updated_at = NOW()
  WHERE sport_template_id = v_template_id
    AND element = 'Handler Discrimination';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 8 THEN
    RAISE EXCEPTION 'Expected 8 UKC Handler Discrimination rows, updated %', v_updated;
  END IF;

  RAISE NOTICE 'UKC HD hide counts marked as rules-set on % rows', v_updated;
END $$;
