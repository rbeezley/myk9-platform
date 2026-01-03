-- Migration: Add configurable rule fields to class_requirements table
-- This allows rules to be managed via database instead of hardcoded in application

-- Add new columns for configurable class rules
ALTER TABLE class_requirements
  ADD COLUMN IF NOT EXISTS has_30_second_warning BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS time_type VARCHAR(10) DEFAULT 'range'
    CHECK (time_type IN ('fixed', 'range', 'dictated')),
  ADD COLUMN IF NOT EXISTS warning_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_class_requirements_time_type ON class_requirements(time_type);
CREATE INDEX IF NOT EXISTS idx_class_requirements_has_warning ON class_requirements(has_30_second_warning);

-- Comment the columns for documentation
COMMENT ON COLUMN class_requirements.has_30_second_warning IS 'Whether this class level receives a 30-second warning before max time expires';
COMMENT ON COLUMN class_requirements.time_type IS 'Type of max time: fixed (organization dictated), range (judge sets within bounds), or dictated (exact time required)';
COMMENT ON COLUMN class_requirements.warning_notes IS 'Custom warning message to display for this class (e.g., "Master classes do not receive a 30-second warning")';
COMMENT ON COLUMN class_requirements.updated_at IS 'Last time these requirements were updated';

-- Update existing Master classes to not have 30-second warning
-- AKC Master levels
UPDATE class_requirements
SET
  has_30_second_warning = false,
  warning_notes = 'Master classes do not receive a 30-second warning',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND level ILIKE '%master%';

-- Update Container Master to use fixed time (4 minutes per AKC rules)
UPDATE class_requirements
SET
  time_type = 'fixed',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND element = 'Container'
  AND level = 'Master';

-- Update Buried Master to use fixed time (4 minutes per AKC rules)
UPDATE class_requirements
SET
  time_type = 'fixed',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND element = 'Buried'
  AND level = 'Master';

-- Update Interior Master to use fixed time (4 minutes per AKC rules)
UPDATE class_requirements
SET
  time_type = 'fixed',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND element = 'Interior'
  AND level = 'Master';

-- Update Exterior Master to use fixed time (4 minutes per AKC rules)
UPDATE class_requirements
SET
  time_type = 'fixed',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND element = 'Exterior'
  AND level = 'Master';

-- Update Handler Discrimination Master to use fixed time (3 minutes per AKC rules)
UPDATE class_requirements
SET
  time_type = 'fixed',
  updated_at = NOW()
WHERE
  organization = 'AKC'
  AND element = 'Handler Discrimination'
  AND level = 'Master';

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_class_requirements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS class_requirements_updated_at_trigger ON class_requirements;
CREATE TRIGGER class_requirements_updated_at_trigger
  BEFORE UPDATE ON class_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_class_requirements_updated_at();
