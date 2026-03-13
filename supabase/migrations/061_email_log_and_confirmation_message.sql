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
