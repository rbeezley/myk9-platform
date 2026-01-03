-- Rename 'none' status to 'no-status' for consistency
-- This makes the database value match the user-facing display text

-- Step 1: Drop the old constraint first (before modifying data)
ALTER TABLE entries
DROP CONSTRAINT IF EXISTS entries_entry_status_check;

-- Step 2: Update all existing 'none' values to 'no-status'
UPDATE entries
SET entry_status = 'no-status'
WHERE entry_status = 'none';

-- Step 3: Add new constraint with 'no-status' instead of 'none'
ALTER TABLE entries
ADD CONSTRAINT entries_entry_status_check
CHECK (entry_status IN (
  'no-status',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'conflict',
  'pulled',
  'in-ring',
  'completed'
));

-- Step 4: Update comment
COMMENT ON COLUMN entries.entry_status IS
'Current status of the entry: no-status, checked-in, at-gate, come-to-gate, conflict, pulled, in-ring, or completed';

-- Verify the change
SELECT
  entry_status,
  COUNT(*) as count
FROM entries
GROUP BY entry_status
ORDER BY entry_status;

SELECT 'Successfully renamed none to no-status in entries table' as status;
