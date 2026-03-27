-- Drop the redundant sport_type column from trials.
-- sport_type can be derived at runtime from the show's organization + trial_type
-- using deriveSportType(org, trialType). Keeping both led to sync issues.

ALTER TABLE trials DROP COLUMN IF EXISTS sport_type;
