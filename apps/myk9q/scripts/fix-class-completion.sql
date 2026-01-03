-- Fix class completion status for all classes where all entries are scored
-- This will mark classes as completed when all their entries have been scored

UPDATE classes c
SET
  is_completed = true,
  completed_at = COALESCE(c.updated_at, NOW())
WHERE
  c.id IN (
    SELECT c2.id
    FROM classes c2
    WHERE c2.total_entry_count > 0
      AND c2.total_entry_count = c2.completed_entry_count
      AND (c2.is_completed IS NULL OR c2.is_completed = false)
  );

-- Also ensure classes that are NOT fully scored are marked as incomplete
UPDATE classes c
SET
  is_completed = false,
  completed_at = NULL
WHERE
  c.id IN (
    SELECT c2.id
    FROM classes c2
    WHERE c2.total_entry_count > 0
      AND c2.total_entry_count > c2.completed_entry_count
      AND c2.is_completed = true
  );

-- Show results
SELECT
  c.id,
  c.element,
  c.level,
  c.section,
  c.total_entry_count,
  c.completed_entry_count,
  c.is_completed,
  c.completed_at
FROM classes c
WHERE c.total_entry_count > 0
ORDER BY c.class_order;
