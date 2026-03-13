-- Allow service role (Edge Functions) to insert into email_log
-- The service_role key bypasses RLS by default, but we also add an
-- explicit policy for the authenticated role in case future code
-- needs to insert from the client side (e.g., resend-email action).
CREATE POLICY email_log_insert_service ON email_log
  FOR INSERT
  WITH CHECK (true);
