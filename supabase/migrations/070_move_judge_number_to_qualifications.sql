-- Move judge_number from people table to judge_qualifications table
-- A judge can have different numbers for different organizations (AKC, UKC, etc.)

-- Step 1: Add judge_number column to judge_qualifications
ALTER TABLE judge_qualifications ADD COLUMN IF NOT EXISTS judge_number TEXT;

-- Step 2: Migrate existing people.judge_number into their qualifications
UPDATE judge_qualifications jq
SET judge_number = p.judge_number
FROM people p
WHERE jq.person_id = p.id
  AND p.judge_number IS NOT NULL
  AND p.judge_number != '';

-- Step 3: Drop judge_number from people table
ALTER TABLE people DROP COLUMN IF EXISTS judge_number;

-- Step 4: Drop the index on the old column (if it still exists after column drop)
DROP INDEX IF EXISTS people_judge_number_idx;
