-- Rename shows.type → shows.organization
-- The "type" column stores sanctioning body codes (AKC, UKC, etc.),
-- which are organizations, not show types. Renaming for clarity.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'type'
  ) THEN
    ALTER TABLE shows RENAME COLUMN type TO organization;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'organization'
  ) THEN
    ALTER TABLE shows ADD COLUMN organization TEXT;
  END IF;
END $$;

-- Add trial_type column for the discipline (Scent Work, Agility, etc.)
-- This was previously only in TypeScript types, not persisted to DB.
ALTER TABLE trials ADD COLUMN IF NOT EXISTS trial_type TEXT;

-- Backfill trial_type from sport_type where possible
UPDATE trials SET trial_type = CASE
  WHEN sport_type LIKE '%scent%' THEN 'Scent Work'
  WHEN sport_type LIKE '%nosework%' THEN 'Nosework'
  WHEN sport_type LIKE '%agility%' THEN 'Agility'
  ELSE NULL
END WHERE trial_type IS NULL AND sport_type IS NOT NULL;
