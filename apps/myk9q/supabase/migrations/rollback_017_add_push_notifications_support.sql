-- =====================================================
-- Rollback Migration 017: Remove Push Notification Support
-- =====================================================
-- Created: 2025-10-31
-- Purpose: Rollback migration 017_add_push_notifications_support.sql
--
-- WARNING: This will delete all push subscription data!

-- =====================================================
-- 1. DROP TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS announcement_created_notification ON announcements;
DROP TRIGGER IF EXISTS entry_scored_up_soon_notification ON results;
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;

-- =====================================================
-- 2. DROP FUNCTIONS
-- =====================================================

DROP FUNCTION IF EXISTS notify_announcement_created();
DROP FUNCTION IF EXISTS notify_up_soon();
DROP FUNCTION IF EXISTS update_push_subscription_updated_at();
DROP FUNCTION IF EXISTS cleanup_expired_push_subscriptions();
DROP FUNCTION IF EXISTS get_push_subscription_count(TEXT);
DROP FUNCTION IF EXISTS check_announcement_rate_limit(TEXT);
DROP FUNCTION IF EXISTS increment_announcement_counter(TEXT);

-- =====================================================
-- 3. DROP TABLES
-- =====================================================

DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS announcement_rate_limits CASCADE;

-- =====================================================
-- ROLLBACK COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Rollback 017: Push notification support removed';
  RAISE NOTICE '  - Dropped push_subscriptions table';
  RAISE NOTICE '  - Dropped all notification triggers and functions';
  RAISE NOTICE '  - Dropped spam protection tables';
  RAISE NOTICE '  - NOTE: Dog favorites in localStorage remain unaffected';
END $$;
