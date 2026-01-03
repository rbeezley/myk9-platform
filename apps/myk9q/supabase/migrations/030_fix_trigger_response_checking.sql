-- =====================================================
-- Migration 030: Fix Trigger Response Checking
-- =====================================================
-- Problem: Triggers use PERFORM which discards the response
-- HTTP 401 is NOT an exception - it's a successful HTTP call
-- Need to capture response and check status_code

-- =====================================================
-- 1. UPDATE ANNOUNCEMENT TRIGGER
-- =====================================================
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
  v_request_id BIGINT;
  v_response RECORD;
BEGIN
  -- Read secrets from config table
  SELECT trigger_secret, anon_key
  INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  WHERE id = 1;

  IF v_trigger_secret IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'Push notification config not found';
    RETURN NEW;
  END IF;

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  v_payload := jsonb_build_object(
    'type', 'announcement',
    'license_key', NEW.license_key,
    'title', NEW.title,
    'body', NEW.content,
    'priority', NEW.priority,
    'url', '/announcements'
  );

  -- Try to send notification
  BEGIN
    -- Capture the request ID
    v_request_id := net.http_post(
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
        'announcement',
        NULL::INTEGER,
        NEW.id
      );
      RAISE WARNING 'Announcement notification failed (HTTP %), queued for retry', v_response.status_code;
    ELSE
      RAISE NOTICE 'Announcement notification sent successfully (HTTP %)', v_response.status_code;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      -- Network error or database error, queue for retry
      PERFORM queue_failed_notification(
        NEW.license_key,
        v_payload,
        SQLERRM,
        'announcement',
        NULL::INTEGER,
        NEW.id
      );
      RAISE WARNING 'Announcement notification exception, queued for retry: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- =====================================================
-- 2. UPDATE UP_SOON TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_trigger_secret TEXT;
  v_anon_key TEXT;
  v_request_id BIGINT;
  v_response RECORD;
  v_entry RECORD;
BEGIN
  -- Only notify if result just got scored AND was NQ or qualified
  IF NEW.is_scored = FALSE OR OLD.is_scored = TRUE THEN
    RETURN NEW;
  END IF;

  -- Read secrets from config table
  SELECT trigger_secret, anon_key
  INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  WHERE id = 1;

  IF v_trigger_secret IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'Push notification config not found';
    RETURN NEW;
  END IF;

  -- Get entry details
  SELECT
    e.id,
    e.armband_number,
    e.call_name,
    e.license_key,
    c.class_name,
    c.level
  INTO v_entry
  FROM entries e
  JOIN classes c ON e.class_id = c.id
  WHERE e.id = NEW.entry_id;

  IF NOT FOUND THEN
    RAISE WARNING 'Entry not found for result_id: %', NEW.id;
    RETURN NEW;
  END IF;

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  v_payload := jsonb_build_object(
    'type', 'up_soon',
    'license_key', v_entry.license_key,
    'armband_number', v_entry.armband_number,
    'call_name', v_entry.call_name,
    'class_name', v_entry.class_name,
    'level', v_entry.level,
    'entry_id', v_entry.id
  );

  -- Try to send notification
  BEGIN
    -- Capture the request ID
    v_request_id := net.http_post(
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

    -- Check the response status code
    SELECT status_code, content
    INTO v_response
    FROM net._http_response
    WHERE id = v_request_id;

    -- If status code is not 2xx, queue for retry
    IF v_response.status_code IS NULL OR v_response.status_code < 200 OR v_response.status_code >= 300 THEN
      PERFORM queue_failed_notification(
        v_entry.license_key,
        v_payload,
        'HTTP ' || COALESCE(v_response.status_code::text, 'NULL') || ': ' || COALESCE(v_response.content::text, 'No response'),
        'up_soon',
        v_entry.id,
        NULL::INTEGER
      );
      RAISE WARNING 'Up soon notification failed (HTTP %), queued for retry', v_response.status_code;
    ELSE
      RAISE NOTICE 'Up soon notification sent successfully (HTTP %)', v_response.status_code;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      -- Network error or database error, queue for retry
      PERFORM queue_failed_notification(
        v_entry.license_key,
        v_payload,
        SQLERRM,
        'up_soon',
        v_entry.id,
        NULL::INTEGER
      );
      RAISE WARNING 'Up soon notification exception, queued for retry: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Triggers already exist, no need to recreate them

-- =====================================================
-- 3. FIX QUEUE FUNCTION SIGNATURE
-- =====================================================
-- announcements.id is BIGINT, not INTEGER
CREATE OR REPLACE FUNCTION queue_failed_notification(
  p_license_key TEXT,
  p_payload JSONB,
  p_error TEXT,
  p_notification_type TEXT,
  p_entry_id INTEGER DEFAULT NULL,
  p_announcement_id BIGINT DEFAULT NULL  -- Changed from INTEGER to BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  INSERT INTO push_notification_queue (
    license_key,
    payload,
    retry_count,
    next_retry_at,
    last_error,
    status,
    notification_type,
    entry_id,
    announcement_id
  ) VALUES (
    p_license_key,
    p_payload,
    0,
    calculate_next_retry(0),
    p_error,
    'pending',
    p_notification_type,
    p_entry_id,
    p_announcement_id
  ) RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

COMMENT ON FUNCTION notify_announcement_created IS 'Sends push notifications for new announcements - captures HTTP response and queues on non-2xx status';
COMMENT ON FUNCTION notify_up_soon IS 'Sends "up soon" notifications when entry is scored - captures HTTP response and queues on non-2xx status';
COMMENT ON FUNCTION queue_failed_notification IS 'Queues failed notification for retry - accepts BIGINT for announcement_id';
