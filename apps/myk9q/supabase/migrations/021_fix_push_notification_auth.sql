-- Migration 021: Fix push notification trigger authorization
-- The previous migration broke authorization - fixing it now

DROP FUNCTION IF EXISTS notify_announcement_created() CASCADE;

CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_anon_key TEXT;
BEGIN
  -- Supabase anon key for authorization (same as Migration 019)
  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODQ4NDksImV4cCI6MjA2MTE2MDg0OX0.TZS60xdJk1b1wI1M-FEPUOzDiPZ_pKsI9c-9qk4EwWY';

  -- Build Edge Function URL
  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Build notification payload with priority field
  v_payload := jsonb_build_object(
    'type', 'announcement',
    'license_key', NEW.license_key,
    'title', NEW.title,
    'body', NEW.content,
    'priority', NEW.priority,
    'url', '/announcements'
  );

  -- Call Edge Function with proper authorization headers
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_announcement_created ON announcements;
CREATE TRIGGER on_announcement_created
  AFTER INSERT ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_announcement_created();
