-- =====================================================
-- Migration 017: Add Push Notification Support
-- =====================================================
-- Created: 2025-10-31
-- Purpose: Add push_subscriptions table for real push notifications
--
-- Changes:
-- 1. Create push_subscriptions table (stores web push subscription data)
-- 2. Add indexes for performance
-- 3. Add RLS policies for security
-- 4. Create trigger functions for automatic push notifications
-- 5. Add spam protection
--
-- Note: Dog favorites are stored in localStorage (dog_favorites_{licenseKey})
--       and tracked by armband number, not in the database
--
-- Rollback: See rollback_017_add_push_notifications_support.sql

-- =====================================================
-- 1. CREATE push_subscriptions TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  license_key TEXT NOT NULL,

  -- User identification
  user_id TEXT NOT NULL, -- Passcode (e.g., 'aa260', 'jf472', 'e4b6c')
  user_role TEXT NOT NULL CHECK (user_role IN ('admin', 'judge', 'steward', 'exhibitor')),

  -- Web Push API subscription data
  endpoint TEXT NOT NULL UNIQUE, -- Push service endpoint URL
  p256dh TEXT NOT NULL,          -- Public key for encryption
  auth TEXT NOT NULL,            -- Authentication secret

  -- Notification preferences (JSONB for flexibility)
  notification_preferences JSONB DEFAULT '{
    "announcements": true,
    "up_soon": true,
    "results": false,
    "spam_limit": 10,
    "favorite_armbands": []
  }'::jsonb,

  -- Metadata
  user_agent TEXT,               -- Browser/device info
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_used_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Soft delete (for expired subscriptions)
  is_active BOOLEAN DEFAULT true NOT NULL
);

COMMENT ON TABLE push_subscriptions IS
'Stores Web Push API subscription data for push notifications. Favorites are stored in localStorage as dog_favorites_{licenseKey} with armband numbers.';

COMMENT ON COLUMN push_subscriptions.notification_preferences IS
'JSON preferences: {"announcements": bool, "up_soon": bool, "results": bool, "spam_limit": int, "favorite_armbands": [1,2,3]}';

-- =====================================================
-- 2. ADD INDEXES FOR PERFORMANCE
-- =====================================================

-- Find all subscriptions for a license key (most common query)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_license_key
ON push_subscriptions(license_key)
WHERE is_active = true;

-- Find subscriptions by user_id and license_key
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
ON push_subscriptions(license_key, user_id, user_role)
WHERE is_active = true;

-- Find subscriptions by endpoint (for deduplication)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
ON push_subscriptions(endpoint)
WHERE is_active = true;

-- Find stale subscriptions for cleanup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used
ON push_subscriptions(last_used_at)
WHERE is_active = true;

-- =====================================================
-- 3. ADD ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own subscriptions
CREATE POLICY "Users can view own subscriptions"
ON push_subscriptions
FOR SELECT
USING (license_key IN (
  SELECT license_key FROM shows -- Only shows user has access to
));

-- Policy: Users can insert their own subscriptions
CREATE POLICY "Users can create own subscriptions"
ON push_subscriptions
FOR INSERT
WITH CHECK (true); -- License key validation happens in app layer

-- Policy: Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions"
ON push_subscriptions
FOR UPDATE
USING (license_key IN (
  SELECT license_key FROM shows
));

-- Policy: Users can delete their own subscriptions
CREATE POLICY "Users can delete own subscriptions"
ON push_subscriptions
FOR DELETE
USING (license_key IN (
  SELECT license_key FROM shows
));

-- =====================================================
-- 4. ADD UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_subscriptions_updated_at
BEFORE UPDATE ON push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_push_subscription_updated_at();

-- =====================================================
-- 5. CREATE NOTIFICATION TRIGGER FUNCTIONS
-- =====================================================

-- Function: Send announcement notifications
-- Trigger: When a new announcement is created
CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Build notification payload
  payload := jsonb_build_object(
    'type', 'announcement',
    'license_key', NEW.license_key,
    'announcement_id', NEW.id,
    'title', NEW.title,
    'message', NEW.content,
    'priority', NEW.priority,
    'created_at', NEW.created_at
  );

  -- Send notification via pg_notify
  -- Edge Function will listen to this channel
  PERFORM pg_notify('push_notification', payload::text);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Send push notification when announcement created
CREATE TRIGGER announcement_created_notification
AFTER INSERT ON announcements
FOR EACH ROW
EXECUTE FUNCTION notify_announcement_created();

-- Function: Notify exhibitors when their favorited dog is up soon
-- Trigger: When an entry is marked as scored (next dogs should be notified)
-- Note: This queries push_subscriptions.notification_preferences->favorite_armbands
--       to find which users have favorited specific armband numbers
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER AS $$
DECLARE
  v_next_entry RECORD;
  v_subscription RECORD;
  v_dogs_ahead INTEGER;
  v_favorite_armbands JSONB;
  payload JSONB;
BEGIN
  -- Only proceed if entry was just scored (is_scored changed from false to true)
  IF (TG_OP = 'UPDATE' AND OLD.is_scored = false AND NEW.is_scored = true) THEN

    -- Find next unscored entries in same class
    FOR v_next_entry IN
      SELECT
        e.id,
        e.armband_number,
        e.dog_call_name,
        e.handler_name,
        c.license_key,
        e.class_id,
        c.element,
        c.level
      FROM entries e
      JOIN classes c ON e.class_id = c.id
      WHERE
        e.class_id = NEW.class_id
        AND e.is_scored = false
        AND e.armband_number > NEW.armband_number
      ORDER BY e.armband_number ASC
      LIMIT 5 -- Check next 5 dogs max
    LOOP
      -- Calculate how many dogs are ahead of this one
      SELECT COUNT(*) INTO v_dogs_ahead
      FROM entries e2
      JOIN results r2 ON e2.id = r2.entry_id
      WHERE e2.class_id = v_next_entry.class_id
        AND e2.armband_number < v_next_entry.armband_number
        AND r2.is_scored = false;

      -- Find subscriptions that have this armband in their favorites
      FOR v_subscription IN
        SELECT
          ps.endpoint,
          ps.p256dh,
          ps.auth,
          ps.user_id,
          ps.notification_preferences->'favorite_armbands' as fav_armbands,
          (ps.notification_preferences->>'up_soon')::boolean as wants_up_soon_notifications
        FROM push_subscriptions ps
        WHERE ps.license_key = v_next_entry.license_key
          AND ps.is_active = true
          AND ps.notification_preferences->'favorite_armbands' ? v_next_entry.armband_number::text
          AND (ps.notification_preferences->>'up_soon')::boolean = true
      LOOP
        -- Build notification payload for this user
        payload := jsonb_build_object(
          'type', 'up_soon',
          'license_key', v_next_entry.license_key,
          'entry_id', v_next_entry.id,
          'armband_number', v_next_entry.armband_number,
          'call_name', v_next_entry.dog_call_name,
          'handler_name', v_next_entry.handler_name,
          'class_id', v_next_entry.class_id,
          'element', v_next_entry.element,
          'level', v_next_entry.level,
          'dogs_ahead', v_dogs_ahead,
          'subscription', jsonb_build_object(
            'endpoint', v_subscription.endpoint,
            'p256dh', v_subscription.p256dh,
            'auth', v_subscription.auth
          )
        );

        -- Send notification for this specific subscription
        PERFORM pg_notify('push_notification', payload::text);
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Send "up soon" notifications when entries are scored
CREATE TRIGGER entry_scored_up_soon_notification
AFTER UPDATE ON results
FOR EACH ROW
WHEN (NEW.is_scored = true AND OLD.is_scored = false)
EXECUTE FUNCTION notify_up_soon();

-- =====================================================
-- 6. ADD HELPER FUNCTIONS
-- =====================================================

-- Function: Clean up expired/invalid subscriptions
CREATE OR REPLACE FUNCTION cleanup_expired_push_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Mark subscriptions as inactive if not used in 90 days
  UPDATE push_subscriptions
  SET is_active = false
  WHERE is_active = true
    AND last_used_at < (now() - INTERVAL '90 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_push_subscriptions() IS
'Deactivates push subscriptions that have not been used in 90 days. Run periodically via cron job.';

-- Function: Get active subscription count for a license key
CREATE OR REPLACE FUNCTION get_push_subscription_count(p_license_key TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM push_subscriptions
    WHERE license_key = p_license_key
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. ADD SPAM PROTECTION
-- =====================================================

-- Table: Track announcement frequency to prevent spam
CREATE TABLE IF NOT EXISTS announcement_rate_limits (
  license_key TEXT NOT NULL,
  hour_bucket TIMESTAMPTZ NOT NULL, -- Truncated to hour
  announcement_count INTEGER DEFAULT 0,

  PRIMARY KEY (license_key, hour_bucket)
);

COMMENT ON TABLE announcement_rate_limits IS
'Tracks announcement creation rate to prevent spam. Limit: 10 announcements per hour per license_key.';

-- Function: Check if announcement rate limit exceeded
CREATE OR REPLACE FUNCTION check_announcement_rate_limit(p_license_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 10; -- Max 10 announcements per hour
BEGIN
  -- Get count for current hour
  SELECT COALESCE(announcement_count, 0)
  INTO v_count
  FROM announcement_rate_limits
  WHERE license_key = p_license_key
    AND hour_bucket = date_trunc('hour', now());

  RETURN (v_count < v_limit);
END;
$$ LANGUAGE plpgsql;

-- Function: Increment announcement counter
CREATE OR REPLACE FUNCTION increment_announcement_counter(p_license_key TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO announcement_rate_limits (license_key, hour_bucket, announcement_count)
  VALUES (p_license_key, date_trunc('hour', now()), 1)
  ON CONFLICT (license_key, hour_bucket)
  DO UPDATE SET announcement_count = announcement_rate_limits.announcement_count + 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant access to authenticated users (via RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT ON announcement_rate_limits TO authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 017: Push notification support added successfully';
  RAISE NOTICE '  - Created push_subscriptions table with RLS policies';
  RAISE NOTICE '  - Created notification trigger functions';
  RAISE NOTICE '  - Added spam protection for announcements';
  RAISE NOTICE '  - NOTE: Dog favorites stored in localStorage (dog_favorites_{licenseKey})';
END $$;
