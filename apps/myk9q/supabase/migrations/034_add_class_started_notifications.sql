-- =====================================================
-- Migration 034: Add Class Started Push Notifications
-- =====================================================
-- Purpose: Notify users when their class starts (briefing/in-progress)
-- Trigger: When classes.class_status changes to 'briefing' or 'in_progress'
-- Filter: Only notify users with favorited dogs in that class
-- Date: 2025-11-02
-- =====================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_notify_class_started ON classes;
DROP FUNCTION IF EXISTS notify_class_started() CASCADE;

-- Create trigger function
CREATE OR REPLACE FUNCTION notify_class_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_anon_key TEXT;
  v_trigger_secret TEXT;
  v_license_key TEXT;
  v_class_name TEXT;
  v_class_armbands INTEGER[];
  subscription RECORD;
BEGIN
  -- Only trigger on status change TO briefing or in_progress
  IF NEW.class_status NOT IN ('briefing', 'in_progress') THEN
    RETURN NEW;
  END IF;

  -- Don't re-notify if status was already briefing or in_progress
  IF OLD.class_status IN ('briefing', 'in_progress') THEN
    RETURN NEW;
  END IF;

  -- Get secrets from config table
  SELECT trigger_secret, anon_key INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  LIMIT 1;

  -- Build Edge Function URL
  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Get class details
  SELECT
    t.license_key,
    c.element || ' ' || c.level
  INTO v_license_key, v_class_name
  FROM classes c
    JOIN trials t ON c.trial_id = t.id
  WHERE c.id = NEW.id;

  -- Get all armband numbers for entries in this class
  SELECT ARRAY_AGG(e.armband_number)
  INTO v_class_armbands
  FROM entries e
  WHERE e.class_id = NEW.id;

  -- If no entries in class, nothing to do
  IF v_class_armbands IS NULL OR array_length(v_class_armbands, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Find all subscriptions where user has at least one favorited dog in this class
  FOR subscription IN
    SELECT
      ps.endpoint,
      ps.p256dh,
      ps.auth,
      ps.notification_preferences
    FROM push_subscriptions ps
    WHERE
      ps.license_key = v_license_key
      AND ps.is_active = true
      AND ps.notification_preferences->>'up_soon' = 'true'
      -- Check if ANY armband from this class is in their favorites
      AND ps.notification_preferences->'favorite_armbands' ?| ARRAY(SELECT unnest(v_class_armbands)::text)
  LOOP
    -- Build notification payload
    v_payload := jsonb_build_object(
      'type', 'class_started',
      'license_key', v_license_key,
      'title', 'Your Class is Starting!',
      'body', v_class_name || ' - Get to the ring for briefing',
      'url', '/classes/' || NEW.id,
      'class_id', NEW.id,
      'class_name', v_class_name,
      'class_status', NEW.class_status
    );

    -- Send notification via Edge Function
    PERFORM net.http_post(
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
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send class_started notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_notify_class_started
  AFTER UPDATE OF class_status ON classes
  FOR EACH ROW
  WHEN (NEW.class_status IN ('briefing', 'in_progress') AND
        (OLD.class_status IS NULL OR OLD.class_status NOT IN ('briefing', 'in_progress')))
  EXECUTE FUNCTION notify_class_started();

-- Add comment
COMMENT ON FUNCTION notify_class_started() IS
  'Sends push notifications when a class status changes to briefing or in_progress. ' ||
  'Only notifies users who have favorited dogs in that specific class. ' ||
  'Prevents duplicate notifications by checking old status.';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- To verify trigger was created:
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trigger_notify_class_started';

-- To test manually (replace class_id):
-- UPDATE classes SET class_status = 'briefing' WHERE id = YOUR_CLASS_ID;

-- To see which users would be notified for a specific class:
-- SELECT
--   ps.user_id,
--   ps.notification_preferences->'favorite_armbands' as favorites,
--   ARRAY_AGG(e.armband_number) as class_armbands
-- FROM push_subscriptions ps
-- CROSS JOIN LATERAL (
--   SELECT armband_number FROM entries WHERE class_id = YOUR_CLASS_ID
-- ) e
-- WHERE ps.license_key = 'YOUR_LICENSE_KEY'
--   AND ps.is_active = true
--   AND ps.notification_preferences->>'up_soon' = 'true'
-- GROUP BY ps.user_id, ps.notification_preferences;
