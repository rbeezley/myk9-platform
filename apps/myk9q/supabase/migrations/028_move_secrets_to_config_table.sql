-- =====================================================
-- Migration 028: Move secrets to configuration table
-- =====================================================
-- Problem: Secrets are hardcoded in Migration 027
-- Solution: Store secrets in a configuration table that can be updated
--           without creating new migrations
--
-- Security Benefits:
-- 1. Secrets can be rotated via UPDATE statement
-- 2. Secrets are not visible in git history
-- 3. Can be managed via Supabase dashboard or admin API
-- 4. No more migrations needed when secrets change
--
-- SETUP INSTRUCTIONS:
-- 1. Apply this migration
-- 2. Manually set the secret values:
--    UPDATE push_notification_config SET trigger_secret = 'YOUR_SECRET_HERE';
-- 3. Keep the secret values in a secure password manager
-- 4. Delete Migration 027 from git history (git filter-branch)
-- =====================================================

-- Create configuration table for push notification secrets
CREATE TABLE IF NOT EXISTS push_notification_config (
  id INTEGER PRIMARY KEY DEFAULT 1,

  -- Shared secret for authenticating database triggers to Edge Function
  -- This should match TRIGGER_SECRET environment variable in Edge Function
  trigger_secret TEXT NOT NULL,

  -- Supabase anon key (for API gateway routing)
  -- Can be updated when JWT secret rotates
  anon_key TEXT NOT NULL,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_by TEXT, -- Who last updated the config

  -- Ensure only one config row exists
  CONSTRAINT single_config_row CHECK (id = 1)
);

-- Add RLS to protect config table
ALTER TABLE push_notification_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can read config (triggers run with SECURITY DEFINER)
CREATE POLICY "Service role can read config"
ON push_notification_config
FOR SELECT
TO service_role
USING (true);

-- Only admins can update config
CREATE POLICY "Admins can update config"
ON push_notification_config
FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' OR
  current_setting('role') = 'service_role'
);

-- Insert default configuration row with placeholder values
-- IMPORTANT: Update these values after migration!
INSERT INTO push_notification_config (id, trigger_secret, anon_key, updated_by)
VALUES (
  1,
  'REPLACE_ME_WITH_SECURE_SECRET', -- Must be updated manually
  'REPLACE_ME_WITH_ANON_KEY',      -- Must be updated manually
  'migration_028'
)
ON CONFLICT (id) DO NOTHING;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_push_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_notification_config_updated_at
BEFORE UPDATE ON push_notification_config
FOR EACH ROW
EXECUTE FUNCTION update_push_config_timestamp();

-- =====================================================
-- Update announcement trigger to use config table
-- =====================================================
DROP FUNCTION IF EXISTS notify_announcement_created() CASCADE;

CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Required to read config table
AS $$
DECLARE
  v_function_url TEXT;
  v_payload JSONB;
  v_trigger_secret TEXT;
  v_anon_key TEXT;
BEGIN
  -- Read secrets from config table instead of hardcoding
  SELECT trigger_secret, anon_key
  INTO v_trigger_secret, v_anon_key
  FROM push_notification_config
  WHERE id = 1;

  -- Validate secrets were retrieved
  IF v_trigger_secret IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'Push notification config not found or incomplete';
    RETURN NEW;
  END IF;

  -- Validate secrets are not placeholder values
  IF v_trigger_secret = 'REPLACE_ME_WITH_SECURE_SECRET' THEN
    RAISE WARNING 'Push notification trigger_secret not configured';
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

-- =====================================================
-- Update up_soon trigger to use config table
-- =====================================================
DROP FUNCTION IF EXISTS notify_up_soon() CASCADE;

CREATE OR REPLACE FUNCTION notify_up_soon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Required to read config table
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
    -- Read secrets from config table instead of hardcoding
    SELECT trigger_secret, anon_key
    INTO v_trigger_secret, v_anon_key
    FROM push_notification_config
    WHERE id = 1;

    -- Validate secrets were retrieved
    IF v_trigger_secret IS NULL OR v_anon_key IS NULL THEN
      RAISE WARNING 'Push notification config not found or incomplete';
      RETURN NEW;
    END IF;

    -- Validate secrets are not placeholder values
    IF v_trigger_secret = 'REPLACE_ME_WITH_SECURE_SECRET' THEN
      RAISE WARNING 'Push notification trigger_secret not configured';
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

-- =====================================================
-- Helper function to update secrets (admin use only)
-- =====================================================
CREATE OR REPLACE FUNCTION update_push_notification_secrets(
  p_trigger_secret TEXT,
  p_anon_key TEXT,
  p_updated_by TEXT DEFAULT 'admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE push_notification_config
  SET
    trigger_secret = p_trigger_secret,
    anon_key = p_anon_key,
    updated_by = p_updated_by,
    updated_at = NOW()
  WHERE id = 1;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION update_push_notification_secrets IS
'Helper function to update push notification secrets.
Usage: SELECT update_push_notification_secrets(''new_secret'', ''new_anon_key'', ''admin_name'');';

-- Add helpful comments
COMMENT ON TABLE push_notification_config IS
'Configuration table for push notification secrets.
Secrets are stored here instead of hardcoded in SQL to allow rotation without migrations.
IMPORTANT: Update trigger_secret and anon_key after applying this migration!';

COMMENT ON COLUMN push_notification_config.trigger_secret IS
'Shared secret for authenticating database triggers to Edge Function.
Must match TRIGGER_SECRET environment variable in Edge Function.
Rotate periodically for security.';

COMMENT ON COLUMN push_notification_config.anon_key IS
'Supabase anon key for API gateway routing.
Update when JWT secret rotates (check Supabase dashboard).';

-- =====================================================
-- Post-Migration Instructions
-- =====================================================
--
-- CRITICAL: Run these SQL commands after migration:
--
-- 1. Generate a new secure secret:
--    Use: openssl rand -base64 32
--    Or: https://generate-secret.now.sh/32
--
-- 2. Get current anon key from Supabase dashboard:
--    Settings > API > anon public key
--
-- 3. Update config table:
--    SELECT update_push_notification_secrets(
--      'YOUR_NEW_SECRET_HERE',
--      'YOUR_ANON_KEY_HERE',
--      'your_username'
--    );
--
-- 4. Verify config:
--    SELECT * FROM push_notification_config;
--
-- 5. Test by creating an announcement
--
-- 6. Update Edge Function TRIGGER_SECRET env var to match new secret
--
-- 7. Delete Migration 027 from git (contains exposed secret)
--
-- =====================================================
