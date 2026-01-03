-- Migration: Create view_combined_classes for TV Run Order
-- Combines Novice A & B classes into single rows for display
-- Non-Novice classes pass through unchanged

CREATE OR REPLACE VIEW view_combined_classes AS
WITH novice_pairs AS (
  -- Find Novice A & B pairs that should be combined
  SELECT
    a.trial_id,
    a.element,
    a.level,
    MIN(a.id) || '-' || MAX(a.id) AS combined_id,
    a.judge_name,
    a.class_status,
    a.element || ' Novice A & B' AS combined_name,
    'Novice' AS combined_level
  FROM classes a
  WHERE
    LOWER(a.level) LIKE '%novice%'
    AND a.section IN ('A', 'B')
  GROUP BY a.trial_id, a.element, a.level, a.judge_name, a.class_status
  HAVING COUNT(DISTINCT a.section) = 2  -- Only combine if BOTH A & B exist
),
standalone_novice AS (
  -- Find Novice classes that DON'T have a matching pair
  SELECT
    c.id::text AS id,
    c.trial_id,
    c.element,
    c.level,
    c.section,
    c.judge_name,
    c.class_status,
    c.element || ' ' || c.level AS class_name,
    c.level AS display_level
  FROM classes c
  WHERE
    LOWER(c.level) LIKE '%novice%'
    AND c.section IN ('A', 'B')
    AND NOT EXISTS (
      -- Exclude if a matching pair exists
      SELECT 1
      FROM classes c2
      WHERE c2.trial_id = c.trial_id
        AND c2.element = c.element
        AND c2.level = c.level
        AND c2.section != c.section
        AND c2.section IN ('A', 'B')
    )
),
non_novice AS (
  -- All non-Novice classes pass through unchanged
  SELECT
    c.id::text AS id,
    c.trial_id,
    c.element,
    c.level,
    c.section,
    c.judge_name,
    c.class_status,
    c.element || ' ' || COALESCE(c.level, '') AS class_name,
    c.level AS display_level
  FROM classes c
  WHERE
    NOT (LOWER(c.level) LIKE '%novice%' AND c.section IN ('A', 'B'))
)

-- Union all three groups
SELECT
  combined_id AS id,
  trial_id,
  element,
  level,
  NULL::text AS section,  -- No section for combined classes
  judge_name,
  class_status,
  combined_name AS class_name,
  combined_level AS display_level
FROM novice_pairs

UNION ALL

SELECT
  id,
  trial_id,
  element,
  level,
  section,
  judge_name,
  class_status,
  class_name,
  display_level
FROM standalone_novice

UNION ALL

SELECT
  id,
  trial_id,
  element,
  level,
  section,
  judge_name,
  class_status,
  class_name,
  display_level
FROM non_novice;

-- Add comment
COMMENT ON VIEW view_combined_classes IS
'Combines Novice A & B classes into single rows for TV Run Order display.
Non-Novice classes and standalone Novice sections pass through unchanged.';
