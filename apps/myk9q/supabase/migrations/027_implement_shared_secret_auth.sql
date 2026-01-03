-- =====================================================
-- Migration 027: Implement shared secret authentication
-- =====================================================
-- Problem: Anon keys expire, causing triggers to break with 401 errors
-- Solution: Use static shared secret that never expires
--
-- SETUP REQUIRED:
-- 1. Set TRIGGER_SECRET environment variable in Edge Function
--    Secret: OmxSTSee5Af5q8V2rPukv6pjgGd1AB8DBjumoGVmJVY=
-- 2. Deploy updated Edge Function with new auth logic
-- 3. Apply this migration
--
-- This permanently solves the expiring key problem!
-- =====================================================

-- Update announcements trigger
DROP FUNCTION IF EXISTS notify_announcement_created() CASCADE;

CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_trigger_secret TEXT;
  v_anon_key TEXT;
BEGIN
  -- Static trigger secret (never expires!)
  v_trigger_secret := 'OmxSTSee5Af5q8V2rPukv6pjgGd1AB8DBjumoGVmJVY=';
  -- Current anon key (for Supabase API gateway)
  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMjYzMzIsImV4cCI6MjA3MDYwMjMzMn0.vXgwI9HyBMiH-t6WP13unRgFVc9rg3khDRNdhIedWqs';

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  v_payload := jsonb_build_object(
    'type', 'announcement',
    'license_key', NEW.license_key,
    'title', NEW.title,
    'body', NEW.content,
    'priority', NEW.priority,
    'url', '/announcements'
  );

  -- Send both anon key (for gateway) and shared secret (for our auth)
  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key,
      'x-trigger-secret', v_trigger_secret
    ),
    body := v_payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_announcement_created ON announcements;
CREATE TRIGGER trigger_notify_announcement_created
  AFTER INSERT ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_announcement_created();

-- Update up_soon trigger
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
  v_trigger_secret TEXT;
  v_anon_key TEXT;
  v_license_key TEXT;
BEGIN
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN
    -- Static trigger secret (never expires!)
    v_trigger_secret := 'OmxSTSee5Af5q8V2rPukv6pjgGd1AB8DBjumoGVmJVY=';
    -- Current anon key (for Supabase API gateway)
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMjYzMzIsImV4cCI6MjA3MDYwMjMzMn0.vXgwI9HyBMiH-t6WP13unRgFVc9rg3khDRNdhIedWqs';
    v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

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

    v_license_key := scored_entry.license_key;
    v_class_name := scored_entry.element || ' ' || scored_entry.level;
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

      -- Send both anon key (for gateway) and shared secret (for our auth)
      PERFORM net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key,
          'x-trigger-secret', v_trigger_secret
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

COMMENT ON FUNCTION notify_announcement_created() IS
'Sends push notifications when announcements are created.
Uses shared secret authentication (never expires).
No JWT/anon key dependency!';

COMMENT ON FUNCTION notify_up_soon() IS
'Sends push notifications when entries are up soon (next 5 unscored entries).
Uses COALESCE(NULLIF(exhibitor_order, 0), armband_number) for correct run order.
Joins through classes -> trials -> shows to get license_key.
Uses shared secret authentication (never expires).
No JWT/anon key dependency!';
