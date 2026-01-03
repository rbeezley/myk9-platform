-- Comprehensive fix for ALL time_limit_seconds values for AKC Scent Work classes
-- This updates ALL records to correct values regardless of their current incorrect values

-- CONTAINER - All levels: 2 minutes (120 seconds)
UPDATE classes
SET time_limit_seconds = 120
WHERE element = 'Container'
  AND time_limit_seconds != 120; -- Fix any value that's not already correct

-- INTERIOR - All levels: 3 minutes (180 seconds) per area
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Interior'
  AND time_limit_seconds != 180;

-- EXTERIOR - Novice/Advanced: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Exterior'
  AND level IN ('Novice', 'Advanced')
  AND time_limit_seconds != 180;

-- EXTERIOR - Excellent: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Exterior'
  AND level = 'Excellent'
  AND time_limit_seconds != 240;

-- EXTERIOR - Master: 5 minutes (300 seconds)
UPDATE classes
SET time_limit_seconds = 300
WHERE element = 'Exterior'
  AND level = 'Master'
  AND time_limit_seconds != 300;

-- BURIED - Novice/Advanced: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Buried'
  AND level IN ('Novice', 'Advanced')
  AND time_limit_seconds != 180;

-- BURIED - Excellent: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Buried'
  AND level = 'Excellent'
  AND time_limit_seconds != 240;

-- BURIED - Master: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Buried'
  AND level = 'Master'
  AND time_limit_seconds != 240;

-- HANDLER DISCRIMINATION - Novice/Advanced/Excellent: 2 minutes (120 seconds) per area
UPDATE classes
SET time_limit_seconds = 120
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level IN ('Novice', 'Advanced', 'Excellent')
  AND time_limit_seconds != 120;

-- HANDLER DISCRIMINATION - Master: 3 minutes (180 seconds) per area
UPDATE classes
SET time_limit_seconds = 180
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level = 'Master'
  AND time_limit_seconds != 180;

-- Multi-area time limits (Interior Excellent/Master, Handler Discrimination Master)

-- INTERIOR EXCELLENT - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE element = 'Interior'
  AND level = 'Excellent'
  AND time_limit_area2_seconds != 180
  AND time_limit_area2_seconds > 0;

-- INTERIOR MASTER - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE element = 'Interior'
  AND level = 'Master'
  AND time_limit_area2_seconds != 180
  AND time_limit_area2_seconds > 0;

-- INTERIOR MASTER - Area 3: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area3_seconds = 180
WHERE element = 'Interior'
  AND level = 'Master'
  AND time_limit_area3_seconds != 180
  AND time_limit_area3_seconds > 0;

-- HANDLER DISCRIMINATION MASTER - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level = 'Master'
  AND time_limit_area2_seconds != 180
  AND time_limit_area2_seconds > 0;

-- Log summary
DO $$
BEGIN
  RAISE NOTICE 'Comprehensively fixed ALL AKC Scent Work time limits to correct values';
  RAISE NOTICE 'Container: All levels -> 120 seconds (2 min)';
  RAISE NOTICE 'Interior: All levels -> 180 seconds (3 min) per area';
  RAISE NOTICE 'Exterior: Novice/Adv -> 180s, Exc -> 240s, Master -> 300s';
  RAISE NOTICE 'Buried: Novice/Adv -> 180s, Exc/Master -> 240s';
  RAISE NOTICE 'Handler Disc: Novice/Adv/Exc -> 120s, Master -> 180s per area';
END $$;
