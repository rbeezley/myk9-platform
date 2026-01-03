-- =====================================================
-- Migration: Add passcode column to push_subscriptions
-- =====================================================
-- Purpose: Enable easier troubleshooting by storing the user's passcode
-- Combined with user_agent and created_at, helps identify specific users
--
-- For staff (admin/judge/steward): passcode is unique per person
-- For exhibitors: combine with user_agent + timestamp to identify

ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS passcode TEXT;

-- Add index for filtering by passcode
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_passcode
ON push_subscriptions(passcode)
WHERE is_active = true;

COMMENT ON COLUMN push_subscriptions.passcode IS
'User passcode for troubleshooting (e.g., aa260, jf472). Combined with user_agent helps identify specific users.';
