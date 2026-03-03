-- Migration 045: Promo Codes & Financial Tracking
-- Phase 2: Secretary-facing tools for trial discounts and finances.
-- Promo codes apply discounts at entry checkout.
-- Comped entries track judge/worker/special-circumstance waivers.

-- =============================================
-- PROMO CODES
-- =============================================

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value DECIMAL(10,2) NOT NULL,
  usage_limit INTEGER,              -- NULL = unlimited
  usage_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,           -- NULL = no expiry
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT promo_codes_trial_code_unique UNIQUE (trial_id, code),
  CONSTRAINT promo_codes_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT promo_codes_usage_count_non_negative CHECK (usage_count >= 0),
  CONSTRAINT promo_codes_percentage_max CHECK (
    discount_type != 'percentage' OR discount_value <= 100
  )
);

CREATE INDEX idx_promo_codes_trial_id ON promo_codes(trial_id);
CREATE INDEX idx_promo_codes_created_by ON promo_codes(created_by);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_promo_codes_updated_at
  BEFORE UPDATE ON promo_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ENTRIES TABLE — ADD PROMO/COMP COLUMNS
-- =============================================

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS comped_reason TEXT;

-- =============================================
-- ROW LEVEL SECURITY — PROMO CODES
-- =============================================

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read promo codes (exhibitors need to validate at checkout)
CREATE POLICY "promo_codes_select_policy" ON promo_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only the creator can insert
CREATE POLICY "promo_codes_insert_policy" ON promo_codes
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Authenticated users can update (for incrementing usage_count at checkout)
CREATE POLICY "promo_codes_update_policy" ON promo_codes
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Only the creator can delete
CREATE POLICY "promo_codes_delete_policy" ON promo_codes
  FOR DELETE USING (created_by = auth.uid());
