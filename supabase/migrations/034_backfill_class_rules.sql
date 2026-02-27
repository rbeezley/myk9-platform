-- Migration 034: Backfill class rule columns from sport_class_rules
--
-- Populates timer_mode, hides_known, and distraction_count for existing
-- classes by joining through trials → sport_templates → sport_class_rules.
-- Also backfills num_hides where it's still the default.
--
-- Classes that don't match a sport_class_rules row keep their defaults.

-- Step 1: Ensure trials have sport_type set (default: akc-scent-work)
ALTER TABLE trials ADD COLUMN IF NOT EXISTS sport_type TEXT DEFAULT 'akc-scent-work';

-- Step 2: Backfill class rule columns
UPDATE classes c
SET
  timer_mode     = COALESCE(scr.timer_mode, c.timer_mode),
  hides_known    = COALESCE(scr.hides_known, c.hides_known),
  distraction_count = COALESCE(
    CASE WHEN scr.distraction_count_max > 0 THEN scr.distraction_count_max ELSE NULL END,
    c.distraction_count
  ),
  num_hides      = COALESCE(
    CASE WHEN c.num_hides = 1 THEN scr.hide_count_fixed END,
    c.num_hides
  )
FROM trials t
JOIN sport_templates st ON st.sport_code = t.sport_type
JOIN sport_class_rules scr ON scr.sport_template_id = st.id
WHERE c.trial_id = t.id
  AND LOWER(scr.element) = LOWER(c.element)
  AND LOWER(COALESCE(scr.level, '')) = LOWER(COALESCE(c.level, ''));
