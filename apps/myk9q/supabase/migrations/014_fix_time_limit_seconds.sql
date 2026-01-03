-- Fix time_limit_seconds values that are stored as minutes instead of seconds
-- Container Master should be 240 seconds (4 minutes), not 14400 seconds (240 minutes)

-- Update Container Master classes
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Container'
  AND level = 'Master'
  AND time_limit_seconds = 14400;

-- Update Buried Master classes
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Buried'
  AND level = 'Master'
  AND time_limit_seconds = 14400;

-- Update Interior Master classes
UPDATE classes
SET time_limit_seconds = 240
WHERE element = 'Interior'
  AND level = 'Master'
  AND time_limit_seconds = 14400;

-- Update Exterior Master classes
UPDATE classes
SET time_limit_seconds = 300
WHERE element = 'Exterior'
  AND level = 'Master'
  AND time_limit_seconds = 18000;

-- Update Handler Discrimination Master classes
UPDATE classes
SET time_limit_seconds = 180
WHERE element ILIKE '%Handler%Discrimination%'
  AND level = 'Master'
  AND time_limit_seconds = 10800;

-- Log the fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed time_limit_seconds values from minutes to seconds';
END $$;
