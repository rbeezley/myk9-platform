-- =============================================
-- Migration 018: Fix Run Order for Push Notifications
-- =============================================
-- Problem: notify_up_soon() trigger uses armband_number for ordering,
--          but should use run order (exhibitor_order with armband fallback)
-- Solution: Update trigger to use COALESCE(NULLIF(exhibitor_order, 0), armband_number)
-- =============================================

-- Drop existing trigger function
DROP FUNCTION IF EXISTS notify_up_soon() CASCADE;

-- Recreate with correct run order logic
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER AS $$
DECLARE
  scored_entry RECORD;
  next_entries RECORD;
  payload JSONB;
BEGIN
  -- Only proceed if result was just scored (is_scored changed to true)
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN

    -- Get the entry that was just scored with its run order
    SELECT
      e.*,
      COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
    INTO scored_entry
    FROM entries e
    WHERE e.id = NEW.entry_id;

    -- Find next 5 unscored entries in run order
    FOR next_entries IN
      SELECT
        e.id,
        e.armband_number,
        e.call_name,
        e.handler,
        e.class_id,
        c.license_key,
        COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) AS effective_run_order
      FROM entries e
      INNER JOIN classes c ON e.class_id = c.id
      LEFT JOIN results r ON e.id = r.entry_id
      WHERE c.id = scored_entry.class_id
        AND (r.is_scored IS NULL OR r.is_scored = false)
        -- Compare using effective run order (exhibitor_order with armband fallback)
        AND COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) > scored_entry.effective_run_order
      ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
      LIMIT 5
    LOOP

      -- Build notification payload
      payload := jsonb_build_object(
        'type', 'up_soon',
        'license_key', next_entries.license_key,
        'class_id', next_entries.class_id,
        'entry_id', next_entries.id,
        'armband_number', next_entries.armband_number,
        'dog_name', next_entries.call_name,
        'handler', next_entries.handler,
        'title', 'You''re Up Soon!',
        'body', next_entries.call_name || ' (#' || next_entries.armband_number || ') will be running soon'
      );

      -- Send notification via Edge Function
      -- Note: This requires the Edge Function URL to be configured
      -- For now, this is a placeholder - actual HTTP call will be added after Edge Function deployment

      -- Log for debugging
      RAISE NOTICE 'Up Soon Notification: Entry % (Armband %, Run Order %)',
        next_entries.id,
        next_entries.armband_number,
        next_entries.effective_run_order;

    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_notify_up_soon ON results;
CREATE TRIGGER trigger_notify_up_soon
  AFTER INSERT OR UPDATE ON results
  FOR EACH ROW
  EXECUTE FUNCTION notify_up_soon();

-- Add comment explaining the fix
COMMENT ON FUNCTION notify_up_soon() IS
'Sends push notifications when entries are up soon.
Uses COALESCE(NULLIF(exhibitor_order, 0), armband_number) for correct run order.
When exhibitor_order = 0 (default), uses armband_number.
When exhibitor_order > 0 (custom order), uses exhibitor_order.';
