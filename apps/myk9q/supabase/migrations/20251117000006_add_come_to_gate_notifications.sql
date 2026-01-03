-- =====================================================
-- Migration: Add Come-to-Gate Push Notifications
-- =====================================================
-- Purpose: Notify exhibitors when steward sets status to "come-to-gate"
-- Trigger: When entries.checkin_status changes to 'come-to-gate'
-- Filter: Only notify the specific user who owns that entry
-- Date: 2025-11-17
-- =====================================================

-- =============================================================================
-- STEP 1: Update notification preferences to include come_to_gate setting
-- =============================================================================

-- Add come_to_gate preference to existing subscriptions (default: true)
UPDATE push_subscriptions
SET notification_preferences = notification_preferences || '{"come_to_gate": true}'::jsonb
WHERE notification_preferences->>'come_to_gate' IS NULL;

-- Update the default for new subscriptions by altering the column default
ALTER TABLE push_subscriptions
ALTER COLUMN notification_preferences
SET DEFAULT '{
  "announcements": true,
  "up_soon": true,
  "results": false,
  "come_to_gate": true,
  "spam_limit": 10,
  "favorite_armbands": []
}'::jsonb;

COMMENT ON COLUMN push_subscriptions.notification_preferences IS
'JSON preferences: {"announcements": bool, "up_soon": bool, "results": bool, "come_to_gate": bool, "spam_limit": int, "favorite_armbands": [1,2,3]}';

-- =============================================================================
-- STEP 2: Create notification trigger function
-- =============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_notify_come_to_gate ON entries;
DROP FUNCTION IF EXISTS notify_come_to_gate() CASCADE;

-- Create trigger function
CREATE OR REPLACE FUNCTION notify_come_to_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_anon_key TEXT;
  v_trigger_secret TEXT;
  v_request_id BIGINT;
  v_response RECORD;
  v_class_info RECORD;
  subscription RECORD;
BEGIN
  -- Only trigger on status change TO come-to-gate
  IF NEW.entry_status != 'come-to-gate' THEN
    RETURN NEW;
  END IF;

  -- Don't re-notify if status was already come-to-gate
  IF OLD.entry_status = 'come-to-gate' THEN
    RETURN NEW;
  END IF;

  -- Get secrets from config table
  SELECT trigger_secret, anon_key INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  LIMIT 1;

  IF v_trigger_secret IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'Push notification config not found';
    RETURN NEW;
  END IF;

  -- Build Edge Function URL
  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Get class details
  SELECT
    c.element || ' ' || c.level as class_name,
    c.id as class_id
  INTO v_class_info
  FROM classes c
  WHERE c.id = NEW.class_id;

  -- Find all active push subscriptions for users who have this dog favorited
  FOR subscription IN
    SELECT
      ps.endpoint,
      ps.p256dh,
      ps.auth,
      ps.notification_preferences
    FROM push_subscriptions ps
    WHERE
      ps.license_key = NEW.license_key
      AND ps.is_active = true
      AND ps.notification_preferences->>'come_to_gate' = 'true'
      -- Check if this specific armband is in their favorites
      AND ps.notification_preferences->'favorite_armbands' ? NEW.armband_number::text
  LOOP
    -- Build notification payload
    v_payload := jsonb_build_object(
      'type', 'come_to_gate',
      'license_key', NEW.license_key,
      'title', '🔔 Come to Gate!',
      'body', 'Armband #' || NEW.armband_number || ' (' || NEW.call_name || ') - Please proceed to the ring gate',
      'url', '/entries/' || NEW.id,
      'entry_id', NEW.id,
      'armband_number', NEW.armband_number,
      'call_name', NEW.call_name,
      'class_name', v_class_info.class_name,
      'class_id', v_class_info.class_id,
      'priority', 'high'
    );

    -- Send notification via Edge Function with response checking
    BEGIN
      -- Capture the request ID
      v_request_id := net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key,
          'X-Trigger-Secret', v_trigger_secret
        ),
        body := v_payload,
        timeout_milliseconds := 5000
      );

      -- Check the response status code
      SELECT status_code, content
      INTO v_response
      FROM net._http_response
      WHERE id = v_request_id;

      -- If status code is not 2xx, queue for retry
      IF v_response.status_code IS NULL OR v_response.status_code < 200 OR v_response.status_code >= 300 THEN
        PERFORM queue_failed_notification(
          NEW.license_key,
          v_payload,
          'HTTP ' || COALESCE(v_response.status_code::text, 'NULL') || ': ' || COALESCE(v_response.content::text, 'No response'),
          'come_to_gate',
          NEW.id,
          NULL::BIGINT
        );
        RAISE WARNING 'Come-to-gate notification failed (HTTP %), queued for retry', v_response.status_code;
      ELSE
        RAISE NOTICE 'Come-to-gate notification sent successfully (HTTP %)', v_response.status_code;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Network error or database error, queue for retry
        PERFORM queue_failed_notification(
          NEW.license_key,
          v_payload,
          SQLERRM,
          'come_to_gate',
          NEW.id,
          NULL::BIGINT
        );
        RAISE WARNING 'Come-to-gate notification exception, queued for retry: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send come_to_gate notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_notify_come_to_gate
  AFTER UPDATE OF entry_status ON entries
  FOR EACH ROW
  WHEN (NEW.entry_status = 'come-to-gate' AND
        (OLD.entry_status IS NULL OR OLD.entry_status != 'come-to-gate'))
  EXECUTE FUNCTION notify_come_to_gate();

-- Add comment
COMMENT ON FUNCTION notify_come_to_gate() IS 'Sends push notifications when an entry status changes to come-to-gate. Only notifies users who have favorited this specific dog. Prevents duplicate notifications by checking old status. High priority notification to ensure exhibitor responds quickly.';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- To verify trigger was created:
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trigger_notify_come_to_gate';

-- To test manually (replace entry_id):
-- UPDATE entries SET checkin_status = 'come-to-gate' WHERE id = YOUR_ENTRY_ID;

-- To see which users would be notified for a specific entry:
-- SELECT
--   ps.user_id,
--   ps.notification_preferences->'favorite_armbands' as favorites,
--   e.armband_number,
--   e.call_name
-- FROM push_subscriptions ps
-- CROSS JOIN entries e
-- WHERE e.id = YOUR_ENTRY_ID
--   AND ps.license_key = e.license_key
--   AND ps.is_active = true
--   AND ps.notification_preferences->>'come_to_gate' = 'true'
--   AND ps.notification_preferences->'favorite_armbands' ? e.armband_number::text;
