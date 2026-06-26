-- Withdrawal refund policy — club default + show override
--
-- Adds the lightly-structured withdrawal policy fields (cutoff + retention +
-- prose) to clubs (the default every show inherits) and shows (the optional
-- per-show override). Resolved in app code by getEffectiveWithdrawalPolicy()
-- = show override (if any field set) else club default else null.
--
-- See docs/plan-refund-policy-withdrawal.md (Phase 1, D1/D2).
--
-- Additive, nullable columns only — no destructive change, no backfill
-- (pre-launch: no real users). ALTER TABLE ADD COLUMN inherits the existing
-- table GRANTs and RLS, so no new GRANT/policy is required: writes to clubs/
-- shows are already gated to club/show managers by their existing RLS policies,
-- and these columns ride those same policies.

-- Club-level defaults
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS default_withdrawal_cutoff_date DATE,
  ADD COLUMN IF NOT EXISTS default_withdrawal_retention_type TEXT,
  ADD COLUMN IF NOT EXISTS default_withdrawal_retention_value INTEGER,
  ADD COLUMN IF NOT EXISTS default_withdrawal_policy_notes TEXT;

-- Show-level override (NULL across all = inherit the club default)
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS withdrawal_cutoff_date DATE,
  ADD COLUMN IF NOT EXISTS withdrawal_retention_type TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_retention_value INTEGER,
  ADD COLUMN IF NOT EXISTS withdrawal_policy_notes TEXT;

-- Constrain the enum-ish + non-negative fields. Guarded so re-running the
-- migration (or a partial prior apply) does not error on a duplicate constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clubs_default_withdrawal_retention_type_check') THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT clubs_default_withdrawal_retention_type_check
      CHECK (default_withdrawal_retention_type IS NULL
             OR default_withdrawal_retention_type IN ('flat', 'percent'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clubs_default_withdrawal_retention_value_check') THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT clubs_default_withdrawal_retention_value_check
      CHECK (default_withdrawal_retention_value IS NULL
             OR default_withdrawal_retention_value >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_withdrawal_retention_type_check') THEN
    ALTER TABLE public.shows
      ADD CONSTRAINT shows_withdrawal_retention_type_check
      CHECK (withdrawal_retention_type IS NULL
             OR withdrawal_retention_type IN ('flat', 'percent'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_withdrawal_retention_value_check') THEN
    ALTER TABLE public.shows
      ADD CONSTRAINT shows_withdrawal_retention_value_check
      CHECK (withdrawal_retention_value IS NULL
             OR withdrawal_retention_value >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.clubs.default_withdrawal_cutoff_date IS
  'Withdrawal refund cutoff (club default). Full refund on/before this date (show tz); retention applies after. Inherited by all the club''s shows unless overridden.';
COMMENT ON COLUMN public.clubs.default_withdrawal_retention_type IS
  'flat = cents per entry; percent = whole-number percent retained after the cutoff (club default).';
COMMENT ON COLUMN public.shows.withdrawal_cutoff_date IS
  'Per-show withdrawal cutoff override. NULL across all withdrawal_* columns = inherit the club default.';
