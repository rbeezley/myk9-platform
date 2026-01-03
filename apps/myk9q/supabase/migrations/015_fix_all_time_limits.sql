-- Fix ALL time_limit_seconds values for AKC Scent Work classes
-- Time limits are currently stored as minutes * 60 instead of actual seconds
-- This migration converts them to the correct values per AKC regulations

-- CONTAINER - All levels: 2 minutes (120 seconds)
UPDATE classes
SET time_limit_seconds = 120
WHERE element = 'Container'
  AND time_limit_seconds = 7200; -- Currently stored as 120 minutes

-- INTERIOR - All levels: 3 minutes (180 seconds) per area
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Interior'
  AND time_limit_seconds = 10800; -- Currently stored as 180 minutes

-- EXTERIOR - Novice/Advanced: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Exterior'
  AND level IN ('Novice', 'Advanced')
  AND time_limit_seconds = 10800; -- Currently stored as 180 minutes

-- EXTERIOR - Excellent: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Exterior'
  AND level = 'Excellent'
  AND time_limit_seconds = 14400; -- Currently stored as 240 minutes

-- EXTERIOR - Master: 5 minutes (300 seconds)
UPDATE classes
SET time_limit_seconds = 300
WHERE element = 'Exterior'
  AND level = 'Master'
  AND time_limit_seconds = 18000; -- Currently stored as 300 minutes

-- BURIED - Novice/Advanced: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_seconds = 180
WHERE element = 'Buried'
  AND level IN ('Novice', 'Advanced')
  AND time_limit_seconds = 10800; -- Currently stored as 180 minutes

-- BURIED - Excellent: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Buried'
  AND level = 'Excellent'
  AND time_limit_seconds = 14400; -- Currently stored as 240 minutes

-- BURIED - Master: 4 minutes (240 seconds)
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Buried'
  AND level = 'Master'
  AND time_limit_seconds = 14400; -- Currently stored as 240 minutes

-- HANDLER DISCRIMINATION - Novice/Advanced/Excellent: 2 minutes (120 seconds) per area
UPDATE classes
SET time_limit_seconds = 120
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level IN ('Novice', 'Advanced', 'Excellent')
  AND time_limit_seconds = 7200; -- Currently stored as 120 minutes

-- HANDLER DISCRIMINATION - Master: 3 minutes (180 seconds) per area
UPDATE classes
SET time_limit_seconds = 180
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level = 'Master'
  AND time_limit_seconds = 10800; -- Currently stored as 180 minutes

-- Multi-area time limits (Interior Excellent/Master, Handler Discrimination Master)

-- INTERIOR EXCELLENT - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE element = 'Interior'
  AND level = 'Excellent'
  AND time_limit_area2_seconds = 10800; -- Currently stored as 180 minutes

-- INTERIOR MASTER - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE element = 'Interior'
  AND level = 'Master'
  AND time_limit_area2_seconds = 10800; -- Currently stored as 180 minutes

-- INTERIOR MASTER - Area 3: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area3_seconds = 180
WHERE element = 'Interior'
  AND level = 'Master'
  AND time_limit_area3_seconds = 10800; -- Currently stored as 180 minutes

-- HANDLER DISCRIMINATION MASTER - Area 2: 3 minutes (180 seconds)
UPDATE classes
SET time_limit_area2_seconds = 180
WHERE (element = 'Handler Discrimination' OR element ILIKE '%Handler%Discrimination%')
  AND level = 'Master'
  AND time_limit_area2_seconds = 10800; -- Currently stored as 180 minutes

-- Log summary
DO $$
BEGIN
  RAISE NOTICE 'Fixed all AKC Scent Work time limits from minutes to seconds';
  RAISE NOTICE 'Container: All levels -> 120 seconds (2 min)';
  RAISE NOTICE 'Interior: All levels -> 180 seconds (3 min) per area';
  RAISE NOTICE 'Exterior: Novice/Adv -> 180s, Exc -> 240s, Master -> 300s';
  RAISE NOTICE 'Buried: Novice/Adv -> 180s, Exc/Master -> 240s';
  RAISE NOTICE 'Handler Disc: Novice/Adv/Exc -> 120s, Master -> 180s per area';
END $$;
