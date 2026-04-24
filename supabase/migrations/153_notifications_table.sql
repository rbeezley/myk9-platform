-- Migration 153: notifications table for transactional DB notifications
-- Stores per-user notification records (entry confirmed, Q earned, schedule change, judge assignment)

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('entry_confirmed', 'q_earned', 'schedule_change', 'judge_assignment')),
  message     text NOT NULL,
  deep_link_url text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups, newest first
CREATE INDEX IF NOT EXISTS notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "notifications: select own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own; service_role can insert for any user
CREATE POLICY "notifications: insert own or service"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- Users can mark their own notifications read
CREATE POLICY "notifications: update own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
