-- ============================================================================
-- Migration 041: Fix database functions after merging results into entries
-- ============================================================================
-- Two functions need to be updated to reference entries instead of results:
-- 1. recalculate_class_placements - placement calculation
-- 2. notify_up_soon - push notification trigger

-- ============================================================================
-- Fix recalculate_class_placements function
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_class_placements(
  p_class_ids bigint[],
  p_is_nationals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id bigint;
BEGIN
  -- Loop through each class ID and calculate placements separately
  FOREACH v_class_id IN ARRAY p_class_ids
  LOOP
    IF p_is_nationals THEN
      -- Nationals: Rank by qualifying, then points (descending), then time (ascending)
      UPDATE entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN e2.result_status = 'qualified' THEN 0 ELSE 1 END,
              e2.points_earned DESC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) as placement
        FROM entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
      ) ranked
      WHERE e.id = ranked.id;
    ELSE
      -- Regular: Rank by qualifying, then faults (ascending), then time (ascending)
      UPDATE entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN e2.result_status = 'qualified' THEN 0 ELSE 1 END,
              e2.total_faults ASC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) as placement
        FROM entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
      ) ranked
      WHERE e.id = ranked.id;
    END IF;

    -- Reset placement to 0 for non-qualified entries
    UPDATE entries e
    SET final_placement = 0
    WHERE e.class_id = v_class_id
      AND e.is_scored = true
      AND e.result_status != 'qualified';

  END LOOP;
END;
$$;

COMMENT ON FUNCTION recalculate_class_placements IS 'Recalculates placement rankings for qualified entries in specified classes. After migration 039, updates entries table directly instead of results table.';

-- ============================================================================
-- Fix notify_up_soon function
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS trigger
LANGUAGE plpgsql
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
  -- After migration 039, is_scored is now a column in entries table
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

COMMENT ON FUNCTION notify_up_soon IS 'Trigger function that sends push notifications when dogs are coming up soon. After migration 039, checks is_scored column in entries table instead of joining to results table.';

-- ============================================================================
-- Verify trigger is still attached
-- ============================================================================
-- The trigger should still be there, but let's make sure it's on the right event
DROP TRIGGER IF EXISTS on_entry_scored ON entries;

CREATE TRIGGER on_entry_scored
  AFTER UPDATE OF is_scored ON entries
  FOR EACH ROW
  WHEN (NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false))
  EXECUTE FUNCTION notify_up_soon();

COMMENT ON TRIGGER on_entry_scored ON entries IS 'Sends push notifications when an entry is scored. Watches is_scored column in entries table (after migration 039 merged results into entries).';
