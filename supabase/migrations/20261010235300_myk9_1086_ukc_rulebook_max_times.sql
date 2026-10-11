-- =============================================================================
-- UKC Nosework maximum element times come from the rulebook, not a range
-- =============================================================================
-- Migration 030 seeded every ukc-nosework rule with max_time_seconds_fixed = NULL
-- and an invented min/max range. The rulebook fixes the MAXIMUM element time per
-- level (docs/rulebooks/ukc-nose-work-rules.txt, "Below are the maximum element
-- times for each class"); a competition may post a lower time, never a higher one:
--
--   Container / Interior / Exterior / Vehicle:
--     Novice 3 min, Advanced 4, Superior 5, Master 6, Elite 6
--   Handler Discrimination:
--     Novice 3 min, Advanced 3, Excellent 3, Master 4
--
-- (The per-level chapters repeat these: "The maximum time allowance for the Superior
-- Element classes is five (5) minutes", etc.)
--
-- With a NULL fixed time the show wizard created every UKC class with
-- classes.time_limit_seconds = NULL, and the live scoresheet fell back to 180s: a
-- 5-minute Superior search auto-stopped at 3:00 at the Oct 10 2026 trial (MYK9-1086).
--
-- 1. Set the rulebook time on all 48 ukc-nosework rules and clear the fake range.
-- 2. Backfill time_limit_seconds on existing UKC classes that have NONE. A class that
--    already carries a value keeps it -- this never overwrites a deliberate setting.
--    The UPDATE bumps the replication version (classes_version_increment) and fires
--    the show-day broadcast, so ringside devices pick the limit up.

DO $$
DECLARE
  v_template_id UUID;
  v_rules INTEGER;
  v_classes INTEGER;
BEGIN
  SELECT id INTO v_template_id
  FROM public.sport_templates
  WHERE sport_code = 'ukc-nosework';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'ukc-nosework sport template not found';
  END IF;

  UPDATE public.sport_class_rules r
  SET max_time_seconds_fixed = t.seconds,
      max_time_seconds_min = NULL,
      max_time_seconds_max = NULL,
      updated_at = NOW()
  FROM (VALUES
    ('Container', 'Novice', 180), ('Container', 'Advanced', 240),
    ('Container', 'Superior', 300), ('Container', 'Master', 360),
    ('Container', 'Elite', 360),
    ('Interior', 'Novice', 180), ('Interior', 'Advanced', 240),
    ('Interior', 'Superior', 300), ('Interior', 'Master', 360),
    ('Interior', 'Elite', 360),
    ('Exterior', 'Novice', 180), ('Exterior', 'Advanced', 240),
    ('Exterior', 'Superior', 300), ('Exterior', 'Master', 360),
    ('Exterior', 'Elite', 360),
    ('Vehicle', 'Novice', 180), ('Vehicle', 'Advanced', 240),
    ('Vehicle', 'Superior', 300), ('Vehicle', 'Master', 360),
    ('Vehicle', 'Elite', 360),
    ('Handler Discrimination', 'Novice', 180),
    ('Handler Discrimination', 'Advanced', 180),
    ('Handler Discrimination', 'Excellent', 180),
    ('Handler Discrimination', 'Master', 240)
  ) AS t(element, level, seconds)
  WHERE r.sport_template_id = v_template_id
    AND r.element = t.element
    AND r.level = t.level;

  GET DIAGNOSTICS v_rules = ROW_COUNT;

  -- 24 element/level pairs x A/B sections. Anything else means the UKC class set
  -- changed shape and this mapping needs re-checking rather than a partial apply.
  IF v_rules <> 48 THEN
    RAISE EXCEPTION 'Expected 48 ukc-nosework rules, updated %', v_rules;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sport_class_rules
    WHERE sport_template_id = v_template_id AND max_time_seconds_fixed IS NULL
  ) THEN
    RAISE EXCEPTION 'A ukc-nosework rule still has no fixed max time';
  END IF;

  UPDATE public.classes c
  SET time_limit_seconds = rule.seconds
  FROM public.trials tr,
       (SELECT DISTINCT element, level, max_time_seconds_fixed AS seconds
          FROM public.sport_class_rules
         WHERE sport_template_id = v_template_id) AS rule
  WHERE tr.id = c.trial_id
    AND tr.registry_id = 'UKC'
    AND c.deleted_at IS NULL
    AND c.time_limit_seconds IS NULL
    AND rule.element = c.element
    AND rule.level = c.level;

  GET DIAGNOSTICS v_classes = ROW_COUNT;

  RAISE NOTICE 'UKC rulebook max times: % rules set, % classes backfilled', v_rules, v_classes;
END $$;
