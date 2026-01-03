-- =====================================================
-- Migration 024: Fix license_key join in up_soon trigger
-- =====================================================
-- Problem: Trigger tries to get license_key from classes table, but it's on shows table
-- Solution: Join through trials to shows to get license_key
-- =====================================================

DROP FUNCTION IF EXISTS notify_up_soon() CASCADE;

CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  scored_entry RECORD;
  next_entry RECORD;
  v_function_url TEXT;
  v_payload JSONB;
  v_dogs_ahead INTEGER;
  v_class_name TEXT;
  v_anon_key TEXT;
  v_license_key TEXT;
BEGIN
  -- Only proceed if result was just scored (is_scored changed to true)
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN

    -- Supabase anon key for authorization (same as Migration 021)
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODQ4NDksImV4cCI6MjA2MTE2MDg0OX0.TZS60xdJk1b1wI1M-FEPUOzDiPZ_pKsI9c-9qk4EwWY';

    -- Build Edge Function URL
    v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

    -- Get the entry that was just scored with its run order
    -- Join through classes -> trials -> shows to get license_key
    SELECT
      e.*,
      c.element,
      c.level,
      s.license_key,
      COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
    INTO scored_entry
    FROM entries e
    JOIN classes c ON e.class_id = c.id
    JOIN trials t ON c.trial_id = t.id
    JOIN shows s ON t.show_id = s.id
    WHERE e.id = NEW.entry_id;

    -- Store license_key for use in loop
    v_license_key := scored_entry.license_key;

    -- Build class name for notification
    v_class_name := scored_entry.element || ' ' || scored_entry.level;

    -- Find next 5 unscored entries in run order
    v_dogs_ahead := 0;
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
      WHERE e.class_id = scored_entry.class_id
        AND (r.is_scored IS NULL OR r.is_scored = false)
        AND COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) > scored_entry.effective_run_order
      ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
      LIMIT 5
    LOOP
      v_dogs_ahead := v_dogs_ahead + 1;

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

      PERFORM net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key
        ),
        body := v_payload,
        timeout_milliseconds := 5000
      );

      RAISE NOTICE 'Up Soon Notification sent: Entry % (%) is % dogs away',
        next_entry.id,
        next_entry.armband_number,
        v_dogs_ahead;

    END LOOP;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send up soon notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_up_soon ON results;
CREATE TRIGGER trigger_notify_up_soon
  AFTER INSERT OR UPDATE ON results
  FOR EACH ROW
  EXECUTE FUNCTION notify_up_soon();

COMMENT ON FUNCTION notify_up_soon() IS
'Sends push notifications when entries are up soon (next 5 unscored entries).
Uses COALESCE(NULLIF(exhibitor_order, 0), armband_number) for correct run order.
Joins through classes -> trials -> shows to get license_key.
Calls send-push-notification Edge Function using pg_net.http_post() with proper auth.';
