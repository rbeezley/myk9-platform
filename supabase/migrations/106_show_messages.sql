-- 106_show_messages.sql
-- In-app chat: exhibitor <-> trial secretary messaging

-- Thread per participant per show
CREATE TABLE show_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (show_id, participant_id)
);

CREATE INDEX idx_smt_show_last_msg ON show_message_threads (show_id, last_message_at DESC);

-- Individual messages
CREATE TABLE show_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES show_message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  group_label text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sm_thread_created ON show_messages (thread_id, created_at);
CREATE INDEX idx_sm_show_unread ON show_messages (show_id, sender_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE show_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS: show_message_threads
-- =============================================================================

-- Participants see their own threads; secretaries/admins see all threads for their shows
CREATE POLICY "threads_select" ON show_message_threads FOR SELECT TO authenticated
USING (
  participant_id = auth.uid()
  OR is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = show_message_threads.show_id
    AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
  )
);

-- Participants create their own thread; secretaries create for any participant
CREATE POLICY "threads_insert" ON show_message_threads FOR INSERT TO authenticated
WITH CHECK (
  participant_id = auth.uid()
  OR is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = show_message_threads.show_id
    AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
  )
);

-- Only the trigger (SECURITY DEFINER) updates threads; deny direct user updates
CREATE POLICY "threads_update_deny" ON show_message_threads FOR UPDATE TO authenticated
USING (false);

-- =============================================================================
-- RLS: show_messages
-- =============================================================================

-- Users see messages in threads they can access
CREATE POLICY "messages_select" ON show_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- Users insert messages into threads they can access; sender_id must match auth.uid()
CREATE POLICY "messages_insert" ON show_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- Users can mark messages as read in their threads
CREATE POLICY "messages_update_read" ON show_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- Restrict updates to read_at column only (Postgres doesn't support column-level RLS)
CREATE OR REPLACE FUNCTION restrict_message_update_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.show_id IS DISTINCT FROM OLD.show_id
    OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
    OR NEW.group_label IS DISTINCT FROM OLD.group_label
  THEN
    RAISE EXCEPTION 'Only read_at may be updated on show_messages';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restrict_message_update
  BEFORE UPDATE ON show_messages
  FOR EACH ROW
  EXECUTE FUNCTION restrict_message_update_columns();

-- =============================================================================
-- Trigger: update last_message_at on new message
-- =============================================================================

CREATE OR REPLACE FUNCTION update_thread_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE show_message_threads
  SET last_message_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_thread_last_message
  AFTER INSERT ON show_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_message_at();

-- =============================================================================
-- Trigger: push notification on new message via pg_net
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url text;
BEGIN
  edge_function_url := current_setting('app.settings.edge_function_base_url', true)
    || '/push-trigger-chat-message';

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'show_id', NEW.show_id,
        'thread_id', NEW.thread_id,
        'sender_id', NEW.sender_id,
        'body', NEW.body,
        'created_at', NEW.created_at
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_chat_message
  AFTER INSERT ON show_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_chat_message();

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE show_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE show_message_threads;
