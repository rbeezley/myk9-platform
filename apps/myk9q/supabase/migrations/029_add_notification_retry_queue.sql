-- =====================================================
-- Migration 029: Add Retry Queue for Push Notifications
-- =====================================================
-- Problem: Failed notifications are silently dropped
-- Solution: Queue failed deliveries with exponential backoff retry
--
-- Features:
-- 1. Queue table for failed notification attempts
-- 2. Exponential backoff (1min, 5min, 15min, 1hr, 6hr)
-- 3. Dead letter queue for permanent failures
-- 4. Admin view for monitoring failed notifications
-- 5. Automatic retry processor (via pg_cron or manual trigger)
-- =====================================================

-- =====================================================
-- 1. CREATE QUEUE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  license_key TEXT NOT NULL,

  -- Notification payload (stored for retry)
  payload JSONB NOT NULL,

  -- Retry tracking
  retry_count INT DEFAULT 0 NOT NULL,
  max_retries INT DEFAULT 5 NOT NULL,
  next_retry_at TIMESTAMPTZ,

  -- Error tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'failed', 'succeeded')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Original trigger info for debugging
  notification_type TEXT CHECK (notification_type IN ('announcement', 'up_soon')),
  entry_id INTEGER, -- For up_soon notifications
  announcement_id INTEGER -- For announcement notifications
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_queue_next_retry
ON push_notification_queue(next_retry_at)
WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_queue_license_key
ON push_notification_queue(license_key);

CREATE INDEX IF NOT EXISTS idx_queue_status
ON push_notification_queue(status);

CREATE INDEX IF NOT EXISTS idx_queue_created_at
ON push_notification_queue(created_at);

-- =====================================================
-- 2. CREATE DEAD LETTER QUEUE
-- =====================================================
CREATE TABLE IF NOT EXISTS push_notification_dead_letter (
  id UUID PRIMARY KEY,
  license_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  retry_count INT NOT NULL,
  final_error TEXT NOT NULL,
  notification_type TEXT,
  entry_id INTEGER,
  announcement_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  failed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Admin acknowledgment
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_license_key
ON push_notification_dead_letter(license_key);

CREATE INDEX IF NOT EXISTS idx_dead_letter_acknowledged
ON push_notification_dead_letter(acknowledged)
WHERE NOT acknowledged;

-- =====================================================
-- 3. ADD UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_notification_queue_updated_at
BEFORE UPDATE ON push_notification_queue
FOR EACH ROW
EXECUTE FUNCTION update_queue_timestamp();

-- =====================================================
-- 4. HELPER FUNCTION: Calculate Next Retry Time
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_next_retry(retry_count INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
BEGIN
  -- Exponential backoff: 1min, 5min, 15min, 1hr, 6hr
  RETURN NOW() + CASE
    WHEN retry_count = 0 THEN INTERVAL '1 minute'
    WHEN retry_count = 1 THEN INTERVAL '5 minutes'
    WHEN retry_count = 2 THEN INTERVAL '15 minutes'
    WHEN retry_count = 3 THEN INTERVAL '1 hour'
    WHEN retry_count >= 4 THEN INTERVAL '6 hours'
  END;
END;
$$;

-- =====================================================
-- 5. HELPER FUNCTION: Queue Failed Notification
-- =====================================================
CREATE OR REPLACE FUNCTION queue_failed_notification(
  p_license_key TEXT,
  p_payload JSONB,
  p_error TEXT,
  p_notification_type TEXT,
  p_entry_id INTEGER DEFAULT NULL,
  p_announcement_id INTEGER DEFAULT NULL
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
    last_error_at,
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
    NOW(),
    'pending',
    p_notification_type,
    p_entry_id,
    p_announcement_id
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

-- =====================================================
-- 6. HELPER FUNCTION: Move to Dead Letter Queue
-- =====================================================
CREATE OR REPLACE FUNCTION move_to_dead_letter(p_queue_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Get the failed notification
  SELECT * INTO v_record
  FROM push_notification_queue
  WHERE id = p_queue_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Move to dead letter queue
  INSERT INTO push_notification_dead_letter (
    id,
    license_key,
    payload,
    retry_count,
    final_error,
    notification_type,
    entry_id,
    announcement_id,
    created_at
  ) VALUES (
    v_record.id,
    v_record.license_key,
    v_record.payload,
    v_record.retry_count,
    v_record.last_error,
    v_record.notification_type,
    v_record.entry_id,
    v_record.announcement_id,
    v_record.created_at
  );

  -- Delete from queue
  DELETE FROM push_notification_queue WHERE id = p_queue_id;

  RETURN TRUE;
END;
$$;

-- =====================================================
-- 7. RETRY PROCESSOR FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION process_notification_queue()
RETURNS TABLE(
  processed INT,
  succeeded INT,
  retried INT,
  failed INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification RECORD;
  v_function_url TEXT;
  v_trigger_secret TEXT;
  v_anon_key TEXT;
  v_processed INT := 0;
  v_succeeded INT := 0;
  v_retried INT := 0;
  v_failed INT := 0;
BEGIN
  -- Get secrets from config
  SELECT trigger_secret, anon_key
  INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  WHERE id = 1;

  IF v_trigger_secret IS NULL THEN
    RAISE WARNING 'Push notification config not found';
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Process notifications that are ready for retry
  FOR v_notification IN
    SELECT *
    FROM push_notification_queue
    WHERE status IN ('pending', 'retrying')
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY next_retry_at ASC NULLS FIRST
    LIMIT 50 -- Process in batches
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      -- Mark as retrying
      UPDATE push_notification_queue
      SET status = 'retrying'
      WHERE id = v_notification.id;

      -- Try to send notification
      PERFORM net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key,
          'x-trigger-secret', v_trigger_secret
        ),
        body := v_notification.payload,
        timeout_milliseconds := 5000
      );

      -- If we get here, it succeeded
      UPDATE push_notification_queue
      SET
        status = 'succeeded',
        updated_at = NOW()
      WHERE id = v_notification.id;

      v_succeeded := v_succeeded + 1;

      -- Delete succeeded notifications after 1 hour (keep for debugging)
      IF v_notification.created_at < NOW() - INTERVAL '1 hour' THEN
        DELETE FROM push_notification_queue WHERE id = v_notification.id;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Failed, increment retry count
        IF v_notification.retry_count >= v_notification.max_retries THEN
          -- Max retries reached, move to dead letter queue
          PERFORM move_to_dead_letter(v_notification.id);
          v_failed := v_failed + 1;

          RAISE WARNING 'Notification % moved to dead letter queue after % retries',
            v_notification.id, v_notification.retry_count;
        ELSE
          -- Schedule retry with exponential backoff
          UPDATE push_notification_queue
          SET
            retry_count = retry_count + 1,
            next_retry_at = calculate_next_retry(retry_count + 1),
            last_error = SQLERRM,
            last_error_at = NOW(),
            status = 'pending',
            updated_at = NOW()
          WHERE id = v_notification.id;

          v_retried := v_retried + 1;

          RAISE WARNING 'Notification % retry scheduled (attempt % of %)',
            v_notification.id, v_notification.retry_count + 1, v_notification.max_retries;
        END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_succeeded, v_retried, v_failed;
END;
$$;

-- =====================================================
-- 8. UPDATE TRIGGERS TO USE QUEUE ON FAILURE
-- =====================================================

-- Update announcement trigger to queue on failure
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
  v_http_response RECORD;
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

    -- Success!
    RAISE NOTICE 'Announcement notification sent successfully';

  EXCEPTION
    WHEN OTHERS THEN
      -- Failed, queue for retry
      PERFORM queue_failed_notification(
        NEW.license_key,
        v_payload,
        SQLERRM,
        'announcement',
        NULL,
        NEW.id
      );

      RAISE WARNING 'Announcement notification failed, queued for retry: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_announcement_created
  AFTER INSERT ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_announcement_created();

-- Update up_soon trigger to queue on failure
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

      -- Try to send notification
      BEGIN
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

        RAISE NOTICE 'Up soon notification sent: Entry % (%) is % dogs away',
          next_entry.id, next_entry.armband_number, v_dogs_ahead;

      EXCEPTION
        WHEN OTHERS THEN
          -- Failed, queue for retry
          PERFORM queue_failed_notification(
            v_license_key,
            v_payload,
            SQLERRM,
            'up_soon',
            next_entry.id,
            NULL
          );

          RAISE WARNING 'Up soon notification failed, queued for retry: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_up_soon
  AFTER INSERT OR UPDATE ON results
  FOR EACH ROW
  EXECUTE FUNCTION notify_up_soon();

-- =====================================================
-- 9. ADMIN VIEW: Failed Notifications
-- =====================================================
CREATE OR REPLACE VIEW view_failed_notifications AS
SELECT
  q.id,
  q.license_key,
  q.notification_type,
  q.retry_count,
  q.max_retries,
  q.next_retry_at,
  q.last_error,
  q.last_error_at,
  q.status,
  q.created_at,

  -- Announcement details
  a.title as announcement_title,
  a.priority as announcement_priority,

  -- Entry details
  e.armband_number,
  e.dog_call_name,
  e.handler_name
FROM push_notification_queue q
LEFT JOIN announcements a ON q.announcement_id = a.id
LEFT JOIN entries e ON q.entry_id = e.id
WHERE q.status IN ('pending', 'retrying')
ORDER BY q.next_retry_at ASC NULLS FIRST;

-- =====================================================
-- 10. CLEANUP FUNCTION: Remove Old Succeeded Entries
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_queue_entries()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM push_notification_queue
  WHERE status = 'succeeded'
    AND updated_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE push_notification_queue IS
'Queue for failed push notifications with exponential backoff retry.
Automatically retries: 1min, 5min, 15min, 1hr, 6hr.
After 5 failures, moves to dead letter queue.';

COMMENT ON TABLE push_notification_dead_letter IS
'Dead letter queue for notifications that failed after max retries.
Requires admin acknowledgment and investigation.';

COMMENT ON FUNCTION process_notification_queue() IS
'Processes pending notifications in queue with exponential backoff.
Call manually or schedule via pg_cron every minute.
Returns (processed, succeeded, retried, failed) counts.';

COMMENT ON VIEW view_failed_notifications IS
'Admin view showing all failed notifications awaiting retry.
Includes announcement/entry details for debugging.';

-- =====================================================
-- POST-MIGRATION INSTRUCTIONS
-- =====================================================
--
-- 1. Schedule retry processor (recommended):
--    Option A - pg_cron (if extension available):
--      SELECT cron.schedule('process-notifications', '* * * * *', 'SELECT process_notification_queue()');
--
--    Option B - Manual trigger every minute via cron job calling:
--      SELECT process_notification_queue();
--
-- 2. Monitor failed notifications:
--    SELECT * FROM view_failed_notifications;
--
-- 3. Check dead letter queue periodically:
--    SELECT * FROM push_notification_dead_letter WHERE NOT acknowledged;
--
-- 4. Cleanup old succeeded entries (optional, run daily):
--    SELECT cleanup_old_queue_entries();
--
-- =====================================================
