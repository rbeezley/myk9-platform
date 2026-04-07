-- Migration 125: Add onboarding_completed_at to exhibitor_profiles
-- Tracks whether an exhibitor has completed the multi-step onboarding wizard.
-- NULL = not yet completed; set to NOW() on the final wizard step.

ALTER TABLE exhibitor_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
