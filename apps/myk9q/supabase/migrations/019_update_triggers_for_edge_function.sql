-- =====================================================
-- Migration 019: Update Push Notification Triggers
-- =====================================================
-- Purpose: Update triggers to call Edge Function via HTTP
-- Previous: Used pg_notify (doesn't work with Edge Functions)
-- New: Uses net.http_post() to call Edge Function
--
-- Prerequisites:
-- 1. Edge Function 'send-push-notification' must be deployed
-- 2. pg_net extension must be enabled (enabled by default on Supabase)
-- 3. Edge Function URL: https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification
-- =====================================================

-- Drop old trigger functions that use pg_notify
DROP TRIGGER IF EXISTS announcement_created_notification ON announcements;
DROP FUNCTION IF EXISTS notify_announcement_created();

DROP TRIGGER IF EXISTS trigger_notify_up_soon ON results;
DROP FUNCTION IF EXISTS notify_up_soon();

-- =====================================================
-- Updated Function: Send announcement notifications via Edge Function
-- =====================================================
CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
BEGIN
  -- Build Edge Function URL (hardcoded for this project)
  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Build notification payload matching Edge Function interface
  v_payload := jsonb_build_object(
    'type', 'announcement',
    'license_key', NEW.license_key,
    'title', NEW.title,
    'body', NEW.content,
    'url', '/announcements'
  );

  -- Call Edge Function asynchronously using pg_net
  -- Note: We use the service_role authorization which is automatic from database
  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
    ),
    body := v_payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER announcement_created_notification
AFTER INSERT ON announcements
FOR EACH ROW
EXECUTE FUNCTION notify_announcement_created();

COMMENT ON FUNCTION notify_announcement_created() IS
'Sends push notifications for new announcements via Edge Function.
Calls send-push-notification Edge Function using pg_net.http_post().';

-- =====================================================
-- Updated Function: Notify exhibitors when up soon
-- =====================================================
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER AS $$
DECLARE
  scored_entry RECORD;
  next_entry RECORD;
  v_function_url TEXT;
  v_payload JSONB;
  v_dogs_ahead INTEGER;
  v_class_name TEXT;
BEGIN
  -- Only proceed if result was just scored (is_scored changed to true)
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN

    -- Get the entry that was just scored with its run order
    SELECT
      e.*,
      c.element,
      c.level,
      c.license_key,
      COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
    INTO scored_entry
    FROM entries e
    JOIN classes c ON e.class_id = c.id
    WHERE e.id = NEW.entry_id;

    -- Build class name for notification
    v_class_name := scored_entry.element || ' ' || scored_entry.level;

    -- Build Edge Function URL (hardcoded for this project)
    v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

    -- Find next 5 unscored entries in run order
    v_dogs_ahead := 0;
    FOR next_entry IN
      SELECT
        e.id,
        e.armband_number,
        e.call_name,
        e.handler,
        e.class_id,
        COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
      FROM entries e
      LEFT JOIN results r ON e.id = r.entry_id
      WHERE e.class_id = scored_entry.class_id
        AND (r.is_scored IS NULL OR r.is_scored = false)
        -- Compare using effective run order (exhibitor_order with armband fallback)
        AND COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) > scored_entry.effective_run_order
      ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
      LIMIT 5
    LOOP
      v_dogs_ahead := v_dogs_ahead + 1;

      -- Build notification payload
      v_payload := jsonb_build_object(
        'type', 'up_soon',
        'license_key', scored_entry.license_key,
        'title', 'You''re Up Soon!',
        'body', next_entry.call_name || ' (#' || next_entry.armband_number || ') is ' || v_dogs_ahead || ' dogs away in ' || v_class_name,
        'url', '/entries',
        'armband_number', next_entry.armband_number,
        'dog_name', next_entry.call_name,
        'handler', next_entry.handler,
        'class_id', next_entry.class_id,
        'entry_id', next_entry.id
      );

      -- Call Edge Function asynchronously
      PERFORM net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
        ),
        body := v_payload,
        timeout_milliseconds := 5000
      );

    END LOOP;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to send up soon notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_notify_up_soon
AFTER INSERT OR UPDATE ON results
FOR EACH ROW
EXECUTE FUNCTION notify_up_soon();

COMMENT ON FUNCTION notify_up_soon() IS
'Sends push notifications when entries are up soon.
Uses COALESCE(NULLIF(exhibitor_order, 0), armband_number) for correct run order.
Calls send-push-notification Edge Function using pg_net.http_post().';
