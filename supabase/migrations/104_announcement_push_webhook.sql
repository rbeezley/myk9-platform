-- Push notification webhook for high/urgent announcements
-- Fires push-trigger-announcement edge function on show_announcements INSERT
-- Requires pg_net extension (enabled by default on Supabase hosted)

-- Create the trigger function that calls the edge function via pg_net
CREATE OR REPLACE FUNCTION notify_announcement_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/push-trigger-announcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
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

-- Priority filter at trigger level avoids PL/pgSQL function call for normal announcements
DROP TRIGGER IF EXISTS on_announcement_insert_push ON show_announcements;
CREATE TRIGGER on_announcement_insert_push
  AFTER INSERT ON show_announcements
  FOR EACH ROW
  WHEN (NEW.priority IN ('high', 'urgent'))
  EXECUTE FUNCTION notify_announcement_push();
