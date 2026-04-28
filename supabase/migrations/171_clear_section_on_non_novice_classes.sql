-- Clear section on non-Novice scent work classes.
-- Only Novice (A/B) has sections in AKC Scent Work.
-- Any class whose level does not start with 'Novice' should have section = NULL.
UPDATE classes
SET section = NULL
WHERE section IS NOT NULL
  AND section != ''
  AND level IS NOT NULL
  AND level NOT LIKE 'Novice%';
