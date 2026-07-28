-- Add confirmation_message to shows
ALTER TABLE shows ADD COLUMN IF NOT EXISTS confirmation_message TEXT;

-- Create email_log table
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  related_id UUID,
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  status_updated_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_related ON email_log(related_id);
CREATE INDEX IF NOT EXISTS idx_email_log_resend_id ON email_log(resend_message_id);

-- Migration 061 is the first caller that scopes the secretary check to a show.
-- Resolve that show to its club and reuse the canonical migration-016 helper.
-- Migration 099 later replaces this overload after show officials are migrated
-- to show-scoped user_roles.
CREATE OR REPLACE FUNCTION is_show_secretary(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_trial_secretary(
    (SELECT s.club_id FROM public.shows s WHERE s.id = check_show_id)
  );
$$;

COMMENT ON FUNCTION is_show_secretary(UUID) IS
  'Checks trial-secretary access through the club that owns the requested show.';

GRANT EXECUTE ON FUNCTION is_show_secretary(UUID) TO authenticated;

-- RLS
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_select ON email_log
  FOR SELECT USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM registrations r
      JOIN shows s ON s.id = r.show_id
      WHERE r.id = email_log.related_id
      AND is_show_secretary(s.id)
    )
  );
