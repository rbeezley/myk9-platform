-- =============================================================================
-- Fix UKC Handler Discrimination scoring parameters
-- =============================================================================
-- Companion to 20260730180000, which corrected HD's level LABELS. This corrects the
-- scoring parameters those rows carry.
--
-- Migration 030 seeded HD's upper levels by copying the grid-element parameter set.
-- That is wrong: the grid elements (Container/Interior/Exterior/Vehicle) legitimately
-- switch to two timers and multiple odor hides from Superior upward, but Handler
-- Discrimination never does. HD is a single-target search for the handler's own scented
-- article among 12 boxes, at every level. HD Novice and Advanced were seeded correctly;
-- Excellent and Master inherited grid-element behaviour.
--
-- Three corrections, each with an explicit rulebook statement behind it
-- (docs/rulebooks/ukc-nose-work-rules.txt):
--
--   1. timer_mode = 'single' for every HD class.
--      Ch. 4: "For Novice and Advanced Nosework classes and all Handler Discrimination
--      classes, only one timer is used that tracks both the search time and the element
--      time." Excellent and Master were 'dual', so the show-day scoresheet renders a
--      two-timer layout for a one-timer class.
--
--   2. odors = '{}' for every HD class.
--      HD has no essential-oil odor. The dog searches for the handler's own article —
--      Ch. 11 §6 "There will be only one glove in this class"; §7 one handler-scented
--      glove among 11 judge-scented; §8 each handler's pre-scented glove; §10 (Master) a
--      personal item that "cannot be a glove". The seeded Birch/Anise/Clove/Myrrh values
--      were copied from the grid elements and describe a search that does not happen.
--
--   3. hide_count_fixed = 1 (and the min/max band cleared) for every HD class.
--      One target article per search at every level — 12 boxes, one of them the
--      handler's. Excellent carried 2–3 and Master 3–4 from the grid elements.
--
-- NOT changed, deliberately: the max-time bands. Ch. 11 §9 says maximum times "are
-- determined by the specific competition" and "should not exceed three (3) minutes for
-- Novice, Advanced or Excellent", with Master's §10 allowing four minutes. That is a
-- club-set value under a cap, which the existing min/max band already models. Adjusting
-- the caps is a separate judgement call and is left alone here rather than guessed at.
--
-- Also not changed: `hides_known`. Novice/Advanced carry true and Excellent/Master false.
-- Every HD level is blind to the handler in practice (the judge places the box while the
-- handler faces away; Master explicitly forbids showing handlers their box), so the split
-- looks wrong — but no rulebook sentence maps directly onto this column's meaning, so it
-- is flagged rather than altered.
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

  UPDATE public.sport_class_rules
  SET timer_mode = 'single',
      odors = '{}'::text[],
      hide_count_fixed = 1,
      hide_count_min = NULL,
      hide_count_max = NULL,
      updated_at = NOW()
  WHERE sport_template_id = v_template_id
    AND element = 'Handler Discrimination';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 4 levels x A/B sections. If this is not 8, the HD class set changed shape and this
  -- migration's assumptions need re-checking rather than silently applying.
  IF v_updated <> 8 THEN
    RAISE EXCEPTION 'Expected 8 UKC Handler Discrimination rows, updated %', v_updated;
  END IF;

  RAISE NOTICE 'UKC HD scoring rules fixed on % rows (single timer, no odor, 1 hide)', v_updated;
END $$;
