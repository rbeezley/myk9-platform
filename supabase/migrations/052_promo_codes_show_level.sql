-- Migration 052: Add show-level promo codes support
-- Promo codes can now be scoped to either a show (all trials) or a specific trial.

-- 1. Add show_id column
ALTER TABLE promo_codes ADD COLUMN show_id UUID REFERENCES shows(id) ON DELETE CASCADE;

-- 2. Make trial_id nullable (was NOT NULL)
ALTER TABLE promo_codes ALTER COLUMN trial_id DROP NOT NULL;

-- 3. Exactly one of show_id or trial_id must be set
ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_scope_check
  CHECK (
    (show_id IS NOT NULL AND trial_id IS NULL) OR
    (show_id IS NULL AND trial_id IS NOT NULL)
  );

-- 4. Drop old unique constraint (trial_id, code) — replaced by partial indexes
ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_trial_code_unique;

-- 5. Partial unique indexes for each scope
CREATE UNIQUE INDEX idx_promo_codes_show_code
  ON promo_codes(show_id, code) WHERE show_id IS NOT NULL;

CREATE UNIQUE INDEX idx_promo_codes_trial_code
  ON promo_codes(trial_id, code) WHERE trial_id IS NOT NULL;

-- 6. Index for show-level queries
CREATE INDEX idx_promo_codes_show_id
  ON promo_codes(show_id) WHERE show_id IS NOT NULL;
