-- ============================================================================
-- Migration: Add Offline Scoring Status and Stale Data Detection
-- ============================================================================
-- Purpose:
--   1. Add 'offline-scoring' as a valid class status for intentional offline judging
--   2. Add last_result_at column to classes for stale data detection
--   3. Create trigger to update last_result_at when entries are scored
--   4. Update notify_up_soon to skip notifications for offline-scoring classes
-- Date: 2025-12-06
-- ============================================================================

-- ============================================================================
-- STEP 1: Add last_result_at column to classes table
-- ============================================================================
-- This column tracks when the last result was synced for a class,
-- enabling detection of stale run order data

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS last_result_at TIMESTAMPTZ;

COMMENT ON COLUMN classes.last_result_at IS
  'Timestamp of the last scored result synced for this class. Used to detect stale run order data when judge may be offline.';

-- Create index for efficient queries (especially for dashboard/list views)
CREATE INDEX IF NOT EXISTS idx_classes_last_result_at ON classes(last_result_at);

-- ============================================================================
-- STEP 2: Create trigger to update last_result_at when entries are scored
-- ============================================================================

CREATE OR REPLACE FUNCTION update_class_last_result_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When an entry is scored, update the class's last_result_at timestamp
  IF NEW.is_scored = TRUE AND (OLD.is_scored IS NULL OR OLD.is_scored = FALSE) THEN
    UPDATE classes
    SET last_result_at = NOW()
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_class_last_result_at IS
  'Trigger function that updates classes.last_result_at when an entry is scored. Used for stale data detection.';

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS entries_update_class_last_result ON entries;

-- Create the trigger
CREATE TRIGGER entries_update_class_last_result
  AFTER UPDATE OF is_scored ON entries
  FOR EACH ROW
  EXECUTE FUNCTION update_class_last_result_at();

-- ============================================================================
-- STEP 3: Backfill last_result_at for existing classes with scored entries
-- ============================================================================
-- This ensures existing classes have accurate last_result_at values

UPDATE classes c
SET last_result_at = (
  SELECT MAX(e.updated_at)
  FROM entries e
  WHERE e.class_id = c.id AND e.is_scored = TRUE
)
WHERE EXISTS (
  SELECT 1 FROM entries e WHERE e.class_id = c.id AND e.is_scored = TRUE
);

-- ============================================================================
-- STEP 4: Update notify_up_soon to skip offline-scoring classes
-- ============================================================================
-- When a class is being judged offline, notifications should not be sent
-- because the run order data in the database is stale

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
  v_class_status TEXT;
  v_dogs_ahead INTEGER;
  scored_entry RECORD;
  next_entry RECORD;
  subscription RECORD;
BEGIN
  -- Get secrets from config table
  SELECT trigger_secret, anon_key INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  LIMIT 1;

  v_function_url := 'https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification';

  -- Get info about the entry that was just scored, including class status
  SELECT
    e.id,
    e.armband_number,
    e.class_id,
    s.license_key,
    c.element,
    c.level,
    c.class_status,
    COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
  INTO scored_entry
  FROM entries e
    JOIN classes c ON e.class_id = c.id
    JOIN trials t ON c.trial_id = t.id
    JOIN shows s ON t.show_id = s.id
  WHERE e.id = NEW.id;

  -- Skip notifications if class is being scored offline
  -- In this mode, the run order data is stale and notifications would be misleading
  v_class_status := scored_entry.class_status;
  IF v_class_status = 'offline-scoring' THEN
    RAISE NOTICE 'Skipping up_soon notifications for class % - offline scoring mode', scored_entry.class_id;
    RETURN NEW;
  END IF;

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

COMMENT ON FUNCTION notify_up_soon IS
  'Trigger function that sends push notifications when dogs are coming up soon. ' ||
  'Skips notifications when class is in offline-scoring mode to avoid misleading exhibitors. ' ||
  'Checks is_scored column in entries table (after migration 039 merged results into entries).';

-- ============================================================================
-- STEP 5: Verify migration
-- ============================================================================

DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Check column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'last_result_at'
  ) INTO v_column_exists;

  -- Check trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'entries_update_class_last_result'
  ) INTO v_trigger_exists;

  RAISE NOTICE 'Migration verification:';
  RAISE NOTICE '  last_result_at column exists: %', v_column_exists;
  RAISE NOTICE '  entries_update_class_last_result trigger exists: %', v_trigger_exists;

  IF NOT v_column_exists OR NOT v_trigger_exists THEN
    RAISE EXCEPTION 'Migration verification failed';
  END IF;
END;
$$;
