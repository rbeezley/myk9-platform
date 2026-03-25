-- =============================================================================
-- Migration 084: SA-008 — Restrict email_log INSERT to service_role
--
-- HIGH: The email_log INSERT policy had no TO clause, applying to both anon
-- and authenticated roles. Email logs should only be written by edge functions
-- (which use service_role). service_role bypasses RLS by default, but the
-- explicit policy documents intent and protects if FORCE RLS is added later.
-- =============================================================================

DROP POLICY IF EXISTS "email_log_insert_service" ON email_log;

CREATE POLICY "email_log_insert_service" ON email_log
  FOR INSERT TO service_role
  WITH CHECK (true);
