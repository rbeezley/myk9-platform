-- Guard notify_announcement_push() against missing edge-function config.
--
-- Migration 104 defined notify_announcement_push() with the single-argument
-- current_setting form reading the legacy app.settings.supabase_url GUC (plus
-- app.settings.service_role_key). The single-arg form RAISES when the GUC is
-- unset, and these GUCs are not configured on this project (the codebase
-- standardized on app.settings.edge_function_base_url, not the legacy name). Because
-- the AFTER INSERT trigger fires WHEN priority IN ('high','urgent'), any all-show
-- message sent WITH a push alert (priority 'high') aborted the INSERT entirely —
-- surfacing to the secretary as "Could not send show message". A quiet send
-- (priority 'normal') skipped the trigger and worked, which is why only the push
-- path failed.
--
-- Fix: mirror the guard already applied to notify_chat_message in
-- 20260531144257_guard_notify_chat_message_missing_config.sql — read config with
-- the two-arg current_setting (returns NULL instead of raising), skip the
-- http_post with a NOTICE when config is absent, and use the standardized
-- `edge_function_base_url` GUC (which already includes the /functions/v1 path).
-- The announcement still saves and exhibitors still receive it in-app via
-- realtime; push fires automatically once the GUC is configured.

CREATE OR REPLACE FUNCTION public.notify_announcement_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_base_url text;
  service_role_key text;
BEGIN
  edge_function_base_url := current_setting('app.settings.edge_function_base_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  IF edge_function_base_url IS NULL
    OR edge_function_base_url = ''
    OR service_role_key IS NULL
    OR service_role_key = ''
  THEN
    RAISE NOTICE 'notify_announcement_push skipped because edge function config is not set';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := edge_function_base_url || '/push-trigger-announcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'show_announcements',
      'record', jsonb_build_object(
        'id', NEW.id,
        'show_id', NEW.show_id,
        'author_id', NEW.author_id,
        'author_role', NEW.author_role,
        'title', NEW.title,
        'content', NEW.content,
        'priority', NEW.priority
      )
    )
  );

  RETURN NEW;
END;
$$;
