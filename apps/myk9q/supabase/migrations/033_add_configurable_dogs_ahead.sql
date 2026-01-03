-- =====================================================
-- Migration 033: Add Configurable Dogs Ahead Notification
-- =====================================================
-- Purpose: Allow users to configure when they want to be notified
--          (e.g., only when 2 dogs away, not when 5 dogs away)
-- Date: 2025-11-02
-- =====================================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_notify_up_soon ON results;
DROP FUNCTION IF EXISTS notify_up_soon() CASCADE;

-- Recreate function with dogs_ahead preference support
CREATE OR REPLACE FUNCTION notify_up_soon()
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
  v_dogs_ahead INTEGER;
  scored_entry RECORD;
  next_entry RECORD;
  subscription RECORD;
BEGIN
  -- Get secrets from config table
  SELECT trigger_secret, anon_key INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  LIMIT 1;

  -- Build Edge Function URL
  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Get scored entry details
  SELECT
    e.id,
    e.armband_number,
    e.class_id,
    t.license_key,
    c.element,
    c.level,
    COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
  INTO scored_entry
  FROM entries e
    JOIN classes c ON e.class_id = c.id
    JOIN trials t ON c.trial_id = t.id
    JOIN shows s ON t.show_id = s.id
    WHERE e.id = NEW.entry_id;

  v_license_key := scored_entry.license_key;
  v_class_name := scored_entry.element || ' ' || scored_entry.level;
  v_dogs_ahead := 0;

  -- Check next 5 dogs (maximum threshold)
  FOR next_entry IN
    SELECT
      e.id,
      e.armband_number,
      e.dog_call_name,
      e.handler_name,
      e.class_id,
      COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
    FROM entries e
      LEFT JOIN results r ON e.id = r.entry_id
    WHERE
        e.class_id = scored_entry.class_id
        AND e.id != scored_entry.id
        AND (r.is_scored IS NULL OR r.is_scored = false)
        AND COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) > scored_entry.effective_run_order
      ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
      LIMIT 5
  LOOP
    v_dogs_ahead := v_dogs_ahead + 1;

    -- Find all subscriptions that:
    -- 1. Are subscribed to this show
    -- 2. Have this armband in favorites
    -- 3. Have dogs_ahead preference >= current position
    FOR subscription IN
      SELECT
        ps.endpoint,
        ps.p256dh,
        ps.auth,
        ps.notification_preferences,
        COALESCE((ps.notification_preferences->>'dogs_ahead')::INTEGER, 3) AS user_dogs_ahead
      FROM push_subscriptions ps
      WHERE
        ps.license_key = v_license_key
        AND ps.is_active = true
        AND ps.notification_preferences->>'up_soon' = 'true'
        AND ps.notification_preferences->'favorite_armbands' @> to_jsonb(next_entry.armband_number)
        -- Only notify if dog is within user's preferred threshold
        AND v_dogs_ahead <= COALESCE((ps.notification_preferences->>'dogs_ahead')::INTEGER, 3)
    LOOP
      -- Build notification payload
      v_payload := jsonb_build_object(
        'type', 'up_soon',
        'license_key', v_license_key,
        'title', 'You''re Up Soon!',
        'body', next_entry.dog_call_name || ' (#' || next_entry.armband_number || ') is ' || v_dogs_ahead || ' dogs away in ' || v_class_name,
        'url', '/entries',
        'armband_number', next_entry.armband_number,
        'dog_name', next_entry.dog_call_name,
        'handler', next_entry.handler_name,
        'class_id', next_entry.class_id,
        'entry_id', next_entry.id
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
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send up_soon notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER trigger_notify_up_soon
  AFTER UPDATE OF is_scored ON results
  FOR EACH ROW
  WHEN (NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false))
  EXECUTE FUNCTION notify_up_soon();

-- Add comment
COMMENT ON FUNCTION notify_up_soon() IS
  'Sends push notifications when favorited dogs are coming up soon. ' ||
  'Respects user preference for dogs_ahead threshold (1-5 dogs). ' ||
  'Default: 3 dogs ahead if not specified.';
