-- =====================================================
-- Migration: Fix Push Notification URLs
-- =====================================================
-- Problem: Several notification triggers send invalid URLs:
--   - up_soon: '/entries' (missing class ID)
--   - come_to_gate: '/entries/{entryId}' (wrong route pattern)
--   - class_started: '/classes/{id}' (wrong route pattern)
--
-- Solution: All should use '/class/{classId}/entries' to match app routes
-- Date: 2025-12-17
-- =====================================================

-- =============================================================================
-- Fix 1: notify_up_soon function
-- =============================================================================
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS trigger
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
  SELECT trigger_secret, anon_key INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  LIMIT 1;

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Get info about the entry that was just scored
  SELECT
    e.id,
    e.armband_number,
    e.class_id,
    s.license_key,
    c.element,
    c.level,
    COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
  INTO scored_entry
  FROM entries e
    JOIN classes c ON e.class_id = c.id
    JOIN trials t ON c.trial_id = t.id
    JOIN shows s ON t.show_id = s.id
  WHERE e.id = NEW.id;

  v_license_key := scored_entry.license_key;
  v_class_name := scored_entry.element || ' ' || scored_entry.level;
  v_dogs_ahead := 0;

  -- Find next unscored entries in run order
  FOR next_entry IN
    SELECT
      e.id,
      e.armband_number,
      e.dog_call_name,
      e.handler_name,
      e.class_id,
      COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
    FROM entries e
    WHERE
        e.class_id = scored_entry.class_id
        AND e.id != scored_entry.id
        AND (e.is_scored IS NULL OR e.is_scored = false)
        AND COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) > scored_entry.effective_run_order
      ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
      LIMIT 5
  LOOP
    v_dogs_ahead := v_dogs_ahead + 1;

    -- Find subscriptions for exhibitors with this dog as a favorite
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
        AND v_dogs_ahead <= COALESCE((ps.notification_preferences->>'dogs_ahead')::INTEGER, 3)
    LOOP
      v_payload := jsonb_build_object(
        'type', 'up_soon',
        'license_key', v_license_key,
        'title', 'You''re Up Soon!',
        'body', next_entry.dog_call_name || ' (#' || next_entry.armband_number || ') is ' || v_dogs_ahead || ' dogs away in ' || v_class_name,
        -- FIX: Use correct route pattern /class/{classId}/entries
        'url', '/class/' || next_entry.class_id || '/entries',
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

COMMENT ON FUNCTION notify_up_soon IS 'Sends push notifications when dogs are coming up soon. Uses correct URL pattern /class/{classId}/entries.';

-- =============================================================================
-- Fix 2: notify_come_to_gate function
-- =============================================================================
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
      'body', 'Armband #' || NEW.armband_number || ' (' || NEW.dog_call_name || ') - Please proceed to the ring gate',
      -- FIX: Use correct route pattern /class/{classId}/entries
      'url', '/class/' || v_class_info.class_id || '/entries',
      'entry_id', NEW.id,
      'armband_number', NEW.armband_number,
      'call_name', NEW.dog_call_name,
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

COMMENT ON FUNCTION notify_come_to_gate IS 'Sends push notifications when entry status changes to come-to-gate. Uses correct URL pattern /class/{classId}/entries.';

-- =============================================================================
-- Fix 3: notify_class_started function
-- =============================================================================
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
      -- FIX: Use correct route pattern /class/{classId}/entries
      'url', '/class/' || NEW.id || '/entries',
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

COMMENT ON FUNCTION notify_class_started IS 'Sends push notifications when class status changes to briefing or in_progress. Uses correct URL pattern /class/{classId}/entries.';

-- =============================================================================
-- Verification
-- =============================================================================
-- Run this after migration to verify functions were updated:
-- SELECT proname, prosrc
-- FROM pg_proc
-- WHERE proname IN ('notify_up_soon', 'notify_come_to_gate', 'notify_class_started')
-- AND prosrc LIKE '%/class/%/entries%';
